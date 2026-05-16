# CLAUDE.md — Session bootstrap

This file is a lightweight Claude-specific bootstrap and complements `AGENTS.md`.

## First checks

1. Read `AGENTS.md`.
2. Read `docs/CHANGELOG.md`.
3. Read `docs/00-README-INDEX.md`.
4. Read `MAINTENANCE.md` (operational mapping: what changes require what doc updates).
5. Read `docs/DOCUMENTATION-MAP.md` (carte des 27 docs + 25 ADRs + drifts connus).

## Working style for this repository

- Default to precise, incremental edits.
- Keep architecture aligned with ADR decisions in `docs/adr/`.
- Prefer fixing root causes over temporary workarounds.
- If a script, path, or process changes, update docs in the same change.
- Cross-check `MAINTENANCE.md` §3 to see which docs depend on the area you touch.

## Validation commands

- `pnpm run verify:repo` (chaîne complète — préféré)
- `pnpm run validate:data`
- `pnpm run validate:schemas`
- `pnpm run docs:sync:check`
