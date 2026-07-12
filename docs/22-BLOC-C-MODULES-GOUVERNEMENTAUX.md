# 22 — Bloc C : Modules gouvernementaux (vulnerability-service + SGOGT + intégrité électorale)

> **Bloc concerné** : C (Priorité P1, post-Bloc-A en parallèle de Bloc B) — trois sous-modules
> institutionnels groupés dans un même bloc pour cohérence (tous portés par la gouvernance
> gouvernementale CTDEC + DNEC + Min. Intérieur). **Prérequis** : Bloc A complet ; sécurité doc 15
> (chiffrement PII via Vault Transit) ; observabilité doc 17 ; déploiement K3s doc 20. **Durée
> estimée** : 14 à 18 heures pour un étudiant seul (réparti sur les 3 sous-modules). **Livrables de
> cette étape** :
>
> **Sous-module C1 — `vulnerability-service` (port 3011, NestJS)**
>
> - Modèle `VulnerabilityProfile` (catégories : grossesse, handicap, personne âgée 65+, mineur
>   isolé, déplacé interne, malade chronique)
> - File prioritaire RDV CTDEC avec poids configurable par catégorie
> - Workflow « agent mobile » : visite à domicile + kit offline + sync différée (5 jours de cache)
> - Endpoint `POST /vulnerability/declare` (citoyen ou agent) avec preuve justificative (certificat
>   médical, attestation chef de village)
>
> **Sous-module C2 — SGOGT (Système de Gouvernance et d'Orientation Gouvernemental Tactique)**
>
> - Messagerie officielle signée **JWS RS256 via Vault Transit** entre fonctionnaires (Transit ne
>   supporte PAS Ed25519, cf. ADR-026 / ADR-034 ; voir §4.3 pour le détail des claims signés)
> - Escalade automatique (TTL 24 h → supérieur hiérarchique)
> - Traçabilité totale (**hash-chain SHA-256** de l'audit-service, cf. ADR-007 + doc 09 ; **PAS** un
>   arbre de Merkle)
> - UI dédiée dans `apps/governance` (boîte de réception + envoi + filtres)
>
> **Sous-module C3 — Intégrité électorale**
>
> - Inscription automatique sur les listes à 18 ans (`@cron` quotidien)
> - Fichier dynamique : Δ depuis dernier export (ajouts/retraits/décès)
> - Export sécurisé pour la DGE : signé **RS256** (Vault Transit) + SHA-256 via en-têtes HTTP réels,
>   **rate-limité + quota**, et **chaque export journalisé** dans l'audit (compte DGE compromis
>   détectable)
> - Anonymisation des champs sensibles (pas de N°CNI ; `pseudonymousId` = **HMAC-SHA256 calculé dans
>   Vault**, clé non exportable, PAS un `SHA-256(NINA+sel)` bruteforçable). Pseudonyme **STABLE
>   entre exports** (linkable par conception) ⇒ l'export DGE reste **ré-identifiable** en commune
>   peu peuplée — voir l'avertissement §4.4. La SEULE valeur secrète est la clé HMAC Transit ;
>   `saltVersion` n'est qu'un tag de séparation de domaine **public**.
> - `docs/adr/ADR-022-modules-gouvernementaux-scope.md`

---

## 1. Objectif pédagogique

Le Bloc C consolide **trois modules institutionnels** qui partagent un même profil utilisateur
(fonctionnaire DNEC/CTDEC/DGE), une même sensibilité (données nominatives + décisions
administratives), et une même exigence d'audit (traçabilité 10 ans via la **hash-chain SHA-256** de
l'audit-service, cf. ADR-007 et doc 09 — **PAS un arbre de Merkle**). Plutôt que 3 microservices
totalement séparés, on factorise dans **1 microservice + sous-modules** :

- **`vulnerability-service`** : autonome (port 3011) car la logique d'agent mobile et le cache
  offline sont spécifiques.
- **SGOGT + Intégrité électorale** : intégrés dans `governance-service` (port 3010) car ils
  partagent les permissions RBAC + l'UI gouvernance.

Trois leçons :

1. **Priorisation explicite des vulnérables**. Un système d'identité sans politique d'accessibilité
   est aveugle aux 30 % de la population la plus à risque (handicapés, illettrés, ruraux éloignés).
   Le module C1 force la prise en compte dès la conception.

2. **Messagerie auditable ≠ Slack** : SGOGT n'est pas une messagerie instantanée. C'est un système
   de **décisions administratives datées et signées**. Un message « OK, fais-le » d'un supérieur =
   ordre engageant cryptographiquement.

3. **Intégrité électorale = automatisme + transparence**. Un citoyen atteint 18 ans → il est inscrit
   le lendemain sur les listes, sans démarche, sans omission politique possible. La DGE reçoit un
   export reproductible (hash du fichier vérifiable).

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                   | Version                     | Rôle                                                                                             |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| **NestJS**                  | `11.1`                      | `vulnerability-service` + `governance-service`                                                   |
| **@nestjs/schedule**        | `5.x`                       | Cron jobs (inscriptions 18 ans quotidiennes)                                                     |
| **BullMQ**                  | `5.x`                       | Queue agents mobiles (sync différée) sur Redis 8.6                                               |
| **PostGIS**                 | `3.6`                       | Géo-search « citoyen vulnérable le plus proche »                                                 |
| **jose**                    | `6.2.3`                     | Construction/parse JWS (compact) — signature déléguée à Transit                                  |
| **Vault Transit `sign`**    | `1.20`                      | Signature **RS256** des messages SGOGT et de l'export DGE (clé non exportable)                   |
| **Vault Transit `hmac`**    | `1.20`                      | **HMAC-SHA256** du `pseudonymousId` électoral (clé non exportable, jamais en clair côté service) |
| **Vault Transit `encrypt`** | `1.20`                      | Chiffrement preuves justificatives + scellement de la preuve sur chemin nominal                  |
| **@nestjs/throttler**       | `6.x`                       | Rate-limit / quotas sur l'export DGE (anti-exfiltration registre)                                |
| **node-cron syntax**        | n/a                         | `0 2 * * *` pour daily inscription                                                               |
| **CSV/Parquet export**      | `papaparse`, `parquet-wasm` | Export DGE optimisé                                                                              |
| **Expo React Native**       | `SDK 55`                    | App agent mobile (déjà livrée doc 13, étendue)                                                   |

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_BlocC
title Bloc C — Modules gouvernementaux

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam queue     { BackgroundColor #FEE2E2; BorderColor #DC2626 }

actor "Citoyen\n(USSD/Web/App)" as Citizen
actor "Agent mobile" as Agent
actor "Fonctionnaire\n(SGOGT)" as Func
actor "DGE Élections" as DGE

rectangle "vulnerability-service\n:3011" as VS
rectangle "governance-service\n:3010" as GS {
  rectangle "Module SGOGT" as SGOGT
  rectangle "Module Élections" as Elec
}
database "Postgres\nvulnerability_profiles\nsgogt_messages\nvoter_registry" as PG
queue "BullMQ\nagent-mobile-queue" as Q
rectangle "Vault Transit\nencrypt + sign(RS256) + hmac" as Vault
database "audit_logs\n(hash-chain SHA-256)" as Audit

Citizen --> VS : POST /declare (cert médical)
Agent --> VS : sync queue\n(cache 5j offline)
Func --> SGOGT : POST /messages (signé JWS RS256)
SGOGT --> Func : escalade T+24h (TTL)
DGE --> Elec : GET /export?since=ISO8601\n(rate-limité + quota)

VS --> Q : enqueue agent visit
VS --> PG : VulnerabilityProfile
VS ..> Vault : encrypt(proof) [obligatoire chemin nominal]
VS ..> Audit : append(VULNERABILITY_DECLARED)

SGOGT --> PG : sgogt_messages
SGOGT --> Func : escalade hierarchique
SGOGT ..> Vault : transit/sign (RS256, JWS)
SGOGT ..> Audit : append(SGOGT_MESSAGE_SENT)

Elec --> PG : cron daily turn-18
Elec ..> Vault : transit/hmac (pseudonymousId)
Elec ..> Audit : append(VOTER_INSCRIBED / DGE_EXPORT)
Elec --> DGE : signed delta export\n(SHA-256 + JWS RS256, headers HTTP)

note bottom of VS
  Catégories priorité (poids RDV) :
  - grossesse : 5
  - handicap : 5
  - personne âgée 65+ : 4
  - mineur isolé : 5
  - déplacé interne : 3
  - malade chronique : 3
  Citoyen standard : 1
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Modèle Prisma Bloc C

```prisma
// packages/database/prisma/schema.prisma — extensions Bloc C

enum VulnerabilityCategory {
  PREGNANCY              // grossesse
  DISABILITY             // handicap
  ELDERLY_65PLUS         // personne âgée 65+
  UNACCOMPANIED_MINOR    // mineur isolé
  IDP                    // déplacé interne (Internally Displaced Person)
  CHRONIC_ILLNESS        // malade chronique
}

model VulnerabilityProfile {
  id               String                @id @default(uuid())
  citizenId        String                @unique     // FK Citizen.id
  category         VulnerabilityCategory
  declaredBy       String                            // citoyen ou agent
  declaredAt       DateTime              @default(now())
  validUntil       DateTime?                         // grossesse: 9 mois ; chronique: indéfini
  proofUrl         String?                           // MinIO encrypted
  proofHash        String?                           // SHA-256 du fichier
  reviewedBy       String?                           // agent CTDEC ayant validé
  reviewedAt       DateTime?
  rejectionReason  String?
  priorityWeight   Int                               // 1-5, calculé depuis category

  citizen          Citizen               @relation(fields: [citizenId], references: [id])

  @@index([category, validUntil])
  @@map("vulnerability_profiles")
}

model SgogtMessage {
  id               BigInt                @id @default(autoincrement())
  threadId         String                                  // groupe de messages liés
  senderId         String                                  // user.id fonctionnaire
  recipientId      String                                  // direct ou rôle (HEAD_DNEC, etc.)
  subject          String
  body             String                @db.Text
  jwsSignature     String                @db.Text          // JWS compact RS256 (signature Vault Transit ; voir §4.3)
  signedClaims     Json                                    // claims couverts par la signature (sender,recipient,subject,bodyHash,threadId,priority,ttl) — anti-rejeu/anti-altération
  priority         SgogtPriority         @default(NORMAL)
  ttlEscalateAt    DateTime?                              // si pas répondu d'ici là → escalade
  escalatedTo      String?                                // user.id supérieur
  status           SgogtStatus           @default(SENT)
  readAt           DateTime?
  respondedAt      DateTime?
  createdAt        DateTime              @default(now())

  // L'intégrité long terme n'est PAS stockée ici : chaque message émet une ligne
  // dans audit_logs (hash-chain SHA-256, doc 09). On ne duplique pas une fausse
  // « racine Merkle » au niveau du message.

  @@index([recipientId, status])
  @@index([threadId])
  @@map("sgogt_messages")
}

enum SgogtPriority { NORMAL HIGH CRITICAL }
enum SgogtStatus { SENT READ RESPONDED ESCALATED ARCHIVED }

model VoterRegistry {
  id               BigInt                @id @default(autoincrement())
  citizenId        String                @unique
  pseudonymousId   String                @unique          // HMAC-SHA256(NINA) calculé DANS Vault (clé non exportable) — voir §4.4 ; la SEULE valeur secrète est la clé HMAC Transit non-exportable. Un simple SHA-256(NINA+sel) serait bruteforçable (NINA de format public)
  saltVersion      Int                                    // tag de SÉPARATION DE DOMAINE public (PAS un sel secret) : version de contexte mélangée à l'entrée HMAC. Stocké EN CLAIR ici et journalisé ; sert uniquement à la rotation sans casser l'historique
  region           String
  cercle           String
  commune          String?
  registeredAt     DateTime              @default(now())
  inscriptionType  VoterInscriptionType                   // AUTO_18 | MANUAL | TRANSFER
  status           VoterStatus           @default(ACTIVE)
  removedAt        DateTime?
  removedReason    String?                                // décès, déménagement étranger, déchéance

  citizen          Citizen               @relation(fields: [citizenId], references: [id])

  @@index([region, status])
  @@index([pseudonymousId])
  @@map("voter_registry")
}

enum VoterInscriptionType { AUTO_18 MANUAL TRANSFER }
enum VoterStatus { ACTIVE REMOVED_DECEASED REMOVED_RELOCATED REMOVED_DISQUALIFIED }
```

---

### Étape 4.2 — Sous-module C1 : `vulnerability-service`

**Endpoint principal** : `POST /vulnerability/declare`

```ts
// services/vulnerability-service/src/declare/declare.controller.ts
@Controller('vulnerability')
export class DeclareController {
  @Post('declare')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CITIZEN', 'MOBILE_AGENT', 'CTDEC_AGENT')
  async declare(
    @Body() dto: DeclareVulnerabilityDto,
    @UploadedFile() proof: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<VulnerabilityProfile> {
    // 1) Validation Zod : catégorie + citizenId + proof obligatoire si catégorie ≠ MINEUR_ISOLÉ
    const validated = DeclareSchema.parse(dto);

    // 2) ANTI-IDOR (OWASP A01:2021 — Broken Access Control).
    //    Un CITIZEN ne peut déclarer QUE pour lui-même : on refuse tout citizenId
    //    qui ne correspond pas à l'utilisateur authentifié. Seuls les agents
    //    (MOBILE_AGENT/CTDEC_AGENT) peuvent déclarer pour un tiers — et c'est
    //    journalisé via `declaredBy`. Sans ce contrôle, un citoyen pourrait créer
    //    de faux profils de vulnérabilité au nom d'autrui.
    const isAgent = req.user.role === 'MOBILE_AGENT' || req.user.role === 'CTDEC_AGENT';
    if (!isAgent && validated.citizenId !== req.user.id) {
      throw new ForbiddenException('citizenId must match the authenticated user');
    }

    // 3) Upload preuve dans MinIO + chiffrement Vault Transit OBLIGATOIRE.
    //    La preuve (certificat médical, attestation) est une donnée de santé / PII
    //    hautement sensible. Sur le chemin nominal, le chiffrement n'est PAS
    //    optionnel : on chiffre le buffer via Vault Transit AVANT l'upload, et on
    //    ne stocke jamais le fichier en clair dans MinIO. `uploadProof` échoue si
    //    `transitEncrypt` échoue (pas de fallback "clair").
    const proofUrl = proof
      ? await this.uploadProof(validated.citizenId, proof) // encrypt(Vault) → MinIO, throw si Vault KO
      : null;

    // 4) Calcul du poids prioritaire
    const weight = this.calculateWeight(validated.category);

    // 5) Création du profil (status: pending → reviewed_by agent)
    const profile = await this.prisma.vulnerabilityProfile.create({
      data: {
        citizenId: validated.citizenId,
        category: validated.category,
        declaredBy: req.user.id,
        proofUrl,
        // Hash d'intégrité du fichier d'origine (avant chiffrement), pour
        // vérifier qu'une preuve déchiffrée n'a pas été altérée.
        proofHash: proof ? sha256(proof.buffer) : null,
        priorityWeight: weight,
        validUntil: validated.category === 'PREGNANCY' ? addMonths(new Date(), 9) : null,
      },
    });

    // 6) Audit : append dans la hash-chain SHA-256 de l'audit-service (doc 09),
    //    PAS un arbre de Merkle. `auditService.append()` est le client local qui
    //    génère un `sourceEventId` (UUID, idempotence) puis POST l'événement vers
    //    l'audit-service, lequel le chaîne (`previousHash` → `merkleHash`). Le nom
    //    de colonne `merkleHash` est historique côté audit-service : la structure
    //    réelle reste une CHAÎNE linéaire, pas un arbre.
    //
    //    IMPORTANT — forme du DTO. Le contrat d'ingestion réel
    //    (`services/audit-service/src/audit/dtos/ingest.dto.ts`) n'a PAS de
    //    champs `resourceType/resourceId/actorId/payload`. Les champs acceptés
    //    sont : `action, entityType, entityId, userId (UUID), actorType,
    //    oldValue, newValue, ipAddress, correlationId, sourceEventId`. Le
    //    `ValidationPipe` de l'audit-service est configuré
    //    `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`
    //    (vérifié — `services/audit-service/src/main.ts:33`) : toute clé inconnue
    //    n'est PAS silencieusement supprimée, elle déclenche une **400 Bad Request**.
    //    Une métadonnée rangée dans une clé hors-contrat serait donc REJETÉE (et de
    //    toute façon non couverte par le `payloadHash`, cf. `computePayloadHash` /
    //    `chain.ts`, qui ne hashe que ces champs). On range donc l'objet métier libre dans
    //    `newValue` (seul champ JSON libre hashé), l'identité de l'acteur dans
    //    `userId` (réel UUID), et le type/origine dans `entityType`/`entityId`.
    await this.auditService.append({
      action: 'VULNERABILITY_DECLARED',
      entityType: 'VulnerabilityProfile',
      entityId: profile.id,
      userId: req.user.id, // UUID réel de l'utilisateur authentifié (@IsUUID())
      ipAddress: req.ip,
      newValue: { category: validated.category, citizenId: validated.citizenId, by: req.user.id },
    });

    // 7) Si déclaré par un agent mobile en mode offline, enqueue pour validation différée
    if (req.user.role === 'MOBILE_AGENT' && req.user.offlineMode) {
      await this.queue.add('mobile-validate', profile.id);
    }

    return profile;
  }

  private calculateWeight(category: VulnerabilityCategory): number {
    return (
      {
        PREGNANCY: 5,
        DISABILITY: 5,
        UNACCOMPANIED_MINOR: 5,
        ELDERLY_65PLUS: 4,
        IDP: 3,
        CHRONIC_ILLNESS: 3,
      }[category] ?? 1
    );
  }
}
```

**File prioritaire RDV** :

```sql
-- Vue matérialisée pour l'appointment-service
CREATE MATERIALIZED VIEW priority_queue AS
SELECT
  a.id AS appointment_id,
  a.citizen_id,
  a.requested_at,
  COALESCE(vp.priority_weight, 1) AS weight,
  -- Score = priorité × 1000 - secondes d'attente (plus le wait est long, plus le score baisse)
  (COALESCE(vp.priority_weight, 1) * 1000)
    - EXTRACT(EPOCH FROM (NOW() - a.requested_at))::int AS priority_score
FROM appointments a
LEFT JOIN vulnerability_profiles vp ON vp.citizen_id = a.citizen_id
  AND (vp.valid_until IS NULL OR vp.valid_until > NOW())
WHERE a.status = 'PENDING';

REFRESH MATERIALIZED VIEW CONCURRENTLY priority_queue;   -- toutes les 5 min via cron
```

**Mode agent mobile (cache offline 5 jours)** : Expo SQLite locale + sync différée via BullMQ quand
connexion rétablie. Détaillé dans doc 13 (mobile app) + ce doc §4.2.bis.

---

### Étape 4.2ter — AS-BUILT : réconciliation PROMPT 6.1 (validation par catégorie · appel SMS de file · livraison à domicile)

> Consigne l'implémentation réelle (**ADR-035**) qui complète le `vulnerability-service` au-delà du
> squelette §4.2. Changements de schéma **additifs** (table `delivery_missions` + colonne
> `priority_queue_entries.notified_at`) ; **aucun** nouveau `UserRole` plateforme.

**(a) Politique de validation par catégorie** — `GET /vulnerability/categories` expose le
référentiel ; `POST /vulnerability/profiles` l'applique :

- `ELDERLY` → `AUTO_AGE` : âge ≥ 60 dérivé de `Citizen.birthDate` ⇒ **auto-vérifié** ; **422** sinon
  (pas d'auto-déclaration d'un âge non atteint).
- `DISABLED`, `CHRONIC_ILL` → `MANUAL_CERT` : `proofUrl` **obligatoire** + revue agent CTDEC
  (**422** sans preuve).
- `PREGNANT`, `ILLITERATE`, `DIASPORA` → `SELF_DECLARED` : auto-déclaration **acceptée** (vérifiée).

**(b) Appel SMS « c'est votre tour »** — `POST /vulnerability/priority-queue/notify-next` publie un
job SMS vers notification-service (`nina.notifications`), **idempotent** via
`priority_queue_entries.notified_at`, **best-effort** (bus indisponible ⇒ appel rejouable). La
fenêtre **7h-9h** dédiée aux P1 reste portée par `EnrollmentCenter.priority_window_from/to` +
`priority_quota_per_day` (consommée par appointment-service) — **non redéfinie** ici.

**(c) Livraison à domicile** — table additive `delivery_missions` (+ enums `delivery_status`,
`delivery_signature_type`). Cycle `REQUESTED → ASSIGNED → (IN_TRANSIT) → DELIVERED | FAILED`, **SLA
15 j** (`due_at = demande + DELIVERY_SLA_DAYS`). Dispatch ADMIN/SUP → agent **actif** ;
**confirmation réservée à l'agent affecté** (ownership `sub JWT → User.id → mobile_agents`, **403**
sinon) avec preuve de réception **hashée** (jamais le gabarit biométrique brut), photo d'attestation
**chiffrée** (MinIO) + GPS. L'« agent mobile » reste une **entité** (`MobileAgent`), pas un rôle
plateforme (ADR-035 D1).

Endpoints livraison : `POST` / `GET /vulnerability/deliveries` (**liste anti-BOLA** : un simple
AGENT est forcé à SES missions — les adresses domicile ne sont pas énumérables ; supervision
SUP/ADMIN/AUDITOR = vue complète, ADR-035 D6), `GET /vulnerability/deliveries/agent/:agentId`
(tournée, ownership), `PUT /vulnerability/deliveries/:id/{assign,confirm,fail}` (`fail` exige aussi
l'agent **actif**).

---

### Étape 4.3 — Sous-module C2 : SGOGT (messagerie officielle)

```ts
// services/governance-service/src/sgogt/sgogt.controller.ts
@Controller('sgogt')
export class SgogtController {
  @Post('messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OFFICIAL', 'SUPERVISOR', 'DIRECTOR')
  async send(@Body() dto: SendSgogtDto, @Req() req: AuthenticatedRequest) {
    // 0) Calcul des champs dérivés AVANT signature, pour qu'ils soient COUVERTS
    //    par le JWS (sinon un attaquant pourrait altérer threadId/priority/ttl
    //    sans invalider la signature).
    const threadId = dto.threadId ?? uuid();
    const issuedAt = new Date();
    const ttlEscalateAt =
      dto.priority === 'CRITICAL' ? addHours(issuedAt, 4) : addHours(issuedAt, 24);

    // 1) Claims signés. On NE signe pas le `body` brut (potentiellement volumineux)
    //    mais son SHA-256 ; on AJOUTE threadId, priority et ttl pour que toute la
    //    « décision administrative » soit cryptographiquement engageante et
    //    non-rejouable (anti-altération + anti-rejeu via `iat`).
    const signedClaims = {
      sender: req.user.id,
      recipient: dto.recipientId,
      subject: dto.subject,
      bodyHash: sha256Hex(dto.body),
      threadId,
      priority: dto.priority,
      ttlEscalateAt: ttlEscalateAt.toISOString(),
      iat: issuedAt.toISOString(),
    };

    // 2) Signature JWS **RS256 via Vault Transit** (Transit ne supporte PAS Ed25519,
    //    cf. ADR-026 / ADR-034). La clé privée par-fonctionnaire reste DANS Vault
    //    (non exportable) ; le service ne manipule jamais le secret. `jwsService.sign`
    //    s'appuie sur `transitSign(keyName, payloadBase64, { signatureAlgorithm: 'pkcs1v15' })`
    //    du package @nina-aes/vault-client et produit un JWS compact (alg=RS256).
    const jws = await this.jwsService.sign(signedClaims, `sgogt-user-${req.user.id}`);

    // 3) Création message — on persiste les claims signés à côté du JWS pour
    //    permettre une vérification ultérieure sans recalcul ambigu.
    const msg = await this.prisma.sgogtMessage.create({
      data: {
        threadId,
        senderId: req.user.id,
        recipientId: dto.recipientId,
        subject: dto.subject,
        body: dto.body,
        jwsSignature: jws,
        signedClaims,
        priority: dto.priority,
        ttlEscalateAt,
      },
    });

    // 4) Notification (email + push notif app gouvernance)
    await this.notify.dispatch(msg);

    // 5) Audit : append dans la hash-chain SHA-256 de l'audit-service (doc 09),
    //    PAS un arbre de Merkle. Forme du DTO conforme au contrat d'ingestion
    //    réel (cf. note en §4.2) : on range la métadonnée métier dans `newValue`
    //    (seul champ JSON libre hashé par `computePayloadHash`), l'acteur dans
    //    `userId`. `resourceType/resourceId/actorId/payload` N'EXISTENT PAS et
    //    seraient REJETÉS (400 Bad Request) par le `ValidationPipe`
    //    (`forbidNonWhitelisted: true`, cf. main.ts:33) — pas silencieusement strippés.
    await this.auditService.append({
      action: 'SGOGT_MESSAGE_SENT',
      entityType: 'SgogtMessage',
      entityId: String(msg.id),
      userId: req.user.id, // UUID réel (@IsUUID())
      ipAddress: req.ip,
      newValue: { recipient: dto.recipientId, priority: dto.priority, threadId },
    });

    return msg;
  }
}
```

**Cron escalade** :

> **⚠️ PRÉREQUIS SCHÉMA (⏳ à implémenter en Phase 2).** Le `include` ci-dessous suppose deux
> relations Prisma qui N'EXISTENT PAS encore (vérifié) : une relation hiérarchique `manager`
> (self-relation `managerId`) sur le modèle `User`, et une relation `recipient` sur `SgogtMessage`
> (qui n'a aujourd'hui qu'un champ scalaire `recipientId`, cf. §4.1). En l'état,
> `include: { recipient: { include: { manager: true } } }` **ne compile pas**. Deux options : (a)
> ajouter ces relations au schéma (`manager`/`managerId` sur `User`, `recipient` sur `SgogtMessage`)
> avant d'utiliser cet `include` ; ou (b) simplifier le cron en résolvant le supérieur via un lookup
> séparé (`prisma.user.findUnique({ where: { id: msg.recipientId } })` puis lecture de `managerId`).

```ts
// services/governance-service/src/sgogt/sgogt-escalation.cron.ts
@Injectable()
export class SgogtEscalationCron {
  @Cron('*/15 * * * *') // toutes les 15 min
  async escalate(): Promise<void> {
    const dueForEscalation = await this.prisma.sgogtMessage.findMany({
      where: {
        status: 'SENT',
        ttlEscalateAt: { lte: new Date() },
        escalatedTo: null,
      },
      include: { recipient: { include: { manager: true } } },
    });

    for (const msg of dueForEscalation) {
      if (!msg.recipient?.managerId) continue; // pas de supérieur → archive
      await this.prisma.sgogtMessage.update({
        where: { id: msg.id },
        data: {
          status: 'ESCALATED',
          escalatedTo: msg.recipient.managerId,
        },
      });
      // Réémettre une notif vers le supérieur (avec mention "escalade après TTL")
      await this.notify.escalateNotification(msg);
    }
  }
}
```

---

### Étape 4.4 — Sous-module C3 : Intégrité électorale

**Cron quotidien d'inscription auto à 18 ans** :

```ts
// services/governance-service/src/elections/inscription-auto.cron.ts
@Injectable()
export class InscriptionAutoCron {
  @Cron('0 2 * * *', { timeZone: 'Africa/Bamako' }) // 02:00 Bamako
  async inscribeNewAdults(): Promise<void> {
    const today = startOfDay(new Date());
    const eighteenYearsAgo = subYears(today, 18);

    // Trouver les citoyens dont aujourd'hui est leur 18ᵉ anniversaire
    const newAdults = await this.prisma.citizen.findMany({
      where: {
        dateNaissance: { gte: subDays(eighteenYearsAgo, 1), lt: addDays(eighteenYearsAgo, 1) },
        voterRegistry: null, // pas déjà inscrit (transferts, manuel)
      },
    });

    this.logger.info(`Inscription électorale auto : ${newAdults.length} nouveaux majeurs`);

    // On lit UNE fois la version de contexte courante (tag de séparation de
    // domaine PUBLIC, PAS un secret). Le SEUL secret est la clé HMAC Transit
    // non-exportable, qui ne quitte jamais Vault (cf. generatePseudonymousId).
    const saltVersion = await this.getCurrentSaltVersion();

    for (const citizen of newAdults) {
      const pseudonym = await this.generatePseudonymousId(citizen.nina, saltVersion);
      await this.prisma.voterRegistry.create({
        data: {
          citizenId: citizen.id,
          pseudonymousId: pseudonym,
          saltVersion,
          region: citizen.region,
          cercle: citizen.cercle,
          commune: citizen.commune,
          inscriptionType: 'AUTO_18',
        },
      });

      // Audit obligatoire (preuve d'inscription régulière) : append dans la
      // hash-chain SHA-256 de l'audit-service (doc 09), PAS un arbre de Merkle.
      // ATTENTION : on ne met PAS le NINA dans le newValue — uniquement le pseudonyme.
      //
      // Forme du DTO conforme au contrat d'ingestion réel (cf. note en §4.2) :
      // `entityType/entityId/userId/actorType/newValue`. ICI l'acteur est un
      // CRON système, PAS un utilisateur : `userId` est validé `@IsUUID()` et
      // refuserait la chaîne `system:inscription-auto-cron`. On laisse donc
      // `userId` vide (optionnel) et on identifie l'acteur via `actorType`
      // (champ texte libre prévu pour les origines machine/m2m).
      await this.auditService.append({
        action: 'VOTER_INSCRIBED_AUTO_18',
        entityType: 'VoterRegistry',
        entityId: citizen.id,
        actorType: 'system:inscription-auto-cron', // acteur machine (PAS un UUID → pas dans userId)
        newValue: { pseudonym, saltVersion, region: citizen.region },
      });
    }
  }

  /**
   * Génère un ID pseudonyme via **HMAC-SHA256 calculé DANS Vault** (endpoint
   * `transit/hmac/<key>`), PAS un SHA-256 local.
   *
   * POURQUOI un HMAC Vault et pas `SHA-256(NINA + sel)` :
   *  - Le NINA a un **format public** (longueur + structure connues) → l'espace
   *    des entrées est petit. Un `SHA-256(NINA + sel)` est **bruteforçable
   *    trivialement si le sel fuit** (un admin DB ou une fuite de config suffit
   *    à reconstruire la table NINA → pseudonyme, ré-identifiant tout l'électorat).
   *  - Avec `transit/hmac`, la **clé HMAC est générée et conservée par Vault**,
   *    **non exportable** : même un admin DB + le code source ne peuvent PAS
   *    recalculer les pseudonymes hors de Vault. Chaque appel est audité par Vault.
   *    **C'est la SEULE valeur secrète** qui protège le pseudonyme.
   *  - `saltVersion` n'est **PAS un sel secret** : c'est un **tag de séparation
   *    de domaine PUBLIC** (version de contexte), stocké EN CLAIR dans
   *    `voter_registry.saltVersion`, journalisé, et passé en préfixe d'entrée du
   *    HMAC. Le faire tourner produit des pseudonymes différents (rotation sans
   *    casser l'historique), mais sa fuite n'affaiblit RIEN tant que la clé HMAC
   *    Transit reste non-exportable. Ne jamais le qualifier de « sel secret ».
   *
   * NB : `transitHmac()` est un helper à AJOUTER à @nina-aes/vault-client
   * (conçu, non encore livré — voir §9, PRÉREQUIS BLOQUANT) ; il enveloppe
   * l'appel REST `POST transit/hmac/<key>` que Vault expose nativement
   * (algorithme `sha2-256`).
   */
  private async generatePseudonymousId(nina: string, saltVersion: number): Promise<string> {
    // `saltVersion` est un tag de contexte PUBLIC (séparation de domaine), pas un
    // secret : il sert de préfixe à l'entrée HMAC. Le SEUL secret est la clé HMAC
    // Transit, qui reste interne à Vault et n'est jamais lue côté service.
    const input = Buffer.from(`v${saltVersion}:${nina}`, 'utf8').toString('base64');
    // POST transit/hmac/elections-pseudonym  { input: <base64>, algorithm: "sha2-256" }
    // → renvoie "vault:v1:<hmac-base64>". On strip le préfixe de version Vault.
    const vaultHmac = await this.vault.transitHmac('elections-pseudonym', input, {
      algorithm: 'sha2-256',
    });
    return vaultHmac.replace(/^vault:v\d+:/, '');
  }

  /**
   * Lit la version de contexte (tag de séparation de domaine) active.
   * Métadonnée PUBLIQUE et non sensible : ce n'est PAS un sel secret, seulement
   * un numéro de version stocké en clair et journalisé.
   */
  private async getCurrentSaltVersion(): Promise<number> {
    const meta = await this.vault.getSecret<{ saltVersion: number }>('elections/salt-meta');
    return meta.saltVersion;
  }
}
```

> **⛔ PRÉREQUIS BLOQUANT — `transitHmac()` n'existe pas encore dans le vault-client.** Toute la
> pseudonymisation C3 dépend de ce helper, mais (vérifié) `packages/vault-client/src/index.ts`
> n'expose que
> `transitSign / transitVerify / transitReadKey / transitEncrypt / transitDecrypt / rotateTransitKey`.
> **Sans l'ajout ci-dessous, C3 est BLOQUÉ** (le code ci-dessus ne compile pas). Le helper se calque
> sur `transitSign` — même couche HTTP, autre endpoint :

```ts
// packages/vault-client/src/index.ts — méthode à AJOUTER à la classe VaultClient
/**
 * Calcule un HMAC dans Vault (engine Transit, endpoint `transit/hmac/<key>`).
 * La clé HMAC est générée et conservée par Vault, **non exportable** : le
 * service ne manipule jamais le secret. Le résultat est au format
 * `vault:vN:<base64>` (la version `vN` permet la rotation sans casser
 * l'historique). À utiliser pour le `pseudonymousId` électoral (cf. doc 22 §4.4).
 *
 * @param keyName       Nom de la clé HMAC Transit (ex. `elections-pseudonym`).
 * @param payloadBase64 Entrée à hasher, encodée base64.
 * @param opts.algorithm Algorithme de hachage (`sha2-256` par défaut).
 * @returns Chaîne `vault:vN:<hmac-base64>`.
 */
async transitHmac(
  keyName: string,
  payloadBase64: string,
  opts: { algorithm?: 'sha2-256' | 'sha2-384' | 'sha2-512' } = {},
): Promise<string> {
  const body: Record<string, unknown> = { input: payloadBase64 };
  if (opts.algorithm) body.algorithm = opts.algorithm;
  const res = await this.request<{ data: { hmac: string } }>(
    'POST',
    `transit/hmac/${keyName}`,
    body,
  );
  return res.data.hmac; // "vault:vN:<base64>"
}
```

**Export delta pour la DGE** :

> **MODÈLE DE MENACE.** Un compte `DGE_OFFICIAL` **compromis** peut tenter d'exfiltrer **tout le
> registre électoral** (11 M de lignes) en boucle. Quatre contrôles complémentaires :
>
> 1. **Rate-limit (`@nestjs/throttler`, PAR IP par défaut) + quota applicatif PAR COMPTE** : le
>    `@Throttle` borne le débit **par adresse IP** (défense en profondeur, anti-rafale) ; la
>    garantie **« 5 exports / jour PAR COMPTE DGE »** est portée par le quota applicatif
>    `assertWithinDailyQuota(req.user.id)`, PAS par le throttler (voir l'encart THROTTLER
>    ci-dessous).
> 2. **Journalisation de CHAQUE export** dans la hash-chain d'audit (`DGE_EXPORT`) — qui, quand,
>    quelle fenêtre `since`, combien de lignes, IP. Un export massif anormal devient détectable.
> 3. **Signature du flux** (RS256 via Transit) + **SHA-256** transmis dans de **vrais en-têtes
>    HTTP** (`res.setHeader`), pour que la DGE vérifie l'intégrité — `StreamableFile.setMetadata()`
>    **n'existe pas** dans NestJS (voir encart ci-dessous).
> 4. **RBAC strict** `DGE_OFFICIAL` (déjà présent via `@Roles`).

> **⚠️ AVERTISSEMENT RÉ-IDENTIFICATION — l'export est pseudonyme mais LINKABLE.** Le
> `pseudonymousId` est **STABLE** d'un export à l'autre (même clé Transit + même `saltVersion` ⇒
> valeur identique). C'est **délibéré** : la DGE doit pouvoir corréler un retrait avec l'inscription
> correspondante entre deux deltas. **Conséquence de sécurité** : l'export n'offre PAS
> l'unlinkabilité entre exports. Un `DGE_OFFICIAL` compromis ou curieux peut **suivre un individu
> précis** à travers les deltas (attaque par linkage), d'autant que chaque ligne porte une **géo
> fine** (`commune`), des **horodatages exacts** (`registeredAt`/`removedAt`) et un `removedReason`
> **en clair** (« décès », « déménagement étranger », « déchéance »). En **commune peu peuplée**, la
> combinaison `commune + horodatages + removedReason` rend la ré-identification **triviale**, ce qui
> touche directement la protection des personnes (y compris profils sensibles / lanceurs d'alerte).
>
> **Mitigations OBLIGATOIRES** (pas optionnelles) :
>
> - L'export DGE est lui-même **classifié et accès-contrôlé** (RBAC `DGE_OFFICIAL` + chiffrement au
>   repos + journalisation `DGE_EXPORT`) : il ne quitte JAMAIS le périmètre DGE en clair.
> - Avant **tout partage externe** (au-delà de la DGE), appliquer une **k-anonymité** (regroupement
>   géo : remonter `commune` → `cercle` sous un seuil de population) **ou** du **bruit de Laplace**
>   (anonymisation différentielle, cf. §10). Tant que ce traitement n'est pas appliqué, l'export est
>   réputé **ré-identifiant** et ne doit pas franchir la frontière DGE.
>
> Cet avertissement DOIT être repris à l'identique dans
> `docs/governance/ELECTIONS-EXPORT-CONTRACT.md` (cf. §7).

> **PIÈGE NestJS — `StreamableFile.setMetadata()` N'EXISTE PAS.** L'API publique de `StreamableFile`
> expose `getStream()`, `getHeaders()` et le constructeur `StreamableHandlerResponse` (options
> `type` / `disposition` / `length`), mais **aucune** méthode `setMetadata()`. Le code original
> compilait par illusion et planterait à l'exécution. La bonne façon d'ajouter des en-têtes custom
> (signature, hash) est d'injecter la réponse Express via `@Res({ passthrough: true })` et d'appeler
> `res.setHeader(...)` — ce que fait la version corrigée ci-dessous.

> **PIÈGE THROTTLER — un throttler NOMMÉ doit être DÉCLARÉ, sinon `@Throttle({ dge: … })` est
> INERTE.** Le contrôleur ci-dessous référence un throttler **nommé** `dge`. Mais
> `@nestjs/throttler` n'applique une limite que si ce nom est **enregistré** dans
> `ThrottlerModule.forRoot([...])`. À titre de comparaison, l'`appointment-service` actuel
> n'enregistre qu'**un seul throttler anonyme** (sans `name`) — un `@Throttle({ dge: … })` y
> pointerait vers un nom inexistant et **ne limiterait RIEN silencieusement** (le contrôle
> anti-exfiltration serait annoncé mais creux). Il faut donc déclarer le throttler `dge` dans
> l'AppModule de `governance-service` :
>
> **⚠️ PORTÉE DU THROTTLER — PAR IP, PAS PAR COMPTE.** Par défaut `@nestjs/throttler` clé sa limite
> sur l'**adresse IP** de la requête (`getTracker()` renvoie `req.ip`). Aucun override
> `getTracker()` n'existe dans le dépôt (vérifié par grep sur `services/` et `packages/`). Donc le
> throttler `dge` ci-dessous limite **par IP**, pas « par compte DGE » : c'est une **défense en
> profondeur** (anti-rafale), mais le modèle de menace est un **compte DGE compromis** — exactement
> l'acteur qui peut **changer d'IP** pour contourner un cap par-IP, ou être **faussement bloqué
> derrière un NAT partagé**. La garantie réelle **PAR COMPTE** est fournie par le **quota
> applicatif** `assertWithinDailyQuota(req.user.id)` (§4.4, étape 2), qui clé sur l'identité
> authentifiée. Pour rendre le throttler lui-même per-compte, il faudrait un `ThrottlerGuard` dérivé
> surchargeant `getTracker(req) => req.user.id` — **⏳ à implémenter en Phase 2** (aucune
> sous-classe de ce type n'existe aujourd'hui). Ne jamais affirmer « par compte DGE » pour le
> throttler sans cet override.

```ts
// services/governance-service/src/app.module.ts — déclaration des throttlers NOMMÉS
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    // ...
    ThrottlerModule.forRoot([
      // Throttler global (anonyme) : protection de base de toutes les routes.
      { ttl: 60_000, limit: 100 },
      // Throttler NOMMÉ `dge` : anti-exfiltration de l'export électoral.
      // Le nom DOIT correspondre exactement à `@Throttle({ dge: … })` côté contrôleur.
      // 5 exports par heure (3 600 000 ms) PAR IP (clé `getTracker()` = req.ip par
      // défaut, AUCUN override per-compte dans le dépôt) → défense en profondeur.
      // La garantie PAR COMPTE DGE est portée par `assertWithinDailyQuota(req.user.id)`.
      { name: 'dge', ttl: 3_600_000, limit: 5 },
    ]),
    // ...
  ],
})
export class AppModule {}
```

```ts
@Controller('elections')
export class ElectionsExportController {
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DGE_OFFICIAL')
  // Rate-limit anti-exfiltration : au plus 5 exports / heure PAR IP (clé par
  // défaut de @nestjs/throttler = req.ip ; aucun override `getTracker()` per-compte
  // dans le dépôt). C'est une défense EN PROFONDEUR contre la rafale ; la limite
  // PAR COMPTE DGE est garantie par `assertWithinDailyQuota(req.user.id)` ci-dessous.
  @Throttle({ dge: { ttl: 3_600_000, limit: 5 } })
  async export(
    @Query('since') sinceIso: string,
    @Req() req: AuthenticatedRequest,
    // `passthrough: true` : on garde la main sur la réponse (en-têtes) tout en
    // laissant NestJS streamer le StreamableFile retourné.
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // 1) Validation stricte de la fenêtre temporelle (ISO 8601 complet exigé).
    const since = parseISO(sinceIso);
    if (Number.isNaN(since.getTime())) {
      throw new BadRequestException('since must be a full ISO-8601 timestamp');
    }

    // 2) Quota applicatif PAR COMPTE, complémentaire au rate-limit per-IP : c'est
    //    LUI qui garantit « 5 exports / jour par compte DGE ». Il DOIT être ATOMIQUE
    //    — réservation/incrément en UNE opération AVANT de streamer, jamais un
    //    read-then-act dérivé d'un comptage `audit_logs` (sinon TOCTOU : deux exports
    //    concurrents passent tous deux le check avant qu'aucun n'écrive sa ligne, et
    //    le cap est défait). Implémentation atomique attendue : soit un
    //    `UPDATE dge_export_quota SET count = count + 1 WHERE account_id = :id
    //    AND day = :today AND count < :limit RETURNING count` (échec = 0 ligne ⇒ 429),
    //    soit un `INCR` Redis avec TTL journalier comparé au plafond. La ligne
    //    `DGE_EXPORT` dans `audit_logs` (étape 5) reste une PREUVE a posteriori, PAS
    //    la source de comptage du quota.
    await this.exportQuota.assertWithinDailyQuota(req.user.id);

    const delta = await this.prisma.voterRegistry.findMany({
      where: {
        OR: [{ registeredAt: { gte: since } }, { removedAt: { gte: since } }],
      },
      select: {
        pseudonymousId: true,
        region: true,
        cercle: true,
        commune: true,
        status: true,
        registeredAt: true,
        removedAt: true,
        removedReason: true,
      },
    });

    // 3) Sérialisation CSV déterministe + empreinte d'intégrité.
    const csv = papaparse.unparse(delta);
    const buf = Buffer.from(csv, 'utf8');
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    // 4) Signature du FLUX (RS256 via Vault Transit). On signe le SHA-256 préhashé
    //    pour que la DGE valide qu'aucun octet n'a été altéré en transit. Transit
    //    ne supporte pas Ed25519 → RS256/pkcs1v15 (cf. ADR-026).
    const jws = await this.jwsService.sign(
      { sha256, since: sinceIso, count: delta.length, exportedBy: req.user.id },
      'elections-export',
    );

    // 5) JOURNALISATION OBLIGATOIRE de l'export dans la hash-chain d'audit (doc 09).
    //    C'est ce qui rend un compte DGE compromis détectable : chaque exfiltration
    //    laisse une trace immuable (qui, quand, quelle fenêtre, combien de lignes, IP).
    //
    //    Forme du DTO conforme au contrat d'ingestion réel (cf. note en §4.2) :
    //    la métadonnée d'exfiltration EXIGÉE par le brief (qui/quand/fenêtre/
    //    nb-lignes/IP) doit aller dans `newValue` — seul champ JSON libre accepté
    //    par `ingest.dto.ts` ET hashé par `computePayloadHash` (chain.ts). Mise
    //    dans un champ `payload` inexistant, elle ferait carrément ÉCHOUER la
    //    requête : le `ValidationPipe` de l'audit-service rejette toute clé hors
    //    contrat avec une **400 Bad Request** (`forbidNonWhitelisted: true`, cf.
    //    main.ts:33) — l'événement ne serait NI persisté NI chaîne-protégé → le
    //    contrôle « journaliser chaque export » serait annoncé mais creux.
    await this.auditService.append({
      action: 'DGE_EXPORT',
      entityType: 'VoterRegistry',
      entityId: `export:${sinceIso}`,
      userId: req.user.id, // UUID réel du DGE_OFFICIAL (@IsUUID())
      ipAddress: req.ip,
      newValue: { since: sinceIso, count: delta.length, sha256 },
    });

    // 6) VRAIS en-têtes HTTP via res.setHeader (PAS le fantôme setMetadata).
    res.setHeader('X-Export-Signature', jws);
    res.setHeader('X-Export-SHA256', sha256);
    res.setHeader('X-Export-Count', String(delta.length));

    // 7) On retourne le StreamableFile (en-têtes type/disposition/length gérés ici).
    return new StreamableFile(buf, {
      type: 'text/csv',
      disposition: `attachment; filename="voter-delta-${sinceIso}.csv"`,
      length: buf.length,
    });
  }
}
```

> **Vérification côté DGE.** La DGE recalcule `SHA-256(corps)`, le compare à `X-Export-SHA256`, puis
> vérifie `X-Export-Signature` (JWS RS256) avec la **clé publique Transit** de la clé
> `elections-export` (récupérée via `transit/keys/elections-export` ou un JWKS exposé). Tout écart
> (octet altéré, signature invalide) ⇒ export rejeté. Le `count` permet un contrôle de cohérence
> grossier sur le nombre de lignes.

---

### Étape 4.5 — UI gouvernance

3 onglets dans `apps/governance` :

- **Vulnérables** : carte choroplèthe (cf. `MaliHeatmap`) montrant la densité de profils vulnérables
  par cercle ; tableau filtrable par catégorie ; bouton « Assigner agent mobile ».
- **SGOGT** : boîte de réception (similaire Gmail), composition avec drag&drop pour pièces jointes,
  filtres priorité.
- **Élections** : bouton « Export pour DGE » avec sélection date `since` ; tableau historique des
  exports ; vérification SHA-256.

---

## 5. Validation locale

```powershell
# 1) Test C1 — déclarer une vulnérabilité
curl -X POST https://localhost:3011/vulnerability/declare \
  -H "Authorization: Bearer <citizen-jwt>" \
  -F "category=PREGNANCY" \
  -F "citizenId=cln5..." \
  -F "proof=@./test/medical-cert.pdf"

# 2) Vérifier que le poids prioritaire est appliqué
docker exec nina-postgres psql -U nina_admin -d nina_aes_db \
  -c "SELECT * FROM priority_queue ORDER BY priority_score DESC LIMIT 5;"

# 3) Test C2 — envoyer un message SGOGT
curl -X POST https://localhost:3010/sgogt/messages \
  -H "Authorization: Bearer <official-jwt>" \
  -d '{"recipientId":"user-xxx","subject":"Audit Q2","body":"...","priority":"HIGH"}'

# 4) Test C3 — inscrire manuellement (simulation cron)
docker exec nina-governance-service node dist/cli.js inscribe-18-today

# 5) Test C3 — export delta DGE (ISO 8601 COMPLET requis) + capture des en-têtes
#    de signature/hash dans un fichier séparé (-D) pour vérification.
curl -O -J -D ./voter-delta.headers.txt \
  "https://localhost:3010/elections/export?since=2026-01-01T00:00:00Z" \
  -H "Authorization: Bearer <dge-jwt>"

# 6) Vérifier l'intégrité côté DGE : le SHA-256 local doit matcher X-Export-SHA256.
#    (Get-FileHash sous PowerShell ; comparer à l'en-tête capturé ci-dessus.)
Get-FileHash .\voter-delta-2026-01-01T00:00:00Z.csv -Algorithm SHA256

# 7) Vérifier que CHAQUE export est journalisé dans la hash-chain d'audit.
docker exec nina-postgres psql -U nina_admin -d nina_aes_db \
  -c "SELECT action, user_id, entity_id, ip_address, new_value FROM audit_logs WHERE action = 'DGE_EXPORT' ORDER BY id DESC LIMIT 5;"
```

---

## 6. Pièges courants & dépannage

| Symptôme                                       | Cause probable                                  | Solution                                                                             |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `priority_queue` matérialisée vide             | Cron de refresh pas configuré                   | Cron `pg_cron` toutes les 5 min `REFRESH MATERIALIZED VIEW`                          |
| Agent mobile sync échoue                       | Cache local SQLite trop ancien (> 5j)           | Force re-login + repartir d'un seed clean                                            |
| SGOGT escalade pas déclenchée                  | Cron @nestjs/schedule pas démarré               | Vérifier `ScheduleModule.forRoot()` dans AppModule                                   |
| Inscription auto 18 ans rate certains citoyens | Fuseau horaire UTC vs Bamako (1h décalage)      | Toujours `{ timeZone: 'Africa/Bamako' }` dans `@Cron`                                |
| Export DGE retourne 0 lignes                   | `since` mal formaté (date sans heure)           | Forcer ISO 8601 complet `2026-01-01T00:00:00Z`                                       |
| `StreamableFile.setMetadata is not a function` | Méthode inexistante en NestJS                   | Injecter `@Res({ passthrough:true })` et utiliser `res.setHeader(...)`               |
| En-têtes `X-Export-Signature/SHA256` absents   | Headers posés après le stream / via setMetadata | Poser les `res.setHeader` AVANT de retourner le `StreamableFile`                     |
| Pseudonyme bruteforçable si le sel fuit        | `SHA-256(NINA+sel)` local (NINA format public)  | Passer à `transit/hmac` (clé non exportable dans Vault) + sel par-élection versionné |
| Un citoyen crée un profil au nom d'autrui      | Pas de check `citizenId == user` (IDOR/A01)     | Refuser si `!isAgent && citizenId !== req.user.id` (ForbiddenException)              |
| Compte DGE compromis siphonne le registre      | Pas de rate-limit ni de journal d'export        | `@Throttle` + quota quotidien + `DGE_EXPORT` dans audit_logs                         |
| Preuve médicale lisible dans MinIO             | Pas chiffré Vault Transit                       | Chiffrement `transitEncrypt()` OBLIGATOIRE avant upload (pas de fallback clair)      |
| Vue gouvernance lente sur 11M citoyens         | Index GIN trigram manquant                      | `CREATE INDEX ON vulnerability_profiles USING gin(...)`                              |

---

## 7. Documentation à produire

- `docs/adr/ADR-022-modules-gouvernementaux-scope.md` — décision scope 3 sous-modules dans 2
  services (vulnerability autonome + SGOGT/Élections consolidés).
- `docs/governance/SGOGT-PROTOCOL.md` — règles de signature (**JWS RS256 via Vault Transit**, claims
  signés : sender/recipient/subject/bodyHash/threadId/priority/ttl/iat) et escalade.
- `docs/governance/ELECTIONS-EXPORT-CONTRACT.md` — contrat technique DGE : en-têtes
  `X-Export-Signature` (RS256) / `X-Export-SHA256` / `X-Export-Count`, procédure de vérification par
  clé publique Transit, rate-limit/quota, et journalisation `DGE_EXPORT`. **DOIT inclure
  l'avertissement de ré-identification** (cf. §4.4) : le `pseudonymousId` est **stable entre
  exports** (donc pseudonyme mais **LINKABLE** — corrélation des deltas délibérée),
  `commune + horodatages + removedReason` permettent la ré-identification en commune peu peuplée,
  l'export est **classifié / accès-contrôlé**, et une **k-anonymité ou un bruit de Laplace est
  REQUIS** (non optionnel) avant tout partage hors DGE.
- Note d'honnêteté à porter dans l'ADR-022 / les contrats : l'audit Bloc C est une **hash-chain
  SHA-256 linéaire** (doc 09), **inviolable seulement si la racine est ancrée chez un tiers**
  (registre signé OCLEI / Vérificateur Général) — cet ancrage est **conçu, non encore implémenté**.
  Ne jamais qualifier l'audit d'« inaltérable » sans cette réserve.
- Mise à jour `docs/CHANGELOG.md` §20.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc C Modules gouvernementaux — JJ/MM/2026

- Status :
- C1 vulnerability-service :
- C2 SGOGT :
- C3 Élections :
```

---

## 9. Checklist de fin d'étape

- [ ] **PRÉREQUIS BLOQUANT C3** — `transitHmac()` AJOUTÉ à `@nina-aes/vault-client`
      (`packages/vault-client/src/index.ts`). **Vérifié** : l'`index.ts` actuel n'expose que
      `transitSign/transitVerify/transitReadKey/transitEncrypt/transitDecrypt/rotateTransitKey` —
      **aucun `hmac`**. Sans ce helper, le correctif P0 « HMAC dans Vault » est **indélivrable** et
      `generatePseudonymousId` ne compile pas ⇒ **C3 est BLOQUÉ**. Forme attendue (calquée sur
      `transitSign`) : `POST transit/hmac/<key>` avec `{ input: <base64>, algorithm: 'sha2-256' }`,
      renvoie `"vault:vN:<b64>"`. Voir le squelette en §4.4.
- [ ] Migration Prisma `bloc_c_governance` appliquée (3 tables + 4 enums)
- [ ] `vulnerability-service` scaffold opérationnel port 3011
- [ ] Endpoint `/vulnerability/declare` testé avec preuve chiffrée Vault (chiffrement OBLIGATOIRE,
      pas de fallback clair)
- [ ] Anti-IDOR sur `/declare` : un CITIZEN ne peut déclarer que pour `req.user.id`
- [ ] Vue matérialisée `priority_queue` rafraîchie toutes les 5 min
- [ ] BullMQ queue agent mobile + cache SQLite Expo 5 jours
- [ ] `governance-service` étendu avec modules SGOGT + Élections
- [ ] JWS **RS256 via Vault Transit** sur tous les messages SGOGT (vérifiable), claims incluant
      threadId/priority/ttl/bodyHash/iat
- [ ] Cron escalade SGOGT (TTL 4h CRITICAL, 24h NORMAL) testé
- [ ] Cron `inscription-auto` quotidien 02:00 Africa/Bamako
- [ ] `pseudonymousId` via **`transit/hmac`** (clé non exportable) + sel par-élection versionné
      (helper `transitHmac()` ajouté à vault-client)
- [ ] Export delta DGE : signature RS256 + SHA-256 via **vrais `res.setHeader`** (PAS `setMetadata`)
- [ ] Throttler **nommé `dge`** DÉCLARÉ dans `ThrottlerModule.forRoot([...])` du
      `governance-service` (sinon `@Throttle({ dge })` est inerte et ne limite rien)
- [ ] Quota export **atomique** (réservation/incrément AVANT le stream) — pas de comptage TOCTOU
      dérivé d'`audit_logs` (cf. §4.4 étape 2)
- [ ] Export DGE : champs métier dans `newValue` (PAS `payload`) + `userId` UUID réel — conformes à
      `ingest.dto.ts` (sinon strippés par le `ValidationPipe`)
- [ ] Export DGE : rate-limit `@Throttle` + quota quotidien + ligne `DGE_EXPORT` dans `audit_logs`
      pour CHAQUE export
- [ ] Avertissement **ré-identification** (pseudonyme stable/linkable + k-anonymité/Laplace
      obligatoire hors DGE) porté dans §4.4 ET `ELECTIONS-EXPORT-CONTRACT.md`
- [ ] 3 onglets `apps/governance` (Vulnérables / SGOGT / Élections)
- [ ] Audit **hash-chain SHA-256** (PAS Merkle) attaché aux 3 modules Bloc C ; ancrage racine tiers
      (OCLEI / Vérificateur Général) à implémenter
- [ ] `ADR-022` rédigé
- [ ] `docs/CHANGELOG.md` §20 mis à jour
- [ ] Tag Git `governance-modules-mvp` posé
- [ ] Commit conventionnel :
      `feat(governance): C1 vulnerability + C2 SGOGT + C3 elections + ADR-022`

---

## 10. Pour aller plus loin

- **Module C4 (P2)** : génération automatique du **rapport bisannuel** CTDEC/DNEC vers le Ministère
  de l'Administration — agrégation stats vulnérabilité + SGOGT + élections.
- **Module C5 (P3)** : intégration **CICR** (Croix-Rouge) pour les déplacés internes — protocole
  d'échange chiffré similaire à BCID-AES.
- **Vote électronique pilote** : tests sur l'intégrité électorale pourraient préparer un pilote de
  vote dématérialisé sur diaspora. Hors scope V2.
- **Anonymisation différentielle** : ajouter du bruit Laplace sur les exports pour éviter les
  attaques de ré-identification statistique.

---

_Document 22 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
