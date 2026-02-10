# Deployment (Research §6.1, §9)

This document describes how to deploy the Polymarket bot. Research §6.1 recommends a deploy workflow; this repo supports manual and CI-based deployment.

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

- **CI:** [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on push/PR (build, test, lint).
- **Deploy:** There is no automated deploy workflow by default. To add one:
  - Create `.github/workflows/deploy.yml` that builds the image and deploys to your VM or registry (e.g. push to Docker Hub/ECR, then SSH or pull on the server).
  - Use secrets for `PRIVATE_KEY`, `ADMIN_TOKEN`, and any registry credentials.

## Pre-deploy

Run the [pre-deployment verification](./pre-deployment-verification.md) checklist and `./scripts/verify-pre-deploy.sh` (with the bot running or BASE_URL set) before going live.
