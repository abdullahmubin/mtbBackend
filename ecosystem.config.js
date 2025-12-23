/**
 * PM2 ecosystem config - keeps the server running and provides restart policies.
 * Use: pm2 start ecosystem.config.js --env production
 */
export default {
  apps: [
    {
      name: 'a-receipt-api',
      script: './index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_restarts: 10,
      min_uptime: '2000',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
