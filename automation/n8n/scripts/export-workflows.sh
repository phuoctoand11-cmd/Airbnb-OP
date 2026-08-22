#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
compose_file="$repo_root/automation/n8n/compose.yaml"

mkdir -p "$repo_root/automation/n8n/exports"
docker compose -f "$compose_file" exec -T n8n \
  n8n export:workflow --backup --output=/exports

echo "Workflow exports written to automation/n8n/exports (gitignored)."
