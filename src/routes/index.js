/**
 * API Routes Index
 * Combines all route modules for the Express application.
 */

const express = require('express');
const router = express.Router();

const downloadsRoutes = require('./downloads');
const monitorRoutes = require('./monitor');

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Mount route modules
router.use('/downloads', downloadsRoutes);
router.use('/monitor', monitorRoutes);

module.exports = router;
