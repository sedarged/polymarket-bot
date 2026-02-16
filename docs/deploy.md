# Deployment (Research §6.1, §9)

This document provides a quick overview of deployment options. For complete deployment procedures, see the **[Deployment Guide](./deployment-guide.md)**.

## Quick Start

### For Production Deployments (Automated CI/CD)

**Use the automated deployment workflow:**

1. **Staging:** Automatically deploys on merge to `main`
2. **Production:** Manual trigger with required approval

See **[Deployment Guide](./deployment-guide.md)** for complete instructions.

### For Local/Development Testing

## Options

1. **Docker Compose (recommended)**  
   See [docker.md](./docker.md). From repo root: `docker-compose up -d`. Use `.env` for configuration.

2. **Single container**  
   Build and run the production image:
   ```bash
   docker build -t polymarket-bot:latest --target production .
   docker run -d --name polymarket-bot -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data polymarket-bot:latest
   ```

3. **Native (Node)**  
   On the host: `npm install --legacy-peer-deps`, `npm run build`, then `node apps/backend/dist/index.js` (or use a process manager). See [runbook.md](./runbook.md).

## CI/CD

**Complete automated deployment pipeline available:**

- **CI:** [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on push/PR (build, test, lint).
- **Deploy:** [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) handles staging and production deployments
  - Pre-deployment validation (tests, security scans)
  - Docker image build and push to registry
  - Automated staging deployment
  - Manual production deployment with approval
  - Rollback capability
  - Deployment verification

**See [Deployment Guide](./deployment-guide.md) for:**
- Complete deployment procedures
- Environment setup (staging/production)
- Rollback procedures
- Security and access management
- Troubleshooting

## Pre-deploy

Run the [pre-deployment verification](./pre-deployment-verification.md) checklist and `./scripts/verify-pre-deploy.sh` (with the bot running or BASE_URL set) before going live.

After deployment, verify using:
```bash
./scripts/verify-deployment.sh production https://your-prod-url.com
```

## Related Documentation

- **[Deployment Guide](./deployment-guide.md)** - Complete deployment procedures (GAP-015)
- **[Docker Guide](./docker.md)** - Container deployment details
- **[Pre-deployment Verification](./pre-deployment-verification.md)** - Pre-deployment checklist
- **[Runbook](./runbook.md)** - Operational procedures
- **[Automation Guide](./automation.md)** - CI/CD overview
