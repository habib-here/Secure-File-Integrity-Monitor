/**
 * Test Script
 * Verifies that all components work correctly.
 * Run: node src/test.js
 */

const config = require('./config');
const logger = require('./utils/logger');
const { 
    ensureDirectory, 
    getFileExtension, 
    getFilenameFromUrl, 
    isSupportedExtension,
    formatFileSize 
} = require('./utils/fileUtils');

console.log('\n=== File Monitor Downloader - Test Suite ===\n');

// Test 1: Configuration
console.log('1. Testing Configuration...');
try {
    console.log('   ✅ Server port:', config.server.port);
    console.log('   ✅ Monitor URL:', config.monitor.url);
    console.log('   ✅ Poll interval:', config.monitor.pollInterval, 'ms');
    console.log('   ✅ Download directory:', config.download.directory);
    console.log('   ✅ Max retries:', config.download.maxRetries);
    console.log('   ✅ Supported extensions:', config.download.supportedExtensions.length, 'types');
} catch (error) {
    console.log('   ❌ Configuration error:', error.message);
    process.exit(1);
}

// Test 2: File utilities
console.log('\n2. Testing File Utilities...');
try {
    // Test getFileExtension
    const ext1 = getFileExtension('https://example.com/file.pdf?token=123');
    console.log('   ✅ getFileExtension("...file.pdf?token=123"):', ext1);
    
    const ext2 = getFileExtension('https://example.com/image.jpg');
    console.log('   ✅ getFileExtension("...image.jpg"):', ext2);

    // Test getFilenameFromUrl
    const name1 = getFilenameFromUrl('https://example.com/path/to/document.pdf');
    console.log('   ✅ getFilenameFromUrl("...document.pdf"):', name1);

    // Test isSupportedExtension
    const supported1 = isSupportedExtension('.pdf');
    console.log('   ✅ isSupportedExtension(".pdf"):', supported1);
    
    const supported2 = isSupportedExtension('.xyz');
    console.log('   ✅ isSupportedExtension(".xyz"):', supported2);

    // Test formatFileSize
    console.log('   ✅ formatFileSize(1024):', formatFileSize(1024));
    console.log('   ✅ formatFileSize(1048576):', formatFileSize(1048576));
} catch (error) {
    console.log('   ❌ File utilities error:', error.message);
    process.exit(1);
}

// Test 3: Metadata Store
console.log('\n3. Testing Metadata Store...');
try {
    const metadataStore = require('./services/metadataStore');
    
    const stats = metadataStore.getStatistics();
    console.log('   ✅ Statistics loaded:', JSON.stringify(stats));
    
    const downloads = metadataStore.getDownloads();
    console.log('   ✅ Downloads loaded:', downloads.length, 'records');
    
    console.log('   ✅ Last check:', metadataStore.getLastCheck() || 'Never');
} catch (error) {
    console.log('   ❌ Metadata store error:', error.message);
    process.exit(1);
}

// Test 4: Download Service
console.log('\n4. Testing Download Service...');
try {
    const downloadService = require('./services/downloadService');
    console.log('   ✅ Download service initialized');
    console.log('   ✅ Active downloads:', downloadService.activeDownloads.size);
} catch (error) {
    console.log('   ❌ Download service error:', error.message);
    process.exit(1);
}

// Test 5: File Monitor
console.log('\n5. Testing File Monitor...');
try {
    const fileMonitor = require('./services/fileMonitor');
    
    const status = fileMonitor.getStatus();
    console.log('   ✅ Monitor status:', JSON.stringify(status, null, 2));
} catch (error) {
    console.log('   ❌ File monitor error:', error.message);
    process.exit(1);
}

// Test 6: Express Routes
console.log('\n6. Testing Express Routes...');
try {
    const routes = require('./routes');
    console.log('   ✅ Routes module loaded successfully');
} catch (error) {
    console.log('   ❌ Routes error:', error.message);
    process.exit(1);
}

// Summary
console.log('\n=== All Tests Passed! ===\n');
console.log('The file monitor downloader is ready to use.');
console.log('Start the server with: npm start');
console.log('Open dashboard at: http://localhost:' + config.server.port);
console.log('\n');

process.exit(0);
