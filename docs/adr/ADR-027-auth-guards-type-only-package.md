# ADR-027 — `@nina-aes/auth-guards` type-only (no shared `@Injectable()` classes)

## Statut

Accepté — 2026-05-30

## Contexte

Le package workspace `@nina-aes/auth-guards` exportait initialement (v0.1.0) :

1. Des **classes Nest `@Injectable()`** : `JwtAuthGuard`, `RolesGuard`, `MfaGuard`.
2. Des **décorateurs** (`@Public`, `@Roles`, `@RequireMfa`) — simples wrappers `SetMetadata`.
3. Des **types/contrats** (`AuthSubject`, `JwtVerifier`) et le **token DI** `JWT_VERIFIER`.

Au boot d'`auth-service`, NestJS levait `UnknownDependenciesException(Reflector)` lors de
l'instantiation du `JwtAuthGuard` : la classe `Reflector` injectée venait d'**une copie physique**
de `@nestjs/core` (résolution pnpm pour les peer-deps du package `auth-guards`), tandis que le
container DI d'`auth-service` enregistrait `Reflector` depuis **une autre copie physique** (sa
propre résolution). Deux classes JavaScript distinctes → l'identité du token DI ne matche pas.

Diagnostic confirmé par inspection du store pnpm :

```
node_modules/.pnpm/@nestjs+core@11.1.23_@nestj_HASH1/...   ← résolu pour auth-service
node_modules/.pnpm/@nestjs+core@11.1.23_@nestj_HASH2/...   ← résolu pour @nina-aes/auth-guards
```

Tentatives de mitigation infructueuses :

| Approche                                                                        | Résultat                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `.npmrc` : `node-linker=hoisted`                                                | Hoist OK mais casse les bin shims pnpm pour `tsc`/`nest`                                                                         |
| `pnpm-workspace.yaml` : `dedupeDirectDeps: true` + `dedupePeerDependents: true` | Insuffisant : le hash de peer-deps diffère selon le consommateur                                                                 |
| `public-hoist-pattern[]=@nestjs/*`                                              | Aucun effet (already hoisted at top-level, but pnpm symlink resolves to .pnpm hashed dir)                                        |
| Build bundlé (esbuild/ncc) côté service                                         | Évalué : explose la complexité runtime (bundle Prisma engines, Puppeteer, native deps), casse `nest start --watch` et sourcemaps |

## Décision

`@nina-aes/auth-guards` (v0.2.0) devient un **package type-only / metadata-only** :

| Exporté                                         | Type                               | Sûr en partage ?                                           |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `AuthSubject`, `JwtVerifier`, `UserRole`        | TypeScript types/enum              | ✅ Erased au build, aucune dep runtime                     |
| `JWT_VERIFIER`                                  | `Symbol`                           | ✅ Identité valeur-primitive, indépendante de toute classe |
| `IS_PUBLIC_KEY`, `ROLES_KEY`, `REQUIRE_MFA_KEY` | `string`                           | ✅ Idem                                                    |
| `Public()`, `Roles()`, `RequireMfa()`           | Fonctions retournant `SetMetadata` | ✅ Dépend de `@nestjs/common` (peer-dep simple), pas de DI |
| ~~`JwtAuthGuard`, `RolesGuard`, `MfaGuard`~~    | ❌ **Retirés**                     | Forçaient peer-dep `@nestjs/core` → duplication            |

Les **classes Guards** sont **dupliquées dans chaque service consommateur** sous
`services/<svc>/src/auth/guards/`. Chaque copie importe les décorateurs et clés depuis
`@nina-aes/auth-guards` (qui sont des constantes/fonctions pures, donc partageables sans risque DI).

## Conséquences

### Positives

- **Bug résolu** — `auth-service` boote sans `UnknownDependenciesException`. Tous les modules
  s'initialisent (VaultModule, RedisModule, CryptoModule, AuthModule, etc.) et les 13 routes sont
  mappées.
- **Aucune surface DI partagée entre packages** — pattern conforme aux recommandations NestJS
  ([docs Nest sur module providers](https://docs.nestjs.com/providers#provider-scope)) : un provider
  injectable doit vivre dans le module qui le consomme.
- **Pas de bundler runtime** — `nest start --watch`, sourcemaps, hot-reload restent fonctionnels.
- **Surface de la peer-dep réduite** — `@nestjs/core` retiré des peer-deps de `auth-guards` (seul
  `@nestjs/common` reste, pour `SetMetadata`).

### Négatives

- **Duplication de code** — 3 fichiers (~120 lignes au total) sont copiés dans chaque service qui
  veut protéger ses routes par JWT/Roles/MFA. Mitigation : les guards sont triviaux (canActivate ≤30
  lignes), aucune logique métier dedans ; le contrat partagé (`JwtVerifier`, `AuthSubject`) est
  centralisé dans `auth-guards`.
- **Pas de patch central** — un correctif sur la logique du Guard doit être propagé manuellement.
  Mitigation : couverture par tests d'intégration côté service ; le code étant trivial, la dérive
  attendue est minime. Un schematic `nest g` pourrait être ajouté plus tard pour scaffolder ces
  guards.

### Règle d'or pour les futurs packages workspace

> **Tout package workspace `@nina-aes/*` qui s'exécute dans un microservice Nest doit n'exporter que
> des éléments « erased au build » (types) ou des constantes pures (strings, symbols, fonctions sans
> état DI). Toute classe `@Injectable()` doit vivre dans le service consommateur.**

## Alternatives écartées (récap)

| Alternative                             | Pourquoi écartée                                              |
| --------------------------------------- | ------------------------------------------------------------- |
| **Hoisting global pnpm**                | Casse `tsc` bin resolution sous Windows                       |
| **Bundler runtime (esbuild/ncc)**       | Masque le problème ; explose la complexité Prisma+Puppeteer   |
| **Forcer `peerDependencies` strictes**  | Échec : pnpm continue de hasher les chemins selon le contexte |
| **Refacto en monolithe (`apps/auth/`)** | Trop invasif pour un problème ponctuel                        |

## Références

- Issue tracker pnpm — peer-deps duplication : https://github.com/pnpm/pnpm/issues/2444
- NestJS docs — module providers scope : https://docs.nestjs.com/providers
- Commit historique avec tentatives `node-linker=hoisted` : voir log entre `aa80d7a` et `34a5798`.
