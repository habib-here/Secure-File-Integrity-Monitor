/**
 * Downloads API Routes
 * Provides endpoints for viewing and managing downloads.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const metadataStore = require('../services/metadataStore');
const downloadService = require('../services/downloadService');
const { listDownloadedFiles, formatFileSize } = require('../utils/fileUtils');

/**
 * GET /api/downloads
 * List all download records with optional filtering
 * Query params: status, limit
 */
router.get('/', async (req, res) => {
    try {
        const { status, limit } = req.query;
        
        const options = {};
        if (status) options.status = status;
        if (limit) options.limit = parseInt(limit, 10);

        const downloads = metadataStore.getDownloads(options);

        res.json({
            success: true,
            count: downloads.length,
            downloads
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/downloads/files
 * List actual files in the download directory
 */
router.get('/files', async (req, res) => {
    try {
        const files = await listDownloadedFiles();

        res.json({
            success: true,
            count: files.length,
            directory: config.download.directory,
            files
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/downloads/:id
 * Get a specific download record
 */
router.get('/:id', async (req, res) => {
    try {
        const download = metadataStore.getDownload(req.params.id);

        if (!download) {
            return res.status(404).json({
                success: false,
                error: 'Download not found'
            });
        }

        res.json({
            success: true,
            download
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/downloads
 * Trigger a manual download
 * Body: { url: string, filename?: string }
 */
router.post('/', async (req, res) => {
    try {
        const { url, filename } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        const result = await downloadService.downloadFile(url, { filename });

        res.json({
            success: result.success,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/downloads/batch
 * Download multiple files
 * Body: { urls: string[] }
 */
router.post('/batch', async (req, res) => {
    try {
        const { urls } = req.body;

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'URLs array is required'
            });
        }

        const result = await downloadService.downloadMultiple(urls);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/downloads/retry
 * Retry all failed downloads
 */
router.post('/retry', async (req, res) => {
    try {
        const result = await downloadService.retryFailed();

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/downloads/:id/file
 * Download the actual file
 */
router.get('/:id/file', async (req, res) => {
    try {
        const download = metadataStore.getDownload(req.params.id);

        if (!download) {
            return res.status(404).json({
                success: false,
                error: 'Download not found'
            });
        }

        if (download.status !== 'completed' || !download.localPath) {
            return res.status(400).json({
                success: false,
                error: 'File not available'
            });
        }

        // Check if file exists
        try {
            await fs.access(download.localPath);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'File not found on disk'
            });
        }

        res.download(download.localPath, download.filename);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
