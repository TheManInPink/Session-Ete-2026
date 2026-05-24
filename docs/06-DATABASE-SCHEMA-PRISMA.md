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
> - 16 modèles, 10 enums, soft-delete via callback `Prisma.defineExtension`.
> - Singleton paresseux via Proxy.

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
| **PostgreSQL**     | 17      | SGBD cible (via Docker, document 05)                  | https://www.postgresql.org/docs/17/                |
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

    %% ═══ AUDIT ═══
    AuditLog {
        string hash
        string previousHash
    }

    %% ═══ DOCUMENTS ═══
    Document }o--|| Citizen : "concerne"

    %% ═══ AES INTEROP ═══
    AesVerification }o--|| Citizen : "vérifie"

    %% ═══ VULNÉRABILITÉ ═══
    VulnerabilityRecord }o--|| Citizen : "identifie"

    %% ═══ RENDEZ-VOUS ═══
    Appointment }o--|| User : "citoyen"

    %% ═══ ANTI-CORRUPTION ═══
    IntegrityScore }o--|| User : "évalué"
    Alert }o--o| User : "signalement"
```

### 3.2 Tableau récapitulatif des modèles

| Modèle                | Table SQL               | Service principal             | Nb de champs | Rôle                                               |
| --------------------- | ----------------------- | ----------------------------- | ------------ | -------------------------------------------------- |
| `Region`              | `regions`               | identity-service              | 4            | Régions du Mali (10)                               |
| `Cercle`              | `cercles`               | identity-service              | 5            | Cercles (49)                                       |
| `Commune`             | `communes`              | identity-service              | 5            | Communes (703)                                     |
| `Citizen`             | `citizens`              | identity-service              | 14           | Enregistrements d'identité NINA                    |
| `User`                | `users`                 | auth-service                  | 15           | Utilisateurs du système (agents, admins, citoyens) |
| `NinaCorrection`      | `nina_corrections`      | identity-service + ai-service | 16           | Demandes de correction (manuelles et IA)           |
| `AiAnalysis`          | `ai_analyses`           | ai-service                    | 12           | Résultats d'analyse IA par batch                   |
| `AuditLog`            | `audit_logs`            | audit-service                 | 14           | Journal d'audit Merkle (chaîne de hash)            |
| `Document`            | `documents`             | document-service              | 12           | Fiches Descriptives, récépissés, etc.              |
| `Appointment`         | `appointments`          | appointment-service           | 11           | Rendez-vous en mairie / CTDEC                      |
| `Notification`        | `notifications`         | notification-service          | 10           | Emails, SMS, push                                  |
| `AesVerification`     | `aes_verifications`     | interop-service               | 11           | Vérifications inter-pays AES                       |
| `VulnerabilityRecord` | `vulnerability_records` | vulnerability-service         | 10           | Personnes vulnérables                              |
| `IntegrityScore`      | `integrity_scores`      | anticorruption-service        | 10           | Scores d'intégrité SIGAC                           |
| `Alert`               | `alerts`                | anticorruption-service        | 11           | Signalements lanceurs d'alerte                     |
| `UssdSession`         | `ussd_sessions`         | notification-service          | 8            | Historique des sessions USSD                       |

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

Le schéma ci-dessous est le contenu complet de `packages/database/prisma/schema.prisma`. Il remplace
le schéma minimal du document 04.

⚠️ **Ce schéma est conçu pour être extensible**. Chaque modèle contient les champs essentiels. Des
champs supplémentaires seront ajoutés lors de l'implémentation détaillée de chaque service
(documents 07 à 14).

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
  MASCULIN  // 1 dans le NINA
  FEMININ   // 2 dans le NINA
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

/// Région administrative du Mali (10 régions + district de Bamako)
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
// UTILISATEURS / AUTHENTIFICATION
// ═══════════════════════════════════════════════════

/// Utilisateur du système — agents CTDEC, superviseurs, admins, citoyens connectés
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
// CORRECTIONS NINA — Cycle de vie des modifications
// ═══════════════════════════════════════════════════

/// Demande de correction d'un enregistrement NINA
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
// JOURNAL D'AUDIT — Chaîne de hash Merkle
// ═══════════════════════════════════════════════════

/// Entrée du journal d'audit immuable (chaîne de hash SHA-256)
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
  /// Hash SHA-256 de cette entrée (calculé via computeMerkleHash)
  hash          String   @db.VarChar(64)
  /// Hash de l'entrée précédente (chaîne Merkle)
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

/// Signalement anti-corruption (lanceur d'alerte)
model Alert {
  id            String      @id @default(uuid())
  /// Signalant (null si anonyme)
  reporterId    String?     @map("reporter_id")
  reporter      User?       @relation(fields: [reporterId], references: [id])
  /// Canal du signalement
  channel       AlertChannel
  /// Statut du signalement
  status        AlertStatus @default(RECUE)
  /// Description du signalement (chiffré asymétrique en production)
  description   String      @db.Text
  /// Agent ou service visé par le signalement
  targetAgent   String?     @map("target_agent") @db.VarChar(200)
  /// Lieu de l'incident
  location      String?     @db.VarChar(200)
  /// Date de l'incident signalé
  incidentDate  DateTime?   @map("incident_date")
  /// Inspecteur assigné
  assignedTo    String?     @map("assigned_to") @db.VarChar(100)
  /// Notes d'enquête (accès inspecteur uniquement)
  investigationNotes String? @map("investigation_notes") @db.Text
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

## 5. Index et performance — Stratégie d'indexation

### 5.1 Index déjà définis dans le schéma

| Table              | Index                    | Type             | Justification                         |
| ------------------ | ------------------------ | ---------------- | ------------------------------------- |
| `citizens`         | `nina` (UNIQUE)          | B-tree unique    | Recherche directe par NINA — O(log n) |
| `citizens`         | `(lastName)`             | B-tree           | Recherche par nom de famille          |
| `citizens`         | `residenceId`            | B-tree           | Filtrage par lieu de résidence        |
| `citizens`         | `birthDate`              | B-tree           | Filtrage par date de naissance        |
| `audit_logs`       | `sequenceNumber`         | B-tree           | Tri de la chaîne Merkle               |
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

// ── Créer une entrée d'audit ──
const audit = await prisma.auditLog.create({
  data: {
    actorId: userId,
    actorRole: 'AGENT',
    action: 'CREATE',
    resource: 'citizens',
    resourceId: recordId,
    ipAddress: req.ip,
    after: { nina: '19001101001001A', lastName: 'KEITA', firstName: 'Mamadou' },
    hash: computeMerkleHash(data, previousHash),
    previousHash: previousHash,
    sequenceNumber: nextSequence,
  },
});

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
- **Nombre de modèles Prisma** : 16
- **Nombre d'enums Prisma** : 16
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

- [ ] Le fichier `packages/database/prisma/schema.prisma` contient les 16 modèles
- [ ] Les 16 enums sont définis (Sex, UserRole, CorrectionStatus, etc.)
- [ ] Toutes les relations sont définies (Region → Cercle → Commune → Citizen, etc.)
- [ ] Les conventions de nommage sont respectées (camelCase Prisma, snake_case SQL via @map)
- [ ] Chaque modèle a `id`, `createdAt`, et `updatedAt` (sauf AuditLog qui n'a pas updatedAt)

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
