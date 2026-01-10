/**
 * Vercel Serverless API Handler
 * Adapts the Express application for Vercel's serverless environment.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Create Express application
const app = express();

// In-memory storage for serverless (Vercel has no persistent filesystem)
const memoryStore = {
    downloads: [],
    lastCheck: null,
    statistics: {
        totalDownloads: 0,
        totalSize: 0,
        failedDownloads: 0
    }
};

// Monitor state
const monitorState = {
    isRunning: false,
    monitorUrl: process.env.MONITOR_URL || 'https://example.com/files/',
    pollInterval: parseInt(process.env.POLL_INTERVAL, 10) || 60000,
    lastCheck: null,
    discoveredFilesCount: 0
};

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: 'vercel-serverless'
    });
});

// Monitor status
app.get('/api/monitor/status', (req, res) => {
    res.json({
        success: true,
        monitor: monitorState,
        statistics: {
            ...memoryStore.statistics,
            pendingDownloads: memoryStore.downloads.filter(d => d.status === 'pending').length,
            completedDownloads: memoryStore.downloads.filter(d => d.status === 'completed').length,
            failedDownloads: memoryStore.downloads.filter(d => d.status === 'failed').length,
            lastCheck: memoryStore.lastCheck
        }
    });
});

// Start monitor (simulated for serverless)
app.post('/api/monitor/start', (req, res) => {
    monitorState.isRunning = true;
    res.json({
        success: true,
        message: 'Monitor started (serverless mode - use webhooks or cron for actual monitoring)',
        status: monitorState
    });
});

// Stop monitor
app.post('/api/monitor/stop', (req, res) => {
    monitorState.isRunning = false;
    res.json({
        success: true,
        message: 'Monitor stopped',
        status: monitorState
    });
});

// Manual check (demo mode)
app.post('/api/monitor/check', async (req, res) => {
    try {
        monitorState.lastCheck = new Date().toISOString();
        memoryStore.lastCheck = monitorState.lastCheck;

        // Demo: simulate finding files
        res.json({
            success: true,
            totalFound: 0,
            newFiles: 0,
            lastCheck: monitorState.lastCheck,
            message: 'Check completed (demo mode - deploy full version for actual monitoring)'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update monitor config
app.put('/api/monitor/config', (req, res) => {
    const { url, pollInterval } = req.body;
    
    if (url) monitorState.monitorUrl = url;
    if (pollInterval && pollInterval >= 1000) monitorState.pollInterval = pollInterval;
    
    res.json({
        success: true,
        message: 'Configuration updated',
        status: monitorState
    });
});

// Clear cache
app.post('/api/monitor/clear-cache', (req, res) => {
    monitorState.discoveredFilesCount = 0;
    res.json({
        success: true,
        message: 'Cache cleared'
    });
});

// Get downloads
app.get('/api/downloads', (req, res) => {
    const { status, limit } = req.query;
    let downloads = [...memoryStore.downloads];
    
    if (status) {
        downloads = downloads.filter(d => d.status === status);
    }
    
    downloads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (limit) {
        downloads = downloads.slice(0, parseInt(limit, 10));
    }
    
    res.json({
        success: true,
        count: downloads.length,
        downloads
    });
});

// Get download files (serverless - no filesystem)
app.get('/api/downloads/files', (req, res) => {
    res.json({
        success: true,
        count: 0,
        files: [],
        message: 'File system not available in serverless mode'
    });
});

// Get single download
app.get('/api/downloads/:id', (req, res) => {
    const download = memoryStore.downloads.find(d => d.id === req.params.id);
    
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
});

// Add download (demo)
app.post('/api/downloads', async (req, res) => {
    const { url, filename } = req.body;
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL is required'
        });
    }
    
    // Demo: create a download record
    const download = {
        id: Date.now().toString(),
        sourceUrl: url,
        filename: filename || url.split('/').pop() || 'file',
        status: 'pending',
        createdAt: new Date().toISOString(),
        size: 0,
        message: 'Demo mode - actual downloads require full deployment'
    };
    
    memoryStore.downloads.push(download);
    
    res.json({
        success: true,
        ...download
    });
});

// Batch download (demo)
app.post('/api/downloads/batch', (req, res) => {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({
            success: false,
            error: 'URLs array is required'
        });
    }
    
    res.json({
        success: true,
        total: urls.length,
        successful: 0,
        failed: 0,
        skipped: urls.length,
        message: 'Demo mode - actual downloads require full deployment'
    });
});

// Retry failed
app.post('/api/downloads/retry', (req, res) => {
    res.json({
        success: true,
        retried: 0,
        successful: 0,
        stillFailed: 0,
        message: 'Demo mode'
    });
});

// 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Export for Vercel
module.exports = app;
