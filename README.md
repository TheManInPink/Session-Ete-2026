# NINA-AES Platform

Système sécurisé de gestion d'identité numérique pour l'AES, construit en monorepo (`pnpm` + Turborepo) avec services NestJS/FastAPI, packages partagés, données Mali et documentation technique.

## Démarrage rapide

```sh
pnpm install
pnpm docker:up
pnpm verify:repo
pnpm dev
```

## Source de vérité documentation

- Index global: `docs/00-README-INDEX.md`
- État réel et écarts: `docs/CHANGELOG.md`
- Décisions d'architecture: `docs/adr/`

Si un document numéroté contredit le code, se référer d'abord à `docs/CHANGELOG.md`.

## Qualité et maintenance

- Validation référentiel Mali: `pnpm run validate:data`
- Validation JSON Schema: `pnpm run validate:schemas`
- Vérification synchro docs: `pnpm run docs:sync:check`
- Vérification complète repo: `pnpm run verify:repo`

## Gouvernance assistants IA

Les conventions persistantes sont définies ici:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/*.mdc`

Objectif: garantir la cohérence inter-sessions (Claude, Cursor, Copilot) et éviter les dérives de conventions.
