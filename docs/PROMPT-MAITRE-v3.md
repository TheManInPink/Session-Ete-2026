# PROMPT MAÎTRE v3.0 — Implémentation Full-Stack NINA-AES Platform

> **Version** : 3.0 — 23 mai 2026 **Statut** : Document de référence remplaçant le PROMPT v2.0 du 7
> avril 2026 **Destinataire** : Étudiant en informatique, UQAR **Projet** : Système Sécurisé de
> Gestion d'Identité Numérique pour l'AES (Mali · Burkina Faso · Niger) **Repo** :
> `C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform`

---

## Changelog v3.0 — Pourquoi cette refonte

La v2.0 (7 avril 2026) a été auditée le 23 mai 2026. Voir `docs/AUDIT-COMPLET-2026-05.md` et
`docs/VERSIONS-MAI-2026.md` pour le détail. Synthèse des correctifs apportés :

### Corrections de bugs du prompt

1. **Doublon supprimé** : PROMPT 8.2 et PROMPT 9.2 décrivaient deux fois le `governance-service`.
   Fusionnés en un seul.
2. **Collision de ports résolue** : `electoral-service` et `biometric-service` revendiquaient tous
   deux le port 3012. Nouvelle allocation : voir Annexe B.
3. **Phases renumérotées** : v2.0 avait à la fois « Phase 9 » et « Phase 11 ». v3.0 a 10 phases
   continues 1-10.
4. **Services oubliés réintégrés** : `api-gateway`, `enrollment-service`, `ussd-service`,
   `biometric-service` sont maintenant des services NestJS de premier rang dans la liste (v2.0
   omettait les 3 premiers, et le 4e était noyé dans le bloc F).
5. **`ussd-service` traité comme service autonome** (v2.0 le décrivait à tort comme sous-module de
   `vulnerability-service`).

### Mise à jour des versions (versions stables réelles de mai 2026)

- ❌ **Jest 0.3.0** (v2.0) → ✅ **Jest 30.4.2** (typo manifeste corrigée)
- ❌ **Next.js 16.6+** (v2.0, inventé) → ✅ **Next.js 16.2.6**
- ❌ **Prisma 7.6.0** (v2.0, n'existe qu'en `-dev.7`) → ✅ **Prisma 7.3.0** stable (ou 7.8.0 si la
  version de la `package.json` racine est conservée)
- ❌ **HashiCorp Vault 1.21** (v2.0) → ✅ **Vault 2.0.1** (saut majeur avril 2026, alignement IBM)
- ❌ **Electron 39.2.7** (v2.0) → ✅ **Electron 42.1.0** (3 majeurs de retard rattrapés)
- ❌ **MLflow 3.11.0rc0** (v2.0, release candidate) → ✅ **MLflow 3.11.1** stable
- ❌ **PostgreSQL 18 « TDE natif »** (v2.0, faux) → ✅ **Percona Distribution 18.1.1** (qui fournit
  le TDE) ou **LUKS + pgcrypto** si PG upstream
- Toutes les autres versions remises à jour : voir Annexe A.

### Ajouts structurels

- **PROMPT 0 enrichi** : standards transversaux obligatoires (logger structuré, error filter, JSDoc
  français, codes d'erreur, sécurité par défaut, masquage PII).
- **PROMPT 0.1 — État réel du repo** : tableau de complétude par service, à consulter avant chaque
  sprint.
- **PROMPT 11.0 — Renforcement `@nina-aes/logger`** : nouveau prompt dédié au passage de stub à
  Pino + Loki opérationnel, à exécuter **AVANT** tout autre service.
- **Codes d'erreur normalisés** : Annexe C, à respecter dans tous les services.
- **Risques juridiques signalés** : reformulation du chapitre PostgreSQL TDE, ajout de notes sur les
  obligations souveraineté/CNDP/RGPD-like CEDEAO.

### Améliorations qualitatives

- **Commentaires français systématiques** : chaque bout de code livré doit avoir un JSDoc/Docstring
  expliquant **le quoi** ET **le pourquoi**.
- **Logging dès le premier commit** : chaque fichier doit utiliser `@nina-aes/logger`, jamais
  `console.*` ni `new Logger()` NestJS direct.
- **Validation Zod en frontière** : tous les DTOs au boundary (HTTP, RabbitMQ, USSD) doivent être
  validés par Zod via `@nina-aes/shared-types`.
- **Gestion d'erreurs explicite** : chaque fichier expose ses cas d'erreur dans un commentaire de
  tête (`@throws` JSDoc, `Raises:` Docstring).

---

## Table des matières

- [Partie 0 — Prérequis et état réel du repo](#partie-0--prérequis-et-état-réel-du-repo)
- [Partie I — PROMPT 0 (contexte commun à tous les prompts)](#partie-i--prompt-0-contexte-commun-à-tous-les-prompts)
- [Partie II — Standards transversaux obligatoires](#partie-ii--standards-transversaux-obligatoires)
- [Partie III — Prompts d'implémentation par phase](#partie-iii--prompts-dimplémentation-par-phase)
- [Annexe A — Versions canoniques (mai 2026)](#annexe-a--versions-canoniques-mai-2026)
- [Annexe B — Mapping des services et ports](#annexe-b--mapping-des-services-et-ports)
- [Annexe C — Codes d'erreur normalisés](#annexe-c--codes-derreur-normalisés)
- [Annexe D — Checklists par phase](#annexe-d--checklists-par-phase)

---

# Partie 0 — Prérequis et état réel du repo

Avant d'utiliser ce prompt, l'étudiant **doit** avoir lu :

1. `docs/AUDIT-COMPLET-2026-05.md` — où en est le code en mai 2026
2. `docs/VERSIONS-MAI-2026.md` — versions réelles, pas les versions inventées du v2.0
3. `AGENTS.md`, `CLAUDE.md`, `docs/CHANGELOG.md`, `docs/00-README-INDEX.md`, `MAINTENANCE.md`

## État réel du code (résumé condensé)

| Service                  | Complétude     | Action prioritaire                                                          |
| ------------------------ | -------------- | --------------------------------------------------------------------------- |
| `identity-service`       | 100 %          | Modèle de référence. **Étudier sa structure avant tout autre service.**     |
| `auth-service`           | 60 %           | Compléter émission JWT + intégration Keycloak                               |
| `document-service`       | 60 %           | Implémenter PDF + MinIO + QR JWT RS256                                      |
| `audit-service`          | 60 %           | Implémenter chaîne Merkle + trigger PostgreSQL append-only                  |
| `appointment-service`    | 40 %           | Implémenter logique RDV + Redis sorted sets                                 |
| `notification-service`   | 30 %           | Intégrer SMS Africa's Talking + email + push                                |
| `ai-service`             | 30 %           | Implémenter pipeline IA 5 étapes                                            |
| `governance-service`     | 20 %           | Implémenter MOS + SSD + escalade                                            |
| `biometric-service`      | 20 %           | **Reporter (bloc F)** — ne pas avancer avant les autres                     |
| `interop-service`        | 10 %           | Implémenter protocole BCID-AES (mTLS + Ed25519)                             |
| `vulnerability-service`  | 10 %           | Implémenter files prioritaires + livraison domicile                         |
| `anticorruption-service` | 5 %            | Implémenter SIGAC complet                                                   |
| **`api-gateway`**        | **0 % — VIDE** | **PRIORITÉ ABSOLUE 🔴** — sans lui, les apps frontend ne peuvent rien faire |
| **`enrollment-service`** | **0 % — VIDE** | **PRIORITÉ HAUTE 🟠**                                                       |
| **`ussd-service`**       | **0 % — VIDE** | **PRIORITÉ HAUTE 🟠**                                                       |

> **Règle d'or v3.0** : commencer par le renforcement du logger (Prompt 11.0), puis `api-gateway`,
> `enrollment-service`, `ussd-service`. Pas de nouveau service tant que ces 3 ne sont pas
> opérationnels.

---

# Partie I — PROMPT 0 (contexte commun à tous les prompts)

> **Usage** : coller ce bloc en tête de chaque prompt de phase. Il définit le rôle, le contexte
> projet et les contraintes immuables.

````markdown
# RÔLE

Tu es un **Architecte Logiciel Senior + DevOps Lead + Tech Writer** spécialisé en plateformes
gouvernementales souveraines, avec une expertise approfondie en :

- Architectures microservices NestJS 11 / FastAPI
- Infrastructure cloud hybride et Kubernetes (K3s)
- Sécurité applicative (OWASP 2025, mTLS, JWT RS256, HashiCorp Vault 2.x)
- IA appliquée à la qualité de données (fuzzy matching, NLP, OCR)
- Inclusion numérique (USSD, offline-first, multilinguisme)
- Documentation technique pour étudiants en informatique

Ton interlocuteur est un **étudiant unique** en informatique à l'UQAR (Université du Québec à
Rimouski), encadré par un professeur tuteur, qui développe seul le projet **NINA-AES Platform** — un
système sécurisé de gestion d'identité numérique pour l'Alliance des États du Sahel (Mali, Burkina
Faso, Niger).

# CONTEXTE DU PROJET — RAPPEL CONCIS

## Identité

- **Nom officiel** : Système Sécurisé de Gestion d'Identité Numérique pour l'AES
- **Nom interne** : NINA-AES Platform
- **Repo local** : `C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform`
- **Encadrement** : étudiant SEUL avec professeur tuteur — pas une équipe, pas un projet de fin
  d'études
- **Périmètre** : Frontend, Backend/APIs, Database, Servers, Networking, Cloud Infrastructure, CI/CD
  Pipelines, Security, Containers, CDN, Monitoring & Logging, Backups & Recovery

## Les 9 objectifs (rappel court)

- **O1** — Moderniser et sécuriser le système NINA
- **O2** — Module IA détection/correction d'erreurs
- **O3** — Portail citoyen accessible depuis l'étranger
- **O4** — Interopérabilité AES (vérification transfrontalière)
- **O5** — Système anti-corruption (SIGAC) extensible
- **O6** — Gouvernance traçable (SGOGT)
- **O7** — Accessibilité personnes vulnérables (USSD, bornes, agents mobiles)
- **O8** — Sécurité renforcée (mTLS, JWT signé, Merkle hash, audit immuable)
- **O9** — Conformité (souveraineté données, RGPD-like CEDEAO)

## Ordre impératif des blocs

| Bloc  | Périmètre                                                                         | Priorité                                                                |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **A** | NINA Mali — Desktop → iOS/Android → USSD                                          | **P0 — En cours**                                                       |
| **B** | Interopérabilité AES (Niger + Burkina Faso)                                       | P1                                                                      |
| **C** | Modules gouvernementaux : Vulnérables (C1), SGOGT (C2), Intégrité électorale (C3) | P1                                                                      |
| **D** | SIGAC — Système anti-corruption                                                   | P2                                                                      |
| **E** | Bornes interactives kiosque (Electron)                                            | P2                                                                      |
| **F** | Biométrie complète                                                                | **P3 — EN DERNIER, ne pas y toucher avant que A→E soient fonctionnels** |

## Architecture cible (15 services — pas 11 comme dans v2.0)

- **Monorepo** : Turborepo 2.9.14 + pnpm 11.1.3 + Node.js 24 LTS
- **Frontend** : 3 apps Next.js 16.2 (`citizen`, `admin`, `governance`) + React Native Expo SDK 56
  (mobile) + Electron 42 (kiosque) + simulateur USSD
- **Backend** : 13 microservices NestJS 11.1.23 + 2 microservices FastAPI 0.136 (`ai-service`,
  `anticorruption-service`)
- **Données** : PostgreSQL 18 (TDE via Percona OU LUKS+pgcrypto) + Prisma 7.8 + Redis 8.6.3 +
  Elasticsearch 9.4.1 + MinIO + RabbitMQ 4.3
- **Sécurité** : Keycloak 26.6.2 + HashiCorp Vault 2.0.1 + mTLS + JWT RS256 / Ed25519
- **IA/ML** : scikit-learn 1.8, XGBoost 3.2, RapidFuzz 3.14.5, Jellyfish, spaCy 3.8.14, Tesseract
  OCR 5.5.2
- **Infra** : Docker 29.5 + K3s 1.36, Prometheus 3.11.3 + Grafana 13 + Loki 3.7 + Jaeger 2.18
- **Tests/Qualité** : Jest 30.4.2, Pytest 9.0.3, Playwright 1.60, k6 2.0, ESLint, Prettier, Husky,
  GitHub Actions
- **APIs externes** : Africa's Talking (USSD/SMS, 8 langues nationales)

> Voir `docs/VERSIONS-MAI-2026.md` pour la liste canonique complète.

## Structure monorepo réelle (3 apps + 15 services + 13 packages)

```text
nina-aes-platform/
├── apps/
│   ├── citizen/          (Next.js — Portail citoyen)
│   ├── admin/            (Next.js — Tableau de bord admin)
│   └── governance/       (Next.js — Portail gouvernance)
│   ─── À ajouter ultérieurement ───
│   ├── mobile/           (React Native Expo)
│   └── kiosk/            (Electron — Bloc E)
├── services/             (15 microservices — voir Annexe B pour ports)
│   ├── api-gateway/                  (3000 — NestJS — 🔴 VIDE)
│   ├── identity-service/             (3001 — NestJS — ✅ 100 %)
│   ├── auth-service/                 (3002 — NestJS — 60 %)
│   ├── ai-service/                   (3003 — FastAPI — 30 %)
│   ├── document-service/             (3004 — NestJS — 60 %)
│   ├── notification-service/         (3005 — NestJS — 30 %)
│   ├── interop-service/              (3006 — NestJS — 10 %)
│   ├── audit-service/                (3007 — NestJS — 60 %)
│   ├── appointment-service/          (3008 — NestJS — 40 %)
│   ├── anticorruption-service/       (3009 — FastAPI — 5 %)
│   ├── governance-service/           (3010 — NestJS — 20 %)
│   ├── vulnerability-service/        (3011 — NestJS — 10 %)
│   ├── enrollment-service/           (3013 — NestJS — 🟠 VIDE)
│   ├── ussd-service/                 (3014 — NestJS — 🟠 VIDE)
│   └── biometric-service/            (3015 — NestJS — 20 % — Bloc F)
├── packages/             (13 packages partagés)
│   ├── api-client/       (Hooks React Query générés depuis OpenAPI)
│   ├── auth/             (Guards et décorateurs réutilisables)
│   ├── config/           (Validation Zod env vars)
│   ├── database/         (Prisma schema + singleton)
│   ├── eslint-config/    (Configs ESLint partagées)
│   ├── i18n/             (Fichiers de traduction 8 langues)
│   ├── logger/           (Pino + Loki — à renforcer en Prompt 11.0)
│   ├── observability/    (OpenTelemetry, métriques Prometheus)
│   ├── shared-types/     (Enums, interfaces, DTOs Zod)
│   ├── typescript-config/(Configs TS partagées)
│   ├── ui/               (Composants React partagés)
│   ├── utils/            (NINA helpers, Merkle hash, signatures)
│   └── vault-client/     (Client Vault TypeScript/Python)
├── infrastructure/       (Docker, K3s, Helm, Terraform)
├── ai-models/            (Datasets, modèles entraînés)
├── docs/                 (Documentation technique — 27 fichiers + audits)
├── .github/workflows/    (CI/CD GitHub Actions)
└── scripts/              (Bash + PowerShell de validation)
```
````

## Principes directeurs (immutables)

1. **Souveraineté numérique** : zéro dépendance étrangère sensible (pas d'IDEMIA, pas de service US
   pour les données biométriques, hébergement on-premise au CTDEC)
2. **Inclusion** : chaque feature accessible web + mobile + USSD (8 langues nationales)
3. **Offline-first** : kits mobiles et apps fonctionnent sans connexion permanente
4. **Auditabilité** : chaque action loggée, signée, chaînée Merkle, immuable
5. **Sécurité par défaut** : auth obligatoire, secrets via Vault, OWASP Top 10 traité
6. **Code commenté en français** : JSDoc (TypeScript) ou Docstring (Python) sur **chaque** fonction
   publique, expliquant le QUOI ET le POURQUOI
7. **Logging structuré obligatoire** : `@nina-aes/logger`, jamais `console.*` ni `new Logger()`
   NestJS direct
8. **Validation aux frontières** : Zod sur tous les DTOs entrants (HTTP, RabbitMQ, USSD)
9. **Documentation systématique** : un mini-rapport après chaque étape

# CONTRAINTES STRICTES À RESPECTER

1. **Langue** : tout en français (commentaires, documentation, messages utilisateurs internes).
2. **Versions à jour** : voir Annexe A. Ne JAMAIS inventer une version ; si incertain, demander à
   l'étudiant de vérifier sur le site officiel.
3. **Code intégralement commenté en français** : chaque fonction publique a son JSDoc (TypeScript)
   ou Docstring (Python). Le commentaire explique :
   - **QUOI** : ce que fait la fonction
   - **POURQUOI** : la motivation métier ou l'invariant qu'elle protège
   - **PARAMÈTRES** : type, contraintes, valeurs interdites
   - **RETOUR** : type, sémantique
   - **ERREURS** : `@throws` (JS) ou `Raises:` (Py) — quels codes d'erreur normalisés (Annexe C)
     peuvent être levés
4. **Commandes CLI ordonnées et commentées** : chaque commande précédée d'un commentaire `#`
   français expliquant son rôle. L'étudiant doit pouvoir copier-coller dans l'ordre sans rien
   deviner.
5. **Chemins Windows + PowerShell** : adapter les chemins (`C:\Users\lonel\...`) et fournir les
   commandes PowerShell ET bash (Git Bash/WSL).
6. **Aucune dépendance étrangère sensible** : respecter la souveraineté numérique.
7. **Inclusion numérique** : ne jamais oublier USSD et offline-first dans les choix techniques.
8. **Sécurité par défaut** : chaque endpoint a son auth, chaque secret passe par Vault, chaque
   action est auditée via `audit-service`.
9. **Pédagogique** : l'étudiant est seul. Explique le _pourquoi_ avant le _comment_. Pas de jargon
   non défini.
10. **Pas de code dans les `.md` trop long** : si un fichier source dépasse ~150 lignes, le proposer
    en plusieurs blocs avec des points d'intégration clairs.
11. **Respecter l'ordre des blocs A → F**. Ne jamais sauter d'étapes.
12. **Standards transversaux obligatoires** : voir Partie II ci-dessous. Aucun service ne doit être
    livré sans :
    - Logger structuré `@nina-aes/logger`
    - `AllExceptionsFilter` global
    - `ZodValidationPipe` global
    - Health check `/health` Terminus
    - Métriques Prometheus `/metrics`
    - Codes d'erreur normalisés (Annexe C)
    - Masquage PII (NINA, biométrie) dans tous les logs

# DÉROULEMENT ATTENDU

Procède document par document, dans l'ordre numérique strict.

À la fin de chaque document, indique :

- ✅ « Document XX terminé »
- ➡️ « Prochain document : YY-NOM.md »
- ❓ « Veux-tu que je continue avec le document YY ? »

Et **attends ma confirmation** avant d'enchaîner sur le suivant.

````

---

# Partie II — Standards transversaux obligatoires

> Ces standards s'appliquent à **chaque** service livré. Tout PR qui ne les respecte pas doit être refusé en revue de code.

## 2.1 Logging structuré (obligatoire dès le premier commit)

Tous les services utilisent `@nina-aes/logger` (refondu en Prompt 11.0). Aucun `console.log`, aucun `new Logger()` NestJS direct.

### Pattern NestJS — JSDoc et exemple

```typescript
/**
 * Récupère un citoyen par son NINA avec masquage PII dans les logs.
 *
 * @description
 * - QUOI : interroge identity-service via cache Redis (5 min de TTL).
 *   Si le cache est froid, requête la base PostgreSQL puis remplit le cache.
 * - POURQUOI : la recherche par NINA est l'opération la plus fréquente
 *   du portail citoyen. Le cache absorbe les pics (jours de scrutin).
 *
 * @param nina - Le NINA brut (15 caractères). Sera validé par Zod.
 * @returns Le citoyen complet, ou null si non trouvé.
 *
 * @throws {NinaInvalidFormatError} (E_NINA_FORMAT_001) si format incorrect
 * @throws {RedisUnavailableError} (E_CACHE_002) si Redis indisponible — fallback DB
 * @throws {DatabaseError} (E_DB_001) si PostgreSQL indisponible
 */
async function getCitizenByNina(nina: string): Promise<Citizen | null> {
  const logger = this.logger.child({ operation: 'getCitizenByNina' });

  // PII : le NINA brut ne doit JAMAIS apparaître en log. On utilise maskNina().
  logger.info({ ninaMasked: maskNina(nina) }, 'Recherche citoyen par NINA');

  try {
    const cached = await this.cache.get(`citizen:${nina}`);
    if (cached) {
      logger.debug({ ninaMasked: maskNina(nina), source: 'cache' }, 'Hit cache Redis');
      return cached;
    }

    const citizen = await this.prisma.citizen.findUnique({ where: { nina } });
    if (citizen) {
      await this.cache.set(`citizen:${nina}`, citizen, 300);
    }
    return citizen;
  } catch (error) {
    // On log l'erreur AVEC contexte mais SANS le NINA brut
    logger.error({ err: error, ninaMasked: maskNina(nina) }, 'Échec récupération citoyen');
    throw error; // remontée à l'AllExceptionsFilter qui normalisera
  }
}
````

### Pattern FastAPI — Docstring et exemple

```python
from nina_aes_logger import get_logger

logger = get_logger(__name__)

async def detect_errors(record: NinaRecord) -> ErrorDetectionResult:
    """
    Détecte les erreurs de saisie dans un enregistrement NINA.

    QUOI : applique le pipeline IA en 5 étapes (normalisation → règles →
    fuzzy match → NER spaCy → scoring XGBoost agrégé).

    POURQUOI : 64,9 % des citoyens maliens déclarent des erreurs sur leur
    NINA. La détection automatique réduit le coût humain de la revue.

    Args:
        record: Enregistrement NINA à analyser, validé par Pydantic.

    Returns:
        ErrorDetectionResult avec liste d'anomalies, suggestions, score 0-100.

    Raises:
        InvalidNinaFormatError (E_NINA_FORMAT_001): format NINA non conforme.
        ModelNotLoadedError (E_AI_002): modèle XGBoost non chargé en RAM.
    """
    log = logger.bind(operation="detect_errors", nina_masked=mask_nina(record.nina))
    log.info("Démarrage détection erreurs")

    try:
        normalized = normalize(record)
        rule_errors = apply_business_rules(normalized)
        fuzzy_matches = fuzzy_search_referential(normalized)
        ner_result = ner_classify(normalized)
        score = xgboost_aggregate(rule_errors, fuzzy_matches, ner_result)
        return ErrorDetectionResult(score=score, errors=rule_errors, ...)
    except Exception as exc:
        log.exception("Échec détection erreurs", extra={"err_type": type(exc).__name__})
        raise
```

### Règles de masquage PII (Annexe C des règles de sécurité)

| Donnée                | Règle de masquage                                    | Exemple                         |
| --------------------- | ---------------------------------------------------- | ------------------------------- |
| NINA (15 car.)        | Garder X (sexe), masquer YY-A                        | `1**********A` via `maskNina()` |
| Empreinte biométrique | Jamais log, hash SHA-256 uniquement                  | `bio_sha256:ab12cd...`          |
| Mot de passe / token  | Jamais log, même hashé                               | suppression complète            |
| Adresse e-mail        | Masquer le local part                                | `m***@example.ml`               |
| Téléphone             | Masquer 4 derniers chiffres                          | `+22366*****`                   |
| Photo identité        | URL signée à TTL court, pas de log de l'URL complète | URL hashée                      |
| Adresse résidence     | Garder commune, masquer rue/quartier                 | `Bamako, ***`                   |

## 2.2 Gestion d'erreurs normalisée

Tous les services NestJS exposent un `AllExceptionsFilter` global qui transforme les exceptions
internes en réponse HTTP standardisée :

```typescript
/**
 * Format de réponse d'erreur unifié pour TOUS les services NINA-AES.
 *
 * POURQUOI : le frontend (citizen, admin, governance) doit pouvoir afficher
 * un message utilisateur cohérent quelque soit le service en aval. Le code
 * d'erreur normalisé (Annexe C) permet aussi un mapping i18n dans 8 langues.
 */
interface ErrorResponse {
  ok: false;
  error: {
    code: string; // Ex: "E_NINA_FORMAT_001" — voir Annexe C
    message: string; // Message utilisateur déjà localisé
    correlationId: string; // X-Request-Id propagé depuis l'api-gateway
    timestamp: string; // ISO 8601 UTC
    details?: unknown; // Optionnel : détails techniques (dev uniquement)
  };
}
```

Côté FastAPI, on expose un `exception_handler` global équivalent.

## 2.3 Validation Zod aux frontières

Tous les DTOs HTTP, événements RabbitMQ et payloads USSD sont validés par Zod via
`@nina-aes/shared-types`. Ne JAMAIS dépendre uniquement de `class-validator` (moins strict, pas
partageable avec le frontend).

```typescript
// packages/shared-types/src/dtos/citizens.dto.ts
import { z } from 'zod';

/**
 * Schéma de création d'un citoyen. Partagé entre frontend et backend.
 * POURQUOI : éviter la double maintenance (zod côté front, class-validator
 * côté back) qui dérive systématiquement après quelques sprints.
 */
export const CreateCitizenDto = z.object({
  nina: z.string().regex(/^[12]\d{2}\d{2}\d\d{2}\d{3}\d{3}[A-Z]$/, {
    message: 'Format NINA invalide',
  }),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  birthDate: z.coerce
    .date()
    .max(new Date(), {
      message: 'La date de naissance ne peut pas être dans le futur',
    })
    .min(new Date('1900-01-01'), {
      message: 'La date de naissance ne peut pas être avant 1900',
    }),
  sex: z.enum(['M', 'F']),
  // ...
});

export type CreateCitizenDtoT = z.infer<typeof CreateCitizenDto>;
```

## 2.4 Health check et observabilité (obligatoire)

Chaque service expose :

- `GET /health` (Terminus pour NestJS, équivalent pour FastAPI) — vérifie DB, Redis, RabbitMQ,
  services en aval critiques
- `GET /metrics` (Prometheus) — métriques HTTP, métier, et système
- Tracing OpenTelemetry exporté vers Jaeger
- Logs JSON structurés exportés vers Loki via Promtail

## 2.5 Documentation par étape (mini-rapport)

Après chaque étape implémentée, l'étudiant rédige dans `docs/journal/YYYY-MM-DD-nom-etape.md` :

```markdown
### Rapport — [Nom de l'étape] — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** :
- **Captures jointes** :
- **Codes d'erreur introduits** (référence Annexe C) :
- **Tests ajoutés** :
```

---

# Partie III — Prompts d'implémentation par phase

> Chaque prompt ci-dessous est précédé du PROMPT 0 (Partie I) comme préambule. Format strict : voir
> squelette ci-dessous, valable pour chaque livrable.

## Squelette obligatoire de chaque livrable

```markdown
# [Numéro] — [Titre]

> **Bloc concerné** : A / B / C / D / E / F **Prérequis** : liste des prompts précédents à avoir
> complétés **Durée estimée** : X heures/jours pour un étudiant seul **Livrables** : liste à puces
> **Codes d'erreur introduits** : références Annexe C

## 1. Objectif pédagogique

Pourquoi cette étape, ce qu'on apprend, ce qu'on construit.

## 2. Technologies utilisées (versions canoniques)

Tableau aligné sur `docs/VERSIONS-MAI-2026.md`.

## 3. Architecture / Schéma

Diagramme PlantUML ou Mermaid.

## 4. Étapes d'implémentation (numérotées)

Commandes CLI commentées en français + fichiers à créer/modifier avec code intégralement commenté
JSDoc/Docstring.

## 5. Tests de validation

Commandes curl, captures, sorties attendues.

## 6. Pièges courants & dépannage

Tableau Symptôme / Cause / Solution.

## 7. Documentation à produire

Liste des fichiers `docs/` à mettre à jour.

## 8. Mini-rapport d'étape (template Partie II §2.5)

## 9. Checklist de fin d'étape

- [ ] Logger structuré utilisé partout
- [ ] AllExceptionsFilter global
- [ ] ZodValidationPipe global
- [ ] Health check + métriques
- [ ] Codes d'erreur normalisés (Annexe C)
- [ ] Masquage PII vérifié
- [ ] JSDoc/Docstring français sur chaque fonction publique
- [ ] Tests unitaires écrits et passants
- [ ] Documentation `docs/` mise à jour
- [ ] Commit Git avec message conventionnel
- [ ] Mini-rapport rédigé
- [ ] Aucun secret en clair

## 10. Pour aller plus loin

Liens, lectures, alternatives.
```

---

## PHASE 0 — Préliminaires (NOUVEAU — n'existait pas en v2.0)

### PROMPT 0.1 — Audit personnel et lecture des références

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
Avant de toucher au code, l'étudiant doit lire et comprendre :
1. docs/AUDIT-COMPLET-2026-05.md — état réel du repo
2. docs/VERSIONS-MAI-2026.md — versions canoniques
3. services/identity-service/ entier — modèle de référence à imiter

Produit `docs/journal/2026-05-DD-onboarding.md` qui répond à :
- Quel service vais-je toucher en premier ?
- Quelles dépendances dois-je harmoniser ?
- Quels codes d'erreur sont déjà définis ?
- Quels patterns du identity-service sont réutilisables ?
```

### PROMPT 0.2 — Renforcement de `@nina-aes/logger` (CRITIQUE — à exécuter avant tout)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
Le package @nina-aes/logger est aujourd'hui un STUB (cf. audit, §6). Le rendre
opérationnel AVANT tout autre développement de service. Sans logger structuré,
chaque service développé ensuite devra être ré-instrumenté plus tard.

Livrables :
1. packages/logger/src/index.ts — Pino 9 configuré avec :
   - JSON output par défaut, pretty en dev
   - Niveaux : trace, debug, info, warn, error, fatal
   - Redaction automatique des champs PII (nina, fingerprintHash, password, token,
     authorization, cookie, email — pattern de masquage paths)
   - Sérialisation des erreurs incluant stack trace
   - Hostname, pid, service name, environnement, version Git (depuis env)

2. packages/logger/src/middleware/correlation.ts — Middleware Express/NestJS :
   - Lit X-Request-Id entrant, ou génère un UUID v7 si absent
   - Stocke dans AsyncLocalStorage (Node) pour propagation transparente
   - Propage X-Request-Id sortant vers les services aval via interceptor HTTP

3. packages/logger/src/nestjs/logger.module.ts — Module NestJS :
   - `LoggerModule.forRoot({ serviceName: 'identity-service' })`
   - Bind Pino comme logger NestJS officiel
   - Décorateur @InjectLogger() pour les services

4. packages/logger/src/nestjs/all-exceptions.filter.ts — AllExceptionsFilter standard :
   - Capture toutes les exceptions (HttpException, ZodError, Prisma errors, autres)
   - Log avec niveau approprié (4xx = warn, 5xx = error)
   - Mappe vers ErrorResponse normalisé (cf. Partie II §2.2)
   - Inclut correlationId, code, message i18n, stack en dev seulement

5. packages/logger/python/nina_aes_logger/__init__.py — Équivalent Python :
   - structlog ou loguru avec config équivalente
   - Middleware FastAPI pour correlation ID
   - exception_handler global avec format ErrorResponse compatible

6. packages/logger/docs/USAGE.md (français) — Guide pour les autres services :
   - Comment importer et utiliser dans un nouveau service
   - Patterns recommandés (child logger par opération, masquage PII)
   - Anti-patterns à éviter (console.log, log avec PII en clair)

7. packages/logger/tests/ — Tests :
   - Tests Jest : redaction PII, propagation correlation ID, sérialisation erreurs
   - Tests Pytest : équivalents côté Python

FORMAT : tous les fichiers complets avec JSDoc/Docstring français.
Aucun service ne doit être touché tant que ce prompt n'est pas TERMINÉ et testé.
```

---

## PHASE 1 — Harmonisation et fondations

### PROMPT 1.1 — Harmonisation des versions du monorepo

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
Audit : 6 services en NestJS 10.4 / TS 5.6, 9 services en NestJS 11.1 / TS 6.0.
À harmoniser. Voir docs/AUDIT-COMPLET-2026-05.md §4.

Livrables :
1. Script scripts/bump-versions.mjs (Node) qui :
   - Itère sur services/*/package.json et packages/*/package.json
   - Met à jour selon docs/VERSIONS-MAI-2026.md :
     · @nestjs/* → ^11.1.23
     · typescript → ^6.0.3
     · @types/node → ^25.5.2
     · ajoute "engines": { "node": ">=24.0.0" } si absent
   - Affiche un diff avant application
   - Mode --dry-run par défaut, --apply pour effectuer

2. docs/MIGRATION-2026-05.md — Plan de migration documenté :
   - Breaking changes NestJS 10 → 11 (lifecycle hooks, providers, etc.)
   - Breaking changes TypeScript 5 → 6 (strict, exactOptionalPropertyTypes)
   - Liste des services impactés
   - Tests à relancer après migration

3. Exécution :
   - `pnpm install` après bump
   - `pnpm run build` pour vérifier que ça compile
   - `pnpm run test` pour vérifier que rien n'est cassé

4. .github/workflows/version-check.yml — Workflow qui échoue si une version
   diverge dans le repo (garde-fou).

FORMAT : script Node + doc migration + workflow CI.
```

### PROMPT 1.2 — Scaffolding minimal des 3 services vides

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
api-gateway, enrollment-service, ussd-service ont 0% de code (juste package.json).
Créer le scaffolding minimal RESPECTANT les standards transversaux.

Pour CHACUN des 3 services :

1. src/main.ts — Bootstrap NestJS avec :
   - LoggerModule.forRoot({ serviceName }) depuis @nina-aes/logger
   - ValidationPipe global avec Zod
   - AllExceptionsFilter global (depuis @nina-aes/logger)
   - Helmet, CORS configuré
   - Swagger sur /api/docs
   - Graceful shutdown sur SIGTERM
   - Port lu depuis @nina-aes/config (validation Zod)

2. src/app.module.ts — Module racine :
   - ConfigModule (depuis @nina-aes/config)
   - LoggerModule
   - TerminusModule + HealthController (/health)
   - PrometheusModule (/metrics)

3. src/health/health.controller.ts — Health check qui vérifie les dépendances
   pertinentes (DB, Redis, RabbitMQ, services aval pour api-gateway).

4. Dockerfile multi-stage Node 24 alpine avec utilisateur non-root.

5. README.md complet (français) avec :
   - But du service
   - Endpoints exposés (à compléter au fur et à mesure)
   - Variables d'environnement requises
   - Comment démarrer localement (pnpm dev)
   - Comment tester (pnpm test)
   - Codes d'erreur produits (référence Annexe C)

6. Tests basiques Jest qui vérifient :
   - L'app démarre sans crash
   - /health retourne 200
   - /metrics expose Prometheus

FORMAT : fichiers complets pour les 3 services, code commenté en français.
NE PAS implémenter encore la logique métier — c'est l'objet des prompts suivants.
```

### PROMPT 1.3 — Synchronisation @nina-aes/shared-types

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
Compléter @nina-aes/shared-types avec :
- 12 enums (Sex, MaritalStatus, CorrectionStatus, UserRole, VulnerabilityCategory,
  PriorityLevel, AppointmentStatus, DirectiveStatus, AlertSeverity, AESCountry,
  Language, AuditAction)
- 16 interfaces dont CorrectionRequest, Appointment, CorruptionAlert,
  AgentIntegrityScore, GovernanceDirective, AESVerificationRequest/Response,
  AuditLog, ApiResponse<T>, PaginatedResponse<T>
- DTOs Zod pour TOUS les payloads HTTP/RabbitMQ/USSD (cf. Partie II §2.3)
- Codes d'erreur normalisés (constantes exportées) — voir Annexe C

Sortie : packages/shared-types/src/* + tests Jest de validation Zod.
```

---

## PHASE 2 — Infrastructure & DevOps

### PROMPT 2.1 — docker-compose.dev.yml complet

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
infrastructure/docker/docker-compose.dev.yml — Stack locale complète :
- postgres:18-alpine (port 5432) — init-db.sql avec extensions uuid-ossp,
  pgcrypto, pg_trgm, unaccent, postgis
- redis:8.6.3-alpine (port 6379, AOF activé)
- rabbitmq:4.3-management (5672 + 15672)
- minio/minio:RELEASE.2026-05 (9000 + console 9001)
- elasticsearch:9.4.1 (port 9200, single-node, security off DEV ONLY)
- kibana:9.4.1 (port 5601)
- keycloak/keycloak:26.6.2 (port 8080, mode start-dev, realm nina-aes pré-importé)
- hashicorp/vault:2.0.1 (port 8200, mode dev avec root token nina-dev)
- jaegertracing/jaeger:2.18 (port 16686)
- prom/prometheus:3.11.3 (port 9090)
- grafana/grafana:13.0.1 (port 3001)
- grafana/loki:3.7.2 (port 3100)
- grafana/promtail:3.7.2

Healthchecks pour TOUS les services. Volumes nommés. Network nina-aes-dev.

Scripts associés :
- infrastructure/scripts/init-db.sql — bases nina_aes_dev et nina_aes_test
- infrastructure/scripts/seed-locations.sql — géographie Mali (19 régions, 159 cercles)
- Dockerfile.nestjs multi-stage Node 24 alpine
- Dockerfile.fastapi multi-stage Python 3.14 slim avec uv

Makefile racine (Windows-compatible) : dev, down, logs, restart, db-migrate,
db-seed, db-reset, test, test-watch, lint, format, vault-init, certs-generate.
```

### PROMPT 2.2 — CI/CD GitHub Actions

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
.github/workflows/ :
1. ci.yml — lint + test-backend (services GitHub Actions PG 18, Redis 8.6) +
   test-ai (Pytest 9.0.3 Python 3.14) + test-frontend (Jest 30.4.2 + RTL) +
   test-e2e (Playwright 1.60) + build (Docker matrix) + security (Trivy 0.69.3
   épinglé par SHA, Snyk)
   Cache : pnpm store, Turborepo cache, Docker layers
2. cd-staging.yml — Deploy K3s staging via Helm 4.2 (push main)
3. release.yml — Tag v*.*.* → build images + CHANGELOG.md auto + GitHub Release
4. codeql.yml — Analyse statique sécurité hebdo + PR
5. dependabot.yml — Mises à jour deps (pnpm, pip, docker, github-actions)
6. version-check.yml (cf. PROMPT 1.1) — Garde-fou versions
```

### PROMPT 2.3 — Husky + commitlint

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
- husky 9 + lint-staged + @commitlint/config-conventional
- pre-commit : lint-staged + typecheck + npm audit signatures
- commit-msg : conventional commits avec scopes (identity, auth, ai, ...)
- pre-push : tests + build incrémental
- CONTRIBUTING.md à la racine
```

### PROMPT 2.4 — HashiCorp Vault 2.0.1

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
⚠️ Vault a sauté à 2.0 en avril 2026 (alignement IBM). Migration depuis 1.x :
- nouveaux noms d'API pour certaines fonctionnalités
- déprécation des engines legacy

Livrables :
1. infrastructure/vault/vault-init.sh — Init en mode dev
2. infrastructure/vault/policies/*.hcl — Une policy par service + admin + auditor
3. infrastructure/vault/seed-secrets.sh — Pré-remplissage dev :
   - kv/data/jwt (clés RS256)
   - kv/data/database/*
   - kv/data/africastalking/*
   - kv/data/aes/certs/*
   - kv/data/keycloak/*
4. packages/vault-client/ — Client TS (déjà existant à étendre) + Python (hvac)
5. docs/security/vault-usage.md
6. Politique rotation 90 jours
```

### PROMPT 2.5 — Stack monitoring complète

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
infrastructure/monitoring/ :
- prometheus.yml (scrape /metrics des 15 services + node-exporter + postgres_exporter
  + redis_exporter)
- alertmanager.yml (routing par sévérité, templates français)
- grafana/dashboards/ — 8 dashboards JSON :
  01-overview, 02-identity, 03-ai, 04-sigac, 05-postgres, 06-business-kpis,
  07-api-gateway (latences par service aval), 08-ussd-sessions
- @nina-aes/observability — Module NestJS partagé pour métriques métier
- services/ai-service/src/observability.py — Équivalent FastAPI
- Loki + Promtail config (déjà partiellement en place via @nina-aes/logger)
- Jaeger 2.18 avec OpenTelemetry Collector
```

---

## PHASE 3 — Backend Core (Bloc A)

### PROMPT 3.1 — api-gateway (PRIORITÉ ABSOLUE 🔴)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
services/api-gateway est VIDE (0%). Sans lui, les apps frontend ne peuvent rien
faire. C'est le point d'entrée unique pour citizen + admin + governance + mobile + USSD.

Port : 3000. Stack : NestJS 11.1.23 + http-proxy-middleware + Opossum (circuit
breaker) + @nestjs/throttler + helmet.

Responsabilités :
1. Routing intelligent vers les 14 services internes (mapping Annexe B)
2. Authentification centralisée :
   - Vérifie le JWT (clé publique Keycloak) UNE SEULE FOIS
   - Propage le user aux services internes via header X-User-Context (signé JWS)
   - Rejet 401 si token absent/invalide/expiré (sauf endpoints publics whitelistés)
3. Rate limiting global et par utilisateur (Redis-backed via @nestjs/throttler)
4. Circuit breaker Opossum :
   - Timeout 5s par service aval
   - 50% d'échecs sur fenêtre 10s → open
   - Fallback : 503 avec message i18n
5. Compression gzip/brotli
6. CORS strict configuré pour les 3 apps frontend (origins whitelistés)
7. Helmet pour les headers sécurité (CSP, HSTS, X-Frame-Options, etc.)
8. Logging structuré + tracing OpenTelemetry propagé (X-Request-Id)
9. /api/docs — Swagger UI agrégé (combine OpenAPI des 14 services en aval)
10. /health — Health aggregator (vérifie tous les services en aval)
11. /metrics — Métriques Prometheus (latence par route, taux d'erreur par service aval)

Fichiers à créer :
- src/main.ts (déjà créé en PROMPT 1.2, à étendre)
- src/app.module.ts (idem)
- src/proxy/proxy.module.ts
- src/proxy/proxy.controller.ts — Catch-all wildcard route avec routing rules
- src/proxy/proxy.service.ts — Logique de routage + circuit breaker
- src/auth/jwt-validation.middleware.ts
- src/auth/user-context-propagation.interceptor.ts
- src/swagger/aggregator.service.ts — Fetch /api/docs des 14 services et merge
- src/health/aggregator.controller.ts
- test/proxy.e2e-spec.ts — Mock 3 services aval et vérifie le routing

Codes d'erreur introduits (Annexe C) :
- E_GW_001 — Service en aval indisponible
- E_GW_002 — Circuit breaker ouvert
- E_GW_003 — Rate limit dépassé
- E_GW_004 — JWT invalide
- E_GW_005 — User context manquant pour route protégée

FORMAT : tous les fichiers complets, JSDoc français systématique.
```

### PROMPT 3.2 — Compléter identity-service (déjà à 100%, audit & doc)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
identity-service est complet (100%). Mission ici : audit qualité + doc.

1. Vérifier conformité standards Partie II :
   - Logger structuré utilisé partout (cf. PROMPT 0.2) — RÉ-INSTRUMENTER si new Logger()
   - AllExceptionsFilter, ZodValidationPipe, health, metrics → ✅ déjà ?
   - Masquage PII dans tous les logs

2. Compléter docs/services/identity-service.md :
   - Endpoints documentés (OpenAPI extrait via Swagger)
   - Codes d'erreur produits (Annexe C)
   - Diagramme de séquence "Recherche citoyen par NINA"
   - Diagramme de séquence "Soumission correction avec IA"
   - Métriques métier exportées

3. Compléter tests :
   - Coverage cible 85%+ (utiliser jest --coverage)
   - Test E2E Playwright (depuis apps/citizen)

4. Refactoring si nécessaire :
   - Extraire `mask-nina-for-logs` dans @nina-aes/utils si pas déjà
   - Vérifier que CitizenService consomme bien RabbitMQ pour citizen.created

5. ADR-019 dans docs/decisions/ : "Pattern de référence pour les services NestJS"
   (utilisé par tous les autres services).
```

### PROMPT 3.3 — auth-service (60% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
Compléter auth-service (port 3002) pour qu'il émette réellement des JWT.

Endpoints :
- POST /api/v1/auth/register — Inscription citoyen (email + tel, OTP SMS via
  notification-service)
- POST /api/v1/auth/login — JWT RS256 (clés depuis Vault) access 15min +
  refresh 7j stocké Redis avec rotation
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout — Blacklist refresh dans Redis
- POST /api/v1/auth/mfa/enable — TOTP (otplib + QR code)
- POST /api/v1/auth/mfa/verify
- POST /api/v1/auth/mfa/sms — Alternative TOTP via Africa's Talking
- POST /api/v1/auth/password/forgot — Reset signé par email
- POST /api/v1/auth/password/reset
- GET /api/v1/auth/me

Règles :
- Argon2id pour les mots de passe (paramètres OWASP 2025)
- MFA optionnel citoyens, OBLIGATOIRE agents/superviseurs/admins/auditeurs
- Rate limit 5 login/15min/IP
- Clés JWT chargées depuis Vault 2.0.1 au démarrage avec watcher de rotation
- Refresh rotation systématique

Intégration Keycloak 26.6.2 :
- Realm "nina-aes" avec 6 rôles pré-configurés
- Client confidentiel "nina-aes-platform"
- Mapping rôles Keycloak → UserRole interne
- Bootstrap script qui importe le realm JSON au premier démarrage

Guards exportés dans @nina-aes/auth :
- JwtAuthGuard
- RolesGuard + @Roles(...)
- MfaGuard pour endpoints sensibles

Codes d'erreur (Annexe C) :
- E_AUTH_001 à E_AUTH_010
```

### PROMPT 3.4 — document-service (60% → 100%, faille QR corrigée)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Voir PROMPT v2.0 3.3, mises à jour :]
- Puppeteer 23+ (Chrome headless)
- jose 5+ pour JWT RS256
- pdf-lib 1.17+
- MinIO bucket "fiches" avec Object Lock activé
- Template HTML/CSS i18n 8 langues (next-intl côté template)

Corrige la FAILLE F1 (QR brut → JWT RS256 signé contenant NINA + hash bio +
timestamp + issuer + exp). Endpoint /verify-qr pour validation.

Codes d'erreur (Annexe C) : E_DOC_001 à E_DOC_005.
```

### PROMPT 3.5 — audit-service (60% → 100%, Merkle chain)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Voir PROMPT v2.0 3.4, à compléter :]
- Trigger PostgreSQL strict (REJECT UPDATE/DELETE) sur audit_logs
- Chaîne Merkle SHA-256(prev_hash || canonical_json(entry))
- Endpoint /verify pour vérifier l'intégrité
- Endpoint /export CSV signé (rôle AUDITOR)
- Consommation RabbitMQ : citizen.*, correction.*, agent.*, governance.*
- Snapshots quotidiens du dernier hash exportés vers MinIO
- (Optionnel futur) Ancrage blockchain pour notarisation publique

Codes d'erreur : E_AUDIT_001 à E_AUDIT_004.
```

### PROMPT 3.6 — notification-service (30% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
3 canaux unifiés avec retry exponentiel et idempotence :
1. SMS via Africa's Talking SDK officiel
2. Email via SMTP (Maildev en dev)
3. Push mobile (FCM Android + APNS iOS) — pour apps/mobile

Templates dans src/templates/ multilingues 8 langues :
correction-submitted, correction-approved, appointment-confirmed,
appointment-reminder-24h, mfa-code, whistleblower-token, ussd-confirmation

Architecture :
- Consumer RabbitMQ queue "notifications" mode pull (workers parallèles)
- Retry exponentiel (1min, 5min, 30min, 2h, 12h) puis DLQ
- Idempotence via hash(recipient + template + payload)
- Historique table notifications PostgreSQL
- Webhook /callbacks/atalking pour DLR (Delivery Receipts)
- Métriques : envois/h, taux succès canal, latence

Codes d'erreur : E_NOTIF_001 à E_NOTIF_006.
```

### PROMPT 3.7 — appointment-service (40% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
RDV dans les centres d'enrôlement avec files prioritaires.

Endpoints :
- GET /api/v1/centers (+ filtres région, cercle, openNow, géoloc)
- GET /api/v1/centers/:id/availability — Créneaux dispo (STANDARD vs PRIORITAIRE 7h-9h)
- POST /api/v1/appointments — Création (intégration vulnerability-service si vulnerableCategory)
- PUT /api/v1/appointments/:id/cancel
- PUT /api/v1/appointments/:id/check-in (rôle AGENT)
- PUT /api/v1/appointments/:id/complete (rôle AGENT)

Logique :
- File virtuelle Redis sorted sets par centre
- Notifications SMS auto (confirmation + J-1 + H-2) via RabbitMQ → notification-service
- Blacklist 48h après 2 no-shows
- Suggestion centre le plus proche avec dispo

Seeds : CTDEC Bamako Baba Diarra + antennes Kati, Kayes, Sikasso, Ségou, Mopti.

Codes d'erreur : E_APT_001 à E_APT_007.
```

### PROMPT 3.8 — enrollment-service (PRIORITÉ HAUTE 🟠 — 0% → MVP)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
services/enrollment-service est VIDE. Mission MVP (pas la biométrie complète,
qui est en bloc F).

Port : 3013. But : collecte initiale des données d'identité d'un citoyen,
préparation au passage au document-service pour génération de la Fiche.

Endpoints :
- POST /api/v1/enrollment/initiate — Démarre un enrôlement
  Input : { agentId, centerId, citizenData (sans NINA — généré ensuite), parents, location }
  Output : { enrollmentId, expectedNina (proposition selon règles RAVEC), nextStep }
- POST /api/v1/enrollment/:id/upload-justificatif — Upload acte de naissance scanné
  Délègue à document-service pour stockage MinIO + ai-service /ocr-extract pour
  pré-remplir les champs
- POST /api/v1/enrollment/:id/validate — Validation finale par agent (rôle AGENT)
  Crée le citoyen via identity-service (POST /citizens), publie événement
  "enrollment.completed" sur RabbitMQ
- GET /api/v1/enrollment/:id/status
- GET /api/v1/enrollment/agent/:agentId — File d'enrôlement d'un agent
- POST /api/v1/enrollment/offline-sync — Endpoint idempotent pour synchronisation
  différée depuis kits mobiles offline

Logique métier :
- Génération du NINA selon règles RAVEC (sexe + AA + MM + codes géo + séquentiel
  + lettre de contrôle calculée)
- Vérification anti-doublon via ai-service /detect-duplicates AVANT validation
- Workflow état : INITIATED → JUSTIFICATIF_UPLOADED → VALIDATED_AGENT →
  CONFIRMED_CITIZEN | REJECTED
- Toutes les transitions auditées via audit-service
- Délégation IA (OCR + détection erreurs) au ai-service

Stockage Prisma : nouvelle table enrollments avec FK vers users (agent) et
citizens (créé seulement à VALIDATION). État machine via colonne status enum.

Codes d'erreur : E_ENR_001 à E_ENR_008.

FORMAT : MVP fonctionnel, pas la biométrie complète. JSDoc français.
```

### PROMPT 3.9 — ussd-service (PRIORITÉ HAUTE 🟠 — 0% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
services/ussd-service est VIDE. C'est un service NestJS AUTONOME (v2.0 le
disait à tort sous-module de vulnerability-service).

Port : 3014. Stack : NestJS 11 + XState (machine d'états) + ioredis + i18next.

Contexte USSD :
- Protocole GSM stateful, sessions 5 min TTL
- Africa's Talking envoie POST au webhook à chaque interaction
- Code court : *123*NINA# (à confirmer Orange Mali)
- 8 langues nationales (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE)

Arborescence menu (cf. PROMPT v2.0 6.2 — inchangée).

Endpoints :
- POST /api/v1/ussd/callback — Webhook Africa's Talking
  Body : { sessionId, serviceCode, phoneNumber, text }
  Response text/plain : "CON" ou "END" + message (max 182 chars)
- POST /api/v1/ussd/test — Endpoint pour le simulateur USSD-01 (apps/citizen)
- GET /api/v1/ussd/sessions/:sessionId — Debug admin

Implémentation :
- Machine d'états XState (états : ROOT, LANG_SELECT, MAIN_MENU, VERIFY_NINA,
  APPOINTMENT_FLOW, TRACK_REQUEST, SIGAC_REPORT, etc.)
- Cache i18n en Redis (préchargé au démarrage depuis @nina-aes/i18n)
- Logs structurés avec sessionId pour traçabilité
- Métriques : sessions/h, langues utilisées, taux complétion par menu

Sécurité :
- Validation signature HMAC du webhook Africa's Talking
- Rate limit 10 sessions/min/numéro (Redis)
- NINA toujours masqué dans réponses (utiliser maskNina())
- Pas de données sensibles en clair dans messages USSD

Délégations vers les autres services :
- VERIFY_NINA → GET /api/v1/citizens/:nina via api-gateway
- APPOINTMENT_FLOW → POST /api/v1/appointments via api-gateway
- TRACK_REQUEST → GET /api/v1/corrections/:id via api-gateway
- SIGAC_REPORT → POST /api/v1/sigac/alerts via api-gateway

Codes d'erreur : E_USSD_001 à E_USSD_006.

Tests :
- Mock Africa's Talking via supertest
- Scénarios E2E pour chaque option (5 × 8 langues = 40 cas)
- Machine d'états testée isolément

FORMAT : service complet, JSDoc français, i18n JSON pour 8 langues.
```

---

## PHASE 4 — Module IA (Bloc A)

### PROMPT 4.1 — ai-service complet (30% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 4.1 — versions mises à jour :]
- FastAPI 0.136.1 + Pydantic 2.13.4
- Python 3.14.5 (free-threaded officiel)
- scikit-learn 1.8.0, XGBoost 3.2.0
- RapidFuzz 3.14.5, jellyfish, spaCy 3.8.14 (fr_core_news_lg)
- Tesseract OCR 5.5.2 + EasyOCR
- structlog (cf. @nina-aes/logger Python)

7 endpoints (identiques v2.0) + ajouts :
- Tracing OpenTelemetry vers Jaeger 2.18
- exception_handler global format ErrorResponse normalisé

Codes d'erreur : E_AI_001 à E_AI_010.
```

### PROMPT 4.2 — Dataset synthétique

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Identique PROMPT v2.0 4.2. Production éthique d'un dataset 100% synthétique.]
```

### PROMPT 4.3 — Pipeline d'entraînement

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Identique PROMPT v2.0 4.3, avec MLflow 3.11.1 (pas rc0) et workflow CI mis à jour.]
```

---

## PHASE 5 — Frontend & Mobile (Bloc A)

### PROMPT 5.1 — Intégration API frontend (12 écrans existants)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 5.1 — à utiliser avec les versions mai 2026 :]
- Next.js 16.2.6 + React 19.2.6
- TanStack Query v5 latest
- @keycloak/keycloak-js 26.x compatible
- next-intl latest

Génération api-client depuis OpenAPI agrégé du api-gateway (PROMPT 3.1).
```

### PROMPT 5.2 — App mobile React Native (Expo SDK 56)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 5.2 — Expo SDK 56 + RN 0.85.2. Nouveau backend animation +
nouvelle architecture obligatoire.]
```

---

## PHASE 6 — Vulnérables (Bloc A + C1)

> Note : ussd-service est traité en PHASE 3 (PROMPT 3.9) comme service autonome.

### PROMPT 6.1 — vulnerability-service (10% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 6.1 — focus livraison à domicile + files prioritaires.
Intégration avec appointment-service (PROMPT 3.7) pour slots prioritaires.
Intégration avec ussd-service (PROMPT 3.9) pour le menu *123*NINA#.]

Codes d'erreur : E_VUL_001 à E_VUL_006.
```

---

## PHASE 7 — Interopérabilité AES (Bloc B)

### PROMPT 7.1 — interop-service (10% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 7.1 — Protocole BCID-AES (mTLS + JWS Ed25519).
Aucune donnée personnelle transmise — seulement booléen + score.]

Stack mise à jour :
- jose 5+ (signatures Ed25519)
- @nestjs/microservices 11.x
- NGINX en amont pour mTLS termination (config fournie)

Codes d'erreur : E_AES_001 à E_AES_008.
```

### PROMPT 7.2 — Tests interop Mali ↔ Burkina ↔ Niger

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 7.2 — Stack 3 pays en local pour tests E2E.]
```

---

## PHASE 8 — Gouvernance & Anti-Corruption (Bloc C2/C3 + D)

### PROMPT 8.1 — governance-service SGOGT (20% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[FUSION des PROMPTS v2.0 8.2 et 9.2 (qui étaient des doublons).
Messagerie Officielle Sécurisée + Suivi des Directives + escalade auto.]

Stack :
- @nestjs/websockets pour temps réel
- jose 5+ (signature Ed25519 côté client + vérification serveur)
- MinIO Object Lock pour archivage 10 ans

Codes d'erreur : E_GOV_001 à E_GOV_010.
```

### PROMPT 8.2 — electoral-service (NOUVEAU service — port 3016)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 8.3 — Bloc C3 intégrité électorale.]

ATTENTION : port réattribué à 3016 (v2.0 disait 3012 → collision avec biometric).

Codes d'erreur : E_ELEC_001 à E_ELEC_006.
```

### PROMPT 8.3 — anticorruption-service SIGAC (5% → 100%)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 8.4 — Isolation Forest + scoring + lanceurs d'alerte chiffrés E2E.]

Stack mise à jour :
- FastAPI 0.136.1 + Pydantic 2.13.4
- scikit-learn 1.8 (Isolation Forest)
- transformers + BERT multilingue
- pgcrypto pour chiffrement E2E des alertes

Codes d'erreur : E_SIGAC_001 à E_SIGAC_008.
```

---

## PHASE 9 — Kiosques + Biométrie (Bloc E + F)

### PROMPT 9.1 — App Electron kiosk (Electron 42)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 9.1 — Electron 42.1.0 (pas 39 !). Mode kiosque verrouillé,
8 langues, imprimante thermique, auto-update signé via Vault.]
```

### PROMPT 9.2 — Plan biométrique (Bloc F — différé)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 9.2 — Document de planification, pas du code.
biometric-service (port 3015) reste à 20% intentionnellement.]
```

---

## PHASE 10 — Tests, Sécurité, Déploiement, Documentation

### PROMPT 10.1 — Tests complets

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 10.1 — versions :]
- Jest 30.4.2 (pas 0.3.0 !)
- Pytest 9.0.3
- Playwright 1.60.0
- k6 2.0 (TypeScript natif)

Coverage cible : 80% lignes, 70% branches sur backend.
```

### PROMPT 10.2 — Sécurité (STRIDE + OWASP 2025 + hardening)

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 10.2. OWASP Top 10 édition 2025.]
- Trivy 0.69.3 épinglé par SHA (attaque supply chain mars 2026)
- ZAP 2.17+
```

### PROMPT 10.3 — Déploiement K3s + Backup/Recovery

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 10.3. Stack :]
- K3s 1.35 (choix défensif) ou 1.36 (récent)
- Helm 4.2.0
- cert-manager + Let's Encrypt
- Longhorn
- pgBackRest (PostgreSQL 18)
- MinIO Object Lock

RPO 1h / RTO 4h.
```

### PROMPT 10.4 — Documentation finale

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 10.4 — ADRs étendus :]
- ADR-018 NestJS 11 + Zod
- ADR-019 Pattern identity-service comme référence
- ADR-020 Pourquoi 15 services (et pas 11 comme v2.0)
- ADR-021 Vault 2.x migration
- ADR-022 TDE PostgreSQL via Percona vs LUKS

Glossaire mis à jour.
```

### PROMPT 10.5 — Préparation soutenance UQAR

```text
[COLLER LE PROMPT 0]

─── TÂCHE ───
[Cf. PROMPT v2.0 10.5 — script démo + Q&A + checklist jour J.]
```

---

# Annexe A — Versions canoniques (mai 2026)

Voir `docs/VERSIONS-MAI-2026.md` — table complète des 41 technos avec versions actuelles, drapeaux
rouges du v2.0, et recommandations pragmatiques.

# Annexe B — Mapping des services et ports

| Port | Service                | Stack     | Statut audit mai 2026 | Priorité v3.0         |
| ---- | ---------------------- | --------- | --------------------- | --------------------- |
| 3000 | api-gateway            | NestJS 11 | 🔴 VIDE               | P0 — Critique         |
| 3001 | identity-service       | NestJS 11 | ✅ 100 %              | Audit qualité + doc   |
| 3002 | auth-service           | NestJS 11 | 60 %                  | P1                    |
| 3003 | ai-service             | FastAPI   | 30 %                  | P1                    |
| 3004 | document-service       | NestJS 11 | 60 %                  | P1                    |
| 3005 | notification-service   | NestJS 11 | 30 %                  | P1                    |
| 3006 | interop-service        | NestJS 11 | 10 %                  | P2 (Bloc B)           |
| 3007 | audit-service          | NestJS 11 | 60 %                  | P1                    |
| 3008 | appointment-service    | NestJS 11 | 40 %                  | P1                    |
| 3009 | anticorruption-service | FastAPI   | 5 %                   | P2 (Bloc D)           |
| 3010 | governance-service     | NestJS 11 | 20 %                  | P2 (Bloc C2)          |
| 3011 | vulnerability-service  | NestJS 11 | 10 %                  | P2 (Bloc C1)          |
| 3013 | enrollment-service     | NestJS 11 | 🟠 VIDE               | P0                    |
| 3014 | ussd-service           | NestJS 11 | 🟠 VIDE               | P0                    |
| 3015 | biometric-service      | NestJS 11 | 20 %                  | P3 (Bloc F — différé) |
| 3016 | electoral-service      | NestJS 11 | Non créé              | P2 (Bloc C3)          |

> **Note** : port 3012 réservé / non utilisé (anciennement collision v2.0 entre electoral et
> biometric).

# Annexe C — Codes d'erreur normalisés

Format : `E_{DOMAIN}_{NNN}`. Domaines : NINA, AUTH, GW, AI, DOC, AUDIT, NOTIF, APT, ENR, USSD, VUL,
AES, GOV, ELEC, SIGAC, CACHE, DB.

Liste centralisée dans `packages/shared-types/src/error-codes.ts` (à créer en PROMPT 1.3). Chaque
code a :

- `code` : la constante
- `httpStatus` : code HTTP à renvoyer (400, 401, 403, 404, 409, 422, 500, 503)
- `messageKey` : clé i18n pour la traduction (FR + 7 langues)
- `loggable` : booléen — si true, log warn ; si false (erreurs métier attendues), log info

Exemples :

```typescript
export const ERROR_CODES = {
  E_NINA_FORMAT_001: { httpStatus: 422, messageKey: 'errors.nina.format', loggable: false },
  E_NINA_NOT_FOUND_002: { httpStatus: 404, messageKey: 'errors.nina.notFound', loggable: false },
  E_GW_002: { httpStatus: 503, messageKey: 'errors.gateway.circuitOpen', loggable: true },
  E_AUTH_001: { httpStatus: 401, messageKey: 'errors.auth.invalidCredentials', loggable: false },
  E_AUTH_004: { httpStatus: 401, messageKey: 'errors.auth.tokenExpired', loggable: false },
  E_USSD_002: { httpStatus: 400, messageKey: 'errors.ussd.invalidSession', loggable: false },
  // ... ~80 codes au total
} as const;
```

# Annexe D — Checklists par phase

Chaque phase a sa checklist standard (cf. Partie III, squelette §9). Récapitulatif global de fin de
v3.0 :

- [ ] Audit du repo terminé et documenté (`AUDIT-COMPLET-2026-05.md`)
- [ ] Versions canoniques publiées (`VERSIONS-MAI-2026.md`)
- [ ] `@nina-aes/logger` opérationnel — Pino + Loki + correlation ID + masquage PII
- [ ] Tous les services bumpés à NestJS 11.1.23, TS 6.0.3, Node 24
- [ ] api-gateway fonctionnel et routant 14 services en aval
- [ ] enrollment-service MVP livré
- [ ] ussd-service complet avec 8 langues et machine d'états
- [ ] identity-service audité et documenté comme pattern de référence
- [ ] AllExceptionsFilter + ZodValidationPipe globaux dans tous les services
- [ ] Codes d'erreur normalisés (Annexe C) appliqués
- [ ] Masquage PII vérifié dans tous les logs
- [ ] JSDoc/Docstring français systématique
- [ ] Tests coverage backend ≥ 80 %
- [ ] Audit OWASP 2025 documenté avec preuves
- [ ] Helm charts complets pour les 15 services + ports cohérents
- [ ] Documentation à jour, doublons éliminés

---

**Fin du PROMPT v3.0 — 23 mai 2026 — UQAR**
