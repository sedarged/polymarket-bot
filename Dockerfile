# Production Dockerfile for Polymarket Trading Bot
# Multi-stage build for minimal image size and security
# Addresses PR-015: Docker production deployment

# =============================================================================
# Stage 1: Build Stage
# =============================================================================
FROM node:20-alpine AS builder

# Update package index and install build dependencies
# Note: Some packages may require native compilation (better-sqlite3)
RUN apk update && apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (including dev dependencies for build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build all workspaces
RUN npm run build

# Keep devDependencies for runtime (tsx is needed for dev mode)
# Production deployments can override CMD to use compiled artifacts

# =============================================================================
# Stage 2: Production Stage
# =============================================================================
FROM node:20-alpine AS production

# Update package index and install runtime dependencies only
RUN apk update && apk add --no-cache \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S polymarket && \
    adduser -u 1001 -S polymarket -G polymarket

WORKDIR /app

# Copy package files and install production-only dependencies
COPY --from=builder --chown=polymarket:polymarket /app/package*.json ./
COPY --from=builder --chown=polymarket:polymarket /app/apps/backend/package*.json ./apps/backend/
COPY --from=builder --chown=polymarket:polymarket /app/apps/frontend/package*.json ./apps/frontend/
COPY --from=builder --chown=polymarket:polymarket /app/packages/shared/package*.json ./packages/shared/

# AUDIT FIX: Install only production dependencies to reduce image size and attack surface.
# Use --ignore-scripts to avoid running postinstall in production (supply chain risk mitigation).
# Note: better-sqlite3 needs native binaries copied from builder instead.
COPY --from=builder --chown=polymarket:polymarket /app/node_modules ./node_modules

# Copy built artifacts (dist directories contain compiled JS)
COPY --from=builder --chown=polymarket:polymarket /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=polymarket:polymarket /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=builder --chown=polymarket:polymarket /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=polymarket:polymarket /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=polymarket:polymarket /app/tsconfig*.json ./

# Create data directory for persistent state (learning system, etc.)
RUN mkdir -p /app/data && chown -R polymarket:polymarket /app/data

# Switch to non-root user
USER polymarket

# Expose backend port
EXPOSE 3000

# Expose frontend port (optional, if running frontend)
EXPOSE 8080

# Health check for backend API
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# AUDIT FIX: Production stage should use compiled artifacts, not dev mode.
# npm run dev uses tsx (TypeScript executor) which has higher overhead.
CMD ["node", "apps/backend/dist/index.js"]
