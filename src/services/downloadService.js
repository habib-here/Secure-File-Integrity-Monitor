/**
 * Download Service
 * Handles file downloads with retry logic, error handling,
 * and progress tracking.
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const config = require('../config');
const logger = require('../utils/logger');
const metadataStore = require('./metadataStore');
const {
    ensureDirectory,
    getFilenameFromUrl,
    getUniqueFilename,
    calculateHash,
    isSupportedExtension,
    getFileExtension,
    formatFileSize
} = require('../utils/fileUtils');

class DownloadService {
    constructor() {
        this.activeDownloads = new Map();
        this.downloadQueue = [];
        this.isProcessing = false;
    }

    /**
     * Downloads a file from URL with retry support
     * @param {string} url - URL to download
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Download result
     */
    async downloadFile(url, options = {}) {
        const filename = options.filename || getFilenameFromUrl(url);
        const extension = getFileExtension(filename);

        // Check if extension is supported
        if (!isSupportedExtension(extension)) {
            logger.warn(`Unsupported file extension: ${extension}`, { url });
            return { success: false, reason: 'unsupported_extension' };
        }

        // Check if already downloaded (URL-based deduplication)
        if (metadataStore.isDownloaded(url)) {
            logger.debug(`File already downloaded: ${url}`);
            return { success: false, reason: 'already_downloaded' };
        }

        // Create download record
        const record = await metadataStore.addDownload({
            url,
            filename,
            status: 'pending'
        });

        // Attempt download with retries
        return this._downloadWithRetry(url, filename, record.id, options);
    }

    /**
     * Internal method to download with retry logic
     */
    async _downloadWithRetry(url, filename, recordId, options = {}) {
        const maxRetries = options.maxRetries || config.download.maxRetries;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`Download attempt ${attempt}/${maxRetries}`, { url, filename });

                await metadataStore.updateDownload(recordId, {
                    status: attempt > 1 ? 'retrying' : 'downloading',
                    retryCount: attempt - 1
                });

                const result = await this._performDownload(url, filename, recordId);
                
                logger.info('Download completed successfully', {
                    filename: result.filename,
                    size: formatFileSize(result.size)
                });

                return { success: true, ...result };

            } catch (error) {
                lastError = error;
                logger.warn(`Download attempt ${attempt} failed`, {
                    url,
                    error: error.message
                });

                if (attempt < maxRetries) {
                    // Wait before retry with exponential backoff
                    const delay = config.download.retryDelay * Math.pow(2, attempt - 1);
                    logger.info(`Waiting ${delay}ms before retry...`);
                    await this._sleep(delay);
                }
            }
        }

        // All retries exhausted
        await metadataStore.updateDownload(recordId, {
            status: 'failed',
            error: lastError.message
        });

        logger.error('Download failed after all retries', {
            url,
            error: lastError.message
        });

        return {
            success: false,
            reason: 'download_failed',
            error: lastError.message
        };
    }

    /**
     * Performs the actual download
     */
    async _performDownload(url, filename, recordId) {
        // Ensure download directory exists
        await ensureDirectory(config.download.directory);

        // Make HTTP request
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: config.download.timeout,
            headers: {
                'User-Agent': 'FileMonitorDownloader/1.0'
            },
            validateStatus: (status) => status >= 200 && status < 300
        });

        const buffer = Buffer.from(response.data);
        const hash = calculateHash(buffer);

        // Check for content-based duplicate
        if (metadataStore.hashExists(hash)) {
            logger.info('Duplicate content detected, skipping', { hash });
            await metadataStore.updateDownload(recordId, {
                status: 'skipped',
                hash,
                error: 'duplicate_content'
            });
            return {
                filename,
                size: buffer.length,
                hash,
                skipped: true,
                reason: 'duplicate_content'
            };
        }

        // Determine final filename and ensure uniqueness
        const contentType = response.headers['content-type'];
        let finalFilename = filename;

        // If filename has no extension, try to determine from content-type
        if (!getFileExtension(filename)) {
            const ext = mime.extension(contentType);
            if (ext) {
                finalFilename = `${filename}.${ext}`;
            }
        }

        // Get unique filename
        finalFilename = await getUniqueFilename(config.download.directory, finalFilename);
        const localPath = path.join(config.download.directory, finalFilename);

        // Write file to disk
        await fs.writeFile(localPath, buffer);

        // Update metadata
        await metadataStore.updateDownload(recordId, {
            status: 'completed',
            filename: finalFilename,
            localPath,
            size: buffer.length,
            hash,
            mimeType: contentType
        });

        return {
            filename: finalFilename,
            localPath,
            size: buffer.length,
            hash,
            mimeType: contentType
        };
    }

    /**
     * Download multiple files
     * @param {Array<string>} urls - Array of URLs to download
     * @returns {Promise<Object>} Results summary
     */
    async downloadMultiple(urls) {
        const results = {
            total: urls.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            downloads: []
        };

        for (const url of urls) {
            const result = await this.downloadFile(url);
            results.downloads.push({ url, ...result });

            if (result.success) {
                results.successful++;
            } else if (result.reason === 'already_downloaded' || result.reason === 'duplicate_content') {
                results.skipped++;
            } else {
                results.failed++;
            }
        }

        logger.info('Batch download completed', {
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            skipped: results.skipped
        });

        return results;
    }

    /**
     * Retry failed downloads
     * @returns {Promise<Object>} Retry results
     */
    async retryFailed() {
        const failed = metadataStore.getDownloads({ status: 'failed' });
        
        if (failed.length === 0) {
            logger.info('No failed downloads to retry');
            return { retried: 0 };
        }

        logger.info(`Retrying ${failed.length} failed downloads`);

        const results = {
            retried: 0,
            successful: 0,
            stillFailed: 0
        };

        for (const download of failed) {
            // Reset the download status to allow retry
            await metadataStore.updateDownload(download.id, {
                status: 'pending',
                error: null
            });

            const result = await this._downloadWithRetry(
                download.sourceUrl,
                download.filename,
                download.id
            );

            results.retried++;
            if (result.success) {
                results.successful++;
            } else {
                results.stillFailed++;
            }
        }

        return results;
    }

    /**
     * Sleep utility
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
module.exports = new DownloadService();
