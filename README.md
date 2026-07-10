# @idleberg/fidel

A forum scraper built on Playwright, designed to archive vBulletin-based forums. It discovers sub-forums, threads, and member profiles automatically, then writes structured JSON to disk.

## Features

- **Cloudflare bypass** -- uses stealth-mode Playwright with realistic browser fingerprinting; detects challenge pages and retries automatically
- **HTML sanitization** -- strips forum chrome, normalizes BBCode containers to semantic HTML, replaces smileys with emoji, and rewrites internal links to local cross-references
- **Attachment handling** -- three modes: download to content-addressed storage (SHA-256 deduplicated), metadata-only, or ignore entirely
- **Concurrency** -- parallel browser pages with configurable worker pool and per-request throttling
- **Disk cache** -- every fetched page is cached locally; subsequent runs serve cached HTML directly into the browser via route interception, skipping the network
- **Resumable** -- skips forums, threads, and members that already exist on disk, so interrupted runs pick up where they left off
- **URL rewriting** -- resolves legacy `showthread.php` / `forumdisplay.php` links to their modern equivalents, rewrites cross-references to local paths, and falls back to Wayback Machine URLs for dead links
- **Typed schemas** -- Valibot schemas for all data types, with generated JSON Schema files available for downstream consumers

## Installation

Requires Node.js >= 24.

```sh
npm install --global @idleberg/fidel
```

Chromium is installed automatically via a `postinstall` script.

## Usage

```sh
fidel https://forums.winamp.com/forum/visualizations/avs
```

See `fidel --help` for available options.

### Output structure

```
data/
  forums/           forum listings with thread metadata
  threads/{id}/     full thread JSON, grouped by forum
  members/          member profiles
  attachments/      content-addressed attachment files
  cache/            raw HTML cache
```

## Schemas

Valibot schemas are exported at runtime via `@idleberg/fidel/schemas`. Generated JSON Schema files are available in the `schemas/` directory.

```sh
pnpm build:schema
```

## License

This work is licensed under the [MIT License](LICENSE).

