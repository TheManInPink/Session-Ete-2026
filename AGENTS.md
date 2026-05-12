# AGENTS.md — NINA-AES Platform

This file defines persistent instructions for AI coding assistants operating in this repository.

## Scope

- Applies to all folders under `nina-aes-platform/`.
- Applies to all assistant sessions (Cursor, Claude, Copilot).

## Mandatory reading order

Before making substantial suggestions or changes:

1. `docs/CHANGELOG.md` (source of truth for real state and known deviations)
2. `docs/00-README-INDEX.md` (navigation and canonical implementation order)
3. `MAINTENANCE.md` (operational rules — when to update what, full verify chain)
4. `graphify-out/GRAPH_REPORT.md` if present (architecture map)

## Operational constraints

- Package manager: `pnpm` only.
- Prefer workspace-scoped commands over global ones.
- Do not introduce new frameworks or infra layers without explicit justification.
- Keep edits minimal and cohesive to the requested scope.

## Documentation synchronization policy

Any change to one of these must trigger documentation sync in the same PR:

- Build/test scripts
- Data contracts
- Service interfaces
- Security/auth behavior

At minimum, update:

- `docs/CHANGELOG.md` (what changed and why)
- `docs/00-README-INDEX.md` if navigation/status changed
- `MAINTENANCE.md` §3 ("Quand modifier quoi") if a new mapping rule emerges

## Data quality policy

- Mali referential data files in `data/mali/` are validated before merge.
- JSON schema contracts are stored in `schemas/`.
- Validation commands:
  - `pnpm run validate:data`
  - `pnpm run validate:schemas`

## Security and safety

- Never commit credentials, tokens, or secrets.
- Do not weaken auditability, integrity, or identity controls.
- Preserve append-only and traceability patterns described in ADRs.

