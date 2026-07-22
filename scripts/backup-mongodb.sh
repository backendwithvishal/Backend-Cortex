#!/usr/bin/env bash
# ==============================================================================
# Cortex AI — Automated MongoDB Backup Script
# ==============================================================================

set -euo pipefail

# Configuration
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/cortex_ai}"
BACKUP_DIR="${BACKUP_DIR:-./backups/mongodb}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="${BACKUP_DIR}/backup_${TIMESTAMP}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

echo "[INFO] Starting MongoDB Backup at $(date)..."
mkdir -p "${BACKUP_DIR}"

# Execute mongodump
if command -v mongodump &> /dev/null; then
    mongodump --uri="${MONGO_URI}" --out="${BACKUP_PATH}" --quiet
    echo "[INFO] Database dump created at ${BACKUP_PATH}"

    # Compress archive
    tar -czf "${BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}" "backup_${TIMESTAMP}"
    rm -rf "${BACKUP_PATH}"
    echo "[INFO] Compressed backup archive created at ${BACKUP_PATH}.tar.gz"
else
    echo "[ERROR] mongodump tool not found in PATH. Please install mongodb-database-tools."
    exit 1
fi

# Clean up old backups exceeding retention days
echo "[INFO] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "backup_*.tar.gz" -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;

echo "[SUCCESS] Backup process completed successfully!"
