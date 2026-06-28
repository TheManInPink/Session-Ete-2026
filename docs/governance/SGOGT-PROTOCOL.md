# SGOGT — Protocole de messagerie officielle signée

> **Document de référence** : `docs/governance/SGOGT-PROTOCOL.md` **Module concerné** :
> `governance-service` (port 3010), sous-module **C2 — SGOGT** (Système de Gouvernance et
> d'Orientation Gouvernemental Tactique). **Document parent** :
> `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md` §4.3 (référence normative). **Dépendances
> cryptographiques** : ADR-007 (audit hash-chain), ADR-026 / ADR-034 (Vault Transit + capacités
> algorithmiques), doc 09 (audit-service). **Statut** : spécification de protocole. Les marqueurs
> **⏳** signalent ce qui est _conçu_ mais _non encore implémenté_ (Phase 2). Aucune affirmation de
> ce document ne doit être présentée comme « déjà en production » sans le marqueur correspondant.
>
> **✅ AS-BUILT (mise à jour) — les briques suivantes, jadis marquées ⏳ Phase 2, sont DÉSORMAIS
> IMPLÉMENTÉES** dans `governance-service` et **vérifiables** (les marqueurs ⏳ résiduels ci-dessous
> sont conservés pour l'historique mais NE bloquent plus) :
>
> - **`JwsSigner`** (`src/crypto/jws.signer.ts`) — assemble l'en-tête, compose le JWS compact et
>   convertit l'enveloppe Transit `vault:vN:<base64>` en 3ᵉ segment **base64url** (RFC 7515). En sus
>   du contrat initial, l'en-tête porte un champ **`kv`** qui **ÉPINGLE la version de clé Transit**
>   utilisée à la signature → la vérification résout EXACTEMENT cette version
>   (`transitReadPublicKey(kid, kv)`) et reste valide **après rotation** (non-répudiation
>   préservée).
> - **`transitReadPublicKey(keyName, version?)`** (`@nina-aes/vault-client`) — extrait
>   `keys[v].public_key` (PEM) ⇒ **vérification externe hors Vault** (DGE / Vérificateur Général).
> - **`transitHmac(keyName, payloadBase64)`** (`@nina-aes/vault-client`) — pseudonyme électoral.
> - **ACK signé** (`SgogtService.acknowledge`) + **stockage `readReceiptJws`** (schéma +
>   repository).
> - **Chaîne d'escalade signée** (`SgogtEscalationService` + `SgogtRepository.applyEscalation`,
>   transaction idempotente) + **relations hiérarchiques** (`User.manager`) au schéma.
> - **Endpoints** `ack` / `respond` / cron d'escalade + actions d'audit
>   `SGOGT_MESSAGE_READ / _RESPONDED / _ESCALATED` — livrés.
>
> Restent **⏳ Phase 2** (réellement non livrés) : l'**ancrage racine chez un tiers** (OCLEI /
> Vérificateur Général) et le palier d'escalade multi-niveaux au-delà du 1ᵉʳ cran.

---

## 1. Pourquoi un protocole — et pas un simple chat

### 1.1 Le problème : l'appel téléphonique non traçable

Dans l'administration malienne (DNEC, CTDEC, Ministère de l'Intérieur, DGE), une part importante des
décisions opérationnelles transite par **appel téléphonique** : un directeur appelle un chef de
centre, dit « OK, traite ce dossier en priorité », et raccroche. Cette pratique a trois défauts
structurels :

1. **Aucune trace.** Si la décision est contestée plus tard (« vous n'avez jamais dit ça »), il
   n'existe aucune preuve. Le subordonné porte le risque d'une instruction qu'il ne peut pas prouver
   avoir reçue.
2. **Aucune authentification.** N'importe qui prétendant être le directeur peut donner un ordre.
   L'usurpation d'identité hiérarchique est triviale au téléphone.
3. **Aucune responsabilité.** Une décision illégale ou abusive ne laisse aucune empreinte
   exploitable par un contrôle a posteriori (Vérificateur Général, OCLEI, justice).

### 1.2 La réponse : la décision administrative _cryptographiquement engageante_

SGOGT **n'est pas une messagerie instantanée** (ce n'est pas Slack, pas WhatsApp). C'est un système
de **décisions administratives datées et signées**. La règle fondatrice du module :

> Un message « OK, fais-le » émis par un supérieur via SGOGT **est** un ordre cryptographiquement
> engageant. Il identifie son auteur de façon non-répudiable, il est horodaté, il est inscrit dans
> une chaîne d'audit inviolable, et il escalade tout seul s'il reste sans réponse.

Trois propriétés de sécurité en découlent, traitées dans ce document :

| Propriété                                | Mécanisme                                          | Section      |
| ---------------------------------------- | -------------------------------------------------- | ------------ |
| **Authenticité** (qui a vraiment écrit)  | Signature JWS **RS256 via Vault Transit**          | §3, §4       |
| **Intégrité** (rien n'a été altéré)      | Claims signés couvrant tous les champs sensibles   | §3.2, §5     |
| **Non-répudiation** (impossible de nier) | Clé privée non-exportable + audit hash-chain ancré | §3.3, §8, §9 |

### 1.3 Pourquoi RS256 et pas Ed25519 (rappel CANON)

La signature des messages SGOGT est déléguée à **Vault Transit**, afin que la clé privée
par-fonctionnaire **ne quitte jamais Vault** (non-exportable, voir §4.1). Or :

> **Vault Transit ne supporte PAS Ed25519** (cf. ADR-026 / ADR-034). La signature asymétrique réelle
> disponible côté Transit est **RSA** (algorithme JWS `RS256`, mécanisme PKCS#1 v1.5). SGOGT signe
> donc en **RS256**.

À ne pas confondre avec l'**audit-service** (doc 09), qui scelle la _racine_ de sa hash-chain en
**Ed25519 in-process** (`@noble/ed25519`) — c'est une opération interne au service d'audit, hors
Vault. SGOGT, lui, signe **chaque message** via Transit en RS256. Les deux mondes coexistent et
n'utilisent pas le même algorithme parce qu'ils n'utilisent pas le même porte-clés.

---

## 2. Vue d'ensemble du protocole

```
   Fonctionnaire A (expéditeur)                          Fonctionnaire B (destinataire)
   ────────────────────────────                          ──────────────────────────────
            │                                                        ▲
            │ 1. POST /sgogt/messages                                │
            │    {recipientId, subject, body, priority, threadId?}   │
            ▼                                                        │
   ┌─────────────────────────────────────────────────────────┐      │
   │ governance-service  (SgogtController)                    │      │
   │                                                          │      │
   │  2. Dérive threadId, iat, ttlEscalateAt                  │      │
   │  3. Construit signedClaims (sender,recipient,subject,    │      │
   │     bodyHash,threadId,priority,ttl,iat)                  │      │
   │  4. JWS RS256 ─────────────► Vault Transit (sign)        │      │
   │  5. Persiste SgogtMessage (jws + signedClaims)           │      │
   │  6. Notifie B (push + email) ───────────────────────────┼──────┘
   │  7. Append audit hash-chain (SGOGT_MESSAGE_SENT)         │
   └─────────────────────────────────────────────────────────┘
            │                                                        │
            │                            8. B lit, VÉRIFIE le JWS    │
            │                               (clé publique Transit)   │
            │                            9. B accuse réception       │
            │ ◄──────────────────────────  (ACK signé, READ)        │
            │                                                        │
            │  ⏰ Si pas de réponse avant ttlEscalateAt :            │
            │     escalade automatique vers le supérieur de B        │
            ▼                                                        ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Audit hash-chain SHA-256 (doc 09) — racine scellée Ed25519/h,        │
   │ ancrage tiers OCLEI / Vérificateur Général  ⏳ (conçu, Phase 2)      │
   └─────────────────────────────────────────────────────────────────────┘
```

**Cycle de vie d'un message** (`SgogtStatus`) :

```
SENT ──(lecture destinataire)──► READ ──(réponse)──► RESPONDED ──► ARCHIVED
  │                                 │
  └──(TTL dépassé, pas de réponse)──┴────────────────► ESCALATED ──► (notif supérieur)
```

---

## 3. Signature JWS des messages

### 3.1 POURQUOI signer, et POURQUOI signer _ces_ champs précis

Signer le seul corps (`body`) du message serait insuffisant. Un attaquant (ou un administrateur de
base de données malveillant) pourrait altérer **les métadonnées** qui portent la valeur juridique de
la décision :

- changer le **destinataire** (`recipientId`) pour faire croire qu'un ordre s'adressait à quelqu'un
  d'autre ;
- baisser la **priorité** (`CRITICAL` → `NORMAL`) pour neutraliser l'escalade ;
- repousser le **TTL** (`ttlEscalateAt`) pour empêcher l'escalade automatique ;
- déplacer le message dans un autre **fil** (`threadId`) pour casser la chronologie d'une décision ;
- **rejouer** un ancien message comme s'il était neuf.

> **Règle d'or.** Tout champ dont l'altération change la portée administrative du message **DOIT**
> être couvert par la signature. La signature ne couvre pas seulement « le texte », elle couvre **la
> décision entière**.

### 3.2 Les claims signés (couverture exacte)

Les champs effectivement couverts par le JWS sont, conformément à doc 22 §4.3 :

| Claim           | Source                           | Rôle de sécurité                                      |
| --------------- | -------------------------------- | ----------------------------------------------------- |
| `sender`        | `req.user.id` (JWT authentifié)  | **Authenticité** : lie le message à l'auteur réel     |
| `recipient`     | `dto.recipientId`                | Empêche la redirection frauduleuse de l'ordre         |
| `subject`       | `dto.subject`                    | Empêche le détournement de l'objet de la décision     |
| `bodyHash`      | `SHA-256(dto.body)`              | **Intégrité** du corps sans signer un blob volumineux |
| `threadId`      | dérivé / `dto.threadId`          | Verrouille la place du message dans la chronologie    |
| `priority`      | `dto.priority`                   | Empêche la neutralisation de l'escalade               |
| `ttlEscalateAt` | dérivé (voir §6)                 | Verrouille le délai d'escalade                        |
| `iat`           | horodatage d'émission (ISO 8601) | **Anti-rejeu** : datation engageante de l'émission    |

On ne signe **pas** le `body` brut mais son **`bodyHash` (SHA-256)** : cela garde le payload JWS
compact même pour un message long, tout en garantissant qu'un seul octet modifié du corps invalide
la vérification.

```ts
// services/governance-service/src/sgogt/sgogt.controller.ts (extrait — cf. doc 22 §4.3)
//
// POURQUOI calculer threadId / iat / ttlEscalateAt AVANT la signature :
// ces champs DOIVENT être couverts par le JWS. S'ils étaient ajoutés après,
// un attaquant pourrait les altérer sans invalider la signature.
const threadId = dto.threadId ?? uuid();
const issuedAt = new Date();
const ttlEscalateAt = dto.priority === 'CRITICAL' ? addHours(issuedAt, 4) : addHours(issuedAt, 24);

/**
 * Claims signés = la « décision administrative » dans son intégralité.
 * On signe le bodyHash (SHA-256) plutôt que le body brut (compacité du JWS)
 * et on AJOUTE threadId/priority/ttl/iat pour rendre la décision
 * cryptographiquement engageante, non-altérable et non-rejouable.
 */
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

// Signature JWS compact RS256 — la clé privée par-fonctionnaire reste DANS Vault.
const jws = await this.jwsService.sign(signedClaims, `sgogt-user-${req.user.id}`);
```

### 3.3 Anatomie du JWS compact produit

Le résultat est un **JWS compact** à trois segments base64url séparés par des points :

```
   <header>.<payload>.<signature>

   header  (décodé)  = { "alg": "RS256", "typ": "JWT", "kid": "sgogt-user-<id>", "kv": <keyVersion> }
   payload (décodé)  = signedClaims   (l'objet de §3.2)
   signature         = RSA-PKCS1v15( SHA-256( base64url(header) || "." || base64url(payload) ),
                                     clé privée Transit `sgogt-user-<id>` )
```

- `alg` est **toujours** `RS256`. **Refuser** tout JWS reçu dont l'en-tête annonce `alg: none` ou un
  algorithme symétrique (`HS*`) : c'est l'attaque classique de confusion d'algorithme.
- `kid` identifie la clé Transit du signataire, ce qui permet au vérificateur de retrouver la **clé
  publique** correspondante.
- `kv` ÉPINGLE la **version** de la clé Transit utilisée à la signature (renvoyée par
  `transit/sign`). Le vérificateur lit la clé publique **à cette version précise**
  (`transitReadPublicKey(kid, kv)`), jamais `latest_version` : une **rotation** ultérieure de la clé
  ne casse donc PAS la vérification des signatures antérieures. `kv` étant dans l'en-tête, il est
  **couvert par la signature** (toute altération invalide le JWS — comportement fail-closed).

> **✅ Implémenté — `JwsSigner` (`src/crypto/jws.signer.ts`).** `signer.sign(claims, kid)` s'appuie
> sur
> `transitSign(keyName, payloadBase64, { signatureAlgorithm: 'pkcs1v15', hashAlgorithm: 'sha2-256' })`
> du package `@nina-aes/vault-client` ; il assemble l'en-tête (avec `kv`), encode le payload et
> compose le JWS compact.
>
> **Conversion enveloppe Transit → 3ᵉ segment JWS (RFC 7515) — OBLIGATOIRE.** `transitSign` renvoie
> une signature au **format propriétaire Vault** `vault:vN:<base64>` (préfixe de version
>
> - base64 **standard**), **pas** une signature RSA brute. Pour produire un JWS compact
>   **interopérable** (vérifiable par une librairie JWS standard côté DGE / Vérificateur Général),
>   le `JwsService` **DOIT** : (1) retirer le préfixe `vault:vN:`, (2) décoder le base64 standard
>   restant en octets bruts de la signature RSA, puis (3) **ré-encoder ces octets en base64url**
>   (sans padding) pour former le 3ᵉ segment. **Sans cette transformation, le JWS émis n'est PAS
>   conforme RFC 7515** et un vérificateur externe utilisant une librairie standard ne pourra pas le
>   valider.

---

## 4. Vérification des messages

### 4.1 Le modèle de clés : une clé Transit _par fonctionnaire_

Chaque fonctionnaire dispose d'une **clé RSA dédiée dans Vault Transit**, nommée
`sgogt-user-<userId>`. Propriétés :

- **Non-exportable** : la clé privée est générée et conservée par Vault, jamais lue par le service.
  Le `governance-service` ne manipule **aucun** secret cryptographique en clair.
- **Signature déléguée** : pour signer, le service envoie le payload à
  `POST transit/sign/sgogt-user-<id>` ; Vault renvoie la signature.
- **Clé publique extractible** ✅ (implémenté) : pour les clés RSA, Vault expose la partie publique
  sous `keys[<version>].public_key` via `GET transit/keys/sgogt-user-<id>`. Le helper
  **`transitReadPublicKey(keyName, version?)`** de `@nina-aes/vault-client` extrait désormais
  `keys[v].public_key` (PEM) **à la version demandée** ⇒ la **vérification hors Vault**
  (Vérificateur Général) est disponible. La version est fournie par le champ `kv` de l'en-tête JWS
  (§3.3), de sorte que la vérification reste robuste à la **rotation** de clé.

Conséquence directe pour la **non-répudiation** : comme la clé privée ne quitte jamais Vault, seul
le détenteur des droits Vault sur cette clé (le fonctionnaire authentifié, via son identité) a pu
produire la signature. L'auteur **ne peut pas nier** avoir signé (§8).

### 4.2 Procédure de vérification (côté destinataire ou côté contrôle)

Pour vérifier un message stocké (`jwsSignature` + `signedClaims`) :

```ts
/**
 * Vérifie un message SGOGT.
 * Renvoie true seulement si TOUTES les conditions sont remplies :
 *  - la signature RSA est valide pour la clé publique du `kid` (= sender) ;
 *  - l'algorithme est bien RS256 (refus strict de none/HS*) ;
 *  - les claims signés correspondent aux colonnes persistées (anti-altération DB) ;
 *  - le bodyHash signé correspond au body réellement stocké (anti-substitution).
 */
async function verifySgogtMessage(msg: SgogtMessage): Promise<boolean> {
  // 1) Décoder l'en-tête SANS faire confiance à `alg` annoncé.
  //    `signatureBytes` = base64url-DÉCODE du 3ᵉ segment (octets RSA bruts). Côté émission,
  //    le JwsService a converti l'enveloppe Transit `vault:vN:<base64>` en ce 3ᵉ segment
  //    base64url (cf. §3.3) ; la vérification standard opère donc sur les octets bruts.
  const { header, payload, signingInput, signatureBytes } = parseCompactJws(msg.jwsSignature);

  // 2) Verrou anti-confusion d'algorithme : on N'accepte QUE RS256.
  if (header.alg !== 'RS256') {
    throw new UnauthorizedException(`Algorithme JWS refusé : ${header.alg}`);
  }

  // 3) Le kid doit désigner la clé du sender prétendu (cohérence identité/clé).
  if (header.kid !== `sgogt-user-${msg.senderId}`) {
    throw new UnauthorizedException('kid ne correspond pas au senderId');
  }

  // 4) Récupérer la clé PUBLIQUE Transit du signataire À LA VERSION ÉPINGLÉE (kv)
  //    et vérifier la signature RSA. Aucune clé privée n'est manipulée : on vérifie
  //    hors Vault avec la publique. On passe header.kv → résolution déterministe,
  //    robuste à la rotation (JAMAIS latest_version implicite).
  const publicKey = await vault.transitReadPublicKey(header.kid, header.kv);
  const signatureValid = rsaPkcs1v15Verify(signingInput, signatureBytes, publicKey);
  if (!signatureValid) return false;

  // 5) Cohérence claims signés ↔ colonnes persistées : un admin DB qui modifie
  //    `recipientId`/`priority`/`ttlEscalateAt` en base SANS re-signer est détecté ici.
  if (
    payload.recipient !== msg.recipientId ||
    payload.priority !== msg.priority ||
    payload.threadId !== msg.threadId ||
    payload.ttlEscalateAt !== msg.ttlEscalateAt.toISOString()
  ) {
    return false;
  }

  // 6) Intégrité du corps : le hash signé doit matcher le body stocké.
  if (payload.bodyHash !== sha256Hex(msg.body)) return false;

  return true;
}
```

> **✅ Implémenté.** `JwsSigner.parse`/`JwsSigner.verify` (`src/crypto/jws.signer.ts`) réalisent
> `parseCompactJws` + la vérification RSA-PKCS1v15, et le helper
> **`transitReadPublicKey(name, version)`** de `@nina-aes/vault-client` extrait
> `keys[<version>].public_key` de `GET transit/keys/<name>`. **La vérification externe par clé
> publique extraite (Vérificateur Général) est donc disponible**, à la **version épinglée** (`kv`) —
> robuste à la rotation. La voie déléguée `transit/verify` (§4.3) reste une alternative équivalente
> quand le vérificateur a déjà accès au Vault de l'État.

### 4.3 Vérification alternative côté Vault (`transit/verify`)

Quand le vérificateur a déjà accès à Vault (contrôle interne), il peut **déléguer** la vérification
à Vault via `POST transit/verify/sgogt-user-<id>` plutôt que d'extraire la clé publique. Les deux
voies sont cryptographiquement équivalentes et **toutes deux opérationnelles**. La voie « clé
publique extraite » (§4.2) est **préférée** pour le **contrôle externe indépendant** (Vérificateur
Général), qui ne doit pas dépendre de l'accès au Vault de l'État : elle est **livrée** via
`transitReadPublicKey(kid, kv)` (cf. §4.1, §4.2).

---

## 5. Classification des messages (priorité)

La classification porte le **niveau d'urgence** et **pilote le délai d'escalade**. Elle est
modélisée par l'enum `SgogtPriority` (cf. doc 22 §4.1) :

| Classification        | Enum       | Délai d'escalade (TTL) | Sémantique                                           |
| --------------------- | ---------- | ---------------------- | ---------------------------------------------------- |
| **Normal**            | `NORMAL`   | **24 h**               | Décision courante, traitement dans la journée ouvrée |
| **Important**         | `HIGH`     | **24 h**               | Prioritaire mais non bloquant ; remonte vite la pile |
| **Urgent / Critique** | `CRITICAL` | **4 h**                | Décision bloquante : escalade rapide si silence      |

> **Note d'honnêteté.** Le schéma actuel (doc 22 §4.1) définit **trois** niveaux
> (`NORMAL / HIGH / CRITICAL`). La logique de TTL implémentée distingue surtout `CRITICAL` (4 h) des
> autres (24 h). Un palier intermédiaire propre à `HIGH` (p. ex. 8 h) est **⏳ envisageable en Phase
> 2** mais n'est **pas** spécifié aujourd'hui : ne pas affirmer un délai `HIGH` distinct tant qu'il
> n'est pas ajouté au code.

La `priority` étant **incluse dans les claims signés** (§3.2), elle ne peut pas être abaissée après
coup pour neutraliser l'escalade sans invalider la signature.

---

## 6. Escalade automatique

### 6.1 POURQUOI une escalade

Une décision administrative urgente qui reste **sans réponse** ne doit pas se perdre. SGOGT remplace
l'appel téléphonique de relance (« tu as vu mon message ? ») par un mécanisme **automatique et
tracé** : passé le TTL, le message remonte au **supérieur hiérarchique** du destinataire, qui prend
le relais. Le silence devient une information exploitable, pas un trou noir.

### 6.2 Calcul du délai (TTL)

Le `ttlEscalateAt` est dérivé à l'émission, **avant signature** (donc immuable) :

```ts
// CRITICAL → 4 h ; NORMAL/HIGH → 24 h (cf. §5 et doc 22 §4.3)
const ttlEscalateAt = dto.priority === 'CRITICAL' ? addHours(issuedAt, 4) : addHours(issuedAt, 24);
```

### 6.3 Le cron d'escalade

Un cron NestJS (`@nestjs/schedule`) balaie toutes les **15 minutes** les messages échus et non
répondus, et les escalade :

```ts
// services/governance-service/src/sgogt/sgogt-escalation.cron.ts (cf. doc 22 §4.3)
@Cron('*/15 * * * *') // toutes les 15 min
async escalate(): Promise<void> {
  const dueForEscalation = await this.prisma.sgogtMessage.findMany({
    where: {
      status: 'SENT',               // pas encore READ/RESPONDED
      ttlEscalateAt: { lte: new Date() },
      escalatedTo: null,            // pas déjà escaladé (idempotence)
    },
    // ⏳ voir §6.4 : `include` hiérarchique suppose des relations non encore au schéma.
  });

  for (const msg of dueForEscalation) {
    const managerId = await this.resolveManager(msg.recipientId); // lookup supérieur
    if (!managerId) continue;       // pas de supérieur → on archive / on laisse
    await this.prisma.sgogtMessage.update({
      where: { id: msg.id },
      data: { status: 'ESCALATED', escalatedTo: managerId },
    });
    await this.notify.escalateNotification(msg); // notif "escalade après TTL"
  }
}
```

**Niveaux d'escalade.** L'escalade remonte **d'un cran** dans la hiérarchie (destinataire → son
supérieur direct). Un message déjà escaladé (`escalatedTo != null`) n'est pas ré-escaladé par ce
cron : c'est **une remontée d'un niveau**, idempotente. Une escalade multi-niveaux en cascade
(supérieur du supérieur si toujours silence) est **⏳ conçue pour Phase 2**.

### 6.4 ✅ Prérequis schéma (implémenté)

> **✅ Implémenté — relations hiérarchiques.** La self-relation `manager`/`managerId` sur `User` est
> présente au schéma. As-built, `SgogtRepository.resolveManager` réalise un **lookup séparé**
> (`prisma.user.findUnique({ where: { id: recipientId }, select: { managerId: true } })`) plutôt
> qu'un `include` imbriqué — choix volontaire (le modèle `SgogtSignedMessage` n'expose qu'un
> scalaire `recipientId` côté escalade, suffisant ici). L'escalade d'un cran est livrée
> (`SgogtEscalationService.sweep` + `applyEscalation` transactionnel/idempotent).

---

## 7. Accusé de réception signé

### 7.1 POURQUOI un ACK signé

Symétriquement à l'expéditeur qui ne peut nier avoir envoyé, le **destinataire ne doit pas pouvoir
nier avoir reçu et lu**. Un accusé de réception **signé par le destinataire** (avec sa propre clé
Transit `sgogt-user-<recipientId>`) ferme la boucle de non-répudiation : il prouve que l'ordre a été
**vu** à un instant donné, ce qui conditionne la responsabilité de l'exécution.

### 7.2 Forme de l'ACK

L'accusé de réception est lui-même un **JWS RS256** dont les claims couvrent l'identité du message
acquitté et l'instant de lecture :

```ts
/**
 * Construit et signe l'accusé de réception d'un message SGOGT.
 * Le destinataire signe avec SA clé Transit : c'est LUI qui s'engage
 * à avoir pris connaissance du message à `readAt`.
 */
async function buildSignedAck(msg: SgogtMessage, reader: AuthenticatedUser): Promise<string> {
  const ackClaims = {
    ackType: 'SGOGT_READ_RECEIPT',
    messageId: String(msg.id),
    threadId: msg.threadId,
    // On lie l'ACK à la signature exacte du message acquitté (empreinte) :
    // impossible d'accuser réception d'un autre message que celui réellement reçu.
    messageJwsHash: sha256Hex(msg.jwsSignature),
    reader: reader.id,
    readAt: new Date().toISOString(),
  };
  // Signé avec la clé du LECTEUR (pas celle de l'expéditeur).
  return jwsService.sign(ackClaims, `sgogt-user-${reader.id}`);
}
```

À la première lecture, le statut passe `SENT → READ`, `readAt` est renseigné, et l'ACK signé est :

1. **conservé** à côté du message (preuve de lecture vérifiable) ;
2. **inscrit dans l'audit** (`SGOGT_MESSAGE_READ`, §8) ;
3. notifié à l'expéditeur.

> **✅ Implémenté.** Le **stockage du JWS d'ACK** (colonne `readReceiptJws` sur
> `SgogtSignedMessage`) et l'endpoint `POST /sgogt/messages/:id/ack` sont livrés
> (`SgogtService.acknowledge` + `SgogtRepository.markRead`). L'ACK vérifie d'abord la signature de
> l'émetteur (refus 401 si invalide), est signé avec la clé du **lecteur** (en-tête `kv` épinglant
> la version de SA clé), puis persisté avec `readAt`. Anti-IDOR : seul le destinataire peut
> acquitter (403 sinon).

---

## 8. Traçabilité — audit hash-chain (PAS Merkle)

### 8.1 Chaque action SGOGT laisse une trace immuable

Toute action significative émet une ligne dans l'**audit-service** (doc 09), qui la chaîne dans une
**hash-chain SHA-256 linéaire** (ADR-007). Actions journalisées :

| Action métier        | `action` (audit)             | Émise par                      |
| -------------------- | ---------------------------- | ------------------------------ |
| Envoi d'un message   | `SGOGT_MESSAGE_SENT`         | `SgogtController.send`         |
| Lecture / ACK        | `SGOGT_MESSAGE_READ` ✅      | `SgogtService.acknowledge`     |
| Réponse              | `SGOGT_MESSAGE_RESPONDED` ✅ | `SgogtService.respond`         |
| Escalade automatique | `SGOGT_MESSAGE_ESCALATED` ✅ | `SgogtEscalationService.sweep` |

### 8.2 PAS un arbre de Merkle (CANON)

> **CANON.** L'audit Bloc C est une **hash-chain SHA-256 LINÉAIRE**, **pas** un arbre de Merkle.
> Chaque ligne chaîne le hash de la précédente (`previousHash`). Le nom de colonne `merkleHash` côté
> audit-service est **historique** : la structure réelle reste une **chaîne**, pas un arbre (cf. doc
> 09 et ADR-007). Ne jamais qualifier cette structure d'« arbre de Merkle ».
>
> **Note terminologique.** ADR-007 emploie encore, de façon imprécise, la formulation « chaîne de
> type Merkle » et conserve le nom de colonne `merkleHash`. Le présent document **fait autorité sur
> la terminologie** : la structure est une **hash-chain SHA-256 linéaire**, et les mots « arbre de
> Merkle » sont à proscrire. Ce point sera répercuté dans ADR-007 (libellé à aligner).

Le calcul de chaînage (doc 09) est, schématiquement :

```
payloadHash_N = SHA256( canonicalJson({ action, actorType, correlationId, entityId,
                                        entityType, ipAddress, newValue, oldValue,
                                        sourceEventId, userId }) )
merkleHash_N  = SHA256( previousHash_(N-1) | payloadHash_N | occurredAt_N(ISO) | sourceEventId_N )
```

Altérer la ligne `N` casse `merkleHash_N` → détecté ; recalculer proprement `merkleHash_N` décale
`previousHash_(N+1)` → **la ligne N+1 détecte l'intrusion**.

### 8.3 Forme EXACTE du DTO d'audit (contrat d'ingestion réel)

> **IMPORTANT — conformité au contrat.** Le DTO d'ingestion réel
> (`services/audit-service/src/audit/dtos/ingest.dto.ts`) n'a **PAS** de champs
> `resourceType/resourceId/actorId/payload`. Les champs acceptés sont :
> `action, entityType, entityId, userId (UUID), actorType, oldValue, newValue, ipAddress, correlationId, sourceEventId`.
> Le `ValidationPipe` de l'audit-service est
> `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` : **toute clé inconnue
> déclenche une 400 Bad Request** (elle n'est pas silencieusement supprimée). Une métadonnée rangée
> dans une clé hors-contrat serait donc **rejetée** _et_ non couverte par le `payloadHash`.

On range donc l'objet métier libre dans `newValue` (seul champ JSON libre hashé), l'identité de
l'acteur dans `userId` (UUID réel), le type/origine dans `entityType`/`entityId` :

```ts
// Audit de l'envoi d'un message SGOGT (cf. doc 22 §4.3).
await this.auditService.append({
  action: 'SGOGT_MESSAGE_SENT',
  entityType: 'SgogtMessage',
  entityId: String(msg.id),
  userId: req.user.id, // UUID réel du fonctionnaire authentifié (@IsUUID())
  ipAddress: req.ip,
  // Seul champ JSON libre, hashé par computePayloadHash :
  newValue: { recipient: dto.recipientId, priority: dto.priority, threadId },
});
```

> **À NE PAS mettre dans l'audit.** Ne **jamais** journaliser le `body` en clair ni des PII
> sensibles dans `newValue` : on journalise des **métadonnées de décision** (qui, vers qui, quelle
> priorité, quel fil), pas le contenu intégral. Le contenu reste dans `sgogt_messages.body`, protégé
> par les contrôles d'accès du service.

### 8.4 Inviolabilité — la réserve honnête

> **Note d'honnêteté (CANON).** La hash-chain SHA-256 est **inviolable seulement si la racine est
> ancrée chez un tiers** (registre signé OCLEI / Vérificateur Général). Le **scellement horaire
> Ed25519 in-process** de la racine existe côté audit-service (doc 09), mais l'**ancrage externe
> chez un tiers** est **⏳ conçu, non encore implémenté (Phase 2)**. Tant que cet ancrage n'est pas
> en place, on ne qualifie l'audit **ni** d'« inaltérable » **ni** d'« inviolable » sans réserve :
> un attaquant ayant un accès suffisant _et_ la clé de scellement pourrait réécrire un segment. La
> signature horaire réduit la fenêtre, l'ancrage tiers la ferme.

---

## 9. Non-répudiation — synthèse

La non-répudiation SGOGT repose sur **trois piliers cumulés** ; aucun seul ne suffit :

| Pilier                        | Garantit que…                                                   | Mécanisme                                                      | Statut                                               |
| ----------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| **Clé privée non-exportable** | seul l'auteur a pu signer                                       | Vault Transit, clé `sgogt-user-<id>` jamais lue par le service | en place                                             |
| **Claims signés exhaustifs**  | rien (destinataire/priorité/TTL/corps/instant) n'a été altéré   | JWS RS256 couvrant §3.2                                        | en place                                             |
| **Audit chaîné + ancré**      | la signature existait avant un instant T et n'a pas été effacée | hash-chain SHA-256 + scellement Ed25519/h + ancrage tiers      | scellement: en place · **ancrage tiers: ⏳ Phase 2** |

**Conséquence opérationnelle.** Un fonctionnaire ne peut pas dire « je n'ai jamais envoyé cet ordre
» (signature RSA non-exportable), ni « le message disait autre chose » (claims signés), ni « cette
ligne a été fabriquée après coup » (audit chaîné + scellé). Le destinataire ne peut pas dire « je
n'ai jamais reçu » dès lors que l'**ACK signé** (§7) est en place (✅ implémenté).

---

## 10. Modèle de menace SGOGT (résumé)

| Menace                                             | Acteur                  | Contrôle SGOGT                                           | Statut          |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------- | --------------- |
| Usurpation d'identité hiérarchique                 | externe / interne       | Signature RS256 liée à `req.user.id` + `kid`             | en place        |
| Altération d'un message en base                    | admin DB                | Claims signés vérifiés contre les colonnes (§4.2)        | en place        |
| Abaissement de priorité / TTL pour tuer l'escalade | interne                 | `priority`/`ttlEscalateAt` dans les claims signés        | en place        |
| Confusion d'algorithme (`alg: none`/`HS*`)         | externe                 | Refus strict de tout `alg != RS256` (§3.3, §4.2)         | en place        |
| Rejeu d'un ancien ordre                            | interne                 | `iat` signé + `sourceEventId` idempotent côté audit      | en place        |
| Réécriture de l'historique d'audit                 | interne privilégié      | hash-chain + scellement Ed25519/h                        | partiel         |
| Réécriture **+** vol de la clé de scellement       | interne très privilégié | **ancrage racine chez tiers (OCLEI / Vérif. Gén.)**      | **⏳ Phase 2**  |
| Déni de réception                                  | destinataire            | ACK signé par le lecteur (§7)                            | **✅ en place** |
| Répudiation d'un ordre après **rotation** de clé   | interne privilégié      | Version de clé `kv` épinglée dans l'en-tête signé (§3.3) | **✅ en place** |

---

## 11. Checklist de conformité du protocole

- [ ] JWS **RS256 via Vault Transit** sur tout message (jamais Ed25519, jamais `HS*`/`none`).
- [ ] Claims signés couvrant **sender, recipient, subject, bodyHash, threadId, priority,
      ttlEscalateAt, iat** (couverture complète de la décision).
- [ ] `bodyHash = SHA-256(body)` signé ; `body` brut **non** signé (compacité du JWS).
- [ ] Champs dérivés (`threadId`, `iat`, `ttlEscalateAt`) calculés **avant** signature.
- [ ] Vérification : refus strict `alg != RS256` + cohérence `kid`↔`senderId` + **présence de
      `kv`** + claims↔colonnes + `bodyHash`↔`body`.
- [x] Clé Transit `sgogt-user-<id>` **non-exportable** ; vérification interne déléguée via
      `transit/verify` opérationnelle. ✅ Vérification externe par clé publique extraite hors Vault
      (`transitReadPublicKey(kid, kv)` lisant `keys[v].public_key`) — livrée.
- [x] ✅ `JwsSigner` convertit l'enveloppe Transit `vault:vN:<base64>` en 3ᵉ segment **base64url**
      (signature RSA brute) pour un JWS conforme **RFC 7515** interopérable.
- [x] ✅ **Version de clé `kv` épinglée** dans l'en-tête signé → vérification à version explicite,
      robuste à la **rotation** Vault (non-répudiation préservée ; cache clé publique par
      `kid#version`).
- [ ] Escalade : TTL **4 h** (`CRITICAL`) / **24 h** (`NORMAL`/`HIGH`), cron, idempotente.
- [x] Audit `SGOGT_MESSAGE_SENT` + ✅ `READ`/`RESPONDED`/`ESCALATED` en **hash-chain SHA-256** (PAS
      Merkle), DTO conforme à `ingest.dto.ts` (`newValue` + `userId` UUID, pas `payload`).
- [ ] **Pas** de `body` en clair ni de PII sensible dans `newValue`.
- [x] ✅ ACK signé (`POST /sgogt/messages/:id/ack`, colonne `readReceiptJws`) — livré.
- [x] ✅ Relation hiérarchique `manager`/`managerId` au schéma — livrée.
- [ ] ⏳ Ancrage racine d'audit chez tiers (OCLEI / Vérificateur Général) — Phase 2.
- [ ] Aucune affirmation d'« audit inaltérable » sans la réserve §8.4.

---

## 12. Références

- `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md` §4.3 — spécification source du module SGOGT.
- `docs/09-BACKEND-AUDIT-SERVICE.md` — hash-chain SHA-256, scellement Ed25519 in-process,
  `chain.ts`, `ingest.dto.ts`.
- `docs/adr/ADR-007-merkle-audit.md` — décision hash-chain linéaire (nom `merkleHash` historique).
- `docs/adr/ADR-022-modules-gouvernementaux-scope.md` — scope Bloc C.
- `docs/adr/ADR-026` / `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` — Vault Transit ne
  supporte pas Ed25519 ; RS256 pour la signature déléguée.
- `docs/governance/ELECTIONS-EXPORT-CONTRACT.md` — sous-module C3 (contrat d'export DGE).

---

_Document SGOGT-PROTOCOL — Version 1.0 — Juin 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
