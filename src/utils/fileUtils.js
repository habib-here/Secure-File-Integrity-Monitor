/**
 * File Utilities
 * Helper functions for file operations, validation, and path handling.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path to ensure
 */
const ensureDirectory = async (dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
};

/**
 * Synchronously ensures a directory exists
 * @param {string} dirPath - Directory path to ensure
 */
const ensureDirectorySync = (dirPath) => {
    if (!fsSync.existsSync(dirPath)) {
        fsSync.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Gets the file extension from a URL or filename
 * @param {string} url - URL or filename
 * @returns {string} Lowercase file extension including the dot
 */
const getFileExtension = (url) => {
    // Remove query parameters and fragments
    const cleanUrl = url.split('?')[0].split('#')[0];
    const ext = path.extname(cleanUrl).toLowerCase();
    return ext;
};

/**
 * Extracts filename from URL
 * @param {string} url - URL to extract filename from
 * @returns {string} Extracted filename
 */
const getFilenameFromUrl = (url) => {
    // Remove query parameters and fragments
    const cleanUrl = url.split('?')[0].split('#')[0];
    // Get the last path segment
    const segments = cleanUrl.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'unknown';
};

/**
 * Generates a unique filename to avoid conflicts
 * @param {string} directory - Target directory
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} Unique filename
 */
const getUniqueFilename = async (directory, originalName) => {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    let filename = originalName;
    let counter = 1;

    while (fsSync.existsSync(path.join(directory, filename))) {
        filename = `${baseName}_${counter}${ext}`;
        counter++;
    }

    return filename;
};

/**
 * Calculates MD5 hash of file content
 * @param {Buffer} buffer - File content buffer
 * @returns {string} MD5 hash
 */
const calculateHash = (buffer) => {
    return crypto.createHash('md5').update(buffer).digest('hex');
};

/**
 * Checks if a file extension is supported
 * @param {string} extension - File extension to check
 * @returns {boolean} True if supported
 */
const isSupportedExtension = (extension) => {
    const ext = extension.toLowerCase();
    return config.download.supportedExtensions.includes(ext) || 
           config.download.supportedExtensions.length === 0;
};

/**
 * Formats file size to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Gets file stats safely
 * @param {string} filePath - Path to file
 * @returns {Promise<Object|null>} File stats or null if not found
 */
const getFileStats = async (filePath) => {
    try {
        return await fs.stat(filePath);
    } catch {
        return null;
    }
};

/**
 * Lists all files in the download directory
 * @returns {Promise<Array>} Array of file information objects
 */
const listDownloadedFiles = async () => {
    await ensureDirectory(config.download.directory);
    
    const files = await fs.readdir(config.download.directory);
    const fileInfos = [];

    for (const file of files) {
        const filePath = path.join(config.download.directory, file);
        const stats = await getFileStats(filePath);
        
        if (stats && stats.isFile()) {
            fileInfos.push({
                name: file,
                path: filePath,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
            });
        }
    }

    return fileInfos;
};

module.exports = {
    ensureDirectory,
    ensureDirectorySync,
    getFileExtension,
    getFilenameFromUrl,
    getUniqueFilename,
    calculateHash,
    isSupportedExtension,
    formatFileSize,
    getFileStats,
    listDownloadedFiles
};
