# ADR-022 — Scope Bloc C : 3 sous-modules consolidés dans 2 microservices (vulnerability-service + governance-service)

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [22 — Bloc C Modules gouvernementaux](../22-BLOC-C-MODULES-GOUVERNEMENTAUX.md)
**Complète** : [ADR-002 — Microservices](./ADR-002-microservices.md),
[ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md)

---

## Contexte

Le PROMPT initial spécifie 3 modules institutionnels distincts dans le Bloc C : (1) personnes
vulnérables, (2) SGOGT messagerie officielle, (3) intégrité électorale. La question : faut-il **3
microservices séparés** ou **les regrouper** ?

Trois critères évalués :

1. **Cohésion fonctionnelle** : ces 3 modules partagent les permissions RBAC (rôles `OFFICIAL`,
   `SUPERVISOR`, `DIRECTOR`, `DGE_OFFICIAL`), la même UI dans `apps/governance`, et la même exigence
   d'audit Merkle. Forte cohésion → regroupement justifié.

2. **Indépendance d'évolution** : `vulnerability-service` a des besoins spécifiques (cache offline 5
   jours, queue BullMQ agents mobiles, géo-search PostGIS). SGOGT et Élections sont plus classiques
   (CRUD
   - cron). Indépendance partielle → séparation partielle justifiée.

3. **Charge opérationnelle** : étudiant solo. 3 services = 3 dockerfiles, 3 charts Helm, 3
   dashboards Prometheus. Limiter la prolifération improve maintenabilité.

---

## Décision

Le Bloc C est implémenté en **2 microservices** :

1. **`vulnerability-service` (port 3011, autonome)**
   - Logique d'agent mobile (BullMQ + cache SQLite Expo)
   - Géo-search PostGIS pour assignation
   - Endpoint `POST /vulnerability/declare` côté citoyen ou agent
   - Stack indépendante car les besoins sync différée / offline-first créent une complexité
     spécifique.

2. **`governance-service` (port 3010, multi-modules)**
   - Module **SGOGT** : messagerie officielle JWS Ed25519 + escalade
   - Module **Élections** : inscription auto 18 ans + export delta DGE
   - Stack partagée car même RBAC + même UI + même base Prisma
   - Modules logiques séparés par dossier (`src/sgogt/`, `src/elections/`), pas de service séparé.

L'UI gouvernance (`apps/governance`, port 4003) consomme les **deux services** via
`@nina-aes/api-client` (qui aggrège déjà 4+ services existants Bloc A).

---

## Conséquences positives

- **Cohérence opérationnelle** : un upgrade de `governance-service` met à jour SGOGT et Élections
  simultanément (cohérent quand les 2 partagent le même schema Prisma).
- **Moins de surface CI/CD** : 2 dockerfiles au lieu de 3, 2 charts Helm sous-section au lieu de 3.
- **Audit Merkle factorisé** : 1 instance d'`AuditService` injectée dans les 3 modules. Pas de
  risque de chaîne Merkle dupliquée.
- **vulnerability-service autonome** : peut évoluer rapidement sans bloquer SGOGT. Le cache offline
  5 jours est un concept qui ne pollue pas le `governance-service`.
- **RBAC clairs** :
  - Citoyens / Agents mobiles : `vulnerability-service` uniquement
  - Fonctionnaires : `governance-service` (SGOGT + Élections)
  - DGE_OFFICIAL : `governance-service` (Élections seul)

---

## Conséquences négatives

- **Coupling logique modéré** : si l'inscription électorale dépend de la catégorie vulnérabilité
  (ex. priorité scrutin handicapés), il faut un appel HTTP `governance → vulnerability`. Mitigation
  : query directe PostgreSQL en lecture seule, pas d'appel REST (autorisé car même DB).
- **Pas de scaling indépendant SGOGT/Élections** : si SGOGT explose (10k messages/min), Élections
  subit. Acceptable car volumétrie Élections constante (~10k inscriptions/an, pic pendant la période
  électorale).
- **Risque de bloat** : `governance-service` accumule des modules hétérogènes. Mitigation : règle
  stricte « 1 module = 1 dossier + 1 contrôleur ». Si la complexité dépasse 5 modules, splitter en
  V2.
- **Schema Prisma partagé entre SGOGT et Élections** : on doit éviter les FK cross-module pour
  préserver la portabilité.

---

## Alternatives rejetées

- **3 microservices séparés** (`vulnerability` / `sgogt` / `elections`) : pur DDD. Rejeté car (a)
  sur-engineering pour étudiant solo, (b) duplication de la chaîne audit Merkle × 3, (c) coût CI/CD
  ×3 disproportionné par rapport au bénéfice de scaling indépendant.

- **1 microservice unique** (tout dans `governance-service`) : trop de modules hétérogènes. La
  logique offline-first de `vulnerability` ne cohabite pas bien avec le synchrone de SGOGT.

- **vulnerability-service intégré dans `identity-service`** : tempting (les VulnerabilityProfile
  sont liés au Citizen). Rejeté car `identity-service` doit rester très ciblé sur la gestion NINA
  (audit trail, validation, recherche) — pas d'enrichissement métier social.

- **Pas de SGOGT du tout, utilisation de Mattermost ou Rocket.Chat** : alternatives open-source.
  Rejeté car (a) pas de signature cryptographique des messages, (b) pas d'escalade hiérarchique
  native, (c) pas d'audit Merkle, (d) intégration RBAC NINA-AES non triviale.

- **Élections via export pg_dump direct** : simple mais (a) DGE recevrait des NINAs en clair
  (violation privacy), (b) pas de delta-only — toujours export complet, (c) pas de signature
  DGE-vérifiable.

---

## Suivi

| Métrique                                       | Cible         | Outil                                       |
| ---------------------------------------------- | ------------- | ------------------------------------------- |
| Latence p95 `POST /vulnerability/declare`      | < 800 ms      | Prometheus histogram                        |
| Taux de profils vulnérables validés / déclarés | > 90 %        | Dashboard governance                        |
| Délai moyen validation agent CTDEC             | < 7 jours     | Query SQL `proof_reviewed_at - declared_at` |
| SGOGT message lu en < 24 h                     | > 95 % NORMAL | Query `read_at - created_at`                |
| Messages SGOGT escaladés                       | < 5 %         | Counter `sgogt_escalated_total`             |
| Inscriptions auto-18 ratées                    | 0 / mois      | Audit + alert Prometheus                    |
| Exports DGE générés                            | trace only    | Audit log                                   |
| Hash SHA-256 export DGE vérifié                | 100 %         | DGE feedback manuel                         |

Si **vulnerability-service** ne tient plus la charge (> 1 000 declare/h soutenu pendant 1 semaine),
envisager le split en V2.
