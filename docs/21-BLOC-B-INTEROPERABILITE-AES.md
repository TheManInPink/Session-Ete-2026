# 21 — Bloc B : Interopérabilité AES (BCID-AES, mTLS, JWS Ed25519, interop-service)

> **Bloc concerné** : B (Priorité P1, post-Bloc-A) — interopérabilité
> transfrontalière Mali ⇄ Burkina Faso ⇄ Niger.
> **Prérequis** : Bloc A complet (docs 07 à 14) ; sécurité doc 15 (Vault PKI,
> mTLS) ; observabilité doc 17 ; déploiement K3s doc 20.
> **Durée estimée** : 12 à 16 heures pour un étudiant seul.
> **Livrables de cette étape** :
>
> - **`interop-service` (port 3006, NestJS)** — microservice frontière qui
>   reçoit/émet les requêtes BCID-AES (Border Citizen Identity — Alliance des
>   États du Sahel)
> - **Protocole BCID-AES v1** documenté : modèle requête-réponse minimaliste
>   (verbe `verify-nina`, `notify-cross-border-event`), schémas Zod stricts,
>   versionnage explicite (`v1`, `v2` futur)
> - **mTLS entre gateways nationaux** : Mali GW ↔ BFA GW ↔ NER GW via certs
>   client X.509 émis par la PKI Vault interne (cf. doc 15 §4.2). Chaque pays
>   présente son cert au peer.
> - **Signatures JWS Ed25519** sur les payloads applicatifs (en plus de
>   mTLS) — vérifiables par clé publique enregistrée dans une table
>   `aes_partner_keys` versionnée.
> - **Rate limiting** : 1 000 req/h/pays (limite contractuelle BCID-AES),
>   appliquée via Redis sorted set (`@nestjs/throttler` custom storage).
> - **Table `aes_verification_logs`** (audit cross-border 10 ans) : qui a
>   demandé, quel NINA, quelle réponse, signature de l'émetteur — chaîne
>   Merkle compatible audit-service (cf. ADR-014).
> - **Tableau de bord gouvernance** (`apps/governance` port 4003) avec onglet
>   « Interop AES » : volumétrie par pays, taux d'erreurs, rate limit
>   restant, dernier sync.
> - `docs/adr/ADR-021-protocole-bcid-aes-interop.md`

---

## 1. Objectif pédagogique

L'AES (Alliance des États du Sahel — Mali, Burkina Faso, Niger, depuis
septembre 2023) a besoin d'un protocole **souverain** pour vérifier
l'identité d'un citoyen malien qui traverse la frontière vers le Burkina
ou le Niger. Sans ce protocole, chaque vérification passe par des canaux
diplomatiques (ambassade, INTERPOL, CEDEAO) — trop lent pour un cas
opérationnel courant (contrôle routier, ouverture d'un compte bancaire
transfrontalier, scolarisation d'un enfant déplacé).

Trois leçons pédagogiques :

1. **Le protocole précède le code**. Un protocole d'interop mal défini
   se traduit en bugs récurrents pendant 10 ans. Cette étape passe
   ~30 % du temps sur la spec BCID-AES v1 (verbes, schémas, codes
   d'erreur, versionnage) AVANT d'écrire la 1ʳᵉ ligne de NestJS.

2. **Défense en profondeur** : mTLS **ET** JWS Ed25519. mTLS prouve
   « c'est bien la gateway BFA qui parle ». JWS prouve « le payload n'a
   pas été altéré et a été signé par le keystore BFA ». Compromis l'un
   ne suffit pas à forger un appel valide.

3. **Privacy by design** : un appel `verify-nina` ne retourne **jamais**
   le citoyen complet. Réponse minimaliste : `{ exists: true, valid:
   true, vulnerable: false, lastUpdated: '2026-04-15' }`. Le pays
   demandeur n'a aucun moyen de constituer une base parallèle des
   citoyens maliens à partir des réponses BCID-AES.

> 💡 **Souveraineté AES** : BCID-AES s'inspire de **eIDAS** (Union
> européenne) mais reste 100 % souverain Sahel. Pas de validation par
> l'UE, pas de dépendance à un trust framework américain. Les 3 pays
> opèrent leur propre PKI partagée.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                          | Version    | Rôle                                                |
| ---------------------------------- | ---------- | --------------------------------------------------- |
| **NestJS**                         | `11.1`     | Microservice `interop-service` (port 3006)         |
| **jose**                           | `6.2.3`    | JWS Ed25519 signing/verification                    |
| **@fastify/secure-session**        | `8.x`      | mTLS context propagation côté fastify             |
| **@nestjs/throttler**              | `6.4`      | Rate limiting custom storage Redis                  |
| **Zod**                            | `4.x`      | Validation schémas BCID-AES                         |
| **Vault PKI engine**               | `1.20`     | Émission certs X.509 mTLS (cf. doc 15)              |
| **Linkerd**                        | `2.16`     | mTLS sidecar interne K3s (mais pas pour BCID-AES   |
|                                    |            | inter-pays — c'est mTLS direct gateway-to-gateway) |
| **Prisma**                         | `7.8`      | Table `aes_verification_logs` + `aes_partner_keys` |
| **OpenAPI 3.1**                    | n/a        | Spec BCID-AES publiée (`docs/api/bcid-aes-v1.yaml`)|

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_InteropBCID
title Interop BCID-AES — vue cross-pays

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle  { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database   { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud      { BackgroundColor #ECFDF5; BorderColor #059669 }

cloud "Mali — CTDEC" {
  rectangle "interop-service\n:3006 (NestJS)\n+ mTLS server" as MLI
  database "Postgres\naes_verification_logs\n+ aes_partner_keys" as PGML
  rectangle "Vault PKI\n(cert client BFA, NER)" as VML
}

cloud "Burkina Faso — DGEC" {
  rectangle "interop-gateway-bfa\n+ mTLS client" as BFA
}

cloud "Niger — DGE-CIN" {
  rectangle "interop-gateway-ner\n+ mTLS client" as NER
}

BFA <-up-> MLI : mTLS\nverify-nina v1\nJWS Ed25519 payload
NER <-up-> MLI : mTLS\nverify-nina v1\nJWS Ed25519 payload
MLI <--> PGML
MLI <--> VML : auth k8s SA\nfetch peer pub keys

note bottom of MLI
  Rate limit : 1 000 req/h/pays
  (Redis sorted set sliding window)

  Schéma réponse (minimaliste) :
  { exists, valid, vulnerable,
    lastUpdated }
  → JAMAIS de nom, prénom, photo.
end note

note right of BFA
  BFA présente son cert
  client signé par CA AES.
  Le hash de la pub key
  est enregistré dans la
  table aes_partner_keys
  côté Mali.
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Spécification BCID-AES v1 (OpenAPI 3.1)

**Pourquoi** : un protocole formalisé permet à BFA et NER de générer leur
client SDK indépendamment du code Mali. La spec est versionnée
(`/api/v1/...`) — `v2` arrivera quand on ajoutera des verbes (ex.
`renew-nina-cross-border`).

**Fichier à créer** : `docs/api/bcid-aes-v1.yaml`

```yaml
openapi: 3.1.0
info:
  title: BCID-AES v1
  description: |
    Border Citizen Identity — Alliance des États du Sahel.
    Protocole d'interopérabilité Mali ⇄ BFA ⇄ Niger pour la vérification
    d'identité transfrontalière. Souverain, hors eIDAS, hors CEDEAO.
  version: 1.0.0
  license: { name: AES-Internal-License }

servers:
  - url: https://interop.nina-aes.ml/v1
    description: Gateway Mali (CTDEC)
  - url: https://interop.dgec.bf/v1
    description: Gateway Burkina Faso (DGEC) — à provisionner
  - url: https://interop.dge-cin.ne/v1
    description: Gateway Niger (DGE-CIN) — à provisionner

security:
  - mTLS: []
    JWSSignature: []

paths:
  /verify-nina:
    post:
      operationId: verifyNina
      summary: Vérifie l'existence et la validité d'un NINA chez le pays émetteur
      requestBody:
        required: true
        content:
          application/jose:                 # JWS compact (Ed25519)
            schema: { type: string }
      responses:
        '200':
          description: Réponse standard
          content:
            application/jose:
              schema: { type: string }       # JWS signé par le pays émetteur
        '404': { description: NINA inconnu }
        '410': { description: NINA révoqué (décès, fraude avérée) }
        '429': { description: Rate limit atteint (1000/h) }
        '500': { description: Erreur serveur }

  /notify-cross-border-event:
    post:
      operationId: notifyCrossBorderEvent
      summary: Notifie un événement (mariage, naissance, décès) à enregistrer au pays d'origine
      # … idem

components:
  schemas:
    VerifyNinaRequest:
      type: object
      required: [nina, requesterCountry, purpose, requestId]
      properties:
        nina: { type: string, pattern: '^[0-9]{14}[A-Z]$' }
        requesterCountry: { type: string, enum: [MLI, BFA, NER] }
        purpose:
          type: string
          enum: [border-control, bank-kyc, school-enrollment, healthcare, marriage-registration]
        requestId: { type: string, format: uuid }
        timestamp: { type: string, format: date-time }
    VerifyNinaResponse:
      type: object
      required: [exists, valid, lastUpdated]
      properties:
        exists: { type: boolean }
        valid: { type: boolean }
        vulnerable: { type: boolean, nullable: true }
        lastUpdated: { type: string, format: date }
      # PAS de nom, prénom, photo — privacy by design

  securitySchemes:
    mTLS:
      type: mutualTLS
    JWSSignature:
      type: http
      scheme: jose
      description: JWS Ed25519 obligatoire sur le body (payload signé)
```

---

### Étape 4.2 — Microservice `interop-service` (NestJS)

```ts
// services/interop-service/src/verify-nina/verify-nina.controller.ts
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { VerifyNinaService } from './verify-nina.service';
import { VerifyNinaRequestDto, VerifyNinaResponseDto } from './dto';

@Controller('v1')
export class VerifyNinaController {
  constructor(private readonly svc: VerifyNinaService) {}

  @Post('verify-nina')
  async verifyNina(
    @Body() jwsCompact: string,                          // raw JWS
    @Headers('x-aes-peer-country') peerCountry: 'BFA' | 'NER',
    @Headers('x-aes-peer-cert-fingerprint') peerFingerprint: string,
  ): Promise<string> {
    // 1) Le mTLS handshake a déjà validé la chaîne X.509 (Ingress Nginx + cert-manager)
    // 2) Vérifier le fingerprint du cert peer ↔ table aes_partner_keys
    await this.svc.assertPeerKnown(peerCountry, peerFingerprint);

    // 3) Vérifier le JWS Ed25519 + déserialiser le payload
    const request: VerifyNinaRequestDto = await this.svc.verifyJws(jwsCompact, peerCountry);

    // 4) Rate limit (1000/h glissant)
    await this.svc.enforceRateLimit(peerCountry);

    // 5) Logique métier : check NINA en lecture seule
    const response: VerifyNinaResponseDto = await this.svc.checkNina(request);

    // 6) Audit append-only (Merkle compatible)
    await this.svc.logVerification(request, response, peerCountry);

    // 7) Signer la réponse JWS Ed25519 avec la clé privée Mali
    return this.svc.signResponse(response);
  }
}
```

```ts
// services/interop-service/src/verify-nina/verify-nina.service.ts (extrait)
import { SignJWT, compactVerify, importJWK } from 'jose';
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class VerifyNinaService {
  async assertPeerKnown(country: string, fingerprint: string): Promise<void> {
    const known = await this.prisma.aesPartnerKey.findFirst({
      where: { country, certFingerprint: fingerprint, revokedAt: null },
    });
    if (!known) throw new ForbiddenException(`Unknown peer cert for ${country}`);
  }

  async verifyJws(jws: string, peerCountry: string): Promise<VerifyNinaRequestDto> {
    const key = await this.fetchPeerPublicKey(peerCountry);
    const { payload } = await compactVerify(jws, key, { algorithms: ['EdDSA'] });
    const parsed = VerifyNinaRequestSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    if (!parsed.success) throw new BadRequestException('Invalid request schema');
    return parsed.data;
  }

  async signResponse(response: VerifyNinaResponseDto): Promise<string> {
    const privateKey = await this.fetchOwnPrivateKey();  // depuis Vault Transit
    return await new SignJWT({ ...response })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: 'mli-2026-q2' })
      .setIssuedAt()
      .setIssuer('https://interop.nina-aes.ml')
      .setAudience(`aes:${peerCountry}`)
      .setExpirationTime('5m')
      .sign(privateKey);
  }
}
```

---

### Étape 4.3 — Tables Prisma `aes_partner_keys` + `aes_verification_logs`

```prisma
// packages/database/prisma/schema.prisma — extensions Bloc B

model AesPartnerKey {
  id              String    @id @default(uuid())
  country         String    // MLI | BFA | NER
  certFingerprint String    @unique   // SHA-256 du cert X.509
  publicKeyJwk    Json      // clé publique JWK Ed25519
  kid             String    @unique   // identifiant clé (ex: "bfa-2026-q2")
  validFrom       DateTime
  validUntil      DateTime
  revokedAt       DateTime?
  revokedReason   String?
  createdBy       String    // user id qui a enregistré
  createdAt       DateTime  @default(now())

  @@index([country, validUntil])
  @@map("aes_partner_keys")
}

model AesVerificationLog {
  id              BigInt    @id @default(autoincrement())
  timestamp       DateTime  @default(now())
  requestId       String    @unique
  requesterCountry String   // qui demande
  responderCountry String   // qui répond (= MLI ici)
  ninaQueried     String    // NINA demandé (audit, JAMAIS retourné dans la réponse)
  purpose         String
  responseExists  Boolean
  responseValid   Boolean
  jwsSignature    String    @db.Text    // copie du JWS retourné, pour preuve cryptographique
  merkleHash      String                // chaîne Merkle compatible audit-service
  prevHash        String?

  @@index([timestamp])
  @@index([requesterCountry, timestamp])
  @@index([ninaQueried])
  @@map("aes_verification_logs")
}
```

**Migration** :

```powershell
pnpm --filter @nina-aes/database exec prisma migrate dev --name bcid_aes_interop
```

---

### Étape 4.4 — Rate limiting cross-country (Redis sliding window)

```ts
// services/interop-service/src/throttle/aes-rate-limit.guard.ts
import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class AesRateLimitGuard implements CanActivate {
  private readonly LIMIT = 1000;
  private readonly WINDOW_SEC = 3600;

  constructor(private readonly redis: Redis) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const country = req.headers['x-aes-peer-country'] as string;
    const key = `aes:ratelimit:${country}`;
    const now = Date.now();

    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - this.WINDOW_SEC * 1000);
    pipe.zadd(key, now, `${now}:${req.headers['x-request-id']}`);
    pipe.zcard(key);
    pipe.expire(key, this.WINDOW_SEC);
    const [, , countRaw] = (await pipe.exec()) ?? [];
    const count = countRaw?.[1] as number;

    if (count > this.LIMIT) {
      throw new HttpException(
        `Rate limit exceeded for ${country} (max ${this.LIMIT}/h)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
```

---

### Étape 4.5 — Onglet « Interop AES » dans `apps/governance`

```tsx
// apps/governance/app/[locale]/interop-aes/page.tsx
import { fetchInteropStats } from '@nina-aes/api-client/interop';
import { InteropDashboard } from '@/components/InteropDashboard';

export default async function InteropPage() {
  const stats = await fetchInteropStats();    // dernières 24h par pays
  return <InteropDashboard stats={stats} />;
}
```

Composant qui affiche :

- Volumétrie horaire `verify-nina` par pays (graphe d'aires)
- Taux d'erreurs 4xx/5xx par pays
- Rate limit restant (jauge)
- Dernier sync de `aes_partner_keys` (info kid + valid until)
- Tableau des 50 dernières verifications avec drill-down vers
  `aes_verification_logs`

---

### Étape 4.6 — Provisionner les peer keys BFA + NER

Procédure manuelle V1 (V2 = échange automatisé via canal sécurisé) :

```bash
# 1) BFA génère une paire Ed25519 dans sa propre Vault
vault write -force transit/keys/aes-interop-bfa type=ed25519 exportable=true

# 2) BFA exporte sa clé publique en JWK
vault read -format=json transit/export/public-key/aes-interop-bfa > bfa-pubkey.json

# 3) Mali récupère le JSON par canal sécurisé (signal, courrier diplo, etc.)
# 4) Mali enregistre la clé
INSERT INTO aes_partner_keys (id, country, cert_fingerprint, public_key_jwk, kid, valid_from, valid_until, created_by)
VALUES (
  gen_random_uuid(),
  'BFA',
  'sha256:...',
  '{"kty":"OKP","crv":"Ed25519","x":"..."}'::jsonb,
  'bfa-2026-q2',
  '2026-05-01',
  '2027-05-01',
  'admin-mli'
);
```

---

## 5. Validation locale

```powershell
# 1) Démarrer le service local
pnpm --filter @nina-aes/interop-service dev

# 2) Générer un JWS de test signé par une clé BFA factice
node scripts/aes-test/gen-verify-nina-jws.mjs --country=BFA --nina=18903102015042V

# 3) POST vers le service
curl -X POST https://localhost:3006/v1/verify-nina \
  --cert ./certs/aes-bfa.pem --key ./certs/aes-bfa.key \
  -H "X-AES-Peer-Country: BFA" \
  -H "X-AES-Peer-Cert-Fingerprint: sha256:..." \
  -H "Content-Type: application/jose" \
  --data @./test-jws.txt

# 4) Vérifier en DB
docker exec nina-postgres psql -U nina_admin -d nina_aes_db -c \
  "SELECT requester_country, response_exists, response_valid FROM aes_verification_logs ORDER BY id DESC LIMIT 5;"
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                | Cause probable                                       | Solution                                                  |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| mTLS handshake fail `unknown CA`                        | Cert client BFA pas signé par la CA AES partagée    | Vérifier que la CA root AES est dans le truststore mali  |
| JWS verify : `signature verification failed`            | Clé publique BFA pas à jour (rotation Q2)            | Re-sync `aes_partner_keys` ; respecter le `kid` du header |
| Rate limit déclenche à 800 req au lieu de 1000          | Décalage NTP entre Redis et application              | NTP obligatoire ; éventuellement ajouter `margin=5%`     |
| Réponse contient `null` au lieu de `vulnerable: false`  | Citoyen sans catégorie vulnérabilité explicite       | Convention : `null` = pas de donnée ; mapper côté client  |
| Audit Merkle chain break sur logs cross-border          | Trigger BEFORE INSERT pas appliqué                   | Vérifier que le trigger `compute_merkle_hash` est attaché à la table |
| BFA reçoit `404 unknown peer cert`                      | Cert régénéré sans update DB Mali                    | Forcer la mise à jour de `cert_fingerprint` côté partner key |
| Tableau gouvernance ne montre rien                      | Pas de query Prometheus `aes_*_total` exposée        | Ajouter `Counter` Prometheus dans le service (cf. doc 17) |

---

## 7. Documentation à produire

- `docs/adr/ADR-021-protocole-bcid-aes-interop.md` — décision protocole
  custom BCID-AES vs eIDAS, OAuth Federation, SAML.
- `docs/api/bcid-aes-v1.yaml` — spec OpenAPI publiable aux partenaires
  BFA + NER.
- `docs/interop/PARTNER-ONBOARDING.md` — procédure pour intégrer un
  nouveau pays (Tchad ? Mauritanie ?) : générer paire Ed25519, échanger
  certs CA, signer protocole d'entente, premier appel test.
- Mise à jour `docs/CHANGELOG.md` §19 : livrables Bloc B.
- Mise à jour `docs/00-README-INDEX.md` : doc 21 livré.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc B Interop AES — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Spec BCID-AES v1** : ✅ OpenAPI publié, schémas Zod stricts
- **interop-service** : ✅ NestJS port 3006, mTLS + JWS Ed25519
- **Tables Prisma** : ✅ aes_partner_keys + aes_verification_logs migrées
- **Rate limit** : ✅ 1000/h/pays via Redis sliding window
- **Dashboard governance** : ✅ onglet « Interop AES » fonctionnel
- **Provisioning partners** : BFA ⏳ (en cours canal diplo), NER ⏳
- **Test E2E avec BFA factice** : ✅ 100/100 verify-nina passent
- **Difficultés** :
- **Prochaines actions** : signer convention BFA + NER ; doc 22 Bloc C
- **Captures jointes** : interop-dashboard.png, jws-decoded.png, rate-limit-graph.png
```

---

## 9. Checklist de fin d'étape

- [ ] `docs/api/bcid-aes-v1.yaml` rédigé et validé Spectral
- [ ] Migration Prisma `bcid_aes_interop` appliquée
- [ ] `interop-service` scaffold NestJS opérationnel
- [ ] mTLS handshake testé avec un cert BFA factice
- [ ] JWS Ed25519 signature + verification fonctionnels (`jose@6.2.3`)
- [ ] Rate limit Redis sliding window 1000/h/pays
- [ ] `AesPartnerKey` + `AesVerificationLog` seed avec 1 partner BFA factice
- [ ] Trigger Merkle chain sur `aes_verification_logs` (audit-compat)
- [ ] Onglet « Interop AES » dans `apps/governance`
- [ ] Counters Prometheus `aes_verify_nina_total{country}` exposés
- [ ] `PARTNER-ONBOARDING.md` rédigé
- [ ] `ADR-021` rédigé
- [ ] `docs/CHANGELOG.md` §19 mis à jour
- [ ] Tag Git `interop-mvp` posé
- [ ] Commit conventionnel : `feat(interop): BCID-AES v1 + mTLS + JWS Ed25519 + ADR-021`

---

## 10. Pour aller plus loin

- **Renouvellement automatique des peer keys** : sur expiration `valid_until`
  - 30 jours, déclencher un workflow d'échange JWK signé via le canal
  BCID-AES lui-même (verbe `rotate-key`).
- **Webhooks cross-border** : notification asynchrone des événements
  (mariage, décès) via RabbitMQ + JWS.
- **Sanctions partielles** : si BFA dépasse 3 fois son rate limit en 24 h,
  passer la limite à 500/h en `aes_partner_keys.degraded_mode = true`.
- **Audit cross-country trimestriel** : exécuter un export anonymisé des
  `aes_verification_logs` pour rapport aux 3 ministères.
- **eIDAS interop pont V3** : à long terme, gateway optionnelle pour
  citoyens UE résidant AES (mais via une CA tiers UE — politique).
- **Lectures recommandées** :
  - eIDAS Regulation EU 910/2014
  - RFC 8037 (CFRG Ed25519 JOSE)
  - RFC 7515 (JSON Web Signature)
  - NIST SP 800-63B Digital Identity Guidelines

---

_Document 21 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
