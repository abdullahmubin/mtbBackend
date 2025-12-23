# Use Node.js 20 slim image
FROM node:20-slim

# Install Chromium and required dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    chromium \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Copy .env file if exists (optional, remove if not needed)
COPY .env .env

# Verify Chromium installation
RUN chromium --version || echo "Chromium not found"


# Optional: Add a dynamic health check using environment variables
# You can set HEALTHCHECK_HOST and HEALTHCHECK_PORT in your .env or docker-compose.yml
# ENV HEALTHCHECK_HOST=localhost
# ENV HEALTHCHECK_PORT=3031
# HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
#   CMD curl --fail http://$HEALTHCHECK_HOST:$HEALTHCHECK_PORT/health || exit 1

EXPOSE 3031

# Start the app
# CMD ["npm", "start"]
CMD ["node", "index.js"]