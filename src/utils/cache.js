import redisClient from './redisClient.js';
import logger from './logger.js';

/**
 * Redis Cache Manager with TTL and Error Handling
 */
class CacheManager {
    constructor() {
        this.client = redisClient;
        this.defaultTTL = 3600; // 1 hour in seconds
        this.prefix = 'receipt_generator:';
    }

    /**
     * Generate cache key with prefix
     */
    generateKey(key) {
        return `${this.prefix}${key}`;
    }

    /**
     * Set cache with TTL
     */
    async set(key, value, ttl = this.defaultTTL) {
        try {
            const cacheKey = this.generateKey(key);
            const serializedValue = JSON.stringify(value);
            
            await this.client.setEx(cacheKey, ttl, serializedValue);
            
            logger.debug('Cache set', { key: cacheKey, ttl });
            return true;
        } catch (error) {
            logger.error('Cache set error', error, { key, ttl });
            return false;
        }
    }

    /**
     * Get cache value
     */
    async get(key) {
        try {
            const cacheKey = this.generateKey(key);
            const value = await this.client.get(cacheKey);
            
            if (value) {
                logger.debug('Cache hit', { key: cacheKey });
                return JSON.parse(value);
            }
            
            logger.debug('Cache miss', { key: cacheKey });
            return null;
        } catch (error) {
            logger.error('Cache get error', error, { key });
            return null;
        }
    }

    /**
     * Delete cache key
     */
    async delete(key) {
        try {
            const cacheKey = this.generateKey(key);
            const result = await this.client.del(cacheKey);
            
            logger.debug('Cache deleted', { key: cacheKey, result });
            return result > 0;
        } catch (error) {
            logger.error('Cache delete error', error, { key });
            return false;
        }
    }

    /**
     * Delete multiple cache keys by pattern
     */
    async deletePattern(pattern) {
        try {
            const searchPattern = this.generateKey(pattern);
            const keys = await this.client.keys(searchPattern);
            
            if (keys.length > 0) {
                const result = await this.client.del(keys);
                logger.debug('Cache pattern deleted', { pattern: searchPattern, deleted: result });
                return result;
            }
            
            return 0;
        } catch (error) {
            logger.error('Cache pattern delete error', error, { pattern });
            return 0;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key) {
        try {
            const cacheKey = this.generateKey(key);
            const result = await this.client.exists(cacheKey);
            return result === 1;
        } catch (error) {
            logger.error('Cache exists error', error, { key });
            return false;
        }
    }

    /**
     * Get TTL for a key
     */
    async getTTL(key) {
        try {
            const cacheKey = this.generateKey(key);
            const ttl = await this.client.ttl(cacheKey);
            return ttl;
        } catch (error) {
            logger.error('Cache TTL error', error, { key });
            return -1;
        }
    }

    /**
     * Set cache with custom TTL
     */
    async setWithTTL(key, value, ttl) {
        return this.set(key, value, ttl);
    }

    /**
     * Cache wrapper for async functions
     */
    async cacheFunction(key, fn, ttl = this.defaultTTL) {
        try {
            // Try to get from cache first
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }

            // Execute function and cache result
            const result = await fn();
            await this.set(key, result, ttl);
            
            return result;
        } catch (error) {
            logger.error('Cache function error', error, { key });
            // Fallback to direct function call
            return await fn();
        }
    }

    /**
     * Cache user data
     */
    async cacheUser(userId, userData, ttl = 1800) { // 30 minutes
        return this.set(`user:${userId}`, userData, ttl);
    }

    /**
     * Get cached user data
     */
    async getCachedUser(userId) {
        return this.get(`user:${userId}`);
    }

    /**
     * Cache receipt data
     */
    async cacheReceipt(receiptId, receiptData, ttl = 3600) { // 1 hour
        return this.set(`receipt:${receiptId}`, receiptData, ttl);
    }

    /**
     * Get cached receipt data
     */
    async getCachedReceipt(receiptId) {
        return this.get(`receipt:${receiptId}`);
    }

    /**
     * Cache receipt list with pagination
     */
    async cacheReceiptList(query, page, limit, data, ttl = 1800) { // 30 minutes
        const key = `receipts:${JSON.stringify(query)}:${page}:${limit}`;
        return this.set(key, data, ttl);
    }

    /**
     * Get cached receipt list
     */
    async getCachedReceiptList(query, page, limit) {
        const key = `receipts:${JSON.stringify(query)}:${page}:${limit}`;
        return this.get(key);
    }

    /**
     * Invalidate user-related cache
     */
    async invalidateUserCache(userId) {
        const patterns = [
            `user:${userId}`,
            `receipts:*`,
            `dashboard:*`
        ];
        
        for (const pattern of patterns) {
            await this.deletePattern(pattern);
        }
    }

    /**
     * Invalidate receipt-related cache
     */
    async invalidateReceiptCache(receiptId = null) {
        if (receiptId) {
            await this.delete(`receipt:${receiptId}`);
        }
        await this.deletePattern('receipts:*');
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        try {
            const info = await this.client.info('memory');
            const keys = await this.client.keys(`${this.prefix}*`);
            
            return {
                totalKeys: keys.length,
                memoryInfo: info,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Cache stats error', error);
            return null;
        }
    }

    /**
     * Clear all cache
     */
    async clearAll() {
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            if (keys.length > 0) {
                const result = await this.client.del(keys);
                logger.info('All cache cleared', { deleted: result });
                return result;
            }
            return 0;
        } catch (error) {
            logger.error('Clear all cache error', error);
            return 0;
        }
    }
}

// Create singleton instance
const cacheManager = new CacheManager();

export default cacheManager; 