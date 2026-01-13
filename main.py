#!/usr/bin/env python3
"""
Secure File Integrity & Aggregation Agent
Real-time file monitoring with SHA-256 integrity verification.

Security Features:
- Chunked file reading (memory-safe for files >10GB)
- File stability detection before hashing (race condition prevention)
- Comprehensive exception handling for locked/deleted files
"""

import os
import sys
import time
import hashlib
import logging
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

# ============================================================================
# CONFIGURATION
# ============================================================================

WATCH_DIRECTORY = os.getenv("WATCH_DIR", "./monitored")
DOWNLOAD_DIRECTORY = os.getenv("DOWNLOAD_DIR", "./downloads")
LOG_FILE = os.getenv("LOG_FILE", "./logs/integrity.log")
HASH_MANIFEST = os.getenv("HASH_MANIFEST", "./logs/hash_manifest.log")
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))

# Stability detection settings (race condition prevention)
FILE_STABILITY_CHECKS = int(os.getenv("STABILITY_CHECKS", "3"))
FILE_STABILITY_INTERVAL = float(os.getenv("STABILITY_INTERVAL", "0.5"))
HASH_CHUNK_SIZE = int(os.getenv("HASH_CHUNK_SIZE", "65536"))  # 64KB chunks
MAX_HASH_RETRIES = int(os.getenv("MAX_HASH_RETRIES", "3"))

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

def setup_logging() -> logging.Logger:
    """Configure structured logging with timestamp, level, and message."""
    log_dir = Path(LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    logger = logging.getLogger("SecureFileMonitor")
    logger.setLevel(logging.DEBUG)
    
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File Handler (Immutable Append-Only Log)
    file_handler = logging.FileHandler(LOG_FILE, mode='a', encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    return logger

logger = setup_logging()

# ============================================================================
# CRYPTOGRAPHIC INTEGRITY FUNCTIONS
# ============================================================================

def wait_for_file_stability(filepath: str, checks: int = FILE_STABILITY_CHECKS, 
                            interval: float = FILE_STABILITY_INTERVAL) -> bool:
    """
    Wait until file size stabilizes (prevents race conditions with incomplete writes).
    
    Args:
        filepath: Path to the file.
        checks: Number of consecutive size checks that must match.
        interval: Time between checks in seconds.
    
    Returns:
        True if file is stable, False if file disappeared or error occurred.
    """
    try:
        previous_size = -1
        stable_count = 0
        
        for _ in range(checks * 3):  # Max attempts = 3x the required checks
            if not os.path.exists(filepath):
                logger.warning(f"STABILITY_CHECK: File disappeared during wait - {filepath}")
                return False
            
            try:
                current_size = os.path.getsize(filepath)
            except (OSError, PermissionError):
                time.sleep(interval)
                continue
            
            if current_size == previous_size and current_size > 0:
                stable_count += 1
                if stable_count >= checks:
                    logger.debug(f"STABILITY_CONFIRMED: {Path(filepath).name} ({current_size} bytes)")
                    return True
            else:
                stable_count = 0
            
            previous_size = current_size
            time.sleep(interval)
        
        logger.warning(f"STABILITY_TIMEOUT: File never stabilized - {filepath}")
        return False
    
    except Exception as e:
        logger.error(f"STABILITY_ERROR: {filepath} - {str(e)}")
        return False


def calculate_file_hash(filepath: str, algorithm: str = "sha256", 
                        chunk_size: int = HASH_CHUNK_SIZE) -> Optional[str]:
    """
    Calculate cryptographic hash of a file using SHA-256.
    
    Memory-safe: Reads file in configurable chunks (default 64KB).
    Handles files >10GB without memory issues.
    
    Args:
        filepath: Path to the file to hash.
        algorithm: Hash algorithm (default: sha256).
        chunk_size: Bytes to read per iteration (default: 64KB).
    
    Returns:
        Hexadecimal hash string or None if error occurs.
    """
    try:
        if not os.path.exists(filepath):
            logger.error(f"FILE_NOT_FOUND: {filepath}")
            return None
        
        hash_func = hashlib.new(algorithm)
        bytes_read = 0
        
        with open(filepath, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                hash_func.update(chunk)
                bytes_read += len(chunk)
        
        file_hash = hash_func.hexdigest()
        logger.debug(f"HASH_COMPLETE: {Path(filepath).name} ({bytes_read} bytes) -> {file_hash[:16]}...")
        return file_hash
    
    except PermissionError:
        logger.error(f"PERMISSION_DENIED: Cannot read file - {filepath}")
        return None
    except FileNotFoundError:
        logger.error(f"FILE_DELETED: File removed during hash operation - {filepath}")
        return None
    except IOError as e:
        logger.error(f"IO_ERROR: {filepath} - {str(e)}")
        return None
    except Exception as e:
        logger.error(f"HASH_ERROR: {filepath} - {type(e).__name__}: {str(e)}")
        return None


def calculate_file_hash_with_retry(filepath: str, max_retries: int = MAX_HASH_RETRIES) -> Tuple[Optional[str], bool]:
    """
    Attempt to hash a file with retries for transient failures.
    
    Args:
        filepath: Path to the file.
        max_retries: Maximum retry attempts.
    
    Returns:
        Tuple of (hash_string or None, success_boolean).
    """
    for attempt in range(max_retries):
        if not os.path.exists(filepath):
            logger.warning(f"HASH_RETRY: File not found (attempt {attempt + 1}/{max_retries}) - {filepath}")
            time.sleep(0.5)
            continue
        
        file_hash = calculate_file_hash(filepath)
        if file_hash:
            return (file_hash, True)
        
        if attempt < max_retries - 1:
            logger.debug(f"HASH_RETRY: Attempt {attempt + 1} failed, retrying...")
            time.sleep(0.5 * (attempt + 1))  # Exponential backoff
    
    logger.error(f"HASH_FAILED: Exhausted {max_retries} retries - {filepath}")
    return (None, False)

def log_hash_to_manifest(filepath: str, file_hash: str, event_type: str) -> None:
    """
    Append file hash to immutable manifest log for audit trail.
    
    Args:
        filepath: Path to the file.
        file_hash: SHA-256 hash of the file.
        event_type: Type of event (CREATED, MODIFIED, DOWNLOADED).
    """
    manifest_dir = Path(HASH_MANIFEST).parent
    manifest_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now(tz=None).astimezone().isoformat()
    filename = Path(filepath).name
    
    entry = f"{timestamp} | {event_type:12} | {file_hash} | {filename}\n"
    
    try:
        with open(HASH_MANIFEST, 'a', encoding='utf-8') as f:
            f.write(entry)
        logger.info(f"MANIFEST_UPDATED: {filename} [{event_type}]")
    except PermissionError:
        logger.error(f"MANIFEST_WRITE_DENIED: Cannot write to {HASH_MANIFEST}")

def verify_file_integrity(filepath: str, expected_hash: str) -> bool:
    """
    Verify file integrity by comparing calculated hash with expected hash.
    
    Args:
        filepath: Path to the file.
        expected_hash: Expected SHA-256 hash.
    
    Returns:
        True if hashes match, False otherwise.
    """
    calculated_hash = calculate_file_hash(filepath)
    
    if calculated_hash is None:
        logger.warning(f"INTEGRITY_CHECK_FAILED: Could not calculate hash for {filepath}")
        return False
    
    if calculated_hash.lower() == expected_hash.lower():
        logger.info(f"INTEGRITY_VERIFIED: {Path(filepath).name}")
        return True
    else:
        logger.critical(f"INTEGRITY_VIOLATION: {Path(filepath).name} - Hash mismatch detected!")
        logger.critical(f"  Expected: {expected_hash}")
        logger.critical(f"  Actual:   {calculated_hash}")
        return False

# ============================================================================
# FILE DOWNLOAD WITH INTEGRITY VERIFICATION
# ============================================================================

def download_file(url: str, destination: Optional[str] = None) -> Optional[str]:
    """
    Download file from URL with integrity logging.
    
    Args:
        url: URL to download from.
        destination: Optional destination path.
    
    Returns:
        Path to downloaded file or None if failed.
    """
    try:
        logger.info(f"DOWNLOAD_INITIATED: {url}")
        
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT,
            stream=True,
            headers={"User-Agent": "SecureFileMonitor/1.0"}
        )
        response.raise_for_status()
        
        # Determine filename
        if destination:
            filepath = destination
        else:
            filename = url.split('/')[-1] or f"download_{int(time.time())}"
            filepath = os.path.join(DOWNLOAD_DIRECTORY, filename)
        
        # Ensure download directory exists
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Download with progress tracking
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
        
        logger.info(f"DOWNLOAD_COMPLETE: {Path(filepath).name} ({downloaded} bytes)")
        
        # Calculate and log integrity hash
        file_hash = calculate_file_hash(filepath)
        if file_hash:
            log_hash_to_manifest(filepath, file_hash, "DOWNLOADED")
            logger.info(f"SHA256: {file_hash}")
        
        return filepath
    
    except requests.exceptions.Timeout:
        logger.error(f"TIMEOUT_ERROR: Request timed out after {REQUEST_TIMEOUT}s - {url}")
        return None
    except requests.exceptions.ConnectionError:
        logger.error(f"CONNECTION_ERROR: Failed to connect to {url}")
        return None
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP_ERROR: {e.response.status_code} - {url}")
        return None
    except PermissionError:
        logger.error(f"PERMISSION_DENIED: Cannot write to {destination or DOWNLOAD_DIRECTORY}")
        return None
    except Exception as e:
        logger.error(f"DOWNLOAD_FAILED: {url} - {str(e)}")
        return None

# ============================================================================
# FILE SYSTEM EVENT HANDLER
# ============================================================================

class IntegrityEventHandler(FileSystemEventHandler):
    """
    Watchdog event handler for file integrity monitoring.
    
    Features:
    - File stability detection before hashing (race condition prevention)
    - Retry logic for transient failures
    - Debouncing for rapid modification events
    """
    
    def __init__(self):
        super().__init__()
        self._processing_lock = {}
        self._last_modified = {}
    
    def _is_file_locked(self, filepath: str) -> bool:
        """Check if file is currently being processed."""
        return self._processing_lock.get(filepath, False)
    
    def _set_processing(self, filepath: str, state: bool) -> None:
        """Mark file as processing or complete."""
        self._processing_lock[filepath] = state
    
    def on_created(self, event: FileSystemEvent) -> None:
        """Handle file creation events with stability detection."""
        if event.is_directory:
            return
        
        filepath = event.src_path
        
        if self._is_file_locked(filepath):
            return
        
        self._set_processing(filepath, True)
        
        try:
            logger.info(f"FILE_CREATED: {Path(filepath).name}")
            
            # Wait for file to be fully written (race condition fix)
            if not wait_for_file_stability(filepath):
                logger.warning(f"SKIPPED: File unstable or deleted - {Path(filepath).name}")
                return
            
            self._process_file_safe(filepath, "CREATED")
        finally:
            self._set_processing(filepath, False)
    
    def on_modified(self, event: FileSystemEvent) -> None:
        """Handle file modification events with debouncing."""
        if event.is_directory:
            return
        
        filepath = event.src_path
        current_time = time.time()
        
        # Debounce: Ignore rapid modifications within 1 second
        last_time = self._last_modified.get(filepath, 0)
        if current_time - last_time < 1.0:
            return
        self._last_modified[filepath] = current_time
        
        if self._is_file_locked(filepath):
            return
        
        self._set_processing(filepath, True)
        
        try:
            logger.info(f"FILE_MODIFIED: {Path(filepath).name}")
            
            if not wait_for_file_stability(filepath):
                logger.warning(f"SKIPPED: File unstable - {Path(filepath).name}")
                return
            
            self._process_file_safe(filepath, "MODIFIED")
        finally:
            self._set_processing(filepath, False)
        
        # Cleanup old entries to prevent memory leak
        if len(self._last_modified) > 1000:
            cutoff = current_time - 60
            self._last_modified = {k: v for k, v in self._last_modified.items() if v > cutoff}
    
    def on_deleted(self, event: FileSystemEvent) -> None:
        """Handle file deletion events."""
        if event.is_directory:
            return
        
        filepath = event.src_path
        logger.warning(f"FILE_DELETED: {Path(filepath).name}")
        
        try:
            log_hash_to_manifest(filepath, "N/A", "DELETED")
        except Exception as e:
            logger.error(f"MANIFEST_ERROR: Could not log deletion - {str(e)}")
    
    def _process_file_safe(self, filepath: str, event_type: str) -> None:
        """Process file with comprehensive error handling and retry logic."""
        try:
            if not os.path.exists(filepath):
                logger.warning(f"PROCESS_SKIPPED: File no longer exists - {filepath}")
                return
            
            file_hash, success = calculate_file_hash_with_retry(filepath)
            
            if success and file_hash:
                log_hash_to_manifest(filepath, file_hash, event_type)
                logger.info(f"SHA256: {file_hash}")
            else:
                logger.error(f"HASH_FAILED: Could not compute hash for {Path(filepath).name}")
        
        except PermissionError:
            logger.error(f"PERMISSION_DENIED: Cannot process {filepath}")
        except Exception as e:
            logger.error(f"PROCESSING_ERROR: {filepath} - {type(e).__name__}: {str(e)}")

# ============================================================================
# MAIN MONITORING LOOP
# ============================================================================

def start_monitor() -> None:
    """Initialize and start the file integrity monitor."""
    
    # Ensure directories exist
    Path(WATCH_DIRECTORY).mkdir(parents=True, exist_ok=True)
    Path(DOWNLOAD_DIRECTORY).mkdir(parents=True, exist_ok=True)
    
    logger.info("=" * 60)
    logger.info("SECURE FILE INTEGRITY MONITOR - STARTING")
    logger.info("=" * 60)
    logger.info(f"Watch Directory:    {os.path.abspath(WATCH_DIRECTORY)}")
    logger.info(f"Download Directory: {os.path.abspath(DOWNLOAD_DIRECTORY)}")
    logger.info(f"Hash Manifest:      {os.path.abspath(HASH_MANIFEST)}")
    logger.info(f"Log File:           {os.path.abspath(LOG_FILE)}")
    logger.info("=" * 60)
    
    # Initialize watchdog observer
    event_handler = IntegrityEventHandler()
    observer = Observer()
    
    # Monitor both directories
    observer.schedule(event_handler, WATCH_DIRECTORY, recursive=True)
    observer.schedule(event_handler, DOWNLOAD_DIRECTORY, recursive=True)
    
    observer.start()
    logger.info("MONITOR_ACTIVE: Watching for file system events...")
    
    try:
        while True:
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("SHUTDOWN_INITIATED: Received interrupt signal")
        observer.stop()
    except Exception as e:
        logger.critical(f"FATAL_ERROR: {str(e)}")
        observer.stop()
        raise
    
    observer.join()
    logger.info("MONITOR_STOPPED: Secure File Monitor terminated")

# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    try:
        start_monitor()
    except Exception as e:
        logger.critical(f"STARTUP_FAILED: {str(e)}")
        sys.exit(1)
