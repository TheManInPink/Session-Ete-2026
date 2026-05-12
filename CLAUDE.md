# CLAUDE.md — Session bootstrap

This file is a lightweight Claude-specific bootstrap and complements `AGENTS.md`.

## First checks

1. Read `AGENTS.md`.
2. Read `docs/CHANGELOG.md`.
3. Read `docs/00-README-INDEX.md`.

## Working style for this repository

- Default to precise, incremental edits.
- Keep architecture aligned with ADR decisions in `docs/adr/`.
- Prefer fixing root causes over temporary workarounds.
- If a script, path, or process changes, update docs in the same change.

## Validation commands

- `pnpm run validate:data`
- `pnpm run validate:schemas`
- `pnpm run docs:sync:check`
