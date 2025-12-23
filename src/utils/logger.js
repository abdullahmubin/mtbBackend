import winston from 'winston';
import fs from 'fs';
import 'dotenv/config';

/**
 * Custom Winston Logger Configuration
 */
class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.environment = process.env.NODE_ENV || 'development';
        
        this.logger = this.createLogger();
    }

    /**
     * Create Winston logger with custom configuration
     */
    createLogger() {
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
                
                if (stack) {
                    log += `\n${stack}`;
                }
                
                if (Object.keys(meta).length > 0) {
                    log += `\n${JSON.stringify(meta, null, 2)}`;
                }
                
                return log;
            })
        );

        const transports = [
            // Console transport for development
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ];

        // Add file transports for production
        if (this.environment === 'production') {
            // Ensure logs directory exists before creating file transports
            try {
                const logDir = 'logs';
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            } catch (e) {
                // If we cannot create the directory, continue without file transports
                // The console transport will still be available.
            }
            transports.push(
                new winston.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    format: logFormat
                }),
                new winston.transports.File({
                    filename: 'logs/combined.log',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    format: logFormat
                })
            );
        }

        return winston.createLogger({
            level: this.logLevel,
            format: logFormat,
            transports,
            exitOnError: false
        });
    }

    /**
     * Log info message
     */
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    /**
     * Log error message
     */
    error(message, error = null, meta = {}) {
        if (error) {
            meta.error = {
                message: error.message,
                stack: error.stack,
                name: error.name
            };
        }
        this.logger.error(message, meta);
    }

    /**
     * Log warning message
     */
    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    /**
     * Log debug message
     */
    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    /**
     * Log HTTP request
     */
    logRequest(req, res, duration) {
        const logData = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id || 'anonymous'
        };

        if (res.statusCode >= 400) {
            this.error('HTTP Request Error', null, logData);
        } else {
            this.info('HTTP Request', logData);
        }
    }

    /**
     * Log database operation
     */
    logDatabase(operation, collection, duration, success = true, error = null) {
        const logData = {
            operation,
            collection,
            duration: `${duration}ms`,
            success
        };

        if (error) {
            logData.error = error.message;
        }

        if (success) {
            this.info('Database Operation', logData);
        } else {
            this.error('Database Operation Failed', error, logData);
        }
    }

    /**
     * Log authentication event
     */
    logAuth(event, userId, success = true, error = null) {
        const logData = {
            event,
            userId,
            success,
            timestamp: new Date().toISOString()
        };

        if (error) {
            logData.error = error.message;
        }

        if (success) {
            this.info('Authentication Event', logData);
        } else {
            this.error('Authentication Event Failed', error, logData);
        }
    }

    /**
     * Log security event
     */
    logSecurity(event, details, severity = 'medium') {
        const logData = {
            event,
            severity,
            details,
            timestamp: new Date().toISOString()
        };

        this.warn('Security Event', logData);
    }

    /**
     * Log performance metric
     */
    logPerformance(metric, value, unit = 'ms') {
        const logData = {
            metric,
            value,
            unit,
            timestamp: new Date().toISOString()
        };

        this.info('Performance Metric', logData);
    }

    /**
     * Get logger instance
     */
    getLogger() {
        return this.logger;
    }

    /**
     * Flush transports (best-effort) before exit
     */
    async flush(timeout = 2000) {
        // Winston doesn't provide a built-in global flush, but transports may expose "flush" or need to finish.
        // We'll wait a short time to allow async transports (like file writes) to flush.
        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(), timeout);
            // Attempt to end streams where supported
            try {
                for (const transport of this.logger.transports) {
                    if (typeof transport.flush === 'function') {
                        try { transport.flush(); } catch (e) { /* ignore */ }
                    }
                    if (transport.close) {
                        try { transport.close(); } catch (e) { /* ignore */ }
                    }
                }
            } catch (e) { /* ignore */ }
            // Resolve after timeout to avoid blocking shutdown
            clearTimeout(t);
            resolve();
        });
    }
}

// Create singleton instance
const logger = new Logger();

export default logger; 