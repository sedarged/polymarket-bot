# Use official Node 20 LTS image
FROM node:20-bullseye

# Create workspace directory
WORKDIR /workspace

# Set non-root user
USER node

# Install global tools as node user
RUN npm install -g npm@latest

# The workspace will be mounted at /workspace
# Dependencies will be installed via postCreateCommand
