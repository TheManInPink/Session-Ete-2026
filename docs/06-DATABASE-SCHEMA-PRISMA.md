# 06 — Schéma de Base de Données Prisma

> ⚠️ **Mise à jour mai 2026** — voir [`CHANGELOG.md`](./CHANGELOG.md) §1–2. Versions effectives :
>
> - **Prisma 7.8.0** + `@prisma/adapter-pg` + `pg` (le moteur « library » est remplacé par le moteur
>   « client » qui exige un driver adapter).
> - `previewFeatures = ["driverAdapters", "postgresqlExtensions", "relationJoins"]` dans le
>   `generator client`.
> - Image PostgreSQL : `postgis/postgis:18-3.6` (et non `postgres:18-alpine`) pour disposer
>   nativement de PostGIS + extensions requises.
> - Locale : ICU (`--locale-provider=icu --icu-locale=fr-FR`).
> - 16 modèles (spec initiale ; schéma implémenté étendu à 22 — cf. §3.2 et CHANGELOG), 10 enums,
>   soft-delete via callback `Prisma.defineExtension`.
> - Singleton paresseux via Proxy.
>
> ⚠️ **Audit honnêteté (cf. ADR-007 / canon sécurité)** — Le journal d'audit n'est **pas** un arbre
> de Merkle malgré certains noms de variables historiques (`computeMerkleHash`, `merkleHash`). C'est
> une **hash-chain SHA-256 linéaire** : chaque entrée chaîne le hash de la précédente. Une
> hash-chain seule **n'est pas inaltérable** — un administrateur disposant d'un accès
> `UPDATE`/`DELETE` sur la base pourrait recalculer toute la chaîne. L'intégrité réelle repose sur
> **deux** mécanismes complémentaires décrits en §4bis : (1) un **scellement Ed25519 in-process**
> (via `@noble/ed25519`, **pas** Vault Transit qui ne supporte pas Ed25519 — cf. ADR-026 / ADR-034)
> des racines périodiques, et (2) l'**ancrage horodaté chez un tiers** (registre signé OCLEI /
> Vérificateur Général). Tant que l'ancrage tiers n'est pas déployé, on parle de hash-chain «
> append-only + scellée », jamais d'« inaltérable ».

> **Bloc concerné** : Transversal (tous les blocs A → F) **Prérequis** : Documents 00 à 05 complétés
> ; PostgreSQL Docker running et healthy ; `packages/database` existant avec **Prisma 7.8+** **Durée
> estimée** : 12 à 16 heures pour un étudiant seul **Livrables de cette étape** :
>
> - Schéma Prisma complet (`packages/database/prisma/schema.prisma`) couvrant les 11 services
> - Migrations initiales exécutées (`prisma migrate dev`)
> - Script de seeds géographiques (`prisma/seed.ts`) — régions, cercles, communes du Mali
> - Client Prisma généré et importable par tous les services NestJS
> - Diagramme ER (Entity-Relationship) à jour
> - Fichier `docs/adr/ADR-011-database-schema-prisma.md` dans le repo

---

## 1. Objectif pédagogique

Le schéma de base de données est le **squelette** du système. Chaque table, chaque colonne, chaque
relation reflète une décision métier. Un schéma bien conçu rend le code applicatif simple ; un
schéma mal conçu force des contorsions complexes dans chaque service.

Dans cette étape, on apprend à :

- **Modéliser un domaine métier complexe** — L'identité nationale malienne implique des entités
  interdépendantes : citoyens (enregistrements NINA), utilisateurs du système (agents,
  superviseurs), sessions d'authentification, documents générés, corrections IA, journaux d'audit,
  rendez-vous, notifications, vérifications inter-pays AES, personnes vulnérables, scores
  anti-corruption. Chaque entité doit être correctement reliée aux autres.

- **Utiliser Prisma comme ORM** — Prisma offre un langage de schéma déclaratif (`.prisma`) qui
  génère automatiquement un client TypeScript typé. Au lieu d'écrire des requêtes SQL à la main, on
  écrit `prisma.citizen.findMany({ where: { lastName: { contains: 'Keita' } } })` et Prisma génère
  le SQL optimisé.

- **Concevoir des index pour la performance** — Un index sur `(lastName, firstName)` accélère la
  recherche par nom de 100× sur une base de 20 millions d'enregistrements. Un index GIN trigram sur
  `lastNameAscii` permet la recherche floue en temps réel. Chaque index a un coût en écriture, donc
  on les place stratégiquement.

- **Implémenter la géographie administrative du Mali** — Le système RAVEC divise le Mali en régions,
  cercles et communes. Ces tables de référence sont les données de seed initiales du système.

- **Appliquer les conventions de nommage** — `camelCase` dans Prisma (TypeScript), `snake_case` dans
  PostgreSQL (SQL). Prisma gère la traduction via `@map()` et `@@map()`.

💡 **Pourquoi un schéma Prisma unifié ?** Tous les microservices NestJS accèdent à la **même base
PostgreSQL** (architecture « shared database »). C'est un compromis pragmatique : en théorie, chaque
microservice devrait avoir sa propre base (« database per service »), mais pour un projet
universitaire avec un seul développeur, la complexité opérationnelle de 11 bases séparées est
disproportionnée. Le schéma unifié dans `packages/database` garantit la cohérence.

---

## 2. Technologies utilisées (avec versions à jour — avril 2026)

| Technologie        | Version | Rôle dans cette étape                                 | Documentation officielle                           |
| ------------------ | ------- | ----------------------------------------------------- | -------------------------------------------------- |
| **Prisma ORM**     | 7.7+    | Schéma déclaratif, migrations, client TypeScript typé | https://www.prisma.io/docs                         |
| **Prisma Client**  | 7.7+    | Client TypeScript auto-généré (requêtes typées)       | https://www.prisma.io/docs/orm/prisma-client       |
| **Prisma Migrate** | 7.7+    | Système de migrations SQL (create, alter, drop)       | https://www.prisma.io/docs/orm/prisma-migrate      |
| **Prisma Studio**  | 7.7+    | Interface web pour visualiser et éditer les données   | https://www.prisma.io/docs/orm/tools/prisma-studio |
| **PostgreSQL**     | 18      | SGBD cible (image `postgis/postgis:18-3.6`, doc 05)   | https://www.postgresql.org/docs/18/                |
| **pgcrypto**       | (ext.)  | Chiffrement de colonne PII (option B — cf. §4ter)     | https://www.postgresql.org/docs/18/pgcrypto.html   |
| **tsx**            | 4.21+   | Exécuteur TypeScript pour le script de seed           | https://tsx.is/                                    |
| **TypeScript**     | 6.0.2   | Typage statique du client Prisma                      | https://www.typescriptlang.org/docs/               |

### Commandes Prisma essentielles

| Commande               | Raccourci Makefile | Effet                                            |
| ---------------------- | ------------------ | ------------------------------------------------ |
| `pnpm run db:generate` | `make db-generate` | Génère le client TypeScript à partir du schéma   |
| `pnpm run db:validate` | `make db-validate` | Valide le schéma Prisma (syntaxe + types)        |
| `pnpm run db:migrate`  | `make db-migrate`  | Crée et exécute les migrations SQL               |
| `pnpm run db:seed`     | `make db-seed`     | Peuple la base avec les données initiales        |
| `pnpm run db:studio`   | `make db-studio`   | Lance l'interface web (http://localhost:5555)    |
| `pnpm run db:reset`    | `make db-reset`    | Drop + recreate + migrate + seed (⚠️ destructif) |

---

## 3. Architecture de la base de données — Vue d'ensemble

### 3.1 Diagramme ER (Entity-Relationship)

Ce diagramme montre toutes les tables du système et leurs relations. Les tables sont regroupées par
domaine fonctionnel.

```mermaid
erDiagram
    %% ═══ GÉOGRAPHIE RAVEC ═══
    Region ||--o{ Cercle : "contient"
    Cercle ||--o{ Commune : "contient"

    %% ═══ IDENTITÉ NINA ═══
    Citizen }o--|| Commune : "enregistré dans"
    Citizen ||--o{ NinaCorrection : "corrections"
    Citizen ||--o{ Document : "documents émis"

    %% ═══ UTILISATEURS / AUTH ═══
    User ||--o{ NinaCorrection : "soumet/approuve"
    User ||--o{ AuditLog : "acteur"
    User ||--o{ Appointment : "prend RDV"
    User ||--o{ Notification : "reçoit"

    %% ═══ IA ═══
    NinaCorrection }o--o| AiAnalysis : "suggérée par IA"

    %% ═══ AUDIT (hash-chain SHA-256, PAS Merkle) ═══
    AuditLog {
        string payloadHash
        string previousHash
        string merkleHash
    }
    AuditRoot {
        string chainRootHash
        string signature_Ed25519
    }
    AuditLog ||--o| AuditRoot : "scellée périodiquement par"

    %% ═══ DOCUMENTS ═══
    Document }o--|| Citizen : "concerne"

    %% ═══ AES INTEROP ═══
    AesVerification }o--|| Citizen : "vérifie"

    %% ═══ VULNÉRABILITÉ ═══
    VulnerabilityRecord }o--|| Citizen : "identifie"

    %% ═══ RENDEZ-VOUS ═══
    Appointment }o--|| User : "citoyen"

    %% ═══ ANTI-CORRUPTION ═══
    %% NB : `Alert` est le nom CIBLE du doc ; le modèle réel est `CorruptionAlert`
    %%      (table `corruption_alerts`). Mapping : Alert (doc) == CorruptionAlert (schema.prisma).
    IntegrityScore }o--|| User : "évalué"
    Alert }o--o| User : "signalement"
```

### 3.2 Tableau récapitulatif des modèles

| Modèle                | Table SQL               | Service principal             | Nb de champs | Rôle                                                                                                                                                                                           |
| --------------------- | ----------------------- | ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Region`              | `regions`               | identity-service              | 4            | Régions du Mali (10)                                                                                                                                                                           |
| `Cercle`              | `cercles`               | identity-service              | 5            | Cercles (49)                                                                                                                                                                                   |
| `Commune`             | `communes`              | identity-service              | 5            | Communes (703)                                                                                                                                                                                 |
| `Citizen`             | `citizens`              | identity-service              | 14           | Enregistrements d'identité NINA                                                                                                                                                                |
| `User`                | `users`                 | auth-service                  | 15           | Utilisateurs du système (agents, admins, citoyens)                                                                                                                                             |
| `NinaCorrection`      | `nina_corrections`      | identity-service + ai-service | 16           | Demandes de correction (manuelles et IA)                                                                                                                                                       |
| `AiAnalysis`          | `ai_analyses`           | ai-service                    | 12           | Résultats d'analyse IA par batch                                                                                                                                                               |
| `AuditLog`            | `audit_logs`            | audit-service                 | 14           | Journal d'audit append-only — hash-chain SHA-256 (PAS Merkle)                                                                                                                                  |
| `AuditRoot`           | `audit_roots`           | audit-service                 | 8            | Racines périodiques scellées Ed25519 + ancrage tiers (cf. §4bis)                                                                                                                               |
| `Document`            | `documents`             | document-service              | 12           | Fiches Descriptives, récépissés, etc.                                                                                                                                                          |
| `Appointment`         | `appointments`          | appointment-service           | 11           | Rendez-vous en mairie / CTDEC                                                                                                                                                                  |
| `EnrollmentCenter`    | `enrollment_centers`    | appointment-service           | 16           | Profil opérationnel d'un centre (horaires, capacité, quotas, géo) — cf. ADR-028                                                                                                                |
| `Notification`        | `notifications`         | notification-service          | 10           | Emails, SMS, push                                                                                                                                                                              |
| `AesVerification`     | `aes_verifications`     | interop-service               | 11           | Vérifications inter-pays AES                                                                                                                                                                   |
| `VulnerabilityRecord` | `vulnerability_records` | vulnerability-service         | 10           | Personnes vulnérables                                                                                                                                                                          |
| `IntegrityScore`      | `integrity_scores`      | anticorruption-service        | 10           | Scores d'intégrité SIGAC                                                                                                                                                                       |
| `Alert`               | `alerts`                | anticorruption-service        | 11           | Signalements lanceurs d'alerte — ⚠️ nom **cible** : le modèle réel est `CorruptionAlert` / table `corruption_alerts` (`Alert` == `CorruptionAlert`), description en clair (`body`) aujourd'hui |
| `UssdSession`         | `ussd_sessions`         | notification-service          | 8            | Historique des sessions USSD                                                                                                                                                                   |

> **Note de synchronisation (2026-06-04)** — Ce tableau reflète la **spec initiale** (PROMPT 1.3).
> Le schéma **implémenté** a évolué depuis : modèles `document-service` (`Document`,
> `DocumentRevocation`, `DocumentAccessLog`), `AuditRoot`, et `EnrollmentCenter`
> (appointment-service, migration `20260604120000_enrollment_centers`). En cas de divergence,
> **`packages/database/prisma/schema.prisma` fait foi** (cf. `docs/CHANGELOG.md` patches
> 0ter/0decies/0undecies).

### 3.3 Conventions de nommage

| Élément       | Convention Prisma (TypeScript) | Convention SQL (PostgreSQL)  | Mécanisme                           |
| ------------- | ------------------------------ | ---------------------------- | ----------------------------------- |
| Nom de modèle | `PascalCase` : `Citizen`       | —                            | Prisma n'a pas de table directement |
| Nom de table  | —                              | `snake_case` : `citizens`    | `@@map("citizens")`                 |
| Nom de champ  | `camelCase` : `birthDate`      | `snake_case` : `birth_date`  | `@map("birth_date")     `           |
| Clé primaire  | `id`                           | `id`                         | `@id @default(uuid())`              |
| Clé étrangère | `regionId`                     | `region_id`                  | `@map("region_id")`                 |
| Timestamps    | `createdAt` / `updatedAt`      | `created_at` / `updated_at`  | `@map(...)`                         |
| Enum          | `PascalCase` : `UserRole`      | Type PostgreSQL personnalisé | `enum UserRole { ... }`             |

---

## 4. Schéma Prisma complet — Code commenté

Le schéma ci-dessous documente le contenu de `packages/database/prisma/schema.prisma`. Il remplace
le schéma minimal du document 04.

⚠️ **Ce schéma est conçu pour être extensible**. Chaque modèle contient les champs essentiels. Des
champs supplémentaires seront ajoutés lors de l'implémentation détaillée de chaque service
(documents 07 à 14).

> 🧭 **Contrat de compilation (à lire avant de copier-coller).** Ce bloc mélange volontairement deux
> générations de modèles :
>
> 1. **Modèles RÉELS implémentés** (source de vérité, compilables tels quels) : `Location`,
>    `Parent`, `Citizen`, `CorrectionRequest`, `ElectoralRecord`, `AuditLog`, `AuditRoot`, `Alert`
>    (+ enums `Sex`, `MaritalStatus`, `Language`, `UserRole`, `CorrectionStatus`). Ce sont eux qui
>    font foi et que ce document a complétés.
> 2. **Modèles PÉDAGOGIQUES / hérités** (illustratifs, conservés pour la lecture progressive) :
>    `Region`, `Cercle`, `Commune`, `NinaCorrection`, et le câblage `User`-centrique de
>    `Appointment` / `Notification`. Ils utilisent un vocabulaire d'enums en français (`SOUMISE`,
>    `CITOYEN`, …) et **ne sont pas reliés** au `Citizen` réel.
>
> **Pour obtenir un `.prisma` qui compile (`pnpm run db:validate`), c'est `schema.prisma` du repo
> qui fait foi**, pas la juxtaposition des deux générations ci-dessous. Les blocs hérités sont
> signalés par un commentaire `⚠️ Modèle PÉDAGOGIQUE`. Cette honnêteté évite de laisser croire qu'un
> simple copier-coller produit un schéma valide.

```prisma
// ═══════════════════════════════════════════════════════════════
// Schéma Prisma — NINA-AES Platform
// Base de données unifiée pour les 11 microservices
//
// Conventions :
//   - Modèles en PascalCase → tables en snake_case via @@map()
//   - Champs en camelCase → colonnes en snake_case via @map()
//   - UUID v4 pour toutes les clés primaires
//   - Timestamps automatiques (createdAt / updatedAt) sur chaque modèle
//
// Auteur  : Étudiant UQAR
// Date    : Avril 2026
// Version : 2.0 (enrichi depuis document 06)
// ═══════════════════════════════════════════════════════════════

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═══════════════════════════════════════════════════
// ENUMS — Types personnalisés PostgreSQL
// ═══════════════════════════════════════════════════

/// Sexe encodé dans le premier chiffre du NINA
enum Sex {
  MALE      // 1 dans le NINA
  FEMALE    // 2 dans le NINA
  UNKNOWN   // état civil incomplet (à compléter par correction)
}

/// Statut matrimonial (FDI / état civil). Référencé par `Citizen.maritalStatus`.
enum MaritalStatus {
  SINGLE        // célibataire
  MARRIED       // marié·e
  DIVORCED      // divorcé·e
  WIDOWED       // veuf·ve
  SEPARATED     // séparé·e
  CIVIL_UNION   // union libre reconnue
}

/// Langues nationales supportées (UI + USSD + notifications).
/// Référencé par `Citizen.preferredLanguage` et `User.preferredLanguage`.
enum Language {
  FR    // français (langue officielle)
  BM    // bambara
  SNK   // soninké
  FF    // peul / fulfulde
  TMQ   // tamasheq
  HAU   // haoussa
  MOS   // mossi
  DJE   // zarma / djerma
}

/// Rôles RBAC — 6 niveaux d'accès dans le système
enum UserRole {
  CITOYEN       // Lecture seule sur ses propres données
  AGENT         // Saisie et correction (agent CTDEC)
  SUPERVISEUR   // Validation des corrections
  ADMIN         // Administration technique
  AUDITEUR      // Lecture seule sur les journaux d'audit
  INSPECTEUR    // Accès SIGAC anti-corruption
}

/// Statut d'une demande de correction NINA
enum CorrectionStatus {
  SOUMISE       // Correction soumise (par IA ou manuellement)
  EN_REVUE      // Un agent examine la correction
  APPROUVEE     // Un superviseur a validé
  REJETEE       // Correction refusée
  APPLIQUEE     // Correction appliquée à la base
}

/// Source de la correction (qui l'a initiée)
enum CorrectionSource {
  IA            // Proposée automatiquement par le service IA
  AGENT         // Soumise manuellement par un agent CTDEC
  CITOYEN       // Demandée par le citoyen via le portail
  USSD          // Demandée via le menu USSD *123*NINA#
}

/// Niveau de confiance d'une analyse IA
enum AiConfidenceLevel {
  HAUTE         // Score >= 85% — correction auto proposée
  MOYENNE       // Score 60-84% — revue manuelle requise
  BASSE         // Score < 60% — log seul
}

/// Type de document généré
enum DocumentType {
  FICHE_DESCRIPTIVE     // Fiche Descriptive Individuelle (PDF signé + QR)
  RECEPISSE             // Récépissé de demande
  ATTESTATION           // Attestation de correction
  EXPORT_AUDIT          // Export du journal d'audit
}

/// Statut d'un document
enum DocumentStatus {
  GENERE        // Document créé et stocké dans MinIO
  SIGNE         // Document signé numériquement (JWT RS256)
  EXPIRE        // Document expiré (au-delà de la période de validité)
  REVOQUE       // Document révoqué (suite à correction ou fraude)
}

/// Canal de notification
enum NotificationChannel {
  EMAIL
  SMS
  PUSH
  USSD
}

/// Statut d'une notification
enum NotificationStatus {
  EN_ATTENTE    // Dans la queue, pas encore envoyée
  ENVOYEE       // Envoyée avec succès
  ECHOUEE       // Échec d'envoi (retry planifié)
  LUE           // Lue par le destinataire (si applicable)
}

/// Statut d'un rendez-vous
enum AppointmentStatus {
  PLANIFIE      // RDV pris, pas encore passé
  CONFIRME      // Confirmé par l'agent / le système
  EN_COURS      // Le citoyen est sur place
  TERMINE       // RDV effectué
  ANNULE        // Annulé par le citoyen ou l'agent
  ABSENT        // Le citoyen ne s'est pas présenté
}

/// Pays membres de l'AES
enum AesCountry {
  MLI           // Mali
  BFA           // Burkina Faso
  NER           // Niger
}

/// Statut d'une vérification inter-pays AES
enum AesVerificationStatus {
  EN_ATTENTE    // Requête envoyée, en attente de réponse
  TROUVEE       // Identité trouvée dans le pays cible
  NON_TROUVEE   // Identité non trouvée
  ERREUR        // Erreur technique (timeout, service indisponible)
}

/// Catégories de personnes vulnérables
enum VulnerabilityCategory {
  PERSONNE_AGEE
  HANDICAP
  FEMME_ENCEINTE
  MALADIE_CHRONIQUE
  ANALPHABETE
  DIASPORA
}

/// Priorité de traitement pour les personnes vulnérables
enum VulnerabilityPriority {
  STANDARD
  PRIORITAIRE
  URGENTE
}

/// Canal d'un signalement anti-corruption
enum AlertChannel {
  PORTAIL       // Via le portail web (citizen ou governance)
  USSD          // Via *123*ALERTE#
  SMS           // Via SMS direct
  ANONYME       // Canal anonyme chiffré
}

/// Statut d'un signalement anti-corruption
enum AlertStatus {
  RECUE         // Signalement reçu
  EN_ENQUETE    // Enquête en cours par un inspecteur
  CONFIRMEE     // Signalement confirmé (action disciplinaire)
  REJETEE       // Signalement non fondé
  CLASSEE       // Dossier classé
}

// ═══════════════════════════════════════════════════
// GÉOGRAPHIE RAVEC — Tables de référence
// ═══════════════════════════════════════════════════

/// Entité administrative hiérarchique (8 niveaux : pays → région → cercle →
/// commune → arrondissement → quartier → village → fraction).
///
/// ⚠️ `Location` est la table géographique RÉELLEMENT implémentée et référencée
/// par `Citizen.birthPlace`, `Citizen.residence`, `Appointment.location`,
/// `ElectoralRecord.pollingStation`, etc. (auto-référente via `parent`).
/// Les modèles `Region` / `Cercle` / `Commune` ci-dessous sont conservés à titre
/// PÉDAGOGIQUE (modélisation « à plat » introductive du document) mais ne sont
/// PAS reliés à `Citizen` ; la source de vérité reste `schema.prisma`.
model Location {
  id        String                                @id @default(uuid()) @db.Uuid
  /// Code administratif officiel (ex. "ML-08-02-005"). Unique.
  code      String                                @unique @db.VarChar(20)
  name      String                                @db.VarChar(150)
  /// Version ASCII (sans diacritiques) pour recherche fuzzy + index trigram.
  nameAscii String                                @map("name_ascii") @db.VarChar(150)
  /// Niveau : 0=pays, 1=région, 2=cercle, 3=commune, 4=arrondissement,
  /// 5=quartier, 6=village, 7=fraction.
  level     Int                                   @db.SmallInt
  parentId  String?                               @map("parent_id") @db.Uuid
  latitude  Decimal?                              @db.Decimal(10, 7)
  longitude Decimal?                              @db.Decimal(10, 7)
  /// Point géographique PostGIS (EPSG:4326). Rempli par trigger SQL.
  geom      Unsupported("geography(Point,4326)")?
  createdAt DateTime                              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime                              @updatedAt @map("updated_at") @db.Timestamptz(6)

  /// Auto-relation hiérarchique : un niveau pointe vers son parent immédiat.
  parent   Location?  @relation("LocationHierarchy", fields: [parentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  children Location[] @relation("LocationHierarchy")

  /// Relations entrantes (lieux de naissance / résidence / RDV / bureau de vote).
  citizensBirth     Citizen[]         @relation("BirthLocation")
  citizensResidence Citizen[]         @relation("ResidenceLocation")
  electoralRecords  ElectoralRecord[]

  @@index([parentId])
  @@index([level])
  @@index([nameAscii(ops: raw("gin_trgm_ops"))], type: Gin, map: "idx_locations_name_ascii_trgm")
  @@map("locations")
}

/// Parent (père ou mère) d'un·e citoyen·ne. Référencé par `Citizen.father` et
/// `Citizen.mother`. Peut être partagé entre frères et sœurs (fratrie).
model Parent {
  id        String    @id @default(uuid()) @db.Uuid
  firstName String    @map("first_name") @db.VarChar(100)
  lastName  String    @map("last_name") @db.VarChar(100)
  /// NINA du parent s'il·elle est lui-même enregistré·e. Nullable.
  nina      String?   @unique @db.VarChar(15)
  sex       Sex
  birthDate DateTime? @map("birth_date") @db.Date
  deceased  Boolean   @default(false)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  fatheredChildren Citizen[] @relation("FatherOf")
  motheredChildren Citizen[] @relation("MotherOf")

  @@index([lastName])
  @@map("parents")
}

/// Région administrative du Mali (10 régions + district de Bamako)
/// ⚠️ Modèle PÉDAGOGIQUE non relié à `Citizen` (cf. note sur `Location`).
model Region {
  id        String   @id @default(uuid())
  /// Code RAVEC de la région (1 chiffre pour les régions historiques, 2 pour les nouvelles)
  code      String   @unique @db.VarChar(2)
  /// Nom officiel de la région
  nom       String   @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  /// Cercles appartenant à cette région
  cercles Cercle[]

  @@map("regions")
}

/// Cercle administratif (subdivision d'une région)
model Cercle {
  id        String   @id @default(uuid())
  /// Code RAVEC du cercle (2 chiffres)
  code      String   @db.VarChar(4)
  /// Nom officiel du cercle
  nom       String   @db.VarChar(100)
  /// Région parente
  regionId  String   @map("region_id")
  region    Region   @relation(fields: [regionId], references: [id])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  /// Communes appartenant à ce cercle
  communes Commune[]

  @@unique([regionId, code])
  @@map("cercles")
}

/// Commune (subdivision d'un cercle) — plus petite unité administrative
model Commune {
  id        String   @id @default(uuid())
  /// Code RAVEC de la commune (3 chiffres)
  code      String   @db.VarChar(7)
  /// Nom officiel de la commune
  nom       String   @db.VarChar(100)
  /// Cercle parent
  cercleId  String   @map("cercle_id")
  cercle    Cercle   @relation(fields: [cercleId], references: [id])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  /// Enregistrements NINA dans cette commune
  ninaRecords Citizen[]

  @@unique([cercleId, code])
  @@map("communes")
}

// ═══════════════════════════════════════════════════
// IDENTITÉ NINA — Table principale
// ═══════════════════════════════════════════════════

/// Enregistrement NINA — identité d'un citoyen malien
/// Source de vérité : packages/database/prisma/schema.prisma (model Citizen)
model Citizen {
  id                    String                 @id @default(uuid()) @db.Uuid
  /// Numéro NINA : 14 chiffres + 1 lettre de contrôle.
  nina                  String                 @unique @db.VarChar(15)
  firstName             String                 @map("first_name") @db.VarChar(100)
  lastName              String                 @map("last_name") @db.VarChar(100)
  /// Versions ASCII indexées trigram pour recherche fuzzy.
  firstNameAscii        String                 @map("first_name_ascii") @db.VarChar(100)
  lastNameAscii         String                 @map("last_name_ascii") @db.VarChar(100)
  birthDate             DateTime               @map("birth_date") @db.Date
  sex                   Sex
  maritalStatus         MaritalStatus          @default(SINGLE) @map("marital_status")
  profession            String?                @db.VarChar(100)
  photoUrl              String?                @map("photo_url") @db.VarChar(500)
  /// Hash SHA-256 de la photo (vérifiable depuis le QR JWT).
  photoHash             String?                @map("photo_hash") @db.VarChar(64)
  /// Hash SHA-256 du template biométrique (Bloc F — jamais le template brut).
  fingerprintHash       String?                @map("fingerprint_hash") @db.VarChar(64)
  /// Catégorie principale de vulnérabilité (file prioritaire). Le détail
  /// (preuves, dates de validité, …) reste dans `VulnerabilityRecord`.
  vulnerabilityCategory VulnerabilityCategory? @map("vulnerability_category")
  birthPlaceId          String                 @map("birth_place_id") @db.Uuid
  residenceId           String                 @map("residence_id") @db.Uuid
  fatherId              String?                @map("father_id") @db.Uuid
  motherId              String?                @map("mother_id") @db.Uuid
  preferredLanguage     Language               @default(FR) @map("preferred_language")
  phoneNumber           String?                @map("phone_number") @db.VarChar(20)
  email                 String?                @db.VarChar(200)
  /// Verrou optimiste pour éviter les écrasements concurrents.
  version               Int                    @default(0)
  createdAt             DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// Soft delete — préféré à un boolean `actif` car horodaté et compatible
  /// avec les audits SIGAC ("quand a-t-on retiré le NINA et pourquoi ?").
  deletedAt             DateTime?              @map("deleted_at") @db.Timestamptz(6)

  birthPlace Location @relation("BirthLocation", fields: [birthPlaceId], references: [id], onDelete: Restrict)
  residence  Location @relation("ResidenceLocation", fields: [residenceId], references: [id], onDelete: Restrict)
  father     Parent?  @relation("FatherOf", fields: [fatherId], references: [id], onDelete: Restrict)
  mother     Parent?  @relation("MotherOf", fields: [motherId], references: [id], onDelete: Restrict)

  correctionRequests CorrectionRequest[]
  appointments       Appointment[]
  vulnerabilities    VulnerabilityRecord[]
  electoralRecord    ElectoralRecord?
  notifications      Notification[]

  @@index([lastName])
  @@index([birthDate])
  @@index([sex])
  @@index([deletedAt])
  @@index([vulnerabilityCategory])
  @@index([lastNameAscii(ops: raw("gin_trgm_ops"))], type: Gin, map: "idx_citizens_lastname_trgm")
  @@index([firstNameAscii(ops: raw("gin_trgm_ops"))], type: Gin, map: "idx_citizens_firstname_trgm")
  @@map("citizens")
}

// ═══════════════════════════════════════════════════
// CORRECTIONS NINA — workflow citoyen ↔ agent
// ═══════════════════════════════════════════════════

/// Demande de correction d'un champ NINA. Référencé par `Citizen.correctionRequests`.
/// (Modèle réellement implémenté — remplace l'ancien `NinaCorrection` documenté
/// plus bas, conservé à titre historique.)
model CorrectionRequest {
  id                  String           @id @default(uuid()) @db.Uuid
  citizenId           String           @map("citizen_id") @db.Uuid
  requestedByUserId   String?          @map("requested_by_user_id") @db.Uuid
  /// Agent assigné (alias UI : `reviewedBy`).
  reviewedBy          String?          @map("reviewed_by") @db.Uuid
  field               String           @db.VarChar(50)
  currentValue        String           @map("current_value") @db.VarChar(500)
  proposedValue       String           @map("proposed_value") @db.VarChar(500)
  reason              String           @db.Text
  /// URL MinIO du justificatif scanné (CIN, acte de naissance…).
  justificationDocUrl String?          @map("justification_doc_url") @db.VarChar(500)
  /// Score IA (0-100) — cf. doc 11 (ai-service).
  aiScore             Decimal?         @map("ai_score") @db.Decimal(5, 2)
  aiVerdict           String?          @map("ai_verdict") @db.VarChar(30)
  aiExplanation       Json?            @map("ai_explanation")
  /// Valeur initiale alignée sur l'enum §4 (SOUMISE). Le schéma implémenté
  /// utilise le vocabulaire anglais (`DRAFT`) — cf. `schema.prisma`.
  status              CorrectionStatus @default(SOUMISE)
  decidedAt           DateTime?        @map("decided_at") @db.Timestamptz(6)
  decisionReason      String?          @map("decision_reason") @db.Text
  createdAt           DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt           DateTime?        @map("deleted_at") @db.Timestamptz(6)

  citizen Citizen @relation(fields: [citizenId], references: [id], onDelete: Restrict)

  @@index([citizenId])
  @@index([status])
  @@index([reviewedBy])
  @@index([createdAt])
  @@index([deletedAt])
  @@map("correction_requests")
}

// ═══════════════════════════════════════════════════
// INSCRIPTION ÉLECTORALE — auto-inscription à 18 ans
// ═══════════════════════════════════════════════════

/// Inscription électorale d'un·e citoyen·ne. Référencé par `Citizen.electoralRecord`
/// (relation 1-1) et par `Location.electoralRecords` (bureau de vote).
model ElectoralRecord {
  id                 String    @id @default(uuid()) @db.Uuid
  citizenId          String    @unique @map("citizen_id") @db.Uuid
  registrationNumber String    @unique @map("registration_number") @db.VarChar(30)
  pollingStationId   String?   @map("polling_station_id") @db.Uuid
  /// Date à partir de laquelle le·la citoyen·ne est éligible (18 ans).
  eligibleAt         DateTime  @map("eligible_at") @db.Date
  /// Enregistrement actif (désactivé en cas de radiation, décès, etc.).
  active             Boolean   @default(true)
  autoRegisteredAt   DateTime? @map("auto_registered_at") @db.Timestamptz(6)
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  citizen        Citizen   @relation(fields: [citizenId], references: [id], onDelete: Restrict)
  pollingStation Location? @relation(fields: [pollingStationId], references: [id], onDelete: Restrict)

  @@index([active])
  @@index([pollingStationId])
  @@map("electoral_records")
}

// ═══════════════════════════════════════════════════
// UTILISATEURS / AUTHENTIFICATION
// ═══════════════════════════════════════════════════

/// Utilisateur du système — agents CTDEC, superviseurs, admins, citoyens connectés
/// ⚠️ Modèle PÉDAGOGIQUE simplifié (vocabulaire FR). Le `User` réellement implémenté
/// (cf. `schema.prisma`) utilise des enums anglais et `username`/`institutionId`.
model User {
  id              String   @id @default(uuid())
  /// Identifiant Keycloak (sub du JWT)
  keycloakId      String   @unique @map("keycloak_id") @db.VarChar(100)
  /// Email professionnel
  email           String   @unique @db.VarChar(200)
  /// Nom complet affiché
  displayName     String   @map("display_name") @db.VarChar(200)
  /// Rôle RBAC dans le système
  role            UserRole @default(CITOYEN)
  /// NINA associé (pour les citoyens qui ont un compte)
  nina            String?  @db.VarChar(15)
  /// Numéro de téléphone (pour SMS et USSD)
  telephone       String?  @db.VarChar(20)
  /// Commune d'affectation (pour les agents)
  communeAffectation String? @map("commune_affectation") @db.VarChar(100)
  /// Compte actif ou désactivé
  actif           Boolean  @default(true)
  /// Dernière connexion
  lastLoginAt     DateTime? @map("last_login_at")
  /// Nombre de connexions totales
  loginCount      Int      @default(0) @map("login_count")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  /// Relations
  corrections     NinaCorrection[]  @relation("SubmittedBy")
  approvals       NinaCorrection[]  @relation("ReviewedBy")
  auditLogs       AuditLog[]
  appointments    Appointment[]
  notifications   Notification[]
  integrityScores IntegrityScore[]
  alerts          Alert[]

  @@map("users")
  @@index([role])
  @@index([nina])
  @@index([communeAffectation])
}

// ═══════════════════════════════════════════════════
// CORRECTIONS NINA (HÉRITÉ) — superseded par CorrectionRequest
// ═══════════════════════════════════════════════════

/// Demande de correction d'un enregistrement NINA.
/// ⚠️ Modèle PÉDAGOGIQUE / HÉRITÉ — REMPLACÉ par `CorrectionRequest` (cf. supra).
/// Conservé pour la lecture progressive ; NON présent dans `schema.prisma`.
/// (Sa relation `ninaRecord → Citizen` n'a pas de contre-relation sur le
/// `Citizen` réel : ne pas compiler ce bloc tel quel.)
model NinaCorrection {
  id              String           @id @default(uuid())
  /// Enregistrement NINA concerné
  ninaRecordId    String           @map("nina_record_id")
  ninaRecord      Citizen       @relation(fields: [ninaRecordId], references: [id])
  /// Utilisateur qui a soumis la correction
  submittedById   String           @map("submitted_by_id")
  submittedBy     User             @relation("SubmittedBy", fields: [submittedById], references: [id])
  /// Utilisateur qui a validé/rejeté (superviseur)
  reviewedById    String?          @map("reviewed_by_id")
  reviewedBy      User?            @relation("ReviewedBy", fields: [reviewedById], references: [id])
  /// Source de la correction
  source          CorrectionSource
  /// Statut actuel dans le cycle de vie
  status          CorrectionStatus @default(SOUMISE)
  /// Champ modifié (ex: "lastName", "firstName", "birthDate")
  fieldName       String           @map("field_name") @db.VarChar(50)
  /// Valeur actuelle (avant correction)
  oldValue        String           @map("old_value") @db.Text
  /// Valeur proposée (après correction)
  newValue        String           @map("new_value") @db.Text
  /// Justification de la correction (texte libre)
  justification   String?          @db.Text
  /// Score de confiance IA (si source = IA)
  aiConfidence    Float?           @map("ai_confidence")
  /// Niveau de confiance catégorisé
  aiLevel         AiConfidenceLevel? @map("ai_level")
  /// Référence vers l'analyse IA (si applicable)
  aiAnalysisId    String?          @map("ai_analysis_id")
  aiAnalysis      AiAnalysis?      @relation(fields: [aiAnalysisId], references: [id])
  /// Commentaire du reviewer (en cas de rejet)
  reviewComment   String?          @map("review_comment") @db.Text
  /// Date de la review
  reviewedAt      DateTime?        @map("reviewed_at")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  @@map("nina_corrections")
  @@index([ninaRecordId])
  @@index([status])
  @@index([source])
  @@index([submittedById])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// SERVICE IA — Résultats d'analyse
// ═══════════════════════════════════════════════════

/// Résultat d'une analyse IA sur un batch d'enregistrements NINA
model AiAnalysis {
  id                String   @id @default(uuid())
  /// Nombre total d'enregistrements analysés dans ce batch
  totalAnalyzed     Int      @map("total_analyzed")
  /// Nombre d'erreurs détectées
  errorsDetected    Int      @map("errors_detected")
  /// Nombre de corrections automatiques (confiance >= 85%)
  autoCorrections   Int      @map("auto_corrections")
  /// Nombre de corrections en revue manuelle (confiance 60-84%)
  manualReviews     Int      @map("manual_reviews")
  /// Score moyen de confiance du batch
  avgConfidence     Float    @map("avg_confidence")
  /// Version du modèle XGBoost utilisé
  modelVersion      String   @map("model_version") @db.VarChar(50)
  /// Durée d'exécution en millisecondes
  durationMs        Int      @map("duration_ms")
  /// Métadonnées supplémentaires (JSON)
  metadata          Json?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  /// Corrections proposées par cette analyse
  corrections NinaCorrection[]

  @@map("ai_analyses")
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// JOURNAL D'AUDIT — Hash-chain SHA-256 append-only (PAS Merkle)
// ═══════════════════════════════════════════════════

/// Entrée du journal d'audit append-only (hash-chain SHA-256 linéaire).
///
/// ⚠️ HONNÊTETÉ : une hash-chain seule n'est PAS « inaltérable ». Un admin DB
/// avec accès UPDATE/DELETE pourrait recalculer toute la chaîne. L'intégrité
/// réelle repose sur (1) le trigger append-only §4ter qui REFUSE UPDATE/DELETE
/// au niveau base, et (2) le scellement Ed25519 + ancrage tiers de `AuditRoot`.
/// Le champ historique `hash`/`previousHash` est conservé ; le schéma implémenté
/// nomme ces colonnes `payload_hash` / `previous_hash` / `merkle_hash`
/// (« merkle » est un nom de variable hérité, PAS un arbre de Merkle réel).
model AuditLog {
  id            String   @id @default(uuid())
  /// Utilisateur qui a effectué l'action
  actorId       String   @map("actor_id")
  actor         User     @relation(fields: [actorId], references: [id])
  /// Rôle de l'acteur au moment de l'action
  actorRole     UserRole @map("actor_role")
  /// Type d'action (CREATE, READ, UPDATE, DELETE, LOGIN, etc.)
  action        String   @db.VarChar(20)
  /// Table/ressource concernée (ex: "citizens", "users")
  resource      String   @db.VarChar(50)
  /// Identifiant de la ressource concernée
  resourceId    String   @map("resource_id") @db.VarChar(100)
  /// Adresse IP de l'acteur
  ipAddress     String   @map("ip_address") @db.VarChar(45)
  /// User-Agent du client
  userAgent     String?  @map("user_agent") @db.VarChar(500)
  /// État avant modification (JSON sérialisé) — null pour CREATE
  before        Json?
  /// État après modification (JSON sérialisé) — null pour DELETE
  after         Json?
  /// Hash SHA-256 du payload JSON canonicalisé (JCS RFC 8785) de cette entrée.
  hash          String   @db.VarChar(64)
  /// Hash de l'entrée précédente (chaînage SHA-256 linéaire ; GENESIS = 64 zéros).
  previousHash  String   @map("previous_hash") @db.VarChar(64)
  /// Numéro séquentiel dans la chaîne (pour tri déterministe)
  sequenceNumber BigInt  @map("sequence_number")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("audit_logs")
  @@index([actorId])
  @@index([resource, resourceId])
  @@index([action])
  @@index([createdAt])
  @@index([sequenceNumber])
}

/// Racine périodique scellée de la hash-chain d'audit (cf. doc 09 §12, §4bis).
///
/// Toutes les heures, `audit-service` lit le dernier `AuditLog.hash` (la
/// « racine » courante de la chaîne) et signe `chainRootHash|signedAt` avec une
/// clé **Ed25519 IN-PROCESS** (`@noble/ed25519`) — Vault Transit ne supporte PAS
/// Ed25519 (cf. ADR-026 / ADR-034). Même si un attaquant réécrivait toute la
/// chaîne en base, il ne pourrait pas reforger une signature Ed25519 valide sans
/// la clé privée. La preuve devient forte UNIQUEMENT après ancrage de
/// `chainRootHash` chez un tiers (registre signé OCLEI / Vérificateur Général),
/// matérialisé par `publishedExternal`. Table elle-même append-only (mêmes
/// triggers que `audit_logs` — cf. §4ter).
model AuditRoot {
  /// BigInt aligné sur la volumétrie de `AuditLog`.
  id                BigInt   @id @default(autoincrement())
  /// `hash` du dernier `AuditLog` couvert par cette racine.
  chainRootHash     String   @map("chain_root_hash") @db.VarChar(64)
  /// id du dernier `AuditLog` couvert (borne haute de l'intervalle scellé).
  lastLogId         BigInt   @map("last_log_id")
  /// Nombre total de logs couverts au moment du scellement (cumulatif).
  logCountCovered   Int      @map("log_count_covered")
  /// Signature Ed25519 (hex, 128 chars) de `chainRootHash|signedAt(ISO)`.
  /// Posée in-process via @noble/ed25519 — PAS via Vault Transit.
  signature         String   @db.VarChar(160)
  /// Identifiant de la clé de signature (support rotation).
  signingKeyId      String   @map("signing_key_id") @db.VarChar(80)
  /// Vrai SI la racine a été ancrée chez un tiers (notarisation hebdo OCLEI).
  /// Tant que false, l'intégrité reste réfutable par un admin DB.
  publishedExternal Boolean  @default(false) @map("published_external")
  signedAt          DateTime @default(now()) @map("signed_at") @db.Timestamptz(6)

  @@index([signedAt])
  @@index([lastLogId])
  @@map("audit_roots")
}

// ═══════════════════════════════════════════════════
// DOCUMENTS — Fiches descriptives, récépissés, etc.
// ═══════════════════════════════════════════════════

/// Document généré par le système (PDF, récépissé, etc.)
model Document {
  id            String         @id @default(uuid())
  /// Enregistrement NINA concerné
  ninaRecordId  String         @map("nina_record_id")
  ninaRecord    Citizen     @relation(fields: [ninaRecordId], references: [id])
  /// Type de document
  type          DocumentType
  /// Statut actuel
  status        DocumentStatus @default(GENERE)
  /// Chemin dans MinIO (bucket/key)
  storagePath   String         @map("storage_path") @db.VarChar(500)
  /// Hash SHA-256 du fichier (pour vérification d'intégrité)
  fileHash      String         @map("file_hash") @db.VarChar(64)
  /// Taille du fichier en octets
  fileSize      Int            @map("file_size")
  /// Token JWT RS256 du QR code (pour FICHE_DESCRIPTIVE)
  qrToken       String?        @map("qr_token") @db.Text
  /// Date d'expiration du document (si applicable)
  expiresAt     DateTime?      @map("expires_at")
  /// Métadonnées supplémentaires (JSON)
  metadata      Json?
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  @@map("documents")
  @@index([ninaRecordId])
  @@index([type])
  @@index([status])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// RENDEZ-VOUS
// ═══════════════════════════════════════════════════

/// Rendez-vous en mairie ou au bureau CTDEC
model Appointment {
  id            String            @id @default(uuid())
  /// Citoyen / utilisateur qui prend le rendez-vous
  userId        String            @map("user_id")
  user          User              @relation(fields: [userId], references: [id])
  /// Date et heure du rendez-vous
  scheduledAt   DateTime          @map("scheduled_at")
  /// Durée prévue en minutes
  durationMin   Int               @default(30) @map("duration_min")
  /// Lieu (nom du bureau CTDEC ou de la mairie)
  location      String            @db.VarChar(200)
  /// Motif du rendez-vous
  reason        String            @db.VarChar(500)
  /// Statut actuel
  status        AppointmentStatus @default(PLANIFIE)
  /// Notes de l'agent
  agentNotes    String?           @map("agent_notes") @db.Text
  /// Source de la prise de RDV (portail, USSD, agent)
  source        String            @default("portail") @db.VarChar(20)
  createdAt     DateTime          @default(now()) @map("created_at")
  updatedAt     DateTime          @updatedAt @map("updated_at")

  @@map("appointments")
  @@index([userId])
  @@index([scheduledAt])
  @@index([status])
  @@index([location])
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════

/// Notification envoyée à un utilisateur
model Notification {
  id            String              @id @default(uuid())
  /// Destinataire
  userId        String              @map("user_id")
  user          User                @relation(fields: [userId], references: [id])
  /// Canal d'envoi
  channel       NotificationChannel
  /// Sujet (pour email)
  subject       String?             @db.VarChar(200)
  /// Contenu du message
  body          String              @db.Text
  /// Statut d'envoi
  status        NotificationStatus  @default(EN_ATTENTE)
  /// Nombre de tentatives d'envoi
  retryCount    Int                 @default(0) @map("retry_count")
  /// Dernière erreur d'envoi
  lastError     String?             @map("last_error") @db.Text
  /// Date d'envoi effectif
  sentAt        DateTime?           @map("sent_at")
  createdAt     DateTime            @default(now()) @map("created_at")

  @@map("notifications")
  @@index([userId])
  @@index([channel])
  @@index([status])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// INTEROPÉRABILITÉ AES — Vérifications inter-pays
// ═══════════════════════════════════════════════════

/// Vérification d'un enregistrement NINA auprès d'un pays AES
model AesVerification {
  id              String                @id @default(uuid())
  /// Enregistrement NINA vérifié
  ninaRecordId    String                @map("nina_record_id")
  ninaRecord      Citizen            @relation(fields: [ninaRecordId], references: [id])
  /// Pays interrogé
  targetCountry   AesCountry            @map("target_country")
  /// Statut de la vérification
  status          AesVerificationStatus @default(EN_ATTENTE)
  /// ID de corrélation de la requête (pour le suivi)
  requestId       String                @unique @map("request_id") @db.VarChar(100)
  /// Réponse brute du pays cible (JSON)
  responsePayload Json?                 @map("response_payload")
  /// Temps de réponse en ms
  responseTimeMs  Int?                  @map("response_time_ms")
  /// Message d'erreur (si status = ERREUR)
  errorMessage    String?               @map("error_message") @db.Text
  /// Date de la réponse
  respondedAt     DateTime?             @map("responded_at")
  createdAt       DateTime              @default(now()) @map("created_at")

  @@map("aes_verifications")
  @@index([ninaRecordId])
  @@index([targetCountry])
  @@index([status])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// PERSONNES VULNÉRABLES
// ═══════════════════════════════════════════════════

/// Enregistrement de vulnérabilité d'un citoyen
model VulnerabilityRecord {
  id            String                @id @default(uuid())
  /// Enregistrement NINA du citoyen
  ninaRecordId  String                @unique @map("nina_record_id")
  ninaRecord    Citizen            @relation(fields: [ninaRecordId], references: [id])
  /// Catégorie de vulnérabilité
  category      VulnerabilityCategory
  /// Priorité de traitement
  priority      VulnerabilityPriority @default(STANDARD)
  /// Description de la situation
  description   String?               @db.Text
  /// Agent qui a enregistré la vulnérabilité
  registeredBy  String                @map("registered_by") @db.VarChar(100)
  /// Date de vérification (réévaluation périodique)
  verifiedAt    DateTime?             @map("verified_at")
  /// Actif ou résolu
  actif         Boolean               @default(true)
  createdAt     DateTime              @default(now()) @map("created_at")
  updatedAt     DateTime              @updatedAt @map("updated_at")

  @@map("vulnerability_records")
  @@index([category])
  @@index([priority])
  @@index([actif])
}

// ═══════════════════════════════════════════════════
// ANTI-CORRUPTION — SIGAC
// ═══════════════════════════════════════════════════

/// Score d'intégrité SIGAC pour un agent ou superviseur
model IntegrityScore {
  id                  String   @id @default(uuid())
  /// Agent évalué
  userId              String   @map("user_id")
  user                User     @relation(fields: [userId], references: [id])
  /// Score global d'intégrité (0-100)
  score               Float
  /// Score : régularité des horaires
  horaireScore        Float    @map("horaire_score")
  /// Score : volume de traitement (anomalies statistiques)
  volumeScore         Float    @map("volume_score")
  /// Score : taux de rejet des corrections
  rejetScore          Float    @map("rejet_score")
  /// Score : accès aux données sensibles
  accesScore          Float    @map("acces_score")
  /// Score : signalements reçus
  signalementScore    Float    @map("signalement_score")
  /// Période évaluée (ex: "2026-04")
  period              String   @db.VarChar(20)
  /// Métadonnées du calcul (JSON)
  metadata            Json?
  createdAt           DateTime @default(now()) @map("created_at")

  @@map("integrity_scores")
  @@unique([userId, period])
  @@index([userId])
  @@index([score])
  @@index([period])
}

/// Signalement anti-corruption (lanceur d'alerte).
///
/// 🔐 PROTECTION DES LANCEURS D'ALERTE (RGPD-like + canon sécurité) — ⏳ CIBLE PHASE 2,
///    PAS L'ÉTAT ACTUEL (cf. bannière d'honnêteté juste avant `model Alert`) :
///   - OBJECTIF : `description` et `investigationNotes` DEVRAIENT être des CHIFFRÉS RÉELS
///     (Bytea), PAS du texte en clair. ⚠️ AUJOURD'HUI le modèle réel `CorruptionAlert`
///     stocke la description EN CLAIR (`description String @map("body")`). Schéma de
///     chiffrement cible : libsodium **sealed box** (X25519 + XSalsa20-Poly1305) —
///     chiffrement asymétrique authentique : seul le service anti-corruption détenant la
///     clé privée (Vault) pourrait déchiffrer ; un admin DB ne verrait que des octets
///     opaques (ce n'est PAS le cas tant que le câblage Phase 2 n'est pas fait).
///     ⚠️ Ed25519 NE CHIFFRE PAS (signature seule) — on utilise X25519, PAS Ed25519.
///   - ANONYMAT : pour un canal ANONYME, `reporterId` DOIT rester null (aucune FK
///     vers `User`). Le suivi se fait via `anonymousReporterToken` (nom réel du champ ;
///     jeton aléatoire haute entropie, rotation Vault) remis au lanceur d'alerte, JAMAIS
///     son identité.
///   - Le couplage IP/User-Agent N'EST PAS journalisé pour les alertes anonymes
///     (cf. trigger / politique applicative doc 23) afin d'éviter la dé-anonymisation.
//
// ⚠️ BANNIÈRE D'HONNÊTETÉ — MODÈLE CIBLE, PAS LE SCHÉMA IMPLÉMENTÉ.
//   Ce `model Alert` est une CIBLE de conception (chiffrement asymétrique du
//   signalement). Il NE correspond PAS au schéma réel `schema.prisma`. Le modèle
//   RÉELLEMENT implémenté est `CorruptionAlert` (table `corruption_alerts`,
//   schema.prisma:527), dont la description du lanceur d'alerte est aujourd'hui
//   stockée EN CLAIR :
//       description String @map("body") @db.Text   // ← PLAINTEXT, colonne `body`
//   La seule colonne binaire réelle est `encryptedPayload Bytes? @map("encrypted_payload")`
//   (NULLABLE, générique, NON câblée — reste nulle), avec `encryptionKeyId String?`.
//   Le jeton de suivi anonyme s'appelle `anonymousReporterToken` (PAS `anonymousToken`),
//   et il N'EXISTE AUCUNE colonne `description_enc` ni `investigation_notes_enc`.
//   Correspondance doc↔schéma : `Alert` (doc) == `CorruptionAlert` (schema.prisma) ;
//   `alerts` (doc) == `corruption_alerts` (table réelle). Cf. §4ter.3 « Honnêteté ».
//   Les champs `descriptionEnc`/`investigationNotesEnc` ci-dessous sont donc
//   ⏳ À IMPLÉMENTER EN PHASE 2 (migration ajoutant des colonnes `Bytes` + câblage
//   sealed box X25519 dans anticorruption-service), pas l'état actuel du code.
model Alert {
  id            String      @id @default(uuid())
  /// Signalant — null OBLIGATOIRE si canal = ANONYME (pas de FK ré-identifiante).
  reporterId    String?     @map("reporter_id")
  reporter      User?       @relation(fields: [reporterId], references: [id])
  /// Canal du signalement
  channel       AlertChannel
  /// Statut du signalement
  status        AlertStatus @default(RECUE)
  /// ⏳ CIBLE PHASE 2 — Description qui DEVRAIT être CHIFFRÉE (sealed box X25519),
  /// octets opaques en base. Format applicatif cible : `crypto_box_seal(plaintext,
  /// anticorruptionPubKey)`. ⚠️ N'EXISTE PAS dans `schema.prisma` : le réel est
  /// `description String @map("body")` EN CLAIR + `encryptedPayload Bytes?` (nul).
  descriptionEnc      Bytes   @map("description_enc")
  /// ⏳ CIBLE PHASE 2 — Notes d'enquête qui DEVRAIENT être CHIFFRÉES (sealed box X25519),
  /// accès inspecteur. ⚠️ AUCUNE colonne `investigation_notes_enc` n'existe dans le schéma réel.
  investigationNotesEnc Bytes? @map("investigation_notes_enc")
  /// Jeton anonyme (haute entropie) remis au lanceur d'alerte pour suivre
  /// l'instruction SANS révéler son identité. Rotation Vault.
  /// ⚠️ Nom réel dans `schema.prisma` : `anonymousReporterToken` (`@map("anonymous_reporter_token")`).
  anonymousToken String?    @unique @map("anonymous_token") @db.VarChar(128)
  /// Agent ou service visé par le signalement
  targetAgent   String?     @map("target_agent") @db.VarChar(200)
  /// Lieu de l'incident
  location      String?     @db.VarChar(200)
  /// Date de l'incident signalé
  incidentDate  DateTime?   @map("incident_date")
  /// Inspecteur assigné
  assignedTo    String?     @map("assigned_to") @db.VarChar(100)
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@map("alerts")
  @@index([status])
  @@index([channel])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════
// SESSIONS USSD — Historique
// ═══════════════════════════════════════════════════

/// Historique d'une session USSD (*123*NINA#)
model UssdSession {
  id            String   @id @default(uuid())
  /// Identifiant de session Africa's Talking
  sessionId     String   @unique @map("session_id") @db.VarChar(100)
  /// Numéro de téléphone du citoyen
  phoneNumber   String   @map("phone_number") @db.VarChar(20)
  /// Langue choisie (fr, bm, sg, ff, tmh, ha, mos, dje)
  language      String   @default("fr") @db.VarChar(5)
  /// Dernière étape du menu USSD
  lastStep      String   @map("last_step") @db.VarChar(50)
  /// Données de session (JSON sérialisé)
  sessionData   Json?    @map("session_data")
  /// Durée de la session en secondes
  durationSec   Int?     @map("duration_sec")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("ussd_sessions")
  @@index([phoneNumber])
  @@index([createdAt])
}
```

---

## 4bis. Durcissement de l'audit — append-only + scellement Ed25519 + ancrage tiers

> **POURQUOI cette section ?** Le modèle `AuditLog` du §4 décrit une **hash-chain SHA-256
> linéaire**. C'est une bonne fondation, mais une hash-chain seule **n'est pas inaltérable** : un
> administrateur de base disposant de `UPDATE`/`DELETE` peut réécrire chaque ligne ET recalculer
> tous les hashs. Trois contrôles complémentaires transforment cette chaîne « réfutable » en preuve
> robuste. **Honnêteté** : tant que le contrôle (3) — ancrage tiers — n'est pas en production, on
> parle de chaîne « append-only + scellée », jamais d'« inaltérable ». Détails complets : doc 09
> (audit-service) et ADR-007.

### 4bis.1 Contrôle (1) — Trigger append-only au niveau base

Le premier rempart est **dans PostgreSQL**, pas dans l'application : on refuse `UPDATE` et `DELETE`
sur `audit_logs` et `audit_roots`, même pour le rôle applicatif. Seul `INSERT` est permis.

```sql
-- Migration manuelle (prisma migrate dev --create-only puis éditer le SQL).
-- À appliquer sur audit_logs ET audit_roots.

-- Fonction garde-fou : lève une exception sur toute mutation destructive.
CREATE OR REPLACE FUNCTION nina_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- On bloque AVANT toute modification : aucune ligne d'audit n'est
  -- modifiable ou supprimable, quel que soit le rôle applicatif.
  RAISE EXCEPTION 'audit append-only: % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Trigger sur audit_logs : intercepte UPDATE et DELETE.
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION nina_audit_append_only();

-- Idem pour les racines scellées.
CREATE TRIGGER trg_audit_roots_append_only
  BEFORE UPDATE OR DELETE ON audit_roots
  FOR EACH ROW EXECUTE FUNCTION nina_audit_append_only();
```

> ⚠️ **Limite honnête** : un trigger est contournable par le **propriétaire de la table** ou un
> superuser PostgreSQL (`ALTER TABLE … DISABLE TRIGGER`, `DROP TRIGGER`). Le rôle applicatif
> `nina_audit` (cf. §4ter) n'est PAS propriétaire et n'a pas ces privilèges — d'où l'importance du
> least-privilege. Mais un superuser DB compromis reste un angle mort : c'est exactement ce que le
> scellement (2) + l'ancrage (3) rendent **détectable**.

### 4bis.2 Contrôle (2) — Scellement Ed25519 in-process des racines

Toutes les heures, un cron de `audit-service` lit le dernier `AuditLog.hash` (la « racine » courante
de la chaîne), puis insère une ligne `AuditRoot` signée :

```typescript
// services/audit-service/src/audit-root.cron.ts (extrait commenté)

/**
 * Scelle la racine courante de la hash-chain d'audit.
 *
 * POURQUOI Ed25519 IN-PROCESS et non Vault Transit ?
 *   Vault Transit ne supporte PAS Ed25519 (cf. ADR-026 / ADR-034). La signature
 *   est donc posée en mémoire du service via @noble/ed25519. La clé privée est
 *   livrée par Vault (KV) au démarrage via AppRole, jamais écrite sur disque.
 *
 * @returns la racine scellée persistée (model AuditRoot)
 */
async function sealAuditRoot(): Promise<AuditRoot> {
  // 1. Lire la racine courante = hash du dernier log inséré.
  const last = await prisma.auditLog.findFirst({
    orderBy: { sequenceNumber: 'desc' },
  });
  if (!last) throw new Error('Aucun log à sceller');

  // 2. Construire le message signé : racine + horodatage ISO.
  const signedAt = new Date().toISOString();
  const message = new TextEncoder().encode(`${last.hash}|${signedAt}`);

  // 3. Signer EN MÉMOIRE avec la clé privée Ed25519 (32 octets, depuis Vault).
  //    ed25519.sign renvoie 64 octets → 128 hex.
  const signature = Buffer.from(await ed25519.sign(message, privateKey)).toString('hex');

  // 4. Persister la racine scellée (publishedExternal=false tant que non ancrée).
  return prisma.auditRoot.create({
    data: {
      chainRootHash: last.hash,
      lastLogId: last.sequenceNumber,
      logCountCovered: await prisma.auditLog.count(),
      signature, // 128 hex
      signingKeyId: currentKeyId, // support rotation
      publishedExternal: false,
    },
  });
}
```

Pour **vérifier** une racine, on rejoue
`verify(signature, "${chainRootHash}|${signedAt}", publicKey)` avec la clé **publique** Ed25519
(distribuable largement, y compris à l'OCLEI / Vérificateur Général). Une chaîne réécrite produit un
`chainRootHash` différent → la signature ne valide plus.

### 4bis.3 Contrôle (3) — Ancrage horodaté chez un tiers

Le scellement (2) prouve l'intégrité **uniquement** si l'attaquant n'a jamais eu accès à la clé
privée Ed25519. Pour fermer cet angle mort, on **ancre** périodiquement (hebdomadaire) le dernier
`chainRootHash` chez un tiers indépendant de l'exploitant de la base :

- dépôt du hash dans un **registre signé** tenu par l'OCLEI (Office Central de Lutte contre
  l'Enrichissement Illicite) ou le **Vérificateur Général**, horodaté et contresigné ;
- une fois confirmé, on passe `publishedExternal = true` sur la racine correspondante.

> **Statut : CONÇU, NON IMPLÉMENTÉ.** L'intégration avec un registre OCLEI/VG est une décision
> institutionnelle hors périmètre du prototype. Le champ `publishedExternal` et la colonne
> `audit_roots` sont en place pour l'accueillir. **Souveraineté** : l'ancrage doit rester sur un
> tiers national (pas d'horodatage sur une blockchain publique étrangère ni un service KMS hors-AES
> sur le chemin critique).

---

## 4ter. Sécurité des données — RLS, rôles least-privilege, chiffrement des PII

> **POURQUOI cette section ?** Le `DATABASE_URL` du §7 (`nina_admin`) est un **superuser de
> développement** : pratique localement, **inacceptable en production**. Un service compromis ne
> doit pouvoir toucher QUE ses tables, et les données personnelles (PII) ne doivent pas être
> lisibles en clair par un admin DB. Cette section décrit le modèle de production. Référence
> transverse : `docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-RUNBOOK.md`, ADR-034
> (`ADR-034-security-hardening-vault-mtls-owasp.md`).

### 4ter.1 Rôles least-privilege PAR service (au lieu d'un superuser partagé)

Au lieu d'un unique `nina_admin` partagé par les 11 services, chaque service obtient un **rôle
PostgreSQL dédié** aux privilèges minimaux. Les identifiants de connexion sont distribués par
**Vault database secrets engine** (rotation automatique, leases courts — AppRole / K8s
ServiceAccount, **jamais** de mot de passe long-lived en clair).

```sql
-- Migration manuelle — rôles de production (NON utilisés en dev local).
-- POURQUOI : limiter le rayon de souffle d'un service compromis (OWASP A01).

-- Rôle propriétaire du schéma (migrations Prisma uniquement, hors runtime).
CREATE ROLE nina_owner NOLOGIN;

-- ── identity-service : R/W sur citizens, parents, locations, correction_requests
CREATE ROLE nina_identity LOGIN PASSWORD NULL; -- mot de passe injecté par Vault
GRANT SELECT, INSERT, UPDATE ON citizens, parents, locations, correction_requests TO nina_identity;
-- PAS de DELETE (soft-delete via deletedAt) ; PAS d'accès aux tables d'audit/alertes.

-- ── audit-service : INSERT seul sur audit_logs/audit_roots, SELECT pour vérif.
CREATE ROLE nina_audit LOGIN PASSWORD NULL;
GRANT INSERT, SELECT ON audit_logs, audit_roots TO nina_audit;
-- Le trigger append-only (§4bis) + l'absence de UPDATE/DELETE rendent la chaîne
-- non ré-écrivable par ce rôle. nina_audit n'est PAS propriétaire des tables.

-- ── anticorruption-service : accès EXCLUSIF aux alertes (lanceurs d'alerte).
CREATE ROLE nina_anticorruption LOGIN PASSWORD NULL;
GRANT SELECT, INSERT, UPDATE ON corruption_alerts, integrity_scores TO nina_anticorruption;
-- AUCUN autre rôle n'a accès à `corruption_alerts` → cloisonnement des signalements.
-- (Table réelle = `corruption_alerts`, modèle `CorruptionAlert` ; `alerts` est un nom cible du doc.)

-- ── autres services : un rôle par service, sur ses tables uniquement
--    (document-service → documents ; appointment-service → appointments ; …).
```

| Service                | Rôle PG               | Tables accessibles                                | Privilèges              |
| ---------------------- | --------------------- | ------------------------------------------------- | ----------------------- |
| identity-service       | `nina_identity`       | citizens, parents, locations, correction_requests | SELECT/INSERT/UPDATE    |
| audit-service          | `nina_audit`          | audit_logs, audit_roots                           | INSERT, SELECT (append) |
| anticorruption-service | `nina_anticorruption` | corruption_alerts, integrity_scores               | SELECT/INSERT/UPDATE    |
| document-service       | `nina_document`       | documents                                         | SELECT/INSERT/UPDATE    |
| appointment-service    | `nina_appointment`    | appointments, electoral_records                   | SELECT/INSERT/UPDATE    |
| notification-service   | `nina_notification`   | notifications, ussd_sessions                      | SELECT/INSERT/UPDATE    |
| (migrations Prisma)    | `nina_owner`          | toutes (DDL)                                      | OWNER (hors runtime)    |

> **Honnêteté** : le schéma `schema.prisma` ne porte qu'UN `DATABASE_URL`. La séparation par rôle
> est **conçue** au niveau infra (Vault DB engine + GRANTs ci-dessus), appliquée par migration SQL
> manuelle ; elle n'apparaît pas dans le `.prisma`. En dev local, on reste sur `nina_admin`.
>
> ⚠️ **État réel des rôles (vérifié)** : les rôles par service `nina_identity` / `nina_audit` /
> `nina_anticorruption` du tableau ci-dessus sont un **design de production (SQL manuel), NON
> IMPLÉMENTÉ** — aucune migration ne contient `CREATE ROLE`, `CREATE POLICY` ni
> `ENABLE ROW LEVEL SECURITY` (grep vérifiable sur `prisma/migrations/`). La SEULE migration
> append-only réellement appliquée (`20260530120000_audit_chain_immutability`) suppose un **rôle
> applicatif UNIQUE `nina_app`** et se contente d'un `REVOKE UPDATE, DELETE` _best-effort_
> (conditionné à `IF EXISTS (... rolname = 'nina_app')`), pas d'une séparation par service. Les
> rôles per-service sont donc ⏳ à provisionner en Phase 2.

### 4ter.2 Row-Level Security (RLS) PostgreSQL

Au-delà des privilèges de table, **RLS** filtre les LIGNES visibles selon un contexte applicatif
(rôle métier, commune d'affectation). Exemple : un agent ne voit que les citoyens de sa commune.

```sql
-- POURQUOI RLS : défense en profondeur. Même si un service est détourné, la
-- politique RLS limite les lignes lisibles au contexte transmis par l'app.

-- 1. Activer RLS sur la table sensible.
ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE citizens FORCE ROW LEVEL SECURITY; -- s'applique même au propriétaire

-- 2. L'application pose le contexte par transaction (variable de session GUC) :
--    SET LOCAL app.current_role = 'AGENT';
--    SET LOCAL app.current_commune = 'ML-09-01-001';

-- 3. Politique : un agent ne lit que sa commune ; un admin/auditeur voit tout.
CREATE POLICY citizens_commune_isolation ON citizens
  FOR SELECT
  USING (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUDITOR', 'SUPERVISOR')
    OR residence_id IN (
      SELECT id FROM locations
      WHERE code = current_setting('app.current_commune', true)
    )
  );

-- 4. corruption_alerts : RLS pour cloisonner les signalements aux inspecteurs assignés.
--    ⚠️ La table réelle s'appelle `corruption_alerts` (modèle `CorruptionAlert`),
--       PAS `alerts` : un `ALTER TABLE alerts ...` ÉCHOUERAIT (relation inexistante).
ALTER TABLE corruption_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY corruption_alerts_inspector_only ON corruption_alerts
  FOR ALL
  USING (current_setting('app.current_role', true) = 'ANTICORRUPTION_INSPECTOR');
```

> **Honnêteté** : RLS est **conçu** ici ; il exige que CHAQUE requête applicative pose le
> `SET LOCAL app.*` au début de la transaction (via un middleware Prisma `$executeRaw`). C'est une
> tâche d'implémentation des services (docs 07+), pas encore câblée dans `packages/database`.

### 4ter.3 Chiffrement des PII — deux options

Les données personnelles sensibles (photo, hash biométrique, e-mail, téléphone, et surtout les
signalements de lanceurs d'alerte) ne doivent pas être lisibles en clair par un admin DB ni dans une
sauvegarde volée. Deux stratégies, **non exclusives** :

**Option A — Chiffrement applicatif via Vault Transit (recommandé pour le cœur).** Le service
chiffre/déchiffre via l'API Vault Transit avant écriture ; la base ne voit que
`vault:v1:<ciphertext>`. La clé ne quitte jamais Vault. C'est déjà le cas pour `User.mfaSecret` (cf.
`schema.prisma` réel). Convient aux champs symétriques (TOTP, e-mail). **Souveraineté** : Vault
auto-hébergé, pas d'AWS KMS.

```typescript
// Extrait conceptuel — chiffrement d'un e-mail avant persistance.
// La base ne stocke jamais l'e-mail en clair, seulement le ciphertext Vault.
const emailEnc = await vault.transit.encrypt('nina-pii', { plaintext: base64(email) });
await prisma.citizen.update({ where: { id }, data: { email: emailEnc } }); // "vault:v1:..."
```

**Option B — Chiffrement de colonne `pgcrypto` / `pgsodium` (au repos en base).** Pour les champs
gérés majoritairement en SQL, `pgcrypto` (`pgp_sym_encrypt`) ou `pgsodium` (chiffrement transparent
par colonne) chiffrent côté base. La clé reste hors de la base (transmise par session, jamais
stockée à côté du ciphertext).

```sql
-- pgcrypto activé via postgresqlExtensions (cf. generator). Clé fournie par
-- l'application (Vault), JAMAIS codée en dur ni stockée dans la table.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Écriture chiffrée :  pgp_sym_encrypt(plaintext, current_setting('app.pii_key'))
-- Lecture déchiffrée : pgp_sym_decrypt(col,      current_setting('app.pii_key'))
```

**Cas spécial — lanceurs d'alerte (CIBLE : `corruption_alerts.encrypted_payload`).** Ici on
**exige** (objectif) un chiffrement **asymétrique réel** : libsodium **sealed box** (X25519 +
XSalsa20-Poly1305) ou RSA-OAEP (Transit `rsa-4096`). Le portail de dépôt ne détiendrait que la **clé
publique** (il peut chiffrer mais PAS déchiffrer) ; seul `anticorruption-service`, avec la clé
privée Vault, déchiffrerait. ⚠️ Rappel canon : **Ed25519 ne chiffre pas** (signature uniquement) —
on utilise **X25519**.

> ⚠️ **NON IMPLÉMENTÉ AUJOURD'HUI (vérifié).** Le modèle réel est `CorruptionAlert` (table
> `corruption_alerts`) : la description du signalement y est stockée **EN CLAIR** via
> `description String @map("body") @db.Text` (colonne `body`). La colonne binaire
> `encryptedPayload Bytes? @map("encrypted_payload")` existe mais est **NULLABLE et reste nulle**
> (non câblée), et le DTO de création (`packages/shared-types/src/dtos.ts`) accepte `description` en
> clair (`z.string().min(10).max(8000)`). Le chiffrement sealed box X25519 ci-dessus est donc ⏳ **à
> implémenter en Phase 2** (migration + service), pas l'état du code.

| Champ                                         | Sensibilité            | Mécanisme retenu                                                                                            |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `corruption_alerts.body` (réel)               | Lanceur d'alerte (max) | ⚠️ **EN CLAIR aujourd'hui** (`description String @map("body")`). CIBLE = chiffrer vers `encrypted_payload`  |
| `corruption_alerts.encrypted_payload` (cible) | Lanceur d'alerte (max) | **CIBLE / NON IMPLÉMENTÉ** — Sealed box X25519 (asymétrique) prévu ; colonne `Bytes?` nullable, reste nulle |
| `corruption_alerts` — notes d'enquête         | Enquête                | **CIBLE / NON IMPLÉMENTÉ** — aucune colonne `investigation_notes_enc` n'existe dans `schema.prisma`         |
| `users.mfa_secret`                            | Secret TOTP            | Vault Transit (déjà implémenté)                                                                             |
| `citizens.email` / `phone`                    | Contact PII            | Option A (Transit) ou B (pgcrypto) au choix                                                                 |
| `citizens.fingerprint_hash`                   | Biométrie              | Hash dérivé (fuzzy extractor ISO/IEC 24745) — jamais le template brut                                       |

> **Honnêteté (corrigée — état réel vérifié)** : à ce jour, la description des signalements est
> stockée **EN CLAIR** dans la colonne `corruption_alerts.body` (modèle `CorruptionAlert`,
> `schema.prisma:527`). Le chiffrement asymétrique (sealed box X25519 vers `encrypted_payload`, ou
> Transit `rsa-4096`) est **CONÇU mais NON CÂBLÉ** : la colonne `encrypted_payload Bytes?` existe
> mais reste **nulle**, aucune colonne `description_enc` ni `investigation_notes_enc` n'existe dans
> le schéma, et le DTO de création accepte `description` en clair (`dtos.ts`). **Seul
> `users.mfa_secret` est réellement chiffré** (Vault Transit, auth-service). Le chiffrement du
> signalement et des PII citoyen relève d'une Phase 2 (migration ajoutant les colonnes + câblage
> dans doc 23 anticorruption-service, doc 07 identity-service). Un admin DB lisant
> `corruption_alerts.body` voit le texte du lanceur d'alerte **en clair**, pas des octets opaques.

---

## 5. Index et performance — Stratégie d'indexation

### 5.1 Index déjà définis dans le schéma

| Table              | Index                    | Type             | Justification                         |
| ------------------ | ------------------------ | ---------------- | ------------------------------------- |
| `citizens`         | `nina` (UNIQUE)          | B-tree unique    | Recherche directe par NINA — O(log n) |
| `citizens`         | `(lastName)`             | B-tree           | Recherche par nom de famille          |
| `citizens`         | `residenceId`            | B-tree           | Filtrage par lieu de résidence        |
| `citizens`         | `birthDate`              | B-tree           | Filtrage par date de naissance        |
| `audit_logs`       | `sequenceNumber`         | B-tree           | Tri de la hash-chain (PAS Merkle)     |
| `audit_logs`       | `(resource, resourceId)` | B-tree composite | Audit trail d'une ressource           |
| `nina_corrections` | `status`                 | B-tree           | Filtrage par statut (dashboard admin) |
| `nina_corrections` | `createdAt`              | B-tree           | Tri chronologique                     |
| `users`            | `keycloakId` (UNIQUE)    | B-tree unique    | Lookup après authentification JWT     |
| `users`            | `role`                   | B-tree           | Filtrage par rôle                     |

### 5.2 Index trigram à ajouter après migration (SQL brut)

Les index trigram (`pg_trgm`) ne sont pas supportés nativement par Prisma. Ils seront ajoutés via
une migration SQL manuelle après la migration initiale.

```sql
-- Migration manuelle : index trigram pour la recherche floue
-- À exécuter après prisma migrate dev

-- Index GIN trigram sur last_name_ascii — permet SELECT * FROM citizens WHERE last_name_ascii % 'Mamadu'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_citizens_lastname_trgm
ON citizens USING gin (last_name_ascii gin_trgm_ops);

-- Index GIN trigram sur first_name_ascii — déjà déclaré via @@index Prisma
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_citizens_firstname_trgm
ON citizens USING gin (first_name_ascii gin_trgm_ops);

-- Note : le lieu de naissance n'est pas indexé trigram — birth_place_id
-- est une FK UUID vers Location ; la recherche floue sur le nom de la
-- localité se fait sur Location.name côté ES (nina_locations).

-- Configurer le seuil de similarité pour la recherche floue
-- 0.3 = 30% de similarité minimum (ajustable selon les besoins)
SET pg_trgm.similarity_threshold = 0.3;
```

> Ces index sont désormais déclarés directement dans `schema.prisma` via
> `@@index([... ops: gin_trgm_ops], type: Gin, map: "idx_citizens_*")`, donc `prisma migrate dev`
> les génère automatiquement. Le SQL ci-dessus documente ce que Prisma émet.

### 5.3 Impact des index sur les performances

| Opération                                 | Sans index    | Avec index B-tree   | Avec index GIN trigram  |
| ----------------------------------------- | ------------- | ------------------- | ----------------------- |
| `WHERE nina = '...'`                      | Seq scan O(n) | Index scan O(log n) | —                       |
| `WHERE last_name = 'KEITA'`               | Seq scan O(n) | Index scan O(log n) | —                       |
| `WHERE last_name_ascii % 'Keita'` (fuzzy) | Seq scan O(n) | —                   | Index scan O(k × log n) |
| `WHERE last_name ILIKE '%eita%'`          | Seq scan O(n) | —                   | Index scan O(k × log n) |

Sur une base de **20 millions d'enregistrements** (taille estimée du fichier NINA national) :

- Sans index : recherche floue ~5-10 secondes
- Avec index GIN trigram : recherche floue ~50-200 millisecondes

---

## 6. Seeds — Données initiales géographiques du Mali

### 6.1 Script de seed (`prisma/seed.ts`)

Le script de seed peuple les tables `regions`, `cercles` et `communes` avec la géographie
administrative réelle du Mali. Ces données sont essentielles car le numéro NINA encode les codes
géographiques.

```typescript
// packages/database/prisma/seed.ts

/**
 * @file        seed.ts
 * @description Peuple la base de données avec les données de référence :
 *              - 10 régions + 1 district (Bamako)
 *              - 49 cercles
 *              - Communes représentatives (échantillon pour le développement)
 *
 *              En production, les données complètes (703 communes) seraient
 *              importées depuis le fichier officiel RAVEC.
 *
 * @usage       pnpm run db:seed  (ou make db-seed)
 * @author      Étudiant UQAR
 * @date        2026
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════
// Données géographiques — Régions du Mali
// ═══════════════════════════════════════════════════

const regions = [
  { code: '1', nom: 'Kayes' },
  { code: '2', nom: 'Koulikoro' },
  { code: '3', nom: 'Sikasso' },
  { code: '4', nom: 'Ségou' },
  { code: '5', nom: 'Mopti' },
  { code: '6', nom: 'Tombouctou' },
  { code: '7', nom: 'Gao' },
  { code: '8', nom: 'Kidal' },
  { code: '9', nom: 'Bamako (District)' },
  { code: '10', nom: 'Taoudénit' },
  { code: '11', nom: 'Ménaka' },
];

// ═══════════════════════════════════════════════════
// Données géographiques — Cercles (échantillon)
// codeRegion → liste de cercles
// ═══════════════════════════════════════════════════

const cercles: Record<string, Array<{ code: string; nom: string }>> = {
  '1': [
    // Région de Kayes
    { code: '01', nom: 'Kayes' },
    { code: '02', nom: 'Bafoulabé' },
    { code: '03', nom: 'Diéma' },
    { code: '04', nom: 'Kéniéba' },
    { code: '05', nom: 'Kita' },
    { code: '06', nom: 'Nioro du Sahel' },
    { code: '07', nom: 'Yélimané' },
  ],
  '2': [
    // Région de Koulikoro
    { code: '01', nom: 'Koulikoro' },
    { code: '02', nom: 'Banamba' },
    { code: '03', nom: 'Dioïla' },
    { code: '04', nom: 'Kangaba' },
    { code: '05', nom: 'Kati' },
    { code: '06', nom: 'Kolokani' },
    { code: '07', nom: 'Nara' },
  ],
  '3': [
    // Région de Sikasso
    { code: '01', nom: 'Sikasso' },
    { code: '02', nom: 'Bougouni' },
    { code: '03', nom: 'Kadiolo' },
    { code: '04', nom: 'Kolondiéba' },
    { code: '05', nom: 'Koutiala' },
    { code: '06', nom: 'Yanfolila' },
    { code: '07', nom: 'Yorosso' },
  ],
  '4': [
    // Région de Ségou
    { code: '01', nom: 'Ségou' },
    { code: '02', nom: 'Barouéli' },
    { code: '03', nom: 'Bla' },
    { code: '04', nom: 'Macina' },
    { code: '05', nom: 'Niono' },
    { code: '06', nom: 'San' },
    { code: '07', nom: 'Tominian' },
  ],
  '5': [
    // Région de Mopti
    { code: '01', nom: 'Mopti' },
    { code: '02', nom: 'Bandiagara' },
    { code: '03', nom: 'Bankass' },
    { code: '04', nom: 'Djenné' },
    { code: '05', nom: 'Douentza' },
    { code: '06', nom: 'Koro' },
    { code: '07', nom: 'Ténenkou' },
    { code: '08', nom: 'Youwarou' },
  ],
  '6': [
    // Région de Tombouctou
    { code: '01', nom: 'Tombouctou' },
    { code: '02', nom: 'Diré' },
    { code: '03', nom: 'Goundam' },
    { code: '04', nom: 'Gourma-Rharous' },
    { code: '05', nom: 'Niafunké' },
  ],
  '7': [
    // Région de Gao
    { code: '01', nom: 'Gao' },
    { code: '02', nom: 'Ansongo' },
    { code: '03', nom: 'Bourem' },
  ],
  '8': [
    // Région de Kidal
    { code: '01', nom: 'Kidal' },
    { code: '02', nom: 'Abeïbara' },
    { code: '03', nom: 'Tessalit' },
    { code: '04', nom: 'Tin-Essako' },
  ],
  '9': [
    // District de Bamako
    { code: '01', nom: 'Commune I' },
    { code: '02', nom: 'Commune II' },
    { code: '03', nom: 'Commune III' },
    { code: '04', nom: 'Commune IV' },
    { code: '05', nom: 'Commune V' },
    { code: '06', nom: 'Commune VI' },
  ],
};

// ═══════════════════════════════════════════════════
// Données géographiques — Communes (échantillon)
// codeCercle (regionCode-cercleCode) → liste de communes
// ═══════════════════════════════════════════════════

const communes: Record<string, Array<{ code: string; nom: string }>> = {
  // Kayes → cercle de Kayes
  '1-01': [
    { code: '001', nom: 'Kayes (commune urbaine)' },
    { code: '002', nom: 'Diamou' },
    { code: '003', nom: 'Hawa Dembaya' },
  ],
  // Koulikoro → cercle de Kati
  '2-05': [
    { code: '001', nom: 'Kati (commune urbaine)' },
    { code: '002', nom: 'Kalabancoro' },
    { code: '003', nom: 'Moribabougou' },
  ],
  // Sikasso → cercle de Sikasso
  '3-01': [
    { code: '001', nom: 'Sikasso (commune urbaine)' },
    { code: '002', nom: 'Kapélékourou' },
  ],
  // Ségou → cercle de Ségou
  '4-01': [
    { code: '001', nom: 'Ségou (commune urbaine)' },
    { code: '002', nom: 'Pelengana' },
    { code: '003', nom: 'Sébougou' },
  ],
  // Mopti → cercle de Mopti
  '5-01': [
    { code: '001', nom: 'Mopti (commune urbaine)' },
    { code: '002', nom: 'Sévaré' },
  ],
  // Bamako → les 6 communes
  '9-01': [{ code: '001', nom: 'Bamako Commune I' }],
  '9-02': [{ code: '001', nom: 'Bamako Commune II' }],
  '9-03': [{ code: '001', nom: 'Bamako Commune III' }],
  '9-04': [{ code: '001', nom: 'Bamako Commune IV' }],
  '9-05': [{ code: '001', nom: 'Bamako Commune V' }],
  '9-06': [{ code: '001', nom: 'Bamako Commune VI' }],
};

// ═══════════════════════════════════════════════════
// Fonction de seed principale
// ═══════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('🌍 Seed — Insertion des données géographiques du Mali...');

  // ── Étape 1 : Créer les régions ──
  console.log('  📍 Régions...');
  const regionMap = new Map<string, string>(); // code → id

  for (const r of regions) {
    const region = await prisma.region.upsert({
      where: { code: r.code },
      update: { nom: r.nom },
      create: { code: r.code, nom: r.nom },
    });
    regionMap.set(r.code, region.id);
  }
  console.log(`  ✅ ${regions.length} régions insérées`);

  // ── Étape 2 : Créer les cercles ──
  console.log('  📍 Cercles...');
  const cercleMap = new Map<string, string>(); // "regionCode-cercleCode" → id
  let cercleCount = 0;

  for (const [regionCode, cercleList] of Object.entries(cercles)) {
    const regionId = regionMap.get(regionCode);
    if (!regionId) continue;

    for (const c of cercleList) {
      const cercle = await prisma.cercle.upsert({
        where: {
          regionId_code: { regionId, code: c.code },
        },
        update: { nom: c.nom },
        create: {
          code: c.code,
          nom: c.nom,
          regionId,
        },
      });
      cercleMap.set(`${regionCode}-${c.code}`, cercle.id);
      cercleCount++;
    }
  }
  console.log(`  ✅ ${cercleCount} cercles insérés`);

  // ── Étape 3 : Créer les communes ──
  console.log('  📍 Communes...');
  let communeCount = 0;

  for (const [key, communeList] of Object.entries(communes)) {
    const cercleId = cercleMap.get(key);
    if (!cercleId) continue;

    for (const c of communeList) {
      await prisma.commune.upsert({
        where: {
          cercleId_code: { cercleId, code: c.code },
        },
        update: { nom: c.nom },
        create: {
          code: c.code,
          nom: c.nom,
          cercleId,
        },
      });
      communeCount++;
    }
  }
  console.log(`  ✅ ${communeCount} communes insérées`);

  // ── Résumé ──
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  🇲🇱 Géographie du Mali — Seed terminé');
  console.log(`  Régions  : ${regions.length}`);
  console.log(`  Cercles  : ${cercleCount}`);
  console.log(`  Communes : ${communeCount}`);
  console.log('═══════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════
// Exécution et gestion des erreurs
// ═══════════════════════════════════════════════════

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Erreur lors du seed :', e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

### 6.2 Géographie administrative du Mali — Référence

| Code | Région            | Nombre de cercles | Chef-lieu      |
| ---- | ----------------- | ----------------- | -------------- |
| 1    | Kayes             | 7                 | Kayes          |
| 2    | Koulikoro         | 7                 | Koulikoro      |
| 3    | Sikasso           | 7                 | Sikasso        |
| 4    | Ségou             | 7                 | Ségou          |
| 5    | Mopti             | 8                 | Mopti (Sévaré) |
| 6    | Tombouctou        | 5                 | Tombouctou     |
| 7    | Gao               | 3                 | Gao            |
| 8    | Kidal             | 4                 | Kidal          |
| 9    | Bamako (District) | 6                 | Bamako         |
| 10   | Taoudénit         | —                 | Taoudénit      |
| 11   | Ménaka            | —                 | Ménaka         |

> **Note** : Le script de seed inclut un échantillon représentatif de communes pour le
> développement. En production, les 703 communes officielles seraient importées depuis les données
> RAVEC.

---

## 7. Migrations — Exécution pas à pas

### 7.1 Prérequis

```powershell
# S'assurer que PostgreSQL Docker est running et healthy
pnpm run docker:ps | Select-String postgres
# nina-postgres  postgis/postgis:18-3.6  ...  Up X hours (healthy)

# S'assurer que le fichier .env contient DATABASE_URL
Get-Content .env | Select-String "DATABASE_URL"
# DATABASE_URL=postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db
#
# ⚠️ `nina_admin` est un compte SUPERUSER de DÉVELOPPEMENT uniquement. En
# production, chaque service reçoit un rôle least-privilege distinct (cf. §4ter)
# dont les identifiants sont fournis par le Vault database secrets engine
# (leases courts, rotation) — JAMAIS de mot de passe long-lived en clair.
```

### 7.2 Générer le client Prisma

```powershell
# Depuis la racine du monorepo
pnpm run db:generate

# Cette commande :
# 1. Lit prisma/schema.prisma
# 2. Génère le client TypeScript dans node_modules/@prisma/client
# 3. Le client est maintenant importable : import { PrismaClient } from '@prisma/client'
```

### 7.3 Créer et exécuter la migration initiale

```powershell
# Créer la migration SQL à partir du schéma Prisma
cd packages/database
pnpm exec prisma migrate dev --name init_full_schema

# Cette commande :
# 1. Compare le schéma Prisma avec l'état actuel de la base
# 2. Génère un fichier SQL dans prisma/migrations/TIMESTAMP_init_full_schema/migration.sql
# 3. Exécute le SQL contre PostgreSQL
# 4. Met à jour la table _prisma_migrations (suivi des migrations)
# 5. Régénère le client Prisma
```

**Sortie attendue** :

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "nina_aes_db" at "localhost:5432"

Applying migration `20260409120000_init_full_schema`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20260409120000_init_full_schema/
    └─ migration.sql

Your database is now in sync with your schema.
✔ Generated Prisma Client
```

### 7.4 Index trigram (générés automatiquement par Prisma)

> **Évolution** : depuis Prisma 7, GIN + opérateurs `gin_trgm_ops` sont supportés nativement via
> `@@index([… ops: raw("gin_trgm_ops")], type: Gin, map: "…")`. Plus besoin de migration SQL
> manuelle.

Les index trigram sont déclarés directement dans `schema.prisma` sur les colonnes ASCII normalisées
(`last_name_ascii`, `first_name_ascii`) et émis par `prisma migrate dev` lors de la migration
initiale :

```prisma
// Extrait de packages/database/prisma/schema.prisma — model Citizen
@@index([lastNameAscii(ops: raw("gin_trgm_ops"))], type: Gin, map: "idx_citizens_lastname_trgm")
@@index([firstNameAscii(ops: raw("gin_trgm_ops"))], type: Gin, map: "idx_citizens_firstname_trgm")
```

Le SQL émis dans la migration (pour référence — ne pas écrire à la main) :

```sql
-- Auto-généré par 'prisma migrate dev' (extrait de prisma/migrations/.../migration.sql)
CREATE INDEX "idx_citizens_lastname_trgm"  ON "citizens" USING GIN ("last_name_ascii"  gin_trgm_ops);
CREATE INDEX "idx_citizens_firstname_trgm" ON "citizens" USING GIN ("first_name_ascii" gin_trgm_ops);
```

Note : pas d'index trigram sur `birth_place_id` — c'est une FK UUID vers `Location`. La recherche
floue sur le nom de localité se fait via l'index ES `nina_locations` (cf.
`scripts/init-elasticsearch.sh`).

### 7.5 Exécuter le seed

```powershell
# Peupler la base avec les données géographiques du Mali
pnpm run db:seed

# Sortie attendue (compte derivé de data/mali/ + COMMUNES_PEDAGOGIQUES) :
# 🌱 [seed] démarrage du seed NINA-AES…
# ✅ [seed] 20 régions (loi 2023)
# ✅ [seed] 142 cercles confirmés post-2023
# ✅ [seed] N communes échantillon (pédagogique)
# ✅ [seed] 5 institutions
# ✅ [seed] 6 utilisateurs (1 par rôle UserRole)
# 🌱 [seed] terminé avec succès.
```

### 7.6 Vérifier avec Prisma Studio

```powershell
# Lancer l'interface visuelle
pnpm run db:studio

# Ouvre automatiquement http://localhost:5555 dans le navigateur
# On peut voir les tables, les données, les relations
# Naviguer : regions → cliquer sur une région → voir ses cercles → voir ses communes
```

---

## 8. Client Prisma — Utilisation dans les services

### 8.1 Import du client singleton

Tous les microservices NestJS importent le client Prisma depuis `@nina-aes/database` :

```typescript
// services/identity-service/src/identity.service.ts

import { prisma } from '@nina-aes/database';

// Rechercher un citoyen par NINA
// La hiérarchie géographique est self-référente via Location.parentId
// (level: 0=pays, 1=région, 2=cercle, 3=commune, …) — on remonte avec
// `parent` à chaque niveau.
const record = await prisma.citizen.findUnique({
  where: { nina: '19001101001001A' },
  include: {
    residence: {
      include: {
        parent: {
          // cercle
          include: {
            parent: true, // région
          },
        },
      },
    },
  },
});
// record.residence.name              → "Kayes (commune)"
// record.residence.parent.name       → "Kayes (cercle)"
// record.residence.parent.parent.name → "Kayes (région)"
```

### 8.2 Exemples de requêtes typiques

```typescript
// ── Recherche par nom de famille (exact) ──
const results = await prisma.citizen.findMany({
  where: {
    lastName: { contains: 'KEITA', mode: 'insensitive' },
  },
  take: 20,
  orderBy: { lastName: 'asc' },
});

// ── Recherche par lieu de résidence ──
const records = await prisma.citizen.findMany({
  where: { residenceId: locationUuid },
  include: { residence: true },
});

// ── Créer une entrée d'audit (hash-chain SHA-256, PAS Merkle) ──
// computeChainHash = SHA-256(JCS(payload) || previousHash). Le nom legacy
// computeMerkleHash existe encore dans le code mais NE construit PAS d'arbre.
const audit = await prisma.auditLog.create({
  data: {
    actorId: userId,
    actorRole: 'AGENT',
    action: 'CREATE',
    resource: 'citizens',
    resourceId: recordId,
    ipAddress: req.ip,
    after: { nina: '19001101001001A', lastName: 'KEITA', firstName: 'Mamadou' },
    hash: computeChainHash(data, previousHash),
    previousHash: previousHash, // GENESIS = 64 zéros pour la 1re entrée
    sequenceNumber: nextSequence,
  },
});
// Le scellement Ed25519 de la racine (AuditRoot) est posé hors-ligne par le
// cron horaire de audit-service (cf. §4bis.2), pas à chaque INSERT.

// ── Compter les corrections en attente ──
const pendingCount = await prisma.ninaCorrection.count({
  where: { status: 'SOUMISE' },
});

// ── Pagination ──
const page = 1;
const pageSize = 20;
const [records, total] = await prisma.$transaction([
  prisma.citizen.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  }),
  prisma.citizen.count(),
]);
```

### 8.3 Recherche floue avec SQL brut (pg_trgm)

Pour la recherche floue, on utilise `$queryRaw` car Prisma ne supporte pas nativement l'opérateur
`%` de pg_trgm :

```typescript
// Recherche floue par similarité trigram (sur les versions ASCII indexées GIN)
const fuzzyResults = await prisma.$queryRaw`
  SELECT id, nina, last_name, first_name,
         similarity(last_name_ascii, ${searchTerm}) AS score
  FROM citizens
  WHERE last_name_ascii % ${searchTerm}
     OR first_name_ascii % ${searchTerm}
  ORDER BY score DESC
  LIMIT 20
`;
```

---

## 9. Mini-rapport d'étape (template)

```markdown
### Rapport — 06 Schéma de Base de Données Prisma — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Nombre de modèles Prisma** : 22 implémentés (16 dans la spec initiale — `schema.prisma` fait
  foi)
- **Nombre d'enums Prisma** : 10 implémentés (cf. en-tête + `schema.prisma`)
- **Migration initiale** : ✅ Exécutée sans erreur / ❌ Erreur
- **Seed géographique** : ✅ Régions, cercles, communes insérés
- **Prisma Studio** : ✅ Fonctionnel (http://localhost:5555)
- **Difficultés rencontrées** :
  - [ex: les index trigram nécessitent une migration SQL manuelle]
  - [ex: les relations circulaires entre modèles nécessitent un ordre précis]
- **Solutions trouvées** :
  - [ex: migration --create-only pour créer le SQL manuellement]
  - [ex: utilisation de upsert dans le seed pour l'idempotence]
- **Décisions prises** :
  - [ex: base partagée (shared database) plutôt que database-per-service]
- **Prochaines actions** :
  - Passer au document 07-BACKEND-IDENTITY-SERVICE.md
```

---

## 10. Checklist de fin d'étape

### Schéma Prisma

- [ ] Le fichier `packages/database/prisma/schema.prisma` contient les 22 modèles implémentés (≥ 16
      spec)
- [ ] Les 10 enums sont définis (Sex, MaritalStatus, Language, UserRole, CorrectionStatus, etc.)
- [ ] Toutes les relations sont définies (Location auto-référente → Citizen, Parent → Citizen, etc.)
- [ ] Les enums `MaritalStatus` et `Language` (référencés par `Citizen`) sont bien présents
- [ ] Les conventions de nommage sont respectées (camelCase Prisma, snake_case SQL via @map)
- [ ] Chaque modèle a `id`, `createdAt`, et `updatedAt` (sauf AuditLog/AuditRoot, append-only)

### Sécurité des données (§4bis / §4ter)

- [ ] Trigger append-only posé sur `audit_logs` ET `audit_roots` (refus UPDATE/DELETE)
- [ ] `AuditRoot` matérialisé (scellement Ed25519 in-process — PAS Vault Transit, PAS Merkle)
- [ ] Ancrage tiers OCLEI/VG documenté comme CONÇU/NON IMPLÉMENTÉ (`publishedExternal`)
- [ ] (CIBLE) Rôles least-privilege par service en prod — NON FAIT : la migration réelle suppose un
      rôle UNIQUE `nina_app` (REVOKE best-effort), pas
      `nina_identity`/`nina_audit`/`nina_anticorruption`
- [ ] (CIBLE) RLS conçu sur `citizens` (commune) et `corruption_alerts` (inspecteurs) — NON FAIT :
      aucun `CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` dans les migrations
- [ ] (CIBLE) **chiffrer le signalement** : aujourd'hui `corruption_alerts.body` est **EN CLAIR** ;
      objectif = `encrypted_payload` (`Bytes`) via sealed box X25519 / Transit `rsa-4096` — **NON
      FAIT** (ni `description_enc` ni `investigation_notes_enc` n'existent)
- [ ] Anonymat lanceur d'alerte : `reporterId` null + `anonymousReporterToken`, pas de FK
      ré-identifiante

### Migrations

- [ ] `prisma migrate dev --name init_full_schema` exécuté sans erreur
- [ ] Le dossier `prisma/migrations/` contient au moins 1 migration
- [ ] Les index trigram sont ajoutés (migration SQL manuelle)
- [ ] `prisma generate` génère le client sans erreur

### Seeds

- [ ] `prisma/seed.ts` est présent et exécutable via `pnpm run db:seed`
- [ ] 11 régions du Mali insérées
- [ ] 49 cercles insérés
- [ ] Communes échantillon insérées
- [ ] Le seed est **idempotent** (peut être exécuté plusieurs fois sans erreur grâce aux `upsert`)

### Validation

- [ ] Prisma Studio (`pnpm run db:studio`) affiche toutes les tables avec les bonnes colonnes
- [ ] Les données de seed sont visibles dans Prisma Studio
- [ ] Le client Prisma est importable : `import { prisma } from '@nina-aes/database'`
- [ ] Les requêtes de base fonctionnent (findMany, findUnique, create, count)

### Documentation

- [ ] Fichier `docs/adr/ADR-011-database-schema-prisma.md` créé
- [ ] Commit Git : `feat(database): add complete Prisma schema with 16 models`
- [ ] Mini-rapport rédigé
- [ ] Aucun secret en clair dans les fichiers commités

---

## 11. Pour aller plus loin

### Lectures recommandées

- **Prisma Schema Reference** (https://www.prisma.io/docs/orm/reference/prisma-schema-reference) —
  Référence complète de chaque directive du langage de schéma Prisma (model, enum, @relation, @map,
  @@index, etc.).
- **Prisma Migrate Guide** (https://www.prisma.io/docs/orm/prisma-migrate) — Guide détaillé des
  migrations : création, application, rollback, baseline.
- **PostgreSQL pg_trgm** (https://www.postgresql.org/docs/17/pgtrgm.html) — Documentation officielle
  de l'extension trigram. Explique les opérateurs `%`, `<->`, et les index GIN.
- **Database Normalization** (Wikipedia) — Les 5 formes normales. Le schéma NINA-AES est en 3NF
  (troisième forme normale) — un bon équilibre entre normalisation et performance.
- **Prisma Relations** (https://www.prisma.io/docs/orm/prisma-schema/data-model/relations) — Guide
  complet des relations Prisma : 1-1, 1-N, N-N, self-relations.

### Alternatives techniques considérées

| Alternative                                          | Pourquoi elle n'a pas été retenue                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeORM** au lieu de Prisma                        | TypeORM utilise des décorateurs et des classes, ce qui est plus verbeux. Prisma offre un schéma déclaratif et un client auto-généré plus ergonomique. TypeORM est plus mature pour les migrations complexes, mais Prisma 7 a comblé l'écart.                                            |
| **Drizzle ORM** au lieu de Prisma                    | Drizzle est plus léger et « SQL-like », mais son écosystème est moins mature. Prisma offre Studio, des migrations robustes, et une meilleure documentation.                                                                                                                             |
| **SQL brut** (sans ORM)                              | Offre un contrôle total mais nécessite d'écrire et maintenir chaque requête à la main. Avec 16 modèles et 11 services, le coût de maintenance serait disproportionné.                                                                                                                   |
| **Database-per-service** (une base par microservice) | Architecture plus pure mais complexité opérationnelle énorme pour un étudiant seul : 11 bases PostgreSQL, 11 migrations, 11 seeds, transactions distribuées (saga pattern) pour les opérations cross-service. La shared database est un compromis pragmatique documenté dans l'ADR-011. |
| **MongoDB** au lieu de PostgreSQL                    | NoSQL adapté aux documents non structurés, mais l'identité nationale est un domaine fortement structuré avec des relations claires (région → cercle → commune → citoyen). Les transactions ACID de PostgreSQL sont essentielles pour l'intégrité des données NINA.                      |

---

_Document 06 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
