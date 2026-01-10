/**
 * File Monitor Downloader - Main Application Entry
 * 
 * Production-ready automated file monitoring and downloader system.
 * Monitors specified URLs for new files and automatically downloads them.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes');
const fileMonitor = require('./services/fileMonitor');
const { ensureDirectorySync } = require('./utils/fileUtils');

// Initialize Express application
const app = express();

// Ensure required directories exist
ensureDirectorySync(config.download.directory);
ensureDirectorySync(config.logging.directory);
ensureDirectorySync(path.dirname(config.data.downloadsFile));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve downloaded files (optional, can be disabled for security)
app.use('/files', express.static(config.download.directory));

// API routes
app.use('/api', apiRoutes);

// Root endpoint - serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { 
        error: err.message, 
        stack: err.stack,
        url: req.originalUrl
    });
    
    res.status(500).json({
        success: false,
        error: config.server.isProduction ? 'Internal server error' : err.message
    });
});

// Start server
const server = app.listen(config.server.port, () => {
    logger.info(`🚀 Server started on port ${config.server.port}`);
    logger.info(`📁 Download directory: ${config.download.directory}`);
    logger.info(`🔍 Monitoring URL: ${config.monitor.url}`);
    logger.info(`⏱️  Poll interval: ${config.monitor.pollInterval}ms`);
    
    // Auto-start monitor if configured
    if (config.monitor.autoStart) {
        logger.info('Auto-starting file monitor...');
        fileMonitor.start();
    }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    
    // Stop the file monitor
    fileMonitor.stop();
    
    // Close the server
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason: String(reason) });
});

module.exports = app;
