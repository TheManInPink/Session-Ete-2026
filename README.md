# NINA-AES Platform

Système sécurisé de gestion d'identité numérique pour l'AES, construit en monorepo (`pnpm` +
Turborepo) avec services NestJS/FastAPI, packages partagés, données Mali et documentation technique.

> **Statut mai 2026** : 27/27 documents canoniques livrés (00 → 26), 25 ADRs livrées, ~30 000 lignes
> de spec architecturale. Bloc A (cœur identité) en cours d'implémentation ; phase transversale
> (15-20) et Blocs B-F (21-25) spécifiés intégralement.

## Démarrage rapide

```sh
pnpm install
pnpm docker:up
pnpm verify:repo
pnpm dev
```

## Source de vérité documentation

- **Carte complète** : [`docs/DOCUMENTATION-MAP.md`](./docs/DOCUMENTATION-MAP.md) — 27 docs + 25
  ADRs + 6 fichiers gouvernance + drifts connus
- **Index navigation** : [`docs/00-README-INDEX.md`](./docs/00-README-INDEX.md)
- **État réel courant** : [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)
- **Opérationnel quotidien** : [`MAINTENANCE.md`](./MAINTENANCE.md) (§3 « Quand modifier quoi »)
- **Décisions d'architecture** : [`docs/adr/`](./docs/adr/) (ADR-001 → ADR-025)

Si un document numéroté contredit le code, se référer d'abord à `docs/CHANGELOG.md` puis à
`docs/DOCUMENTATION-MAP.md` pour les drifts documentés.

## Qualité et maintenance

- Validation référentiel Mali : `pnpm run validate:data`
- Validation JSON Schema : `pnpm run validate:schemas`
- Vérification synchro docs : `pnpm run docs:sync:check`
- **Vérification complète repo (préféré) : `pnpm run verify:repo`**

## Gouvernance assistants IA

Les conventions persistantes — alignées entre elles — sont définies ici :

- [`AGENTS.md`](./AGENTS.md) — universel (tous outils)
- [`CLAUDE.md`](./CLAUDE.md) — bootstrap Claude Code
- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) — GitHub Copilot
- [`.cursor/rules/ai-governance.mdc`](./.cursor/rules/ai-governance.mdc) — Cursor (alwaysApply)
- [`.cursor/rules/graphify.mdc`](./.cursor/rules/graphify.mdc) — knowledge graph

Objectif : garantir la cohérence inter-sessions (Claude, Cursor, Copilot) et éviter les dérives de
conventions. Les 5 invariants partagés sont listés dans `docs/DOCUMENTATION-MAP.md` §2.2.

## Souveraineté numérique

Stack 100 % open-source self-hostable. Aucune dépendance à un SaaS US non substituable. Chaque ADR
contient une « Note souveraineté » + une section « Alternatives rejetées » documentant les
interdictions explicites (AWS / Azure / GCP / Datadog / NewRelic / Splunk / Codecov / etc.).
