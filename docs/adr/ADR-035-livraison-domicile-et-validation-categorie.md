# ADR-035 — Livraison à domicile, politique de validation par catégorie et appel SMS de file (vulnerability-service)

**Statut** : ✅ Accepté **Date** : 2026-07-11 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [22 — Bloc C Modules gouvernementaux](../22-BLOC-C-MODULES-GOUVERNEMENTAUX.md)
**Complète** : [ADR-022 — Scope Bloc C](./ADR-022-modules-gouvernementaux-scope.md),
[ADR-027 — auth-guards type-only](./ADR-027-auth-guards-type-only-package.md),
[ADR-028 — appointment-service (centres, file)](./ADR-028-appointment-service-centres-file-attente.md)

---

## Contexte

Le `vulnerability-service` (Bloc C1) couvrait déjà : profils de vulnérabilité (catégorie
particulière, anti-IDOR, audité), file prioritaire (score `poids × K − âge`), agents mobiles
(enregistrement) et kits offline (idempotents). En réconciliant le service avec la spec PROMPT 6.1,
quatre écarts fonctionnels réels subsistaient :

1. **Pas de référentiel d'éligibilité** (`GET /categories`).
2. **Pas d'auto-détection ELDERLY** ni de **politique de validation par catégorie** au moment de la
   déclaration (tout profil était créé « non vérifié » quelle que soit la catégorie).
3. **Pas de missions de livraison à domicile** (create/assign/confirm/tournée, SLA 15 j) : seul
   l'enregistrement d'agents existait.
4. **Pas de notification SMS « c'est votre tour »** pour la file prioritaire.

La question : comment combler ces écarts **sans casser** les décisions déjà actées (ADR-022 : 2
services pour le Bloc C ; ADR-027 : guards locaux ; queue Postgres ; préfixe `/vulnerability/*`) et
**sans introduire de dépendance étrangère** ni de rôle plateforme superflu ?

---

## Décision

### D1 — « MOBILE_AGENT » = AGENT propriétaire d'un `MobileAgent` actif (pas un nouveau `UserRole`)

Le PROMPT évoque un « sous-rôle MOBILE_AGENT d'AGENT ». On ne l'implémente **pas** comme nouvelle
valeur de l'enum partagé `UserRole` (`@nina-aes/auth-guards`), car cela rippleait dans
`auth-service` (émission des tokens), Keycloak (mapping des rôles) et **tous** les services — coût
disproportionné pour un étudiant solo. À la place : le rôle reste **AGENT** et l'habilitation fine
vient de l'**entité** `MobileAgent` (déjà modélisée). La confirmation d'une livraison résout
`actor.userId` (sub JWT) → `User.id` (`findInternalUserId`) → `MobileAgent` (relation 1:1) et exige
que **cet** agent soit l'**affecté** de la mission ET **ACTIF** — contrôle d'ownership façon
anti-IDOR (même esprit qu'ADR-028 pour le self-service RDV).

### D2 — Politique de validation par catégorie (auto / self-déclaré / certificat)

Table unique de vérité `CATEGORY_POLICY` (dans `common/vulnerability.enums.ts`), exposée par
`GET /vulnerability/categories` **et** appliquée à `POST /vulnerability/profiles/declare` :

| Catégorie                      | Mode            | Règle                                                                       |
| ------------------------------ | --------------- | --------------------------------------------------------------------------- |
| ELDERLY                        | `AUTO_AGE`      | âge ≥ 60 (dérivé de `Citizen.birthDate`) ⇒ **auto-vérifié** ; sinon **422** |
| DISABLED, CHRONIC_ILL          | `MANUAL_CERT`   | **preuve obligatoire** (`proofUrl`) + revue agent CTDEC ; sinon **422**     |
| PREGNANT, ILLITERATE, DIASPORA | `SELF_DECLARED` | auto-déclaration **acceptée** sans preuve (auto-vérifié)                    |

L'âge ELDERLY est dérivé de la **date de naissance authentique** (`birthDate`), plus fiable que
l'année sur 2 chiffres du NINA (ambiguïté 19xx/20xx).

### D3 — Missions de livraison à domicile (`DeliveryMission`, SLA 15 j)

Nouveau sous-domaine `src/deliveries/` + modèle Prisma **additif** `DeliveryMission` (+ enums
`DeliveryStatus`, `DeliverySignatureType`). Cycle
`REQUESTED → ASSIGNED → (IN_TRANSIT) → DELIVERED | FAILED`. `dueAt = demande + DELIVERY_SLA_DAYS`
(15 j garantis). Chemin `/vulnerability/deliveries` (**pluriel**, cohérent avec
`profiles`/`mobile-agents`/`offline-batches`) plutôt que le `/delivery` littéral du prompt. **Aucune
donnée biométrique brute** : la preuve de réception est un **hash** (`signatureHash`) + une **URL
d'attestation chiffrée** (MinIO) + des coordonnées GPS — jamais le gabarit (souveraineté, doc 22
§5). Chaque transition est **auditée**.

### D4 — Appel SMS « c'est votre tour » de la file (délégué, idempotent, best-effort)

`POST /vulnerability/priority-queue/notify-next` publie un job SMS vers **notification-service**
(exchange `nina.notifications`, même contrat qu'appointment-service) pour le prochain citoyen non
encore appelé, puis horodate `notifiedAt` (idempotence). Best-effort : un bus indisponible ne fait
**pas** échouer l'opération et laisse l'appel **rejouable**. La **fenêtre 7h-9h dédiée** aux P1
reste portée par `EnrollmentCenter.priorityFrom/To/Quota` et **consommée par l'appointment-service**
— **non dupliquée** ici (séparation des responsabilités, ADR-022).

### D5 — `GET /categories` sous authentification (pas public)

Le référentiel d'éligibilité n'expose **aucune** donnée citoyenne, mais reste servi derrière
`JwtAuthGuard` (n'importe quel rôle) — principe « auth par défaut ». Utilisable par les fronts
citoyen/USSD/kiosque via leur token.

### D6 — Liste des livraisons : périmètre restreint pour l'AGENT (anti-BOLA)

Les missions de livraison exposent l'**adresse au domicile** de citoyens vulnérables (PII sensible).
`GET /vulnerability/deliveries` reste ouvert à AGENT/SUP/ADMIN/AUDITOR, mais un **simple AGENT est
forcé à ses propres missions** : quel que soit l'`agentId` fourni en query, il est **écrasé** par
l'agent résolu depuis son token (sub JWT → `User.id` → `MobileAgent`) ; un rôle non-supervision sans
`MobileAgent` rattaché obtient une liste **vide**. La supervision (SUPERVISOR/ADMIN/AUDITOR)
conserve la vue complète et le filtre par agent. Même modèle d'ownership que la tournée
(`GET /agent/:agentId`) et que la confirmation (D1) — cohérence anti-IDOR/BOLA sur **tous** les
chemins de lecture des missions. La query de liste est par ailleurs **validée** (Zod) : un `status`
hors enum ou une `page` non numérique est rejeté en **400** au lieu de provoquer une erreur SQL 500.

---

## Conséquences positives

- **Zéro rupture** : changements de schéma **additifs** (nouvelle table + colonne nullable
  `notified_at`) ; migration réversible ; aucun rôle plateforme ajouté ; ADR-022/027/028 intacts.
- **Souveraineté préservée** : aucune donnée biométrique brute stockée ; NINA jamais en clair.
- **Ownership fort** : la confirmation de livraison est cryptographiquement rattachable à l'agent
  assermenté affecté (traçabilité + non-répudiation applicative via l'audit).
- **Cohérence de contrat** : le job SMS réutilise le contrat notification-service existant.

## Conséquences négatives

- **Résolution en 2 sauts** (sub JWT → User.id → MobileAgent) à la confirmation : léger surcoût
  requête, mais évite un rôle plateforme et reste cohérent avec le reste du service.
- **Pas d'auto-notification de file par cron** : l'appel « c'est votre tour » est **déclenché par
  l'agent** (`notify-next`), pas automatique à intervalle — choix opérationnel (un SMS n'a de sens
  que quand un guichet se libère). Extension cron possible en V2 si besoin.
- **`requested_by`/`assigned_by` sans FK** (VarChar, comme `enqueued_by`) : pas d'intégrité
  référentielle sur ces acteurs — acceptable (identifiants d'audit, pas de jointure métier).

## Alternatives rejetées

- **Nouveau `UserRole.MOBILE_AGENT`** : rippl e auth-service + Keycloak + tous les services. Rejeté
  (cf. D1).
- **Queue Redis sorted-set + créneaux 7h-9h re-modélisés ici** : dupliquerait la logique de créneaux
  prioritaires déjà portée par `EnrollmentCenter`/appointment-service. Rejeté (cf. D4).
- **Stockage de la photo/biométrie d'attestation en base** : violerait la minimisation ; on ne garde
  qu'un hash + une URL chiffrée. Rejeté.
- **`GET /categories` public** : rejeté au profit de « auth par défaut » (données non sensibles mais
  cohérence de posture).

---

## Durcissements issus de la revue adversariale (2026-07-11)

Une revue multi-agents du diff a confirmé plusieurs défauts que les gates verts ne détectaient pas ;
tous corrigés dans la même passe :

- **BOLA sur la liste des missions** (élevé) — cf. **D6** : un AGENT pouvait énumérer **toutes** les
  missions (adresses domicile) via `agentId` arbitraire ou absent. Corrigé (périmètre forcé).
- **Chaîne de migrations cassée** (élevé) — les tables Bloc C1 (`priority_queue_entries`,
  `mobile_agents`, `offline_*`, `vulnerability_access_logs`) avaient été créées par `db push` **sans
  migration** ; la migration de livraison les **référençait** (ALTER + FK) et aurait fait échouer
  `migrate deploy` sur une base fraîche. Ajout d'une **baseline**
  `20260709120000_vulnerability_bloc_c1_base` (5 tables + 3 enums C1) **avant**
  `20260711120000_vulnerability_delivery_missions`, toutes deux régénérées depuis le SQL canonique
  Prisma (id `UUID` **sans** `DEFAULT` — génération applicative Prisma 7). Vérifié par
  `migrate diff --from-migrations` (base fantôme) : le diff résiduel ne contient **que** de la
  dérive orthogonale **préexistante** (Bloc B `aes_partners`, colonnes
  `aes_verification_logs`/`biometric_consents`, `id DROP DEFAULT` Prisma 7) — **hors périmètre**
  PROMPT 6.1, à réconcilier par une baseline globale ultérieure. **Base FRAÎCHE** (CI/prod) :
  `prisma migrate deploy` suffit. **Base de DEV existante** (tables + `notified_at` déjà présentes
  via `db push`) : résoudre les **deux** migrations comme appliquées sans les rejouer
  (`prisma migrate resolve --applied <bloc_c1_base>` **et** `<delivery_missions>`), ou
  `prisma migrate reset` — surtout **pas** `migrate deploy` seul, qui rejouerait le
  `ADD COLUMN notified_at` et échouerait. `prisma.config.ts` accepte désormais un
  `shadowDatabaseUrl` optionnel (via `SHADOW_DATABASE_URL`, inerte sinon) pour rejouer les
  migrations en base fantôme.
- **Template SMS inexistant** (élevé) — `notify-next` publiait `template: 'priority_queue_turn'`
  **absent** du catalogue notification-service (rendu → `TEMPLATE_NOT_FOUND`). Template
  **`priority-queue-turn`** enregistré (catalogue + `locales/fr.json`, canal SMS,
  `requiredVars: []`) et clé alignée côté publisher.
- **Sabotage par agent suspendu** (moyen) — `fail()` vérifiait l'ownership mais **pas** que l'agent
  était `ACTIVE` : un agent suspendu pouvait encore échouer sa mission. Aligné sur `confirm()`
  (403).
- **Attribution d'audit incomplète** (faible) — le publisher nichait `entityType`/`entityId`/
  `actorType`/`ipAddress` sous `payload`, mais le normalizer d'audit-service les lit **au niveau
  racine** de l'enveloppe (⇒ `entity_id` NULL). Champs **hissés à la racine** (enveloppe toujours
  compatible `DomainEvent` identity-service).

Gates après corrections : `check-types` + ESLint `--max-warnings=0` + tests **verts**
(vulnerability-service **80 tests**, notification-service **25 tests**).

## Suivi

| Métrique                                          | Cible  | Outil                                       |
| ------------------------------------------------- | ------ | ------------------------------------------- |
| Missions livrées dans le SLA (≤ 15 j)             | > 95 % | Query `confirmed_at - created_at`           |
| Confirmations par un agent NON affecté            | 0      | Refus 403 + audit `delivery.*`              |
| Profils ELDERLY auto-vérifiés à tort (< 60 ans)   | 0      | Refus 422 + test unitaire                   |
| SMS « c'est votre tour » ré-expédiés (doublon)    | 0      | Idempotence `notifiedAt` / `idempotencyKey` |
| NINA ou gabarit biométrique en clair (logs/audit) | 0      | Revue + `maskNina`/hash                     |
