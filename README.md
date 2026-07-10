# @idleberg/fidel

> A forum scraper built on Playwright, designed to archive vBulletin-based forums, such as the Winamp forum.

## Features

- **Cloudflare bypass** – stealth-mode Playwright with automatic challenge detection and retries
- **HTML sanitization** – strips forum chrome, normalizes BBCode to semantic HTML, replaces smileys with emoji
- **Attachment handling** – download (SHA-256 deduplicated), metadata-only, or ignore
- **Concurrency** – parallel browser pages with configurable throttling
- **Disk cache** – cached HTML served via route interception, skipping the network on re-runs
- **Resumable** – skips already-scraped forums, threads, and members
- **URL rewriting** – resolves legacy vBulletin links, rewrites cross-references to local paths, falls back to Wayback Machine
- **Typed schemas** – Valibot schemas with generated JSON Schema files for downstream consumers

## Installation

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

## License

This work is licensed under the [MIT License](LICENSE).

