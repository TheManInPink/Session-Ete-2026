# 22 — Bloc C : Modules gouvernementaux (vulnerability-service + SGOGT + intégrité électorale)

> **Bloc concerné** : C (Priorité P1, post-Bloc-A en parallèle de Bloc B) —
> trois sous-modules institutionnels groupés dans un même bloc pour
> cohérence (tous portés par la gouvernance gouvernementale CTDEC + DNEC +
> Min. Intérieur).
> **Prérequis** : Bloc A complet ; sécurité doc 15 (chiffrement PII via
> Vault Transit) ; observabilité doc 17 ; déploiement K3s doc 20.
> **Durée estimée** : 14 à 18 heures pour un étudiant seul (réparti sur
> les 3 sous-modules).
> **Livrables de cette étape** :
>
> **Sous-module C1 — `vulnerability-service` (port 3011, NestJS)**
> - Modèle `VulnerabilityProfile` (catégories : grossesse, handicap,
>   personne âgée 65+, mineur isolé, déplacé interne, malade chronique)
> - File prioritaire RDV CTDEC avec poids configurable par catégorie
> - Workflow « agent mobile » : visite à domicile + kit offline + sync
>   différée (5 jours de cache)
> - Endpoint `POST /vulnerability/declare` (citoyen ou agent) avec preuve
>   justificative (certificat médical, attestation chef de village)
>
> **Sous-module C2 — SGOGT (Système de Gouvernance et d'Orientation
> Gouvernemental Tactique)**
> - Messagerie officielle signée JWS Ed25519 entre fonctionnaires
> - Escalade automatique (TTL 24 h → supérieur hiérarchique)
> - Traçabilité totale (audit Merkle, cf. ADR-014)
> - UI dédiée dans `apps/governance` (boîte de réception + envoi + filtres)
>
> **Sous-module C3 — Intégrité électorale**
> - Inscription automatique sur les listes à 18 ans (`@cron` quotidien)
> - Fichier dynamique : Δ depuis dernier export (ajouts/retraits/décès)
> - Export sécurisé pour la Direction Générale des Élections (DGE)
> - Anonymisation des champs sensibles (pas de N°CNI, juste un id pseudonyme)
>
> - `docs/adr/ADR-022-modules-gouvernementaux-scope.md`

---

## 1. Objectif pédagogique

Le Bloc C consolide **trois modules institutionnels** qui partagent un
même profil utilisateur (fonctionnaire DNEC/CTDEC/DGE), une même
sensibilité (données nominatives + décisions administratives), et une
même exigence d'audit (traçabilité 10 ans Merkle). Plutôt que 3 microservices
totalement séparés, on factorise dans **1 microservice +
sous-modules** :

- **`vulnerability-service`** : autonome (port 3011) car la logique
  d'agent mobile et le cache offline sont spécifiques.
- **SGOGT + Intégrité électorale** : intégrés dans `governance-service`
  (port 3010) car ils partagent les permissions RBAC + l'UI gouvernance.

Trois leçons :

1. **Priorisation explicite des vulnérables**. Un système d'identité
   sans politique d'accessibilité est aveugle aux 30 % de la
   population la plus à risque (handicapés, illettrés, ruraux
   éloignés). Le module C1 force la prise en compte dès la conception.

2. **Messagerie auditable ≠ Slack** : SGOGT n'est pas une messagerie
   instantanée. C'est un système de **décisions administratives
   datées et signées**. Un message « OK, fais-le » d'un supérieur =
   ordre engageant cryptographiquement.

3. **Intégrité électorale = automatisme + transparence**. Un citoyen
   atteint 18 ans → il est inscrit le lendemain sur les listes,
   sans démarche, sans omission politique possible. La DGE reçoit
   un export reproductible (hash du fichier vérifiable).

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                          | Version    | Rôle                                                |
| ---------------------------------- | ---------- | --------------------------------------------------- |
| **NestJS**                         | `11.1`     | `vulnerability-service` + `governance-service`     |
| **@nestjs/schedule**               | `5.x`      | Cron jobs (inscriptions 18 ans quotidiennes)        |
| **BullMQ**                         | `5.x`      | Queue agents mobiles (sync différée) sur Redis 8.6 |
| **PostGIS**                        | `3.6`      | Géo-search « citoyen vulnérable le plus proche »   |
| **jose**                           | `6.2.3`    | JWS Ed25519 pour SGOGT                              |
| **node-cron syntax**               | n/a        | `0 2 * * *` pour daily inscription                  |
| **CSV/Parquet export**             | `papaparse`, `parquet-wasm` | Export DGE optimisé          |
| **Expo React Native**              | `SDK 55`   | App agent mobile (déjà livrée doc 13, étendue)     |
| **Vault Transit**                  | `1.20`     | Chiffrement preuves justificatives                  |

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
rectangle "Vault Transit\nencrypt PII" as Vault

Citizen --> VS : POST /declare (cert médical)
Agent --> VS : sync queue\n(cache 5j offline)
Func --> SGOGT : POST /messages (signé JWS)
SGOGT --> Func : escalade T+24h (TTL)
DGE --> Elec : GET /export?delta=YYYY-MM-DD

VS --> Q : enqueue agent visit
VS --> PG : VulnerabilityProfile
VS ..> Vault : encrypt(proof)

SGOGT --> PG : sgogt_messages
SGOGT --> Func : escalade hierarchique

Elec --> PG : cron daily turn-18
Elec --> DGE : signed delta export\n(SHA-256 + JWS)

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
  jwsSignature     String                @db.Text          // signature Ed25519
  priority         SgogtPriority         @default(NORMAL)
  ttlEscalateAt    DateTime?                              // si pas répondu d'ici là → escalade
  escalatedTo      String?                                // user.id supérieur
  status           SgogtStatus           @default(SENT)
  readAt           DateTime?
  respondedAt      DateTime?
  createdAt        DateTime              @default(now())
  merkleHash       String
  prevHash         String?

  @@index([recipientId, status])
  @@index([threadId])
  @@map("sgogt_messages")
}

enum SgogtPriority { NORMAL HIGH CRITICAL }
enum SgogtStatus { SENT READ RESPONDED ESCALATED ARCHIVED }

model VoterRegistry {
  id               BigInt                @id @default(autoincrement())
  citizenId        String                @unique
  pseudonymousId   String                @unique          // hash NINA + sel élection, sans révéler NINA
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

    // 2) Upload preuve dans MinIO + chiffrement Vault Transit
    const proofUrl = proof ? await this.uploadProof(validated.citizenId, proof) : null;

    // 3) Calcul du poids prioritaire
    const weight = this.calculateWeight(validated.category);

    // 4) Création du profil (status: pending → reviewed_by agent)
    const profile = await this.prisma.vulnerabilityProfile.create({
      data: {
        citizenId: validated.citizenId,
        category: validated.category,
        declaredBy: req.user.id,
        proofUrl,
        proofHash: proof ? sha256(proof.buffer) : null,
        priorityWeight: weight,
        validUntil: validated.category === 'PREGNANCY'
          ? addMonths(new Date(), 9)
          : null,
      },
    });

    // 5) Audit Merkle
    await this.auditService.log({
      action: 'VULNERABILITY_DECLARED',
      entityType: 'VulnerabilityProfile',
      entityId: profile.id,
      payload: { category: validated.category, by: req.user.id },
    });

    // 6) Si déclaré par un agent mobile en mode offline, enqueue pour validation différée
    if (req.user.role === 'MOBILE_AGENT' && req.user.offlineMode) {
      await this.queue.add('mobile-validate', profile.id);
    }

    return profile;
  }

  private calculateWeight(category: VulnerabilityCategory): number {
    return {
      PREGNANCY: 5,
      DISABILITY: 5,
      UNACCOMPANIED_MINOR: 5,
      ELDERLY_65PLUS: 4,
      IDP: 3,
      CHRONIC_ILLNESS: 3,
    }[category] ?? 1;
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

**Mode agent mobile (cache offline 5 jours)** : Expo SQLite locale +
sync différée via BullMQ quand connexion rétablie. Détaillé dans
doc 13 (mobile app) + ce doc §4.2.bis.

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
    // 1) Signature JWS Ed25519 par la clé privée de l'expéditeur (Vault Transit)
    const jws = await this.jwsService.sign(
      { sender: req.user.id, recipient: dto.recipientId, subject: dto.subject, body: dto.body },
      `user-${req.user.id}`,
    );

    // 2) Création message
    const msg = await this.prisma.sgogtMessage.create({
      data: {
        threadId: dto.threadId ?? uuid(),
        senderId: req.user.id,
        recipientId: dto.recipientId,
        subject: dto.subject,
        body: dto.body,
        jwsSignature: jws,
        priority: dto.priority,
        ttlEscalateAt: dto.priority === 'CRITICAL'
          ? addHours(new Date(), 4)
          : addHours(new Date(), 24),
      },
    });

    // 3) Notification (email + push notif app gouvernance)
    await this.notify.dispatch(msg);

    // 4) Audit Merkle
    await this.auditService.log({
      action: 'SGOGT_MESSAGE_SENT',
      entityType: 'SgogtMessage',
      entityId: String(msg.id),
      payload: { recipient: dto.recipientId, priority: dto.priority },
    });

    return msg;
  }
}
```

**Cron escalade** :

```ts
// services/governance-service/src/sgogt/sgogt-escalation.cron.ts
@Injectable()
export class SgogtEscalationCron {
  @Cron('*/15 * * * *')   // toutes les 15 min
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
      if (!msg.recipient?.managerId) continue;   // pas de supérieur → archive
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
  @Cron('0 2 * * *', { timeZone: 'Africa/Bamako' })   // 02:00 Bamako
  async inscribeNewAdults(): Promise<void> {
    const today = startOfDay(new Date());
    const eighteenYearsAgo = subYears(today, 18);

    // Trouver les citoyens dont aujourd'hui est leur 18ᵉ anniversaire
    const newAdults = await this.prisma.citizen.findMany({
      where: {
        dateNaissance: { gte: subDays(eighteenYearsAgo, 1), lt: addDays(eighteenYearsAgo, 1) },
        voterRegistry: null,   // pas déjà inscrit (transferts, manuel)
      },
    });

    this.logger.info(`Inscription électorale auto : ${newAdults.length} nouveaux majeurs`);

    for (const citizen of newAdults) {
      const pseudonym = await this.generatePseudonymousId(citizen.nina);
      await this.prisma.voterRegistry.create({
        data: {
          citizenId: citizen.id,
          pseudonymousId: pseudonym,
          region: citizen.region,
          cercle: citizen.cercle,
          commune: citizen.commune,
          inscriptionType: 'AUTO_18',
        },
      });

      // Audit Merkle obligatoire (preuve d'inscription régulière)
      await this.auditService.log({
        action: 'VOTER_INSCRIBED_AUTO_18',
        entityType: 'VoterRegistry',
        entityId: citizen.id,
        payload: { pseudonym, region: citizen.region },
      });
    }
  }

  /** Génère un ID pseudonyme = SHA-256(NINA + sel-election). Sel rotated tous les 5 ans. */
  private async generatePseudonymousId(nina: string): Promise<string> {
    const electionSalt = await this.vault.read('secret/elections/current-salt');
    return crypto.createHash('sha256').update(nina + electionSalt).digest('hex');
  }
}
```

**Export delta pour la DGE** :

```ts
@Controller('elections')
export class ElectionsExportController {
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DGE_OFFICIAL')
  async export(
    @Query('since') sinceIso: string,
  ): Promise<StreamableFile> {
    const since = parseISO(sinceIso);
    const delta = await this.prisma.voterRegistry.findMany({
      where: {
        OR: [
          { registeredAt: { gte: since } },
          { removedAt: { gte: since } },
        ],
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

    // CSV stream + signature JWS du fichier complet
    const csv = papaparse.unparse(delta);
    const sha256 = crypto.createHash('sha256').update(csv).digest('hex');
    const jws = await this.jwsService.sign({ sha256, since: sinceIso, count: delta.length }, 'elections-export');

    // En-tête HTTP avec signature pour vérification DGE
    return new StreamableFile(Buffer.from(csv), {
      type: 'text/csv',
      disposition: `attachment; filename="voter-delta-${sinceIso}.csv"`,
      length: csv.length,
    }).setMetadata({
      'X-Export-Signature': jws,
      'X-Export-SHA256': sha256,
    });
  }
}
```

---

### Étape 4.5 — UI gouvernance

3 onglets dans `apps/governance` :

- **Vulnérables** : carte choroplèthe (cf. `MaliHeatmap`) montrant la
  densité de profils vulnérables par cercle ; tableau filtrable par
  catégorie ; bouton « Assigner agent mobile ».
- **SGOGT** : boîte de réception (similaire Gmail), composition avec
  drag&drop pour pièces jointes, filtres priorité.
- **Élections** : bouton « Export pour DGE » avec sélection date
  `since` ; tableau historique des exports ; vérification SHA-256.

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

# 5) Test C3 — export delta DGE
curl -O -J "https://localhost:3010/elections/export?since=2026-01-01" \
  -H "Authorization: Bearer <dge-jwt>"
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                | Cause probable                                  | Solution                                                |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `priority_queue` matérialisée vide                      | Cron de refresh pas configuré                   | Cron `pg_cron` toutes les 5 min `REFRESH MATERIALIZED VIEW` |
| Agent mobile sync échoue                                | Cache local SQLite trop ancien (> 5j)            | Force re-login + repartir d'un seed clean              |
| SGOGT escalade pas déclenchée                           | Cron @nestjs/schedule pas démarré                | Vérifier `ScheduleModule.forRoot()` dans AppModule    |
| Inscription auto 18 ans rate certains citoyens          | Fuseau horaire UTC vs Bamako (1h décalage)      | Toujours `{ timeZone: 'Africa/Bamako' }` dans `@Cron`  |
| Export DGE retourne 0 lignes                             | `since` mal formaté (date sans heure)            | Forcer ISO 8601 complet `2026-01-01T00:00:00Z`         |
| Pseudonyme révèle le NINA en pratique                    | Sel pas rotated, dictionnaire pré-calculé      | Rotation sel tous les 5 ans + nouveaux pseudonymes     |
| Preuve médicale lisible dans MinIO                      | Pas chiffré Vault Transit                        | Toujours `vault.encrypt()` avant upload                 |
| Vue gouvernance lente sur 11M citoyens                  | Index GIN trigram manquant                       | `CREATE INDEX ON vulnerability_profiles USING gin(...)` |

---

## 7. Documentation à produire

- `docs/adr/ADR-022-modules-gouvernementaux-scope.md` — décision scope
  3 sous-modules dans 2 services (vulnerability autonome + SGOGT/Élections
  consolidés).
- `docs/governance/SGOGT-PROTOCOL.md` — règles de signature et escalade.
- `docs/governance/ELECTIONS-EXPORT-CONTRACT.md` — contrat technique DGE.
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

- [ ] Migration Prisma `bloc_c_governance` appliquée (3 tables + 4 enums)
- [ ] `vulnerability-service` scaffold opérationnel port 3011
- [ ] Endpoint `/vulnerability/declare` testé avec preuve chiffrée Vault
- [ ] Vue matérialisée `priority_queue` rafraîchie toutes les 5 min
- [ ] BullMQ queue agent mobile + cache SQLite Expo 5 jours
- [ ] `governance-service` étendu avec modules SGOGT + Élections
- [ ] JWS Ed25519 sur tous les messages SGOGT (vérifiable)
- [ ] Cron escalade SGOGT (TTL 4h CRITICAL, 24h NORMAL) testé
- [ ] Cron `inscription-auto` quotidien 02:00 Africa/Bamako
- [ ] Export delta DGE signé + SHA-256 vérifiable
- [ ] 3 onglets `apps/governance` (Vulnérables / SGOGT / Élections)
- [ ] Audit Merkle attaché aux 3 tables Bloc C
- [ ] `ADR-022` rédigé
- [ ] `docs/CHANGELOG.md` §20 mis à jour
- [ ] Tag Git `governance-modules-mvp` posé
- [ ] Commit conventionnel : `feat(governance): C1 vulnerability + C2 SGOGT + C3 elections + ADR-022`

---

## 10. Pour aller plus loin

- **Module C4 (P2)** : génération automatique du **rapport bisannuel**
  CTDEC/DNEC vers le Ministère de l'Administration — agrégation stats
  vulnérabilité + SGOGT + élections.
- **Module C5 (P3)** : intégration **CICR** (Croix-Rouge) pour les
  déplacés internes — protocole d'échange chiffré similaire à BCID-AES.
- **Vote électronique pilote** : tests sur l'intégrité électorale
  pourraient préparer un pilote de vote dématérialisé sur diaspora.
  Hors scope V2.
- **Anonymisation différentielle** : ajouter du bruit Laplace sur les
  exports pour éviter les attaques de ré-identification statistique.

---

_Document 22 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
