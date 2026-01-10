/**
 * Configuration Module
 * Centralizes all application configuration with environment variable support
 * and sensible defaults for production deployment.
 */

require('dotenv').config();
const path = require('path');

// Parse supported extensions from environment variable
const parseExtensions = (extString) => {
    if (!extString) return [];
    return extString.split(',').map(ext => ext.trim().toLowerCase());
};

const config = {
    // Server configuration
    server: {
        port: parseInt(process.env.PORT, 10) || 3000,
        env: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production'
    },

    // Monitoring configuration
    monitor: {
        // URL to monitor for new files
        url: process.env.MONITOR_URL || 'https://example.com/files/',
        // Polling interval in milliseconds
        pollInterval: parseInt(process.env.POLL_INTERVAL, 10) || 60000,
        // Enable/disable automatic monitoring on startup
        autoStart: process.env.AUTO_START !== 'false'
    },

    // Download configuration
    download: {
        // Directory to save downloaded files
        directory: path.resolve(process.env.DOWNLOAD_DIR || './downloads'),
        // Maximum retry attempts for failed downloads
        maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
        // Delay between retries in milliseconds
        retryDelay: parseInt(process.env.RETRY_DELAY, 10) || 5000,
        // Request timeout in milliseconds
        timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
        // Supported file extensions
        supportedExtensions: parseExtensions(
            process.env.SUPPORTED_EXTENSIONS || 
            '.jpg,.jpeg,.png,.gif,.webp,.pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.mp3,.mp4,.txt,.csv'
        )
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        directory: path.resolve(process.env.LOG_DIR || './logs')
    },

    // Data storage paths
    data: {
        downloadsFile: path.resolve('./data/downloads.json')
    }
};

// Validate critical configuration
const validateConfig = () => {
    const errors = [];

    if (!config.monitor.url) {
        errors.push('MONITOR_URL is required');
    }

    if (config.monitor.pollInterval < 1000) {
        errors.push('POLL_INTERVAL must be at least 1000ms');
    }

    if (errors.length > 0) {
        throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
};

// Only validate in non-test environments
if (process.env.NODE_ENV !== 'test') {
    validateConfig();
}

module.exports = config;
