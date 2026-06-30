# Pantheon Atlas

Pantheon session atlas for combat logs, encounters, loot, maps, and live observations.

Pantheon Atlas ingests structured JSONL files written by companion Pantheon mods. The app no longer uses network capture, Npcap, Wireshark, or tshark.

## Requirements

- Node.js 24 or newer for local development.
- For packaged Electron builds, Node.js is bundled into the app.
- Companion mods that write the supported ingest files.

## Quick Start

```powershell
Copy-Item config.example.json config.json
npm start
```

Or double-click:

```text
StartPantheonParser2.bat
```

Open:

```text
http://localhost:3117
```

The app runs one Node process for structured log ingestion, SQLite storage, API, and the web dashboard.

If combat/entity addon files are character-specific, select the character at startup:

```powershell
npm start -- --character Nexerin
```

This sets the local player name and tails `combat-live-Nexerin.jsonl` plus `entities-live-Nexerin.jsonl` when the config paths use `{character}`.

On servers where the mods only write the generic live files, choose `Current` at startup or run:

```powershell
npm start -- --character Current
```

This tails `combat-live-current.jsonl` and `entities-live-current.jsonl`.

## Ingest Files

Set these sections in `config.json` to enable the feeds your mods write:

- `addonLogs`: combat events from `C:\ProgramData\PantheonCombatData\combat-live-{character}.jsonl`
- `entityScannerLogs`: entity, position, target, and map observations from `C:\ProgramData\PantheonEntityScanner\entities-live-{character}.jsonl`
- `lootLogs`: loot events from `C:\ProgramData\PantheonLootData\loot-events-current.jsonl`

Structured combat records are normalized into shared event types for damage, healing, mitigation, encounters, XP, abilities, and dashboard summaries. Entity scanner records drive map entities and local-player state directly.

## Useful Scripts

```powershell
npm start
npm run electron
npm run package:win
npm test
npm run backfill-abilities
npm run import-named-mobs
npm run record-map
```

`npm run package:win` creates a portable Windows Electron build in `dist/`.

`npm run backfill-abilities` rebuilds the local ability registry from existing exact combat rows.

`npm run import-named-mobs` seeds `named_mobs`, `named_mob_aliases`, and `named_spawn_points` from Shalazam's public named mob list/detail pages. Refresh only incomplete records with:

```powershell
npm run import-named-mobs -- --missing-details --detail-delay 1200
```

## Community Items

Atlas can read public community item updates by default and can optionally prepare anonymous item contributions for the shared database. Uploads only include item records whose normalized content is new or changed since the last successful upload.

Read access uses the public R2 URL and does not require any credentials:

```json
{
  "communityItems": {
    "enabled": true,
    "downloadEnabled": true,
    "publicBaseUrl": "https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev",
    "manifestUrl": "https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev/items-manifest.json"
  }
}
```

Atlas reads `items-manifest.json`, downloads any contribution objects it has not seen before, imports those items into the local item database, and marks them as known so they are not uploaded back as fresh local discoveries.

Configure `communityItems` and `communityMobs` in `config.json` for a Worker upload endpoint:

```json
{
  "communityItems": {
    "enabled": true,
    "uploadEnabled": true,
    "uploadEndpoint": "https://your-worker.example.com/items",
    "publicBaseUrl": "https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev"
  },
  "communityMobs": {
    "enabled": true,
    "uploadEnabled": true,
    "uploadMode": "worker",
    "uploadEndpoint": "https://your-worker.example.com/mobs",
    "publicBaseUrl": "https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev",
    "manifestUrl": "https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev/mobs-manifest.json"
  }
}
```

Do not put R2 write credentials in the Electron app. Use the Cloudflare Worker in `workers/item-upload-worker.js` to receive Atlas uploads and write to R2 through an `ITEM_BUCKET` binding. Copy `workers/wrangler.toml.example` to `workers/wrangler.toml`, set `PUBLIC_BASE_URL` to the public R2 URL, deploy it, then point Atlas at the Worker. The Worker accepts:

- `POST /items` for item contribution payloads and `items-manifest.json`
- `POST /mobs` for mob contribution payloads and `mobs-manifest.json`
- `POST /icons` for item icon uploads, returning a public R2 URL

The Worker does not need the R2 API key or secret. Cloudflare grants write access through the R2 binding. If you want a lightweight gate for friend builds, set a Worker secret:

```powershell
cd workers
wrangler secret put ATLAS_UPLOAD_TOKEN
wrangler deploy
```

Then set the same token locally as `communityItems.uploadToken`. This token is not as strong as keeping credentials server-side because any client token can be extracted, but it only permits sanitized Worker uploads instead of full R2 account access.

For guild builds, hard-code the deployed Worker base URL in `COMMUNITY_WORKER_BASE_URL` in `src/config.js` before packaging. Existing user configs with an empty Worker endpoint will automatically inherit the baked-in `/items` and `/mobs` endpoints.

For a private/local build, Atlas can also write directly to R2 using S3-compatible credentials stored in environment variables:

```powershell
$env:PANTHEON_ATLAS_R2_ACCESS_KEY_ID = "..."
$env:PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY = "..."
```

```json
{
  "communityItems": {
    "enabled": true,
    "uploadEnabled": true,
    "uploadMode": "r2",
    "r2": {
      "endpoint": "https://7e51af449fba623b17c429354bda9f69.r2.cloudflarestorage.com",
      "bucket": "pantheon-item-database",
      "objectPrefix": "contributions"
    }
  }
}
```

Only use direct R2 mode on trusted machines. Public builds should use the Worker path so write credentials are never distributed.

## App Updates

Pantheon Atlas checks the latest public GitHub release on startup and offers to open the newest EXE download when a newer version is available. Because the app is currently unsigned and distributed as a portable/installer build, updates are user-approved: download the new build, close Atlas, and run the new EXE or installer.

To publish a tester build:

```powershell
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

The `Release` GitHub Actions workflow builds Windows artifacts and attaches them to the GitHub release. The in-app updater reads `https://api.github.com/repos/sh4dowf0x/pantheon-atlas/releases/latest`.
