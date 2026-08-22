# Anvi Villas automation — local Phase 1

This directory runs a local-only n8n instance for developing and reviewing Anvi Villas automation. It does not include production credentials, does not deploy anything, and does not write to Supabase.

## Safety boundary

- n8n binds only to `127.0.0.1`.
- The image is pinned to `2.32.7`; upgrades are deliberate changes to `compose.yaml`.
- Telemetry, personalization, version notifications, and public templates are disabled.
- Unverified community packages are disabled. Phase 1 workflows use the built-in JavaScript runner only.
- Code tasks time out after 60 seconds, and archive extraction is limited to 256 MiB and 1,000 entries.
- The included workflow is inactive and performs local CSV validation only.
- Listing mapping uses redacted fixture IDs only; unknown listing names are reported as `unmapped_listing` and are never guessed.
- Files under `../fixtures` are mounted read-only at `/files`.
- Do not paste a Supabase service-role key into workflow nodes or commit credentials.

## First start

1. Copy `.env.example` to `.env`.
2. Replace `N8N_ENCRYPTION_KEY` with a locally generated random value.
3. Start n8n:

   ```sh
   docker compose -f automation/n8n/compose.yaml up -d
   ```

4. Open <http://localhost:5678> and create the local owner account.
5. Import `automation/n8n/workflows/airbnb-import-dry-run.json`.
6. Run it manually. It validates synthetic, redacted CSV content and makes no network request.

## Stop without deleting data

```sh
docker compose -f automation/n8n/compose.yaml stop
```

Do not use `down -v` unless deletion of the local n8n volume is explicitly intended.

## Export and backup

Run scripts from the repository root:

```sh
automation/n8n/scripts/export-workflows.sh
automation/n8n/scripts/backup-volume.sh
```

Workflow exports are review artifacts only. Credentials remain encrypted with `N8N_ENCRYPTION_KEY`; never commit runtime backups or credential exports.
Runtime backup archives are permission-restricted but are not encrypted as files. Store them privately.

## Local validation

Run the dependency-free workflow hardening tests from the repository root:

```sh
node automation/n8n/scripts/test-workflow.mjs
```

## Production gate

Do not add production credentials or activate scheduled/commit workflows until all of these are complete:

- server-side authorization is enforced;
- payout and booking-transaction idempotency keys have database constraints;
- the commit operation is atomic;
- migration baseline has been reconciled with production;
- the owner has approved the role matrix and connected credentials personally.
