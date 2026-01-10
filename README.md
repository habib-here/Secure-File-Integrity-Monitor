# 📁 File Monitor Downloader

A production-ready automated file monitoring and downloader system built with Node.js and Express. This system monitors specified URLs for new files and automatically downloads them with retry support, duplicate prevention, and comprehensive logging.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Express](https://img.shields.io/badge/Express-4.18-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ Features

### Core Functionality
- **🔍 URL Monitoring** - Monitor HTTP endpoints, directory listings, or web pages for new files
- **📥 Automatic Downloads** - Immediately download files when they become available
- **📦 Multi-format Support** - Handle images, PDFs, ZIPs, documents, and more
- **🔄 Duplicate Prevention** - URL-based and content-hash-based deduplication
- **🔁 Retry Logic** - Automatic retries with exponential backoff for failed downloads
- **📊 Metadata Tracking** - Store download history, status, and file information

### API & Dashboard
- **🌐 RESTful API** - Complete API for managing downloads and monitor
- **📱 Web Dashboard** - Beautiful, responsive dashboard for monitoring and control
- **📈 Real-time Stats** - View download statistics and monitor status
- **🔔 Activity Logging** - Comprehensive logging for all operations

### Deployment Ready
- **☁️ Vercel Compatible** - Serverless deployment configuration included
- **🔒 Environment Variables** - Secure configuration management
- **📝 Comprehensive Documentation** - Clear setup and usage instructions

## 🏗️ Project Structure

```
file-monitor-downloader/
├── api/
│   └── index.js              # Vercel serverless handler
├── data/
│   └── downloads.json        # Download metadata storage
├── downloads/                 # Downloaded files directory
├── logs/                      # Application logs
├── public/
│   └── index.html            # Web dashboard
├── src/
│   ├── config/
│   │   └── index.js          # Configuration module
│   ├── routes/
│   │   ├── index.js          # Route aggregator
│   │   ├── downloads.js      # Download API routes
│   │   └── monitor.js        # Monitor API routes
│   ├── services/
│   │   ├── downloadService.js   # Download logic with retries
│   │   ├── fileMonitor.js       # URL monitoring service
│   │   └── metadataStore.js     # Persistent storage
│   ├── utils/
│   │   ├── fileUtils.js      # File operation helpers
│   │   └── logger.js         # Winston logger setup
│   └── index.js              # Application entry point
├── .env.example              # Environment template
├── .gitignore
├── package.json
├── README.md
└── vercel.json               # Vercel deployment config
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0 or higher
- npm or yarn

### Local Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/file-monitor-downloader.git
   cd file-monitor-downloader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open the dashboard**
   ```
   http://localhost:3000
   ```

### Development Mode
```bash
npm run dev
```

## ⚙️ Configuration

Create a `.env` file based on `.env.example`:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Monitoring Configuration
MONITOR_URL=https://example.com/files/
POLL_INTERVAL=60000              # 1 minute

# Download Configuration
DOWNLOAD_DIR=./downloads
MAX_RETRIES=3
RETRY_DELAY=5000                 # 5 seconds
REQUEST_TIMEOUT=30000            # 30 seconds

# Supported file extensions
SUPPORTED_EXTENSIONS=.jpg,.jpeg,.png,.gif,.pdf,.zip,.doc,.docx

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `MONITOR_URL` | URL to monitor for files | Required |
| `POLL_INTERVAL` | Check interval in ms | `60000` |
| `DOWNLOAD_DIR` | Download destination | `./downloads` |
| `MAX_RETRIES` | Max download attempts | `3` |
| `RETRY_DELAY` | Delay between retries | `5000` |
| `REQUEST_TIMEOUT` | HTTP timeout | `30000` |
| `SUPPORTED_EXTENSIONS` | Allowed file types | Common types |
| `LOG_LEVEL` | Logging verbosity | `info` |

## 📡 API Reference

### Monitor Endpoints

#### Get Monitor Status
```http
GET /api/monitor/status
```
Response:
```json
{
  "success": true,
  "monitor": {
    "isRunning": true,
    "monitorUrl": "https://example.com/files/",
    "pollInterval": 60000,
    "lastCheck": "2024-01-15T10:30:00.000Z"
  },
  "statistics": {
    "totalDownloads": 42,
    "completedDownloads": 40,
    "failedDownloads": 2
  }
}
```

#### Start Monitor
```http
POST /api/monitor/start
```

#### Stop Monitor
```http
POST /api/monitor/stop
```

#### Trigger Manual Check
```http
POST /api/monitor/check
```

#### Update Configuration
```http
PUT /api/monitor/config
Content-Type: application/json

{
  "url": "https://new-url.com/files/",
  "pollInterval": 120000
}
```

### Download Endpoints

#### List Downloads
```http
GET /api/downloads?status=completed&limit=10
```

#### Get Download Details
```http
GET /api/downloads/:id
```

#### Trigger Manual Download
```http
POST /api/downloads
Content-Type: application/json

{
  "url": "https://example.com/file.pdf",
  "filename": "custom-name.pdf"
}
```

#### Batch Download
```http
POST /api/downloads/batch
Content-Type: application/json

{
  "urls": [
    "https://example.com/file1.pdf",
    "https://example.com/file2.pdf"
  ]
}
```

#### Retry Failed Downloads
```http
POST /api/downloads/retry
```

#### List Physical Files
```http
GET /api/downloads/files
```

### Health Check
```http
GET /api/health
```

## 🌐 Deployment

### Deploy to Vercel

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables**
   ```bash
   vercel env add MONITOR_URL
   vercel env add POLL_INTERVAL
   ```

4. **Deploy to Production**
   ```bash
   vercel --prod
   ```

### Deploy to Other Platforms

#### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

#### PM2
```bash
npm install -g pm2
pm2 start src/index.js --name file-monitor
pm2 save
```

## 📊 Dashboard Features

The web dashboard provides:

- **Real-time Status** - Monitor running state with live updates
- **Statistics Overview** - Total, pending, completed, and failed downloads
- **Configuration Display** - Current URL and polling settings
- **Manual Download** - Download files on-demand by URL
- **Activity Log** - Real-time log of all operations
- **Control Buttons** - Start, stop, and manual check controls

Access the dashboard at `http://localhost:3000` (or your deployment URL).

## 🔧 How It Works

### Monitoring Process

1. **Polling** - The monitor periodically fetches the configured URL
2. **Parsing** - Responses are parsed (HTML, JSON, or plain text) to extract file links
3. **Filtering** - Links are filtered by supported extensions and deduplicated
4. **Downloading** - New files are queued and downloaded with retry support
5. **Storage** - Metadata is persisted; files are saved to the download directory

### Duplicate Prevention

- **URL-based**: Files from the same URL won't be re-downloaded
- **Hash-based**: Files with identical content (MD5) are detected and skipped

### Retry Logic

Failed downloads are automatically retried with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: After 5 seconds
- Attempt 3: After 10 seconds

## 📝 Logging

Logs are stored in the `logs/` directory:

- `combined.log` - All log entries
- `error.log` - Error-level entries only
- `downloads.log` - Download activity

Log levels: `error`, `warn`, `info`, `debug`

## 🧪 Testing

Test the API using curl:

```bash
# Check health
curl http://localhost:3000/api/health

# Get status
curl http://localhost:3000/api/monitor/status

# Start monitoring
curl -X POST http://localhost:3000/api/monitor/start

# Manual download
curl -X POST http://localhost:3000/api/downloads \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}'

# Trigger check
curl -X POST http://localhost:3000/api/monitor/check
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/) - Fast, unopinionated web framework
- [Axios](https://axios-http.com/) - Promise-based HTTP client
- [Cheerio](https://cheerio.js.org/) - Fast HTML parsing
- [Winston](https://github.com/winstonjs/winston) - Versatile logging library

---

**Built with ❤️ as a portfolio project demonstrating real-world automation skills.**
