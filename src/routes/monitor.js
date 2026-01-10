/**
 * Monitor API Routes
 * Provides endpoints for controlling the file monitor.
 */

const express = require('express');
const router = express.Router();
const fileMonitor = require('../services/fileMonitor');
const metadataStore = require('../services/metadataStore');

/**
 * GET /api/monitor/status
 * Get the current monitor status
 */
router.get('/status', (req, res) => {
    try {
        const status = fileMonitor.getStatus();
        const statistics = metadataStore.getStatistics();

        res.json({
            success: true,
            monitor: status,
            statistics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/monitor/start
 * Start the file monitor
 */
router.post('/start', (req, res) => {
    try {
        fileMonitor.start();

        res.json({
            success: true,
            message: 'Monitor started',
            status: fileMonitor.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/monitor/stop
 * Stop the file monitor
 */
router.post('/stop', (req, res) => {
    try {
        fileMonitor.stop();

        res.json({
            success: true,
            message: 'Monitor stopped',
            status: fileMonitor.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/monitor/check
 * Trigger a manual check for new files
 */
router.post('/check', async (req, res) => {
    try {
        const result = await fileMonitor.checkForFiles();

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
 * PUT /api/monitor/config
 * Update monitor configuration
 * Body: { url?: string, pollInterval?: number }
 */
router.put('/config', (req, res) => {
    try {
        const { url, pollInterval } = req.body;

        if (url) {
            fileMonitor.setMonitorUrl(url);
        }

        if (pollInterval) {
            if (pollInterval < 1000) {
                return res.status(400).json({
                    success: false,
                    error: 'Poll interval must be at least 1000ms'
                });
            }
            fileMonitor.setPollInterval(pollInterval);
        }

        res.json({
            success: true,
            message: 'Configuration updated',
            status: fileMonitor.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/monitor/clear-cache
 * Clear the discovered files cache
 */
router.post('/clear-cache', (req, res) => {
    try {
        fileMonitor.clearCache();

        res.json({
            success: true,
            message: 'Cache cleared'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
