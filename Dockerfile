# ============================================================================
# Secure File Integrity & Aggregation Agent
# Lightweight Production Container
# ============================================================================

FROM python:3.9-slim

# Security: Run as non-root user
RUN groupadd -r monitor && useradd -r -g monitor monitor

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Create directories with proper permissions
RUN mkdir -p /app/monitored /app/downloads /app/logs \
    && chown -R monitor:monitor /app

# Switch to non-root user
USER monitor

# Environment variables
ENV WATCH_DIR=/app/monitored \
    DOWNLOAD_DIR=/app/downloads \
    LOG_FILE=/app/logs/integrity.log \
    HASH_MANIFEST=/app/logs/hash_manifest.log \
    REQUEST_TIMEOUT=30 \
    POLL_INTERVAL=5 \
    PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import os; exit(0 if os.path.exists('/app/logs/integrity.log') else 1)"

# Volume mounts for persistence
VOLUME ["/app/monitored", "/app/downloads", "/app/logs"]

# Run the monitor
CMD ["python", "main.py"]
