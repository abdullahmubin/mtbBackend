import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
dotenv.config({ override: process.env.NODE_ENV !== 'production' });

/**
 * Database Configuration with Connection Pooling and Error Handling
 */
class DatabaseManager {
    constructor() {
        this.isConnected = false;
        this.connectionString = process.env.connectionString;
        this.maxPoolSize = 10;
        this.serverSelectionTimeoutMS = 5000;
        this.socketTimeoutMS = 45000;
    }

    /**
     * Validate required environment variables
     */
    validateConfig() {
        if (!this.connectionString) {
            throw new Error('Database connection string is required');
        }
        
        const requiredEnvVars = [
            'SECRET_KEY',
            'REFRESH_SECRET_KEY',
            'FORGET_PASSWORD',
            'FORGET_PASSWORD_KEY'
        ];
        
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
    }

    /**
     * Configure mongoose options for optimal performance
     */
    getMongooseOptions() {
        return {
            maxPoolSize: this.maxPoolSize,
            serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
            socketTimeoutMS: this.socketTimeoutMS,
            bufferCommands: false,
            autoIndex: process.env.NODE_ENV === 'development', // Only create indexes in development
            autoCreate: process.env.NODE_ENV === 'development',
        };
    }

    /**
     * Connect to MongoDB with proper error handling
     */
    async connect() {
        try {
            this.validateConfig();
            
            const options = this.getMongooseOptions();
            
            await mongoose.connect(this.connectionString, options);
            
            this.isConnected = true;
            logger.info('✅ MongoDB connected successfully');
            
            // Handle connection events
            mongoose.connection.on('error', (err) => {
                logger.error('❌ MongoDB connection error', err);
                this.isConnected = false;
            });
            
            mongoose.connection.on('disconnected', () => {
                logger.warn('⚠️ MongoDB disconnected');
                this.isConnected = false;
            });
            
            mongoose.connection.on('reconnected', () => {
                logger.info('🔄 MongoDB reconnected');
                this.isConnected = true;
            });
            
            // Graceful shutdown
            process.on('SIGINT', this.gracefulShutdown.bind(this));
            process.on('SIGTERM', this.gracefulShutdown.bind(this));
            
        } catch (error) {
            logger.error('❌ Failed to connect to MongoDB', error);
            throw error;
        }
    }

    /**
     * Graceful shutdown handler
     */
    async gracefulShutdown() {
    logger.info('🛑 Shutting down gracefully...');
        
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            logger.info('✅ MongoDB connection closed');
        }
        
        process.exit(0);
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            name: mongoose.connection.name
        };
    }

    /**
     * Health check for database
     */
    async healthCheck() {
        try {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.db.admin().ping();
                return { status: 'healthy', timestamp: new Date() };
            } else {
                return { status: 'unhealthy', reason: 'Not connected', timestamp: new Date() };
            }
        } catch (error) {
            return { status: 'unhealthy', reason: error.message, timestamp: new Date() };
        }
    }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

export default databaseManager; 