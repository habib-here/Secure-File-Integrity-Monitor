/**
 * File Monitor Service
 * Monitors specified URLs for new files and triggers downloads
 * using a configurable polling mechanism.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const config = require('../config');
const logger = require('../utils/logger');
const downloadService = require('./downloadService');
const metadataStore = require('./metadataStore');
const { isSupportedExtension, getFileExtension } = require('../utils/fileUtils');

class FileMonitor {
    constructor() {
        this.isRunning = false;
        this.pollTimer = null;
        this.lastCheck = null;
        this.monitorUrl = config.monitor.url;
        this.pollInterval = config.monitor.pollInterval;
        this.discoveredFiles = new Set();
    }

    /**
     * Start the file monitoring process
     */
    start() {
        if (this.isRunning) {
            logger.warn('Monitor is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting file monitor', {
            url: this.monitorUrl,
            interval: `${this.pollInterval}ms`
        });

        // Initial check
        this.checkForFiles();

        // Set up polling interval
        this.pollTimer = setInterval(() => {
            this.checkForFiles();
        }, this.pollInterval);
    }

    /**
     * Stop the file monitoring process
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('Monitor is not running');
            return;
        }

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        this.isRunning = false;
        logger.info('File monitor stopped');
    }

    /**
     * Perform a single check for new files
     * @returns {Promise<Object>} Check results
     */
    async checkForFiles() {
        logger.info('Checking for new files...', { url: this.monitorUrl });

        try {
            const files = await this._fetchFileList();
            const newFiles = this._filterNewFiles(files);

            logger.info(`Found ${files.length} files, ${newFiles.length} are new`);

            if (newFiles.length > 0) {
                await this._processNewFiles(newFiles);
            }

            // Update last check timestamp
            this.lastCheck = new Date();
            await metadataStore.updateLastCheck(this.lastCheck);

            return {
                success: true,
                totalFound: files.length,
                newFiles: newFiles.length,
                lastCheck: this.lastCheck
            };

        } catch (error) {
            logger.error('Error checking for files', { error: error.message });
            return {
                success: false,
                error: error.message,
                lastCheck: this.lastCheck
            };
        }
    }

    /**
     * Fetch the list of files from the monitored URL
     * @returns {Promise<Array>} Array of file URLs
     */
    async _fetchFileList() {
        try {
            const response = await axios.get(this.monitorUrl, {
                timeout: config.download.timeout,
                headers: {
                    'User-Agent': 'FileMonitorDownloader/1.0'
                }
            });

            const contentType = response.headers['content-type'] || '';

            // Handle JSON response (API endpoint)
            if (contentType.includes('application/json')) {
                return this._parseJsonResponse(response.data);
            }

            // Handle HTML response (directory listing or web page)
            if (contentType.includes('text/html')) {
                return this._parseHtmlResponse(response.data, this.monitorUrl);
            }

            // Handle plain text (simple file list)
            if (contentType.includes('text/plain')) {
                return this._parseTextResponse(response.data);
            }

            logger.warn('Unknown content type, attempting HTML parsing', { contentType });
            return this._parseHtmlResponse(response.data, this.monitorUrl);

        } catch (error) {
            logger.error('Failed to fetch file list', { error: error.message });
            throw error;
        }
    }

    /**
     * Parse JSON response for file URLs
     * Supports common API response formats
     */
    _parseJsonResponse(data) {
        const files = [];

        // Handle array of URLs
        if (Array.isArray(data)) {
            for (const item of data) {
                if (typeof item === 'string') {
                    files.push(item);
                } else if (item.url) {
                    files.push(item.url);
                } else if (item.href) {
                    files.push(item.href);
                } else if (item.link) {
                    files.push(item.link);
                } else if (item.file) {
                    files.push(item.file);
                }
            }
        }

        // Handle object with files array
        if (data.files && Array.isArray(data.files)) {
            files.push(...this._parseJsonResponse(data.files));
        }

        // Handle object with items array
        if (data.items && Array.isArray(data.items)) {
            files.push(...this._parseJsonResponse(data.items));
        }

        return files.filter(f => f && this._isValidFileUrl(f));
    }

    /**
     * Parse HTML response for file links
     * Works with directory listings and web pages
     */
    _parseHtmlResponse(html, baseUrl) {
        const $ = cheerio.load(html);
        const files = [];
        const base = new URL(baseUrl);

        // Find all anchor tags
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            try {
                // Resolve relative URLs
                const absoluteUrl = new URL(href, base).href;

                // Check if it's a file we care about
                if (this._isValidFileUrl(absoluteUrl)) {
                    files.push(absoluteUrl);
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        // Also check img tags for images
        $('img').each((_, element) => {
            const src = $(element).attr('src');
            if (!src) return;

            try {
                const absoluteUrl = new URL(src, base).href;
                if (this._isValidFileUrl(absoluteUrl)) {
                    files.push(absoluteUrl);
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Parse plain text response (one URL per line)
     */
    _parseTextResponse(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && this._isValidFileUrl(line));
    }

    /**
     * Check if a URL points to a valid downloadable file
     */
    _isValidFileUrl(url) {
        try {
            const parsed = new URL(url);
            
            // Must be HTTP or HTTPS
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
            }

            // Check extension if we have one
            const extension = getFileExtension(parsed.pathname);
            if (extension) {
                return isSupportedExtension(extension);
            }

            // No extension - might still be valid (API endpoints, etc.)
            return true;

        } catch {
            return false;
        }
    }

    /**
     * Filter out already-downloaded files
     */
    _filterNewFiles(files) {
        return files.filter(url => {
            // Skip if already discovered in this session
            if (this.discoveredFiles.has(url)) {
                return false;
            }

            // Skip if already downloaded (from persistent storage)
            if (metadataStore.isDownloaded(url)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Process and download new files
     */
    async _processNewFiles(files) {
        logger.info(`Processing ${files.length} new files for download`);

        for (const url of files) {
            // Mark as discovered
            this.discoveredFiles.add(url);

            // Trigger download
            try {
                const result = await downloadService.downloadFile(url);
                
                if (result.success) {
                    logger.info('Successfully downloaded', {
                        url,
                        filename: result.filename
                    });
                } else {
                    logger.warn('Download skipped or failed', {
                        url,
                        reason: result.reason
                    });
                }
            } catch (error) {
                logger.error('Error processing file', {
                    url,
                    error: error.message
                });
            }
        }
    }

    /**
     * Update monitor URL
     * @param {string} url - New URL to monitor
     */
    setMonitorUrl(url) {
        this.monitorUrl = url;
        logger.info('Monitor URL updated', { url });
    }

    /**
     * Update polling interval
     * @param {number} interval - New interval in milliseconds
     */
    setPollInterval(interval) {
        this.pollInterval = interval;
        
        if (this.isRunning) {
            this.stop();
            this.start();
        }
        
        logger.info('Poll interval updated', { interval });
    }

    /**
     * Get current monitor status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            monitorUrl: this.monitorUrl,
            pollInterval: this.pollInterval,
            lastCheck: this.lastCheck,
            discoveredFilesCount: this.discoveredFiles.size
        };
    }

    /**
     * Clear the discovered files cache
     */
    clearCache() {
        this.discoveredFiles.clear();
        logger.info('Discovered files cache cleared');
    }
}

// Export singleton instance
module.exports = new FileMonitor();
