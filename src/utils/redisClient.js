/**
 * Redis Client Configuration for Docker Deployment
 * 
 * Note: 
 * - Set REDIS_HOST to your Redis container name (e.g. "my-redis") or its IP address in Docker.
 * - Do NOT use "localhost" unless Redis and backend run in the same container.
 * - Pass environment variables via `docker run -e REDIS_HOST=my-redis -e REDIS_PORT=6379 ...`
 */
import { createClient } from "redis";
import logger from "./logger.js";
import 'dotenv/config';

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
        this.retryDelay = 1000; // 1 second
    }

    createClient() {
        // Debug: Print Redis connection info
        const debugHost = process.env.REDIS_HOST || 'localhost';
        const debugPort = process.env.REDIS_PORT || 6379;
        const redisEnabled = process.env.REDIS_ENABLED !== 'false';
        
        console.log(`[DEBUG] Redis configuration:
  - Enabled: ${redisEnabled}
  - Host: ${debugHost}
  - Port: ${debugPort}
  - Password: ${process.env.REDIS_PASSWORD ? '***' : 'none'}`);

        if (!redisEnabled) {
            logger.info('Redis is disabled via REDIS_ENABLED=false');
            return;
        }

        const config = {
            socket: {
                host: debugHost,
                port: parseInt(debugPort),
                reconnectStrategy: (retries) => {
                    if (retries > this.maxRetries) {
                        logger.error('Redis max retries exceeded');
                        return new Error('Redis max retries exceeded');
                    }
                    this.retryAttempts = retries;
                    return Math.min(retries * this.retryDelay, 3000);
                }
            },
            password: process.env.REDIS_PASSWORD || undefined,
            database: parseInt(process.env.REDIS_DATABASE) || 0
        };

        this.client = createClient(config);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('connect', () => {
            logger.info('Redis client connecting...');
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            this.retryAttempts = 0;
            logger.info('Redis client ready');
        });

        this.client.on('error', (err) => {
            this.isConnected = false;
            logger.error('Redis Client Error', err);
        });

        this.client.on('end', () => {
            this.isConnected = false;
            logger.warn('Redis client disconnected');
        });

        this.client.on('reconnecting', () => {
            logger.info('Redis client reconnecting...');
        });
    }

    async connect() {
        try {
            this.createClient();
            
            if (!this.client) {
                logger.warn('Redis client not created (disabled or configuration issue)');
                return false;
            }
            
            await this.client.connect();
            logger.info('Redis connected successfully');
            return true;
        } catch (error) {
            logger.error('Redis connection failed', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.quit();
                this.isConnected = false;
                logger.info('Redis disconnected');
            }
        } catch (error) {
            logger.error('Redis disconnect error', error);
        }
    }

    getClient() {
        return this.client;
    }

    isRedisConnected() {
        return this.isConnected && this.client?.isReady;
    }

    async healthCheck() {
        try {
            if (!this.isRedisConnected()) {
                return { status: 'disconnected', error: 'Redis not connected' };
            }
            await this.client.ping();
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            logger.error('Redis health check failed', error);
            return { status: 'unhealthy', error: error.message };
        }
    }

    async getInfo() {
        try {
            if (!this.isRedisConnected()) {
                return null;
            }
            const info = await this.client.info();
            return info;
        } catch (error) {
            logger.error('Redis info error', error);
            return null;
        }
    }

    async getMemoryUsage() {
        try {
            if (!this.isRedisConnected()) {
                return null;
            }
            const memory = await this.client.info('memory');
            return memory;
        } catch (error) {
            logger.error('Redis memory usage error', error);
            return null;
        }
    }
}

// Singleton instance
const redisManager = new RedisManager();

const initializeRedis = async () => {
    try {
        const connected = await redisManager.connect();
        if (!connected) {
            logger.warn('Application starting without Redis');
        }
    } catch (error) {
        logger.error('Failed to initialize Redis', error);
        logger.warn('Application will continue without Redis - some features may be limited');
        // Don't throw error - application can run without Redis
    }
};

initializeRedis();

process.on('SIGINT', async () => {
    await redisManager.disconnect();
});
process.on('SIGTERM', async () => {
    await redisManager.disconnect();
});

// Export the client - may be null if Redis is disabled or connection failed
export default redisManager.getClient();