import express from "express";
import compression from "compression";
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config({ override: process.env.NODE_ENV !== 'production' });

// Import enhanced configurations
import databaseManager from "./src/config/database.js";
import configure from "./src/controllers/index.js";
import { handleErrors } from "./src/utils/errors/errorHandler.js";
import logger from "./src/utils/logger.js";
import errorLogService from './src/services/errorLogService.js';
// Swagger
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerOptions from './swaggerDef.js';

// Import security middleware
import { 
    createRateLimiters, 
    helmetConfig, 
    corsConfig, 
    securityHeaders, 
    requestLogger,
    sanitizeRequest 
} from "./src/middleware/securityMiddleware.js";

// Import Puppeteer setup
import setupPuppeteerEnv from './setup-puppeteer.js';

// Set up Puppeteer environment variables
setupPuppeteerEnv();

/**
 * Application Configuration
 */
const isLocalhost = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || (isLocalhost ? 3030 : 3031);

// Create Express app
const app = express();

// If running behind a proxy (Dokploy, Heroku, nginx, etc.), enable trust proxy
// so `req.ip` and rate-limiter see the real client IP from `X-Forwarded-For`.
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    // when behind a single proxy set to 1; you can set a number or a list as needed
    app.set('trust proxy', 1);
    console.log('[DEBUG] Express trust proxy enabled');
}

/**
 * Security Middleware Setup
 */
// Helmet for security headers
app.use(helmetConfig);

// CORS configuration
app.use(cors(corsConfig));

// Security headers
app.use(securityHeaders);

// Request logging
app.use(requestLogger);

    // Serve a safe logo for health/debug UI. Non-fatal if file missing.
    app.get('/api/logo', (req, res) => {
        try {
            // Prefer file under src/assets, but do not crash if unreadable
            const logoPath = new URL('./src/assets/logo.svg', import.meta.url).pathname;
            res.sendFile(logoPath, (err) => {
                if (err) {
                    logger.warn('Logo file not found or could not be sent, serving inline placeholder');
                    res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="100%" height="100%" rx="16" fill="#0ea5e9"/><text x="50%" y="55%" font-size="20" font-family="Arial,Helvetica,sans-serif" fill="#fff" text-anchor="middle">MTB</text></svg>`);
                }
            });
        } catch (err) {
            logger.warn('Failed to resolve logo path, sending inline placeholder', err);
            res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="100%" height="100%" rx="16" fill="#0ea5e9"/><text x="50%" y="55%" font-size="20" font-family="Arial,Helvetica,sans-serif" fill="#fff" text-anchor="middle">MTB</text></svg>`);
        }
    });

// Request sanitization
app.use(sanitizeRequest);

// Compression middleware
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Body parsing middleware - increase limit for file uploads but let multer handle validation
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

/**
 * Rate Limiting Setup
 */
const rateLimiters = createRateLimiters();

// Apply general rate limiting to all routes
app.use(rateLimiters.general);

// Apply stricter rate limiting to auth routes
app.use('/api/auth', rateLimiters.auth);

// Apply upload rate limiting to file upload routes
app.use('/api/upload', rateLimiters.upload);

/**
 * Database Connection
 */
const initializeDatabase = async () => {
    try {
        await databaseManager.connect();
        logger.info('Database connection established');
    } catch (error) {
        logger.error('Database connection failed', error);
    // Attempt to flush logs before exit
    try { await logger.flush(); } catch (e) { /* ignore flush errors */ }
    process.exit(1);
    }
};

/**
 * Health Check Endpoint
 */
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await databaseManager.healthCheck();
        const dbStatus = databaseManager.getConnectionStatus();
        
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            database: {
                status: dbHealth.status,
                connection: dbStatus.isConnected,
                host: dbStatus.host
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            }
        };

        const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(healthStatus);
    } catch (error) {
        logger.error('Health check failed', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

/**
 * Swagger UI and OpenAPI JSON
 */
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api/openapi.json', (req, res) => res.json(swaggerSpec));
// Keep the old JSON summary endpoint (moved)
app.get('/api/docs-summary', (req, res) => {
    res.json({ message: 'See Swagger UI at /api/docs', version: process.env.npm_package_version || '1.0.0' });
});

/**
 * Initialize Application
 */
const initializeApp = async () => {
    try {
        // Initialize database
        await initializeDatabase();
        
        // Configure routes
        configure(app);
        
        // Error handling middleware (must be last)
        app.use(handleErrors);
        
        // 404 handler
        app.use('*', (req, res) => {
            res.status(404).json({
                statusCode: 404,
                message: 'Route not found',
                path: req.originalUrl
            });
        });

                // Start server with port retry logic and attach socket bridge
                const startServer = (desiredPorts) => new Promise((resolve, reject) => {
                        const tryNext = (ports) => {
                                if (ports.length === 0) {
                                        return reject(new Error('No available ports to bind server.'));
                                }
                                const p = ports[0];
                                const server = app.listen(p, async () => {
                                        const actualPort = server.address().port;
                        const hostname = process.env.HOSTNAME || 'localhost';
                        logger.info(`🚀 Server running on host ${hostname} port ${actualPort} in ${process.env.NODE_ENV || 'development'} mode`);
                        console.log(`[DEBUG] Server started on host: ${hostname}, port: ${actualPort}`);
                        logger.info(`📊 Health check available at http://${hostname}:${actualPort}/api/health`);
                        logger.info(`📚 API documentation available at http://${hostname}:${actualPort}/api/docs`);

                                        // Try to dynamically attach socket.io + Redis subscriber
                                        try{
                                            let io;
                                            try{
                                                const { Server } = await import('socket.io');
                                                io = new Server(server, { cors: { origin: '*' } });
                                                logger.info('Socket.IO attached');
                                            }catch(e){ logger.warn('socket.io not installed or failed to attach, skipping realtime bridge'); }

                                            if(io){
                                                const redisClient = (await import('./src/utils/redisClient.js')).default;
                                                try{
                                                    // For redis v4, use client.duplicate for subscriber
                                                    const sub = redisClient.duplicate ? redisClient.duplicate() : redisClient;
                                                    if(sub.connect) await sub.connect();
                                                    await sub.subscribe('notifications', (message) => {
                                                        try{
                                                            logger.info('Realtime: Redis message received on channel notifications');
                                                            const payload = JSON.parse(message);
                                                            logger.info('Realtime: parsed payload', payload);
                                                            io.emit('notifications', payload);
                                                            logger.info('Realtime: emitted notifications to socket clients');
                                                        }catch(err){ 
                                                            logger.warn('Realtime: failed to parse Redis message, emitting raw', err);
                                                            io.emit('notifications', { raw: message });
                                                        }
                                                    });
                                                    logger.info('Subscribed to Redis notifications channel');
                                                }catch(e){ logger.warn('Redis subscribe failed for realtime bridge', e); }

                                                io.on('connection', socket => {
                                                    logger.info('Socket client connected', socket.id);
                                                    socket.on('disconnect', ()=> logger.info('Socket client disconnected', socket.id));
                                                });
                                            }
                                        }catch(e){ logger.warn('Realtime bridge initialization failed', e); }

                                        resolve(server);
                                });
                                server.on('error', (err) => {
                                        if (err.code === 'EADDRINUSE') {
                                                logger.warn(`Port ${p} is in use, trying another port...`);
                                                server.close(() => tryNext(ports.slice(1)));
                                        } else {
                                                reject(err);
                                        }
                                });
                        };
                        tryNext(desiredPorts);
                });

                // Build desired ports list: env PORT first (if set), then defaults, then 0 (random)
                const desiredPorts = [];
                if (Number.isFinite(port) && port > 0) desiredPorts.push(port);
                if (!desiredPorts.includes(3030)) desiredPorts.push(3030);
                if (!desiredPorts.includes(3031)) desiredPorts.push(3031);
                desiredPorts.push(0); // let OS assign a free port as last resort

                await startServer(desiredPorts);
                                // Scheduler and worker responsibilities have been moved to a separate service.
                                // To avoid running scheduled tasks in the web server process, the application
                                // no longer starts the daily scheduler or the reminders worker here.
                                //
                                // If you need to run the scheduler or workers locally for development, use
                                // the separate scheduler service at `../scheduler-service` (or enable the
                                // behavior via a dedicated process). For production, run the scheduler and
                                // queue workers in dedicated services/containers and keep the web server
                                // focused on handling HTTP requests.
                                console.info('Scheduler and reminders worker startup disabled in web server. Run scheduler-service separately.');
        
    } catch (error) {
        logger.error('Application initialization failed', error);
    try { await logger.flush(); } catch (e) { /* ignore */ }
    process.exit(1);
    }
};

/**
 * Graceful Shutdown Handling
 */
const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Close database connection
        await databaseManager.gracefulShutdown();
        
        logger.info('Graceful shutdown completed');
    try { await logger.flush(); } catch (e) { /* ignore */ }
    process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown', error);
    try { await logger.flush(); } catch (e) { /* ignore */ }
    process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Uncaught Exception Handling
 */
process.on('uncaughtException', (error) => {
    try {
        logger.error('Uncaught Exception:', error);
        // Persist to DB (best-effort)
        errorLogService.logError({ err: error, message: error?.message, name: error?.name, stack: error?.stack, meta: { source: 'uncaughtException' } });
    } catch (e) {
        try { console.error('Failed to record uncaughtException', e); } catch (ee) {}
    }
    // Attempt to flush transports and optionally exit depending on config
    (async () => {
        try { await logger.flush(); } catch (e) { /* ignore */ }
        if (process.env.EXIT_ON_FATAL_ERRORS === 'true') {
            try { await errorLogService.logError({ message: 'Process exiting due to uncaughtException', meta: { exitOnFatal: true } }); } catch (e) {}
            try { await logger.flush(); } catch (e) {}
            process.exit(1);
        }
    })();
});

process.on('unhandledRejection', (reason, promise) => {
    try {
        logger.error('Unhandled Rejection', reason, { 
            promise: promise?.toString?.() || 'Unknown promise',
            reason: reason?.toString?.() || 'Unknown reason'
        });
        // Persist to DB (best-effort)
        errorLogService.logError({ message: reason?.message || String(reason), name: reason?.name, stack: reason?.stack, meta: { source: 'unhandledRejection', promise: promise?.toString?.() } });
    } catch (e) {
        try { console.error('Failed to record unhandledRejection', e); } catch (ee) {}
    }
    // Attempt to flush transports and optionally exit depending on config
    (async () => {
        try { await logger.flush(); } catch (e) { /* ignore */ }
        if (process.env.EXIT_ON_FATAL_ERRORS === 'true') {
            try { await errorLogService.logError({ message: 'Process exiting due to unhandledRejection', meta: { exitOnFatal: true } }); } catch (e) {}
            try { await logger.flush(); } catch (e) {}
            process.exit(1);
        }
    })();
});

// Start the application
initializeApp();