## NINA-AES assistant guardrails (Copilot)

This repository is not a generic Turborepo sample. Apply NINA-AES conventions first.

### Mandatory context before proposing changes

1. Read `docs/CHANGELOG.md` for real current state and resolved incidents.
2. Read `docs/00-README-INDEX.md` for implementation order and canonical docs.
3. Read `MAINTENANCE.md` for the operational mapping (what changes require what doc updates).
4. For architecture/codebase questions, read `graphify-out/GRAPH_REPORT.md` if present.
5. If `graphify-out/wiki/index.md` exists, use it for deep navigation.

### Non-negotiable conventions

- Use `pnpm` only (never `npm`).
- Prefer workspace commands:
  - `pnpm --filter <workspace> <script>`
  - `pnpm --filter <workspace> exec <bin>`
- Keep docs and code synchronized:
  - Update docs whenever behavior/contracts/scripts change.
  - If docs contradict code, update docs in same change set.
- Follow Conventional Commits.
- Keep security posture:
  - Do not commit secrets.
  - Do not weaken auth, auditability, or traceability guarantees.

### Data and validation discipline

- Mali administrative data lives in `data/mali/`.
- Validate data before merge:
  - `pnpm run verify:repo` (chaîne complète recommandée)
  - ou `pnpm run validate:data` + `pnpm run validate:schemas` + `pnpm run docs:sync:check`
- Schema files are in `schemas/`.
- Le pre-commit Husky bloque automatiquement tout commit qui violerait ces contrôles.

### AI collaboration policy

- Prefer reusing existing packages/services before adding new modules.
- Avoid broad refactors unless explicitly requested.
- Document significant decisions in:
  - `docs/CHANGELOG.md` (operational changes)
  - `docs/adr/` (architectural decisions)
