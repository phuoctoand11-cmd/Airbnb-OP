#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
backup_dir="$repo_root/automation/n8n/backups"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="n8n-data-$timestamp.tar.gz"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker run --rm \
  --mount type=volume,src=anvi_villas_n8n_data,dst=/data,readonly \
  --mount type=bind,src="$backup_dir",dst=/backup \
  alpine:3.22.1 tar -czf "/backup/$archive" -C /data .
chmod 600 "$backup_dir/$archive"

echo "Restricted local n8n runtime backup written to automation/n8n/backups/$archive"
echo "The archive itself is not encrypted; keep it private. Credential values inside n8n remain encrypted."
echo "Keep N8N_ENCRYPTION_KEY separately; credentials cannot be restored without it."
