/**
 * Metadata Storage Service
 * Manages persistent storage of download metadata including
 * file information, status, and download history.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { ensureDirectorySync } = require('../utils/fileUtils');

class MetadataStore {
    constructor() {
        this.filePath = config.data.downloadsFile;
        this.data = {
            downloads: [],
            lastCheck: null,
            statistics: {
                totalDownloads: 0,
                totalSize: 0,
                failedDownloads: 0
            }
        };
        this._initialize();
    }

    /**
     * Initialize the metadata store by loading existing data
     */
    _initialize() {
        // Ensure data directory exists
        ensureDirectorySync(path.dirname(this.filePath));

        try {
            if (fsSync.existsSync(this.filePath)) {
                const rawData = fsSync.readFileSync(this.filePath, 'utf8');
                const parsed = JSON.parse(rawData);
                this.data = {
                    ...this.data,
                    ...parsed,
                    downloads: parsed.downloads || []
                };
                logger.info(`Loaded ${this.data.downloads.length} download records from storage`);
            } else {
                this._saveSync();
                logger.info('Created new metadata storage file');
            }
        } catch (error) {
            logger.error('Failed to load metadata store', { error: error.message });
            this._saveSync();
        }
    }

    /**
     * Save data synchronously
     */
    _saveSync() {
        try {
            fsSync.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            logger.error('Failed to save metadata', { error: error.message });
        }
    }

    /**
     * Save data asynchronously
     */
    async save() {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            logger.error('Failed to save metadata', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if a URL has already been downloaded
     * @param {string} url - URL to check
     * @returns {boolean} True if already downloaded
     */
    isDownloaded(url) {
        return this.data.downloads.some(
            d => d.sourceUrl === url && d.status === 'completed'
        );
    }

    /**
     * Check if a file hash already exists (content-based deduplication)
     * @param {string} hash - MD5 hash to check
     * @returns {boolean} True if file with hash exists
     */
    hashExists(hash) {
        return this.data.downloads.some(
            d => d.hash === hash && d.status === 'completed'
        );
    }

    /**
     * Add a new download record
     * @param {Object} downloadInfo - Download information
     * @returns {Object} Created download record
     */
    async addDownload(downloadInfo) {
        const record = {
            id: uuidv4(),
            sourceUrl: downloadInfo.url,
            filename: downloadInfo.filename,
            localPath: downloadInfo.localPath,
            size: downloadInfo.size || 0,
            hash: downloadInfo.hash || null,
            mimeType: downloadInfo.mimeType || null,
            status: downloadInfo.status || 'pending',
            retryCount: 0,
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: null,
            metadata: downloadInfo.metadata || {}
        };

        this.data.downloads.push(record);
        await this.save();
        
        logger.info('Added download record', { id: record.id, filename: record.filename });
        return record;
    }

    /**
     * Update an existing download record
     * @param {string} id - Record ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated record or null
     */
    async updateDownload(id, updates) {
        const index = this.data.downloads.findIndex(d => d.id === id);
        
        if (index === -1) {
            return null;
        }

        this.data.downloads[index] = {
            ...this.data.downloads[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        if (updates.status === 'completed') {
            this.data.downloads[index].completedAt = new Date().toISOString();
            this.data.statistics.totalDownloads++;
            this.data.statistics.totalSize += updates.size || 0;
        }

        if (updates.status === 'failed') {
            this.data.statistics.failedDownloads++;
        }

        await this.save();
        return this.data.downloads[index];
    }

    /**
     * Get all download records
     * @param {Object} options - Filter options
     * @returns {Array} Download records
     */
    getDownloads(options = {}) {
        let downloads = [...this.data.downloads];

        // Filter by status
        if (options.status) {
            downloads = downloads.filter(d => d.status === options.status);
        }

        // Sort by date (newest first by default)
        downloads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Limit results
        if (options.limit) {
            downloads = downloads.slice(0, options.limit);
        }

        return downloads;
    }

    /**
     * Get a single download by ID
     * @param {string} id - Download ID
     * @returns {Object|null} Download record or null
     */
    getDownload(id) {
        return this.data.downloads.find(d => d.id === id) || null;
    }

    /**
     * Get pending downloads (for retry processing)
     * @returns {Array} Pending download records
     */
    getPendingDownloads() {
        return this.data.downloads.filter(
            d => d.status === 'pending' || d.status === 'retrying'
        );
    }

    /**
     * Update last check timestamp
     * @param {Date} timestamp - Check timestamp
     */
    async updateLastCheck(timestamp = new Date()) {
        this.data.lastCheck = timestamp.toISOString();
        await this.save();
    }

    /**
     * Get last check timestamp
     * @returns {Date|null} Last check date or null
     */
    getLastCheck() {
        return this.data.lastCheck ? new Date(this.data.lastCheck) : null;
    }

    /**
     * Get download statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            ...this.data.statistics,
            pendingDownloads: this.data.downloads.filter(d => d.status === 'pending').length,
            activeDownloads: this.data.downloads.filter(d => d.status === 'downloading').length,
            completedDownloads: this.data.downloads.filter(d => d.status === 'completed').length,
            failedDownloads: this.data.downloads.filter(d => d.status === 'failed').length,
            lastCheck: this.data.lastCheck
        };
    }

    /**
     * Clean up old records (optional maintenance)
     * @param {number} daysOld - Remove records older than this many days
     */
    async cleanup(daysOld = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);

        const before = this.data.downloads.length;
        this.data.downloads = this.data.downloads.filter(
            d => new Date(d.createdAt) > cutoff || d.status !== 'failed'
        );

        if (this.data.downloads.length < before) {
            await this.save();
            logger.info(`Cleaned up ${before - this.data.downloads.length} old records`);
        }
    }
}

// Export singleton instance
module.exports = new MetadataStore();
