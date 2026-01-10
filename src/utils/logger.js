/**
 * Logger Utility
 * Configures Winston logger with file and console transports
 * for comprehensive logging throughout the application.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure logs directory exists
if (!fs.existsSync(config.logging.directory)) {
    fs.mkdirSync(config.logging.directory, { recursive: true });
}

// Custom log format with timestamp and structured data
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        
        // Append metadata if present
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports: [
        // Console transport with colors for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize({ all: true }),
                logFormat
            )
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(config.logging.directory, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Separate file for error logs
        new winston.transports.File({
            filename: path.join(config.logging.directory, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        // Separate file for download activity
        new winston.transports.File({
            filename: path.join(config.logging.directory, 'downloads.log'),
            level: 'info',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

// Add stream for potential HTTP request logging
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;
