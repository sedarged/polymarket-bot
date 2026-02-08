# Use Node 20 LTS as base image
FROM node:20-bookworm

# Install additional tools that might be useful
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    git \
    vim \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the default user to node (non-root)
USER node

# Set working directory
WORKDIR /workspace

# Keep container running
CMD ["sleep", "infinity"]
