#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 automation/n8n/backups/n8n-data-<timestamp>.tar.gz" >&2
  exit 2
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
archive=$(CDPATH= cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")
compose_file="$repo_root/automation/n8n/compose.yaml"

if [ ! -f "$archive" ]; then
  echo "Backup not found: $archive" >&2
  exit 2
fi

echo "Restore is destructive and replaces the current local n8n volume."
echo "Stop here and run the documented restore manually after reviewing the target archive:"
echo "  docker compose -f $compose_file stop n8n"
echo "  docker run --rm --mount type=volume,src=anvi_villas_n8n_data,dst=/data --mount type=bind,src=$(dirname -- "$archive"),dst=/backup alpine:3.22.1 sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/$(basename -- "$archive") -C /data'"
exit 1
