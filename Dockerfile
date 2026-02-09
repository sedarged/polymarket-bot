# Production Dockerfile for Polymarket Trading Bot
# Multi-stage build for minimal image size and security
# Addresses PR-015: Docker production deployment

# =============================================================================
# Stage 1: Build Stage
# =============================================================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

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

# Remove dev dependencies
RUN npm prune --production --legacy-peer-deps

# =============================================================================
# Stage 2: Production Stage
# =============================================================================
FROM node:20-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    tini

# Create non-root user for security
RUN addgroup -g 1001 -S polymarket && \
    adduser -u 1001 -S polymarket -G polymarket

WORKDIR /app

# Copy built artifacts and production dependencies from builder
COPY --from=builder --chown=polymarket:polymarket /app/package*.json ./
COPY --from=builder --chown=polymarket:polymarket /app/node_modules ./node_modules
COPY --from=builder --chown=polymarket:polymarket /app/apps ./apps
COPY --from=builder --chown=polymarket:polymarket /app/packages ./packages
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

# Default command: run backend server
CMD ["npm", "run", "dev"]
