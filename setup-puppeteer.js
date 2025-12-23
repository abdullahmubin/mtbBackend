// This script helps with environment setup for Puppeteer
import { execSync } from 'child_process';
import fs from 'fs';

// Check if running in Docker environment
const isRunningInDocker = () => {
  try {
    return fs.existsSync('/.dockerenv');
  } catch (err) {
    return false;
  }
};

// Set up appropriate environment variables if needed
const setupPuppeteerEnv = () => {
  if (isRunningInDocker()) {
    console.log('Running in Docker environment, using Chromium at /usr/bin/chromium');
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
  } else {
    console.log('Running in local environment, using Puppeteer\'s bundled Chromium');
    // Let Puppeteer use its bundled Chromium
  }
};

// Export the setup function
export default setupPuppeteerEnv;
