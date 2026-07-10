# @idleberg/fidel

> A forum scraper built on Playwright, designed to archive vBulletin-based forums, such as the Winamp forum.

![License](https://img.shields.io/npm/l/@idleberg/fidel?style=for-the-badge)
[![Version](https://img.shields.io/npm/v/@idleberg/fidel?style=for-the-badge)](https://www.npmjs.org/package/@idleberg/fidel)
[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/fidel/ci.yml?style=for-the-badge)](https://github.com/idleberg/fidel/actions)

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

The output data can be dropped into the [castro](https://github.com/idleberg/castro) directory for beautiful rendering. Try this [example forum](https://idleberg.github.io/castro/).

## License

This work is licensed under the [MIT License](LICENSE).
