# 21 — Bloc B : Interopérabilité AES (BCID-AES, mTLS, JWS Ed25519, interop-service)

> 🚧 **Statut d'implémentation (honnêteté soutenance — 2026-06)** : ce document est un **guide de
> conception, Phase 2 (CONÇU, PAS ENCORE IMPLÉMENTÉ)**. À ce jour `services/interop-service` est un
> **scaffold NestJS/Express** réduit à un endpoint `/health` : il n'embarque **ni** `jose`, **ni**
> `ioredis`, **ni** `@noble/ed25519`, **ni** `@prisma/client`, **ni** `@nestjs/throttler`. Aucun des
> fichiers cités ci-dessous (`verify-nina.*`, `anti-replay.middleware.ts`,
> `aes-rate-limit.guard.ts`, `derive-peer.ts`, `security.e2e-spec.ts`) n'existe encore. Les modèles
> Prisma `AesPartnerKey` et la version « hash-chain » de `AesVerificationLog` montrés en §4.3 **ne
> sont pas** dans le `schema.prisma` committé (le modèle réel n'a ni `requestId @unique`, ni
> `entryHash`, ni `prevHash` ; cf. §4.3 ⚠️). Tous les contrôles de sécurité (anti-replay,
> identité-par-cert mTLS, JWS Ed25519, rate-limit fail-closed) sont donc à présenter comme **«
> conçus, Phase 2 »**, jamais comme acquis, tant que les **tests négatifs §5bis** ne sont pas verts.

> **Bloc concerné** : B (Priorité P1, post-Bloc-A) — interopérabilité transfrontalière Mali ⇄
> Burkina Faso ⇄ Niger. **Prérequis** : Bloc A complet (docs 07 à 14) ; sécurité doc 15 (Vault PKI,
> mTLS) ; observabilité doc 17 ; déploiement K3s doc 20. **Durée estimée** : 12 à 16 heures pour un
> étudiant seul. **Livrables de cette étape** :
>
> - **`interop-service` (port 3006, NestJS)** — microservice frontière qui reçoit/émet les requêtes
>   BCID-AES (Border Citizen Identity — Alliance des États du Sahel)
> - **Protocole BCID-AES v1** documenté : modèle requête-réponse minimaliste (verbe `verify-nina`,
>   `notify-cross-border-event`), schémas Zod stricts, versionnage explicite (`v1`, `v2` futur)
> - **mTLS entre gateways nationaux** : Mali GW ↔ BFA GW ↔ NER GW via certs client X.509 émis par la
>   PKI Vault interne (cf. doc 15 §4.2). Chaque pays présente son cert au peer.
> - **Signatures JWS Ed25519** sur les payloads applicatifs (en plus de mTLS) — vérifiables par clé
>   publique enregistrée dans une table `aes_partner_keys` versionnée.
> - **Rate limiting** : 1 000 req/h/pays (limite contractuelle BCID-AES), appliquée via Redis sorted
>   set (`@nestjs/throttler` custom storage).
> - **Table `aes_verification_logs`** (audit cross-border 10 ans) : qui a demandé, quel NINA, quelle
>   réponse, signature de l'émetteur — **hash-chain SHA-256** compatible audit-service (cf. ADR-007
>   ; ADR-014 = ancrage périodique de la racine chez un tiers OCLEI/Vérificateur Général). ⚠️ Ce
>   n'est **pas** un arbre de Merkle : l'audit NINA-AES est une **chaîne de hachage** (chaque log
>   lie `prevHash`), conforme au canon sécurité.
> - **Tableau de bord gouvernance** (`apps/governance` port 4003) avec onglet « Interop AES » :
>   volumétrie par pays, taux d'erreurs, rate limit restant, dernier sync.
> - `docs/adr/ADR-021-protocole-bcid-aes-interop.md`

---

## 1. Objectif pédagogique

L'AES (Alliance des États du Sahel — Mali, Burkina Faso, Niger, depuis septembre 2023) a besoin d'un
protocole **souverain** pour vérifier l'identité d'un citoyen malien qui traverse la frontière vers
le Burkina ou le Niger. Sans ce protocole, chaque vérification passe par des canaux diplomatiques
(ambassade, INTERPOL, CEDEAO) — trop lent pour un cas opérationnel courant (contrôle routier,
ouverture d'un compte bancaire transfrontalier, scolarisation d'un enfant déplacé).

Trois leçons pédagogiques :

1. **Le protocole précède le code**. Un protocole d'interop mal défini se traduit en bugs récurrents
   pendant 10 ans. Cette étape passe ~30 % du temps sur la spec BCID-AES v1 (verbes, schémas, codes
   d'erreur, versionnage) AVANT d'écrire la 1ʳᵉ ligne de NestJS.

2. **Défense en profondeur** : mTLS **ET** JWS Ed25519 (les deux, jamais l'un OU l'autre — cf.
   `security` OpenAPI §4.1). mTLS prouve « c'est bien la gateway BFA qui parle » — et l'identité du
   pays vient du **cert réel** terminé par l'ingress, **jamais** d'un header client (A01/A07, §4.7).
   JWS prouve « le payload n'a pas été altéré et a été signé par le keystore BFA » ; ses claims
   `jti`/`nbf`/`exp` + un middleware **anti-replay** (§4.2bis) empêchent le **rejeu**. Compromis
   l'un ne suffit pas à forger un appel valide.

3. **Privacy by design** : un appel `verify-nina` ne retourne **jamais** le citoyen complet. Réponse
   minimaliste : `{ exists: true, valid: true, vulnerable: false, lastUpdated: '2026-04-15' }`. Le
   pays demandeur n'a aucun moyen de constituer une base parallèle des citoyens maliens à partir des
   réponses BCID-AES.

> 💡 **Souveraineté AES** : BCID-AES s'inspire de **eIDAS** (Union européenne) mais reste 100 %
> souverain Sahel. Pas de validation par l'UE, pas de dépendance à un trust framework américain. Les
> 3 pays opèrent leur propre PKI partagée.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant             | Version | Rôle                                                |
| --------------------- | ------- | --------------------------------------------------- |
| **NestJS**            | `11.1`  | Microservice `interop-service` (port 3006)          |
| **jose**              | `6.2.3` | JWS Ed25519 signing/verification                    |
| **Ingress NGINX**     | `1.12`  | Terminaison mTLS + injection cert pair (cf. §4.7)   |
| **@nestjs/throttler** | `6.4`   | Rate limiting custom storage Redis                  |
| **Zod**               | `4.x`   | Validation schémas BCID-AES                         |
| **Vault PKI engine**  | `1.20`  | Émission certs X.509 mTLS (cf. doc 15)              |
| **Linkerd**           | `2.16`  | mTLS sidecar interne K3s (mais pas pour BCID-AES    |
|                       |         | inter-pays — c'est mTLS direct gateway-to-gateway)  |
| **Prisma**            | `7.8`   | Table `aes_verification_logs` + `aes_partner_keys`  |
| **OpenAPI 3.2**       | n/a     | Spec BCID-AES publiée (`docs/api/bcid-aes-v1.yaml`) |

> ⚠️ **Correction (v1.1)** : les versions antérieures de ce doc listaient `@fastify/secure-session`
> comme « propagation du contexte mTLS ». C'était **faux** : `@fastify/secure-session` est une lib
> de **session cookie chiffrée** (X25519 + XSalsa20-Poly1305 via libsodium), elle n'a **rien** à
> voir avec mTLS et n'expose **pas** le cert pair. Le contexte mTLS (cert client validé) provient de
> l'**Ingress NGINX** qui termine le handshake et **injecte** le cert vérifié dans des en-têtes
> serveur-only (cf. §4.7). Ne jamais reconstruire le contexte mTLS depuis une lib de session.

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

### Étape 4.1 — Spécification BCID-AES v1 (OpenAPI 3.2)

**Pourquoi** : un protocole formalisé permet à BFA et NER de générer leur client SDK indépendamment
du code Mali. La spec est versionnée (`/api/v1/...`) — `v2` arrivera quand on ajoutera des verbes
(ex. `renew-nina-cross-border`).

**Fichier à créer** : `docs/api/bcid-aes-v1.yaml`

```yaml
openapi: 3.2.0
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

# Sécurité = mTLS ET JWS (défense en profondeur, pas un OR).
# En OpenAPI, les deux schémas DANS LE MÊME objet de la liste = AND logique :
# le client doit présenter un cert mTLS valide ET un body JWS Ed25519 valide.
# ⚠️ Erreur classique à NE PAS faire (= OR, l'un OU l'autre suffit) :
#   security:
#     - mTLS: []
#     - JWSSignature: []     # ← deux entrées de liste = OR : INTERDIT ici
security:
  - mTLS: [] # ┐ même objet de liste
    JWSSignature: [] # ┘ = mTLS AND JWS (les deux obligatoires)

paths:
  /verify-nina:
    post:
      operationId: verifyNina
      summary: Vérifie l'existence et la validité d'un NINA chez le pays émetteur
      requestBody:
        required: true
        content:
          application/jose: # JWS compact (Ed25519)
            schema: { type: string }
      responses:
        '200':
          description: Réponse standard
          content:
            application/jose:
              schema: { type: string } # JWS signé par le pays émetteur
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
      # requestId ET timestamp sont OBLIGATOIRES : ils alimentent l'anti-replay (§4.2bis).
      required: [nina, requesterCountry, purpose, requestId, timestamp]
      properties:
        nina: { type: string, pattern: '^[0-9]{14}[A-Z]$' }
        requesterCountry: { type: string, enum: [MLI, BFA, NER] }
        purpose:
          type: string
          enum: [border-control, bank-kyc, school-enrollment, healthcare, marriage-registration]
        requestId: { type: string, format: uuid } # idempotence + anti-replay (= jti du JWS)
        timestamp: { type: string, format: date-time } # fenêtre ±2 min anti-replay
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
      description: |
        Cert client X.509 émis par la CA AES partagée. Le handshake est terminé
        par l'Ingress NGINX, qui INJECTE le cert pair vérifié dans des en-têtes
        serveur-only (ssl-client-*). Le fingerprint dérivé est confronté à
        aes_partner_keys. JAMAIS dérivé d'un header fourni par le client.
    JWSSignature:
      # `http` + `scheme: jose` n'est pas un scheme HTTP standard ; on documente
      # explicitement un JWS détaché-en-body. Le JWS de requête DOIT porter les
      # claims protégés : jti (= requestId), iat, nbf, exp (≤ 5 min), iss, aud.
      type: http
      scheme: jose
      bearerFormat: JWS-Ed25519-compact
      description: |
        JWS Ed25519 (EdDSA, alg figé) obligatoire sur le body. Claims protégés
        exigés : jti (= requestId, anti-replay), iat, nbf (not-before), exp,
        iss (pays émetteur), aud (= aes:MLI). Le serveur vérifie nbf/exp et
        rejette tout jti déjà vu (cf. §4.2bis anti-replay).
```

---

### Étape 4.2 — Microservice `interop-service` (NestJS)

```ts
// services/interop-service/src/verify-nina/verify-nina.controller.ts
// ⚠️ ADAPTER L'ADAPTATEUR HTTP : le scaffold actuel d'interop-service tourne sur
//    @nestjs/platform-express (PAS Fastify). Soit on type `req: Request` (express),
//    soit on bascule explicitement le service sur platform-fastify AVANT d'utiliser
//    le typage ci-dessous. Ne pas importer `fastify` tant que la dépendance n'est pas
//    ajoutée et le bootstrap (main.ts) migré — sinon le code ne compile pas.
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express'; // adaptateur réel du scaffold (cf. package.json)
import { VerifyNinaService } from './verify-nina.service';
import { VerifyNinaRequestDto, VerifyNinaResponseDto } from './dto';

@Controller('v1')
export class VerifyNinaController {
  constructor(private readonly svc: VerifyNinaService) {}

  @Post('verify-nina')
  async verifyNina(
    @Body() jwsCompact: string, // raw JWS compact (Content-Type: application/jose)
    @Req() req: Request,
  ): Promise<string> {
    // ─────────────────────────────────────────────────────────────────────────
    // (0) IDENTITÉ DU PAIR = dérivée du cert mTLS RÉEL, JAMAIS d'un header client.
    //
    //     ❌ AVANT (faille A01/A07 — Broken Access Control / Identification) :
    //        @Headers('x-aes-peer-country')          peerCountry
    //        @Headers('x-aes-peer-cert-fingerprint') peerFingerprint
    //     Ces deux en-têtes sont 100 % contrôlés par le client : n'importe qui
    //     ayant un cert mTLS valide (même un partenaire) pouvait se déclarer
    //     « BFA » et présenter un fingerprint arbitraire → usurpation de pays.
    //
    //     ✅ MAINTENANT : on lit le cert pair VÉRIFIÉ injecté par l'Ingress NGINX
    //     dans des en-têtes serveur-only (l'ingress les STRIPPE en entrée puis les
    //     réécrit après handshake — un client ne peut pas les forger, cf. §4.7).
    //     Le fingerprint est recalculé en interne, pas lu d'un header de valeur.
    const peer = this.svc.derivePeerFromMtls(req); // { country, certFingerprint }

    // (1) Le fingerprint dérivé du cert mTLS réel ↔ table aes_partner_keys (non révoqué)
    await this.svc.assertPeerKnown(peer.country, peer.certFingerprint);

    // (2) Vérifier le JWS Ed25519 (alg figé EdDSA) + nbf/exp + déserialiser le payload.
    //     verifyJws échoue si nbf futur, exp dépassé, aud ≠ aes:MLI, iss ≠ peer.country.
    const { request, jti } = await this.svc.verifyJws(jwsCompact, peer.country);

    // (2bis) ANTI-REPLAY — AVANT toute logique métier (le @unique DB ne suffit pas :
    //        il rejette à l'INSERT, donc APRÈS le travail + il leake via une 500/409
    //        non maîtrisée, et il ne couvre pas la fenêtre timestamp). On rejette ici
    //        tout jti/requestId déjà vu (cache Redis SET NX) + timestamp hors ±2 min.
    await this.svc.assertNotReplayed(jti, request.requestId, request.timestamp);

    // (3) Rate limit (1000/h glissant) — fail-CLOSED si Redis est indisponible (§4.4)
    await this.svc.enforceRateLimit(peer.country);

    // (4) Logique métier : check NINA en lecture seule
    const response: VerifyNinaResponseDto = await this.svc.checkNina(request);

    // (5) Audit append-only (hash-chain SHA-256 compatible audit-service, cf. ADR-007)
    await this.svc.logVerification(request, response, peer.country);

    // (6) Signer la réponse JWS Ed25519 avec la clé privée Mali (cf. modèle de clé §4.2ter)
    return this.svc.signResponse(response, peer.country);
  }
}
```

> 🛡️ **A01/A07 — pourquoi ne JAMAIS faire confiance à un header d'identité client** :
> `X-AES-Peer-Country` et `X-AES-Peer-Cert-Fingerprint` étaient fournis par l'appelant. Un
> partenaire légitimement authentifié en mTLS (donc avec un cert valide signé par la CA AES) pouvait
> quand même **mentir** sur son pays et son fingerprint dans ces headers — c'est une **élévation
> d'identité** (OWASP A01 Broken Access Control + A07 Identification Failures). La seule source de
> vérité de l'identité du pair est le **cert présenté pendant le handshake TLS**, que seul l'ingress
> (qui a terminé ce handshake) peut attester. Voir §4.7 pour la chaîne ingress → en-têtes
> `ssl-client-*`.

```ts
// services/interop-service/src/verify-nina/verify-nina.service.ts (extrait)
import { SignJWT, jwtVerify, importJWK, type JWTPayload } from 'jose';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

const SELF_ISS = 'https://interop.nina-aes.ml';
const SELF_AUD_PREFIX = 'aes:'; // aud du JWS de requête doit valoir aes:MLI
const REPLAY_WINDOW_MS = 2 * 60 * 1000; // ±2 minutes (clock skew toléré)

@Injectable()
export class VerifyNinaService {
  async assertPeerKnown(country: string, fingerprint: string): Promise<void> {
    const known = await this.prisma.aesPartnerKey.findFirst({
      where: { country, certFingerprint: fingerprint, revokedAt: null },
    });
    if (!known) throw new ForbiddenException(`Unknown peer cert for ${country}`);
  }

  // jwtVerify (et non compactVerify brut) pour valider nbf/exp/aud/iss nativement,
  // alg figé à EdDSA (interdit l'algorithm-confusion / "alg: none").
  async verifyJws(
    jws: string,
    peerCountry: string,
  ): Promise<{ request: VerifyNinaRequestDto; jti: string }> {
    const key = await this.fetchPeerPublicKey(peerCountry); // JWK Ed25519 du partenaire
    const { payload } = await jwtVerify(jws, key, {
      algorithms: ['EdDSA'], // figé : aucune négociation d'algorithme
      issuer: this.expectedIssuerFor(peerCountry), // iss == émetteur du pays pair
      audience: `${SELF_AUD_PREFIX}MLI`, // aud == nous (Mali)
      clockTolerance: 120, // ±2 min ⇒ valide nbf/exp avec le même skew que l'anti-replay
      requiredClaims: ['jti', 'iat', 'nbf', 'exp'], // jti obligatoire pour l'anti-replay
    });
    const p = payload as JWTPayload & Record<string, unknown>;
    if (!p.jti || typeof p.jti !== 'string') throw new BadRequestException('JWS missing jti');

    const parsed = VerifyNinaRequestSchema.safeParse(p);
    if (!parsed.success) throw new BadRequestException('Invalid request schema');
    // Cohérence : jti (claim protégé, signé) DOIT égaler requestId (claim métier).
    if (parsed.data.requestId !== p.jti) {
      throw new BadRequestException('requestId/jti mismatch');
    }
    return { request: parsed.data, jti: p.jti };
  }

  // (2bis) ANTI-REPLAY — SET NX atomique sur Redis + contrôle de fenêtre timestamp.
  async assertNotReplayed(jti: string, requestId: string, timestamp: string): Promise<void> {
    // a) Fenêtre temporelle : le payload signé doit être « frais » (±2 min).
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
      throw new BadRequestException('Request timestamp outside ±2min window (replay?)');
    }
    // b) Unicité du jti : SET NX = pose la clé seulement si absente. TTL = fenêtre + marge,
    //    suffisant car un replay hors fenêtre est déjà rejeté en (a). On NE s'appuie PAS sur
    //    le @unique DB : il rejette trop tard (après le travail métier) et fail-open si l'INSERT
    //    audit est différé. Ici on rejette AVANT toute logique métier.
    let posed: 'OK' | null;
    try {
      posed = await this.redis.set(
        `aes:replay:${jti}`,
        requestId,
        'PX',
        REPLAY_WINDOW_MS + 60_000,
        'NX',
      );
    } catch {
      // Fail-CLOSED : si Redis tombe, on REFUSE plutôt que de risquer un replay accepté.
      throw new ServiceUnavailableException('Replay store unavailable — request refused');
    }
    if (posed !== 'OK') throw new ForbiddenException('Replay detected (jti already seen)');
  }

  // ⚠️ Bug corrigé : `peerCountry` est désormais un PARAMÈTRE (avant il était
  // référencé dans setAudience sans être défini → `undefined`, aud cassé "aes:undefined").
  async signResponse(response: VerifyNinaResponseDto, peerCountry: string): Promise<string> {
    // MODÈLE DE CLÉ — voir §4.2ter : Vault Transit ne supporte PAS Ed25519, donc on signe
    // IN-PROCESS via jose/@noble (alg EdDSA), clé chargée depuis Vault KV + lease court.
    // ⚠️ NE PAS appeler transit/sign ici (non supporté pour Ed25519).
    const privateKey = await this.loadEphemeralEd25519FromVaultKv(); // KV + lease, jamais persistée
    return await new SignJWT({ ...response })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: 'mli-2026-q2' })
      .setJti(crypto.randomUUID()) // jti unique côté réponse aussi
      .setIssuedAt()
      .setNotBefore('0s') // nbf explicite
      .setIssuer(SELF_ISS)
      .setAudience(`${SELF_AUD_PREFIX}${peerCountry}`) // ✅ peerCountry défini → aud:aes:BFA correct
      .setExpirationTime('5m')
      .sign(privateKey);
  }
}
```

> 🐛 **Bug `peerCountry` corrigé** : dans l'ancien `signResponse`,
> `setAudience(\`aes:${peerCountry}\`)` référençait une variable **hors scope** (`peerCountry`n'était pas paramètre) → en TypeScript strict ça ne compile pas, en JS transpilé permissif ça produit`aud:
> "aes:undefined"`, et le partenaire rejette (ou pire, accepte) une réponse mal adressée. Désormais `peerCountry`
> est passé explicitement par le contrôleur (lui-même issu du cert mTLS réel, pas d'un header).

---

### Étape 4.2bis — Middleware ANTI-REPLAY (AVANT toute logique métier)

**Pourquoi le `@unique` DB ne suffit pas** : la contrainte `@@unique` sur `requestId` (cf. §4.3) ne
se déclenche qu'à l'**INSERT** du log d'audit — c'est-à-dire **après** la vérification du NINA, la
lecture en base et la signature de la réponse. Un attaquant qui rejoue une requête capturée :

1. obtient quand même le traitement métier complet (coût CPU/DB, fuite de timing) ;
2. déclenche une violation de contrainte tardive (`P2002`) souvent mal mappée → `500` ou `409` qui
   **leake** l'existence du log ;
3. n'est **pas** borné dans le temps : le `@unique` rejette un replay à J+1 comme à J+10 ans, mais
   ne dit rien d'une requête « fraîche » rejouée 100 fois en rafale dans la même seconde.

Le **middleware anti-replay** s'exécute donc **après** la vérification JWS (on a besoin du `jti`
signé) mais **avant** `checkNina` :

```ts
// services/interop-service/src/replay/anti-replay.middleware.ts
//
// Implémenté comme étape explicite dans le contrôleur (cf. svc.assertNotReplayed) plutôt qu'en
// NestMiddleware, car on a besoin du jti issu de la vérification JWS — qui dépend de la clé du
// pair, elle-même dérivée du cert mTLS. L'ordre est donc :
//   cert mTLS (ingress) → assertPeerKnown → verifyJws (donne jti) → ANTI-REPLAY → métier.
//
// Deux barrières cumulatives :
//   (a) FENÊTRE TIMESTAMP : |now - payload.timestamp| ≤ 2 min  → rejette les vieux replays.
//   (b) UNICITÉ jti       : Redis SET key NX PX               → rejette les replays « frais ».
//
// SET ... NX est ATOMIQUE (pas de race read-then-write). Le TTL (fenêtre + 60 s de marge) suffit :
// au-delà, la barrière (a) prend le relais, donc inutile de garder le jti éternellement en Redis.
//
// FAIL-CLOSED : si Redis est injoignable, assertNotReplayed throw 503 (cf. §4.2 service) — on
// REFUSE la requête. Accepter « au cas où » ouvrirait une fenêtre de replay non maîtrisée.
```

> 🔁 **Défense en profondeur du rejeu** : la fenêtre `nbf`/`exp` du JWS (vérifiée par `jwtVerify`),
> la fenêtre `timestamp` ±2 min (métier) et l'unicité `jti` (Redis) sont **trois** contrôles
> indépendants. Le `@unique` DB reste en dernier filet (defense-in-depth) mais n'est jamais le
> contrôle primaire.

---

### Étape 4.2ter — Modèle de clé : il faut TRANCHER (Vault Transit ne sort pas la clé)

Deux questions distinctes, souvent confondues, qu'il faut séparer :

1. **« Où vit la clé privée ? »** → Vault **ne laisse JAMAIS sortir** une clé Transit
   (`exportable=false`). Donc soit on signe **dans Vault** (la clé ne quitte pas le coffre), soit on
   sort une clé d'un autre store (KV) pour signer **en process** avec `jose`/`@noble`. On ne peut
   pas « avoir le beurre et l'argent du beurre » : `jose.SignJWT().sign(privateKey)` **exige** une
   clé privée en RAM, ce que Transit interdit par construction.

2. **« Quel algorithme ? »** → ici **Ed25519** (EdDSA), imposé par le protocole BCID-AES.

**Le piège canon (ADR-026/034)** : Vault **Transit ne supporte PAS Ed25519** pour la signature
applicative. On **ne peut donc pas** signer le JWS Ed25519 « dans Vault » via `transit/sign`. La
combinaison « clé jamais sortie **ET** Ed25519 » n'est pas réalisable avec Transit.

**Décision tranchée (canon-aligné, modèle doc 09)** : signature JWS Ed25519 **IN-PROCESS via
`@noble/ed25519`** (comme le scellement audit), la clé privée étant chargée depuis un **secret Vault
KV à durée de vie courte (lease)**, jamais codée en dur, jamais un `VAULT_TOKEN` long-lived. On
**n'utilise PAS** `transit/sign` pour Ed25519 (non supporté).

| Critère                      | Vault Transit `sign` (Ed25519) | jose/@noble in-process Ed25519 ✅ retenu |
| ---------------------------- | ------------------------------ | ---------------------------------------- |
| Ed25519 supporté ?           | ❌ NON (canon ADR-026/034)     | ✅ OUI (`@noble/ed25519`)                |
| Clé privée en RAM du service | (n/a, non supporté)            | Oui, mais **éphémère** (lease KV court)  |
| Source de la clé             | —                              | Vault **KV** + lease, jamais hard-codée  |
| Rotation                     | —                              | Rotation du secret KV + `kid` versionné  |

> 🧭 **Alternative documentée** : si l'on voulait « clé jamais en RAM », il faudrait changer
> d'algorithme (ex. **RS256 via Transit `rsa-4096`**, supporté) — mais cela **casserait** le
> protocole BCID-AES qui impose Ed25519 côté pairs. Le QR souverain utilise déjà **RS256 Transit**
> (ADR-026/034) pour cette raison ; ici l'interop reste **Ed25519 in-process**. Acter ce choix dans
> l'**ADR-021** et **ne pas mélanger** les deux voies dans le même service.

```ts
// services/interop-service/src/keys/ed25519-signer.ts (extrait — voie in-process @noble, canon doc 09)
//
// signResponse() ci-dessus appelle ce signer (et NON transit/sign, non supporté pour Ed25519).
//   1) charge la clé privée Ed25519 depuis Vault KV via SA k8s + lease court (TTL minutes)
//   2) signe le JWS compact avec jose (alg EdDSA) — clé en RAM mais éphémère, jamais persistée
//   3) la clé est zéroïsée après usage ; rotation = nouveau secret KV + nouveau kid
//
// Auth Vault = Kubernetes ServiceAccount + lease court (canon : pas de VAULT_TOKEN long-lived,
// pas de clé en clair, pas d'AWS KMS/US sur le cœur).
```

---

### Étape 4.3 — Tables Prisma `aes_partner_keys` + `aes_verification_logs`

> ⚠️ **DRIFT SCHÉMA À RÉSORBER (état committé ≠ cible ci-dessous)** : le `schema.prisma` actuel **ne
> contient PAS** de modèle `AesPartnerKey`, et son `AesVerificationLog` réel **diffère** de la cible
> ci-dessous — il n'a **ni** `requestId @unique`, **ni** `entryHash`, **ni** `prevHash` (il expose
> `requestedNinaHash`, `requestType`, `result`, `signature`, `correlationId`). Le NINA n'est
> **jamais** persisté en clair (data-minimization, privacy by design) : seul le hash SHA-256
> `requestedNinaHash` est conservé pour la corrélation/audit ; l'ancienne colonne `targetNina` (NINA
> en clair) a été **supprimée** suite à la revue sécurité Bloc B. Conséquence : (1) le « @unique DB
> en dernier filet » invoqué en §4.2 / §4.2bis **n'existe pas encore** (il n'y a pas de colonne
> `requestId` unique) — l'anti-replay Redis est donc, en l'état, le **seul** rempart, ce qui
> renforce l'exigence fail-CLOSED ; (2) le **hash-chain** (`entryHash` / `prevHash`) référencé comme
> « compatible ADR-007 » **n'est pas matérialisé** dans la table actuelle. Cette migration
> `bcid_aes_interop` est un **livrable Phase 2**, pas un acquis. Tant qu'elle n'est pas appliquée,
> présenter ces tables comme **« conçues »**.

```prisma
// packages/database/prisma/schema.prisma — extensions Bloc B (CIBLE Phase 2 — non encore committée)

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
  entryHash       String                // SHA-256(entry || prevHash) — maillon hash-chain (ADR-007)
  prevHash        String?               // hash du log précédent (chaînage append-only)

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
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class AesRateLimitGuard implements CanActivate {
  private readonly LIMIT = 1000;
  private readonly WINDOW_SEC = 3600;

  constructor(private readonly redis: Redis) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // ✅ Le pays vient du cert mTLS RÉEL (req.aesPeer, posé par §4.7), PAS d'un header client.
    //    ❌ AVANT : req.headers['x-aes-peer-country'] → un client pouvait usurper un autre pays
    //    pour brûler son quota ou contourner le sien (A01).
    const country = (req as { aesPeer?: { country?: string } }).aesPeer?.country;
    if (!country) throw new HttpException('Missing mTLS peer identity', HttpStatus.FORBIDDEN);

    const key = `aes:ratelimit:${country}`;
    const now = Date.now();
    const member = `${now}:${req.id ?? crypto.randomUUID()}`; // id interne, pas de header X-Request-Id

    let countRaw: unknown;
    try {
      const pipe = this.redis.pipeline();
      pipe.zremrangebyscore(key, 0, now - this.WINDOW_SEC * 1000);
      pipe.zadd(key, now, member);
      pipe.zcard(key);
      pipe.expire(key, this.WINDOW_SEC);
      const res = (await pipe.exec()) ?? [];
      // Détecte aussi les erreurs par-commande dans la pipeline (res[i][0] = error).
      for (const entry of res) {
        if (entry?.[0]) throw entry[0];
      }
      countRaw = res?.[2]?.[1];
    } catch {
      // ── FAIL-CLOSED ── Si Redis est indisponible, on REFUSE (503) au lieu de laisser passer.
      // Laisser passer (fail-open) permettrait de pulvériser la limite contractuelle 1000/h/pays
      // pendant toute la panne Redis → on choisit la sûreté sur la disponibilité.
      throw new ServiceUnavailableException('Rate-limit store unavailable — request refused');
    }

    const count = countRaw as number;
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

> 🔒 **Fail-CLOSED assumé** : pour une frontière contractuelle (1000 req/h/pays), on préfère
> **refuser** pendant une panne Redis plutôt que risquer un dépassement massif non comptabilisé. Le
> `503` est temporaire et retryable côté partenaire ; un fail-open serait silencieux et exploitable.

---

### Étape 4.5 — Onglet « Interop AES » dans `apps/governance`

```tsx
// apps/governance/app/[locale]/interop-aes/page.tsx
import { fetchInteropStats } from '@nina-aes/api-client/interop';
import { InteropDashboard } from '@/components/InteropDashboard';

export default async function InteropPage() {
  const stats = await fetchInteropStats(); // dernières 24h par pays
  return <InteropDashboard stats={stats} />;
}
```

Composant qui affiche :

- Volumétrie horaire `verify-nina` par pays (graphe d'aires)
- Taux d'erreurs 4xx/5xx par pays
- Rate limit restant (jauge)
- Dernier sync de `aes_partner_keys` (info kid + valid until)
- Tableau des 50 dernières verifications avec drill-down vers `aes_verification_logs`

---

### Étape 4.6 — Provisionner les peer keys BFA + NER

Procédure manuelle V1 (V2 = échange automatisé via canal sécurisé) :

> ℹ️ **Côté BFA = hors de notre contrôle.** BFA choisit son propre store de clés. Si BFA s'aligne
> sur la convention NINA-AES (cf. §4.2ter), il génère sa paire Ed25519 **in-process**
> (`@noble`/openssl) et la stocke en Vault **KV** — **pas** en Transit (qui ne signe pas l'Ed25519).
> Mali n'a besoin que de la **clé publique JWK** + le **fingerprint du cert**. Les commandes
> ci-dessous sont **illustratives**.

```bash
# 1) BFA génère une paire Ed25519 (in-process — Transit ne gère pas Ed25519, cf. §4.2ter)
openssl genpkey -algorithm ed25519 -out bfa-interop.key   # clé privée → reste chez BFA
# (ou via une lib @noble ; puis stockage en Vault KV côté BFA, jamais Transit pour Ed25519)

# 2) BFA dérive sa clé publique au format JWK (outil interne BFA) → bfa-pubkey.json
#    (seule la clé PUBLIQUE quitte BFA ; la privée ne sort jamais de son store KV)

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

### Étape 4.7 — Injection du cert pair mTLS par l'Ingress NGINX (source de vérité)

L'identité du pays pair **doit** provenir du **cert présenté pendant le handshake TLS réel**,
terminé par l'**Ingress NGINX**. Le client ne peut pas forger ces en-têtes : NGINX les **strippe en
entrée** puis les **réécrit** après vérification de la chaîne contre la CA AES.

```yaml
# k8s/interop-service/ingress.yaml — extrait commenté (DOCS-ONLY, ne pas appliquer tel quel)
metadata:
  annotations:
    nginx.ingress.kubernetes.io/auth-tls-verify-client: 'on' # mTLS obligatoire
    nginx.ingress.kubernetes.io/auth-tls-secret: 'nina/aes-ca-bundle' # CA AES partagée
    nginx.ingress.kubernetes.io/auth-tls-verify-depth: '2'
    # NGINX passe le cert vérifié dans des en-têtes SERVEUR-ONLY (réécrits, non spoofables) :
    nginx.ingress.kubernetes.io/auth-tls-pass-certificate-to-upstream: 'true'
    # En interne, NGINX EFFACE d'abord tout X-AES-Peer-* / ssl-client-* venant du client,
    # puis injecte ssl-client-cert (PEM url-encodé), ssl-client-verify, ssl-client-fingerprint.
```

```ts
// services/interop-service/src/peer/derive-peer.ts — dérivation côté service
// derivePeerFromMtls(req) :
//   1) exige ssl-client-verify == 'SUCCESS' (sinon ForbiddenException)
//   2) lit le PEM injecté (ssl-client-cert), recalcule le fingerprint SHA-256 EN INTERNE
//      (on NE fait PAS confiance à une valeur de fingerprint pré-calculée fournie en header)
//   3) mappe le SubjectDN/SAN du cert → pays (table de correspondance interne, pas un header)
// Résultat : { country, certFingerprint } 100 % issu du handshake, jamais du client.
//
// ⚠️ Le service doit aussi refuser le trafic qui n'est PAS passé par l'ingress (NetworkPolicy :
//    seul l'ingress-controller peut atteindre :3006), sinon un pod interne pourrait forger les
//    en-têtes ssl-client-*.
```

> 🔑 **Chaîne de confiance** :
> `handshake TLS (cert client) → NGINX vérifie vs CA AES → en-têtes ssl-client-* serveur-only → derivePeerFromMtls recalcule le fingerprint → aes_partner_keys`.
> Aucun maillon ne lit une valeur d'identité fournie par le client. C'est ce qui rend l'usurpation
> A01/A07 impossible même pour un partenaire authentifié.

---

## 5. Validation locale

```powershell
# 1) Démarrer le service local
pnpm --filter @nina-aes/interop-service dev

# 2) Générer un JWS de test signé par une clé BFA factice
node scripts/aes-test/gen-verify-nina-jws.mjs --country=BFA --nina=18903102015042V

# 3) POST vers le service — l'identité du pays vient du CERT mTLS (--cert/--key), PAS d'un header.
#    Les anciens en-têtes X-AES-Peer-Country / X-AES-Peer-Cert-Fingerprint sont SUPPRIMÉS :
#    ils étaient spoofables (A01/A07) et sont désormais ignorés/strippés par l'ingress (§4.7).
curl -X POST https://localhost:3006/v1/verify-nina \
  --cert ./certs/aes-bfa.pem --key ./certs/aes-bfa.key \
  -H "Content-Type: application/jose" \
  --data @./test-jws.txt
# (le JWS de test doit porter jti=requestId, nbf, exp ≤5min, iss=BFA, aud=aes:MLI — sinon 400)

# 4) Vérifier en DB
docker exec nina-postgres psql -U nina_admin -d nina_aes_db -c \
  "SELECT requester_country, response_exists, response_valid FROM aes_verification_logs ORDER BY id DESC LIMIT 5;"
```

---

## 5bis. Tests négatifs de sécurité (obligatoires)

Les tests « happy path » (verify-nina valide → 200) ne prouvent **rien** sur la sécurité. Les
contrôles ajoutés (anti-replay, mTLS réel, JWS, rate-limit) ne sont validés que par des tests qui
**tentent l'attaque et exigent un rejet**. Chaque cas doit être vert (= correctement refusé).

```ts
// services/interop-service/test/security.e2e-spec.ts (extrait — squelette de tests négatifs)
describe('verify-nina — tests négatifs de sécurité', () => {
  it('JWS forgé (signé par une clé inconnue) → 401/403', async () => {
    const jws = await signWith(attackerEd25519Key, validPayload); // clé NON enregistrée
    const res = await postVerifyNina(jws, { cert: bfaCert });
    expect(res.status).toBeGreaterThanOrEqual(401); // jwtVerify échoue (signature invalide)
  });

  it('alg confusion ("alg":"none" ou HS256) → rejeté', async () => {
    const jws = forgeAlgNone(validPayload); // tente de contourner la signature
    const res = await postVerifyNina(jws, { cert: bfaCert });
    expect(res.status).toBeGreaterThanOrEqual(400); // algorithms:['EdDSA'] figé → refus
  });

  it('cert pair RÉVOQUÉ (revokedAt non null) → 403 unknown peer', async () => {
    await revokePartnerKey('BFA'); // simulate révocation côté aes_partner_keys
    const res = await postVerifyNina(validJws, { cert: bfaCert });
    expect(res.status).toBe(403); // assertPeerKnown filtre revokedAt: null
  });

  it('REPLAY : même jti rejoué deux fois → 1er 200, 2e 403', async () => {
    const jws = await signWith(bfaKey, { ...validPayload, requestId: SAME_JTI });
    const first = await postVerifyNina(jws, { cert: bfaCert });
    const second = await postVerifyNina(jws, { cert: bfaCert }); // rejeu exact
    expect(first.status).toBe(200);
    expect(second.status).toBe(403); // assertNotReplayed : jti déjà vu (Redis SET NX)
  });

  it('timestamp hors fenêtre ±2min (replay tardif) → 400', async () => {
    const stale = { ...validPayload, timestamp: new Date(Date.now() - 5 * 60_000).toISOString() };
    const jws = await signWith(bfaKey, stale);
    const res = await postVerifyNina(jws, { cert: bfaCert });
    expect(res.status).toBe(400); // fenêtre ±2 min dépassée
  });

  it('nbf futur / exp dépassé → rejeté par jwtVerify', async () => {
    const jwsNbf = await signWith(bfaKey, validPayload, { nbf: '+10m' });
    expect((await postVerifyNina(jwsNbf, { cert: bfaCert })).status).toBeGreaterThanOrEqual(400);
  });

  it('identité usurpée via header (X-AES-Peer-Country: NER) → IGNORÉE, pays = cert BFA', async () => {
    const res = await postVerifyNina(validJws, {
      cert: bfaCert, // cert réel = BFA
      headers: { 'X-AES-Peer-Country': 'NER' }, // tentative de spoof
    });
    // Le pays effectif est BFA (cert), le header est ignoré → le log doit dire BFA, pas NER.
    expect(await lastLogCountry()).toBe('BFA');
  });

  it('429 : 1001e requête dans l’heure → Too Many Requests', async () => {
    for (let i = 0; i < 1000; i++) await postVerifyNina(freshJws(), { cert: bfaCert });
    const over = await postVerifyNina(freshJws(), { cert: bfaCert });
    expect(over.status).toBe(429);
  });

  it('FAIL-CLOSED : Redis down → 503 (ni 200 ni bypass)', async () => {
    await stopRedis();
    const res = await postVerifyNina(freshJws(), { cert: bfaCert });
    expect(res.status).toBe(503); // rate-limit ET anti-replay refusent quand le store est KO
  });

  it('requête SANS cert mTLS (ssl-client-verify != SUCCESS) → 403', async () => {
    const res = await postVerifyNina(validJws, { cert: null });
    expect(res.status).toBe(403); // derivePeerFromMtls exige un handshake vérifié
  });
});
```

> ✅ **Critère de soutenance** : ces tests négatifs sont la **preuve vérifiable** que les contrôles
> sont implémentés, pas seulement spécifiés. Tant qu'ils n'existent pas, présenter ces contrôles
> comme **« conçus, Phase 2 »** (honnêteté), jamais comme acquis.

---

## 6. Pièges courants & dépannage

| Symptôme                                               | Cause probable                                               | Solution                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| mTLS handshake fail `unknown CA`                       | Cert client BFA pas signé par la CA AES partagée             | Vérifier que la CA root AES est dans le truststore mali                       |
| JWS verify : `signature verification failed`           | Clé publique BFA pas à jour (rotation Q2)                    | Re-sync `aes_partner_keys` ; respecter le `kid` du header                     |
| Rate limit déclenche à 800 req au lieu de 1000         | Décalage NTP entre Redis et application                      | NTP obligatoire ; éventuellement ajouter `margin=5%`                          |
| Réponse contient `null` au lieu de `vulnerable: false` | Citoyen sans catégorie vulnérabilité explicite               | Convention : `null` = pas de donnée ; mapper côté client                      |
| Audit hash-chain break sur logs cross-border           | Trigger BEFORE INSERT pas appliqué                           | Vérifier que le trigger `compute_entry_hash` (SHA-256) est attaché à la table |
| BFA reçoit `404 unknown peer cert`                     | Cert régénéré sans update DB Mali                            | Forcer la mise à jour de `cert_fingerprint` côté partner key                  |
| Tableau gouvernance ne montre rien                     | Pas de query Prometheus `aes_*_total` exposée                | Ajouter `Counter` Prometheus dans le service (cf. doc 17)                     |
| `403 Replay detected` sur une requête légitime         | `requestId`/`jti` réutilisé entre deux appels                | Générer un `requestId` (uuid) **neuf** par appel (= jti du JWS)               |
| `503 store unavailable` en rafale                      | Redis KO → fail-CLOSED volontaire (anti-replay + rate-limit) | Restaurer Redis ; le refus est intentionnel, pas un bug                       |
| `aud: "aes:undefined"` côté partenaire                 | Ancien `signResponse` sans param `peerCountry`               | Bug corrigé (§4.2) : `peerCountry` passé explicitement depuis le cert         |
| Header `X-AES-Peer-Country` ignoré                     | Comportement attendu : identité = cert mTLS réel             | Ne plus envoyer ce header ; il est strippé par l'ingress (§4.7)               |

---

## 7. Documentation à produire

> 🚨 **ADR-021 EXISTE DÉJÀ mais CONTREDIT le canon ET ce document — à CORRIGER (priorité)** :
> l'`ADR-021` committé écrit (a) « chaîne **Merkle** » / « chaînées Merkle » / « **Merkle** chain
> break » (≥ 4 occurrences) — **faux** : l'audit NINA-AES est une **hash-chain SHA-256**
> (`prevHash`), pas un arbre de Merkle (cf. §- liminaire, ADR-007 mécanisme
> `SHA-256(prevHash‖entry)`, ADR-034 §Tampering) ; (b) « Clés Ed25519 **générées dans Vault
> Transit** » + « Rotation Ed25519 keys : Vault Transit auto-rotation » — **faux et contraire au
> canon ADR-026/034** : Transit **ne supporte pas** Ed25519 (cf. §4.2ter). Il référence aussi «
> OpenAPI **3.1** » alors que ce doc fige **3.2**. **Action requise** : reprendre ADR-021 pour
> remplacer « Merkle » → « hash-chain SHA-256 (ADR-007) », « générées dans Vault Transit » → «
> in-process `@noble/ed25519`, clé éphémère depuis Vault **KV** + lease », « Vault Transit
> auto-rotation » → « rotation du secret KV + `kid` versionné », et « OpenAPI 3.1 » → « 3.2 ». Sans
> cette correction, le dossier de soutenance se contredit lui-même.

- `docs/adr/ADR-021-protocole-bcid-aes-interop.md` — décision protocole custom BCID-AES vs eIDAS,
  OAuth Federation, SAML. **Doit aussi acter le modèle de clé** : Ed25519 **in-process** `@noble`
  (clé éphémère depuis Vault KV) car **Transit ne signe pas l'Ed25519** (canon ADR-026/034) ; la
  seule alternative « clé jamais en RAM » impliquerait de changer d'algo (RS256 Transit), ce que
  BCID-AES interdit (cf. §4.2ter). Acter aussi l'anti-replay + l'identité-par-cert (A01/A07).
- `docs/api/bcid-aes-v1.yaml` — spec OpenAPI publiable aux partenaires BFA + NER.
- `docs/interop/PARTNER-ONBOARDING.md` — procédure pour intégrer un nouveau pays (Tchad ? Mauritanie
  ?) : générer paire Ed25519, échanger certs CA, signer protocole d'entente, premier appel test.
- Mise à jour `docs/CHANGELOG.md` §19 : livrables Bloc B.
- Mise à jour `docs/00-README-INDEX.md` : doc 21 livré.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc B Interop AES — JJ/MM/2026

> Template à remplir. ⚠️ Les ✅ ci-dessous sont des EXEMPLES de cible, PAS l'état réel : à la date
> de rédaction l'interop-service est un scaffold /health (cf. bandeau « Statut d'implémentation »).
> Ne cocher ✅ qu'après preuve (test négatif vert §5bis) ; sinon « ⏳ conçu, Phase 2 ».

- **Status** : ✅ Terminé / ⏳ En cours (conçu, Phase 2) / ❌ Bloqué
- **Temps réel passé** : X heures
- **Spec BCID-AES v1** : ⏳ OpenAPI à publier (`docs/api/bcid-aes-v1.yaml` non encore créé)
- **interop-service** : ⏳ scaffold /health uniquement — mTLS + JWS Ed25519 conçus (Phase 2)
- **Anti-replay** : ⏳ conçu (jti Redis SET NX + fenêtre ±2 min) — pas encore implémenté
- **Tables Prisma** : ⏳ migration `bcid_aes_interop` non appliquée (drift §4.3) — conçu
- **Rate limit** : ⏳ conçu 1000/h/pays Redis sliding window, FAIL-CLOSED (503) — pas implémenté
- **Dashboard governance** : ⏳ onglet « Interop AES » à créer
- **Provisioning partners** : BFA ⏳ (canal diplo), NER ⏳
- **Test E2E avec BFA factice** : ⏳ squelette §5bis non encore exécutable (test/ absent)
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
- [ ] JWS Ed25519 signature + verification fonctionnels (`jose@6.2.3`), claims jti/nbf/exp/aud
      vérifiés
- [ ] Middleware ANTI-REPLAY (jti Redis SET NX + fenêtre timestamp ±2 min) AVANT le métier
- [ ] Identité pair dérivée du cert mTLS réel (ingress §4.7), aucun header client de confiance
- [ ] Modèle de clé tranché : Ed25519 in-process `@noble` (clé éphémère Vault KV) — Transit ne signe
      pas Ed25519 — documenté ADR-021
- [ ] Rate limit Redis sliding window 1000/h/pays — FAIL-CLOSED (503) si Redis KO
- [ ] Tests négatifs verts (JWS forgé, alg:none, cert révoqué, replay, timestamp stale, 429, 503,
      no-cert)
- [ ] `AesPartnerKey` + `AesVerificationLog` seed avec 1 partner BFA factice
- [ ] Trigger hash-chain SHA-256 sur `aes_verification_logs` (audit-compat ADR-007)
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
  - 30 jours, déclencher un workflow d'échange JWK signé via le canal BCID-AES lui-même (verbe
    `rotate-key`).
- **Webhooks cross-border** : notification asynchrone des événements (mariage, décès) via RabbitMQ +
  JWS.
- **Sanctions partielles** : si BFA dépasse 3 fois son rate limit en 24 h, passer la limite à 500/h
  en `aes_partner_keys.degraded_mode = true`.
- **Audit cross-country trimestriel** : exécuter un export anonymisé des `aes_verification_logs`
  pour rapport aux 3 ministères.
- **eIDAS interop pont V3** : à long terme, gateway optionnelle pour citoyens UE résidant AES (mais
  via une CA tiers UE — politique).
- **Lectures recommandées** :
  - eIDAS Regulation EU 910/2014
  - RFC 8037 (CFRG Ed25519 JOSE)
  - RFC 7515 (JSON Web Signature)
  - NIST SP 800-63B Digital Identity Guidelines

---

_Document 21 — Version 1.1 (harden sécurité : anti-replay, identité-par-cert mTLS, jti/nbf JWS,
modèle de clé Vault Transit, rate-limit fail-closed, OpenAPI 3.2 mTLS+JWS, tests négatifs) — Juin
2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
