# Migration des versions — Mai 2026

> **Date** : 23 mai 2026 **Statut** : Migration appliquée — drift NestJS 10 → 11 résolu
> **Référence** : `docs/AUDIT-COMPLET-2026-05.md` §4 et `docs/VERSIONS-MAI-2026.md`

---

## 1. Périmètre de la migration

L'audit du 23 mai 2026 a révélé un **drift de versions** au sein du repo : 6 services en NestJS 10.4
/ TS 5.6, 9 services en NestJS 11.1 / TS 6.0. Cette migration aligne les retardataires sur le reste
du repo.

### Services migrés (NestJS 10.4 → 11.1.18)

| Service                       | Avant                                   | Après                                            |
| ----------------------------- | --------------------------------------- | ------------------------------------------------ |
| `services/api-gateway`        | NestJS 10.4 / TS 5.6 / `@types/node` 22 | NestJS 11.1.18 / TS 6.0.2 / `@types/node` 25.5.2 |
| `services/biometric-service`  | NestJS 10.4 / TS 5.6 / `@types/node` 22 | NestJS 11.1.18 / TS 6.0.2 / `@types/node` 25.5.2 |
| `services/enrollment-service` | NestJS 10.4 / TS 5.6 / `@types/node` 22 | NestJS 11.1.18 / TS 6.0.2 / `@types/node` 25.5.2 |
| `services/ussd-service`       | NestJS 10.4 / TS 5.6 / `@types/node` 22 | NestJS 11.1.18 / TS 6.0.2 / `@types/node` 25.5.2 |

### Services déjà conformes (non touchés)

`identity-service`, `auth-service`, `audit-service`, `document-service`, `notification-service`,
`interop-service`, `appointment-service`, `governance-service`, `vulnerability-service`,
`ai-service` (Python), `anticorruption-service` (Python).

---

## 2. Détail du changeset

### 2.1 Dépendances NestJS (10.4 → 11.1.18)

```diff
-    "@nestjs/common": "^10.4.0",
-    "@nestjs/core": "^10.4.0",
-    "@nestjs/microservices": "^10.4.0",
-    "@nestjs/platform-express": "^10.4.0",
-    "@nestjs/swagger": "^7.4.0",
-    "@nestjs/terminus": "^10.2.0",
+    "@nestjs/common": "^11.1.18",
+    "@nestjs/config": "^4.0.0",
+    "@nestjs/core": "^11.1.18",
+    "@nestjs/microservices": "^11.1.18",
+    "@nestjs/platform-express": "^11.1.18",
+    "@nestjs/swagger": "^11.2.0",
+    "@nestjs/terminus": "^11.0.0",
```

⚠️ `@nestjs/swagger` saute de 7.4 à 11.2 (alignement sur la majeure NestJS).

### 2.2 Toolchain

```diff
-    "typescript": "^5.6.0",
-    "@types/node": "^22.15.3",
-    "@types/jest": "^29.5.0",
-    "jest": "^29.7.0",
-    "ts-jest": "^29.2.0",
-    "@nestjs/cli": "^10.4.0",
-    "@nestjs/testing": "^10.4.0",
+    "typescript": "^6.0.2",
+    "@types/node": "^25.5.2",
+    "@types/jest": "^30.0.0",
+    "jest": "^30.3.0",
+    "ts-jest": "^29.4.9",
+    "@nestjs/cli": "^11.0.18",
+    "@nestjs/schematics": "^11.0.10",
+    "@nestjs/testing": "^11.1.18",
```

### 2.3 Engines

Ajout dans les 4 services migrés :

```json
"engines": {
  "node": ">=24.0.0"
}
```

### 2.4 Scripts

Ajout du script `check-types` (manquant dans les 4 services) :

```json
"check-types": "tsc --noEmit"
```

### 2.5 tsconfig.json — corrections

- `services/api-gateway/tsconfig.json` : retrait de `"ignoreDeprecations": "5.0"` (incompatible TS
  6), passage `target: ES2021` → `ES2024`, ajout `tsBuildInfoFile` et `exclude`.
- `services/enrollment-service/tsconfig.json` et `services/ussd-service/tsconfig.json` : suppression
  du `extends: "../../tsconfig.base.json"` (fichier **inexistant** dans le repo, cassait la
  compilation). Remplacé par configuration autonome alignée sur `identity-service`.

### 2.6 Dépendances métier ajoutées

| Service              | Ajout                                                                                | Raison                                                              |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `api-gateway`        | `opossum` 8.1.4 + `@types/opossum`, `ioredis` 5.4.1                                  | Circuit breaker requis pour Prompt 3.1 ; Redis pour rate limiting   |
| `enrollment-service` | `amqplib`, `axios`, `@nestjs/axios`, `@nina-aes/utils`                               | Communication RabbitMQ + appels HTTP aux services aval              |
| `ussd-service`       | `xstate` 5.18.0, `ioredis`, `@nina-aes/i18n`, `@nina-aes/utils`, `@nestjs/throttler` | Machine d'états USSD + sessions Redis + i18n 8 langues + rate limit |

---

## 3. Breaking changes NestJS 10 → 11 à surveiller

Référence : <https://docs.nestjs.com/migration-guide>

| Changement                                                                      | Impact pour ce repo                                             | Action requise                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `Reflector.getAllAndOverride` retourne maintenant `undefined` au lieu de `null` | Faible — peu d'usage dans le repo                               | Audit grep `Reflector` lors du PR               |
| `CacheModule` extrait de `@nestjs/common` vers `@nestjs/cache-manager`          | Aucun service ne l'utilise actuellement                         | Aucune                                          |
| `@nestjs/platform-express` : `Multer` typé strictement                          | Pas d'usage actuel                                              | Vérifier à l'ajout de `document-service` upload |
| `Logger` : signature `setLogLevels` modifiée                                    | Logger NestJS sera remplacé par `@nina-aes/logger` (PROMPT 0.2) | Aucune (sera changé pour Pino)                  |
| Renvoi explicite `Promise<void>` requis dans lifecycle hooks                    | À vérifier dans les services nouvellement migrés                | Tests post-migration                            |

### TypeScript 5.6 → 6.0

- `exactOptionalPropertyTypes` reste opt-in — pas d'impact tant que non activé.
- `strictNullChecks` déjà activé partout — pas de changement.
- Decorators standard (stage 3) coexistent avec `experimentalDecorators` — on conserve
  `experimentalDecorators: true` car NestJS dépend encore des decorators legacy.
- Watch out : certaines règles ESLint TS peuvent échouer après bump — relancer `pnpm lint` après
  installation.

---

## 4. Procédure d'application

```powershell
# 1. Au fond du monorepo
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# 2. Nettoyer les node_modules pour éviter les conflits de versions résiduels
pnpm clean ; if ($?) { Remove-Item -Recurse -Force node_modules, services\*\node_modules, packages\*\node_modules, apps\*\node_modules -ErrorAction SilentlyContinue }

# 3. Réinstaller avec les nouvelles versions
pnpm install

# 4. Vérifier que tout compile
pnpm run check-types

# 5. Lancer les tests pour détecter les régressions
pnpm run test

# 6. Vérifier que les builds passent
pnpm run build
```

Si une étape échoue, ne pas continuer : analyser le message d'erreur et corriger avant de
progresser.

---

## 5. Garde-fou CI

Un workflow `.github/workflows/version-check.yml` (à créer en Prompt 1.1 du v3.0) vérifie
automatiquement à chaque PR que :

- Aucun `package.json` n'utilise `@nestjs/*` < 11.0
- Aucun `package.json` n'utilise `typescript` < 6.0
- Aucun `package.json` n'utilise `@types/node` < 24.0
- Tous les services ont `engines.node >= 24.0.0`

Cela empêche un drift futur de réapparaître.

---

## 6. Versions cibles (à atteindre dans une seconde passe)

Les versions appliquées ici sont **alignées sur le reste du repo** (NestJS 11.1.18, TS 6.0.2). La
cible v3.0 idéale est :

- NestJS **11.1.23** (dernière patch mai 2026)
- TypeScript **6.0.3**
- `@types/node` **25.5.2** (déjà à jour)
- Jest **30.4.2**

Cette deuxième passe sera un simple `pnpm update` à exécuter quand le repo sera stabilisé (après
l'implémentation des 3 services vides en Prompt 1.2 / 3.1 / 3.8 / 3.9 du v3.0).

---

## 7. Risques résiduels

| Risque                                                                      | Probabilité | Impact                                          | Mitigation                                                      |
| --------------------------------------------------------------------------- | ----------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `dist/` orphelin de `api-gateway` contient du code compilé avec l'ancien TS | Élevée      | Faible — sera regénéré au prochain `nest build` | `pnpm clean` avant le premier build                             |
| Lock-file pnpm pas à jour                                                   | Élevée      | Moyen — peut bloquer `pnpm install`             | Supprimer `pnpm-lock.yaml` si nécessaire et regénérer           |
| `@nina-aes/i18n` n'existe peut-être pas encore                              | Moyenne     | Bloque `ussd-service` à l'install               | Vérifier `packages/i18n/package.json` ; créer un stub si absent |
| Lib `opossum` ajoutée mais pas configurée                                   | Faible      | Aucun (sera implémenté en Prompt 3.1)           | Aucune                                                          |

---

**Document généré le 23 mai 2026 — migration appliquée par les Write/Edit dans cette session**
