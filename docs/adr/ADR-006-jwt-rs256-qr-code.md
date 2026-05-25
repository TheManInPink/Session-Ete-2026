# ADR-006 — JWT RS256 pour les QR codes de la Fiche Descriptive

## Statut

Accepté — Avril 2026

## Contexte

La Fiche Descriptive Individuelle actuelle du CTDEC contient un QR code avec le numéro NINA brut (15
caractères). Puisque le format NINA est public et documenté (14 chiffres + 1 lettre de contrôle),
n'importe qui connaissant ce format peut générer un faux QR code pour une carte NINA fictive. C'est
la faille critique F1 identifiée dans le cahier des charges.

## Décision

Remplacer le QR code brut par un JSON Web Token (JWT) signé avec l'algorithme RS256 (RSA-SHA256,
asymétrique). Le payload JWT contient :

- `nina` : le numéro NINA complet (15 caractères)
- `biometric_hash` : hash SHA-256 de l'empreinte biométrique du citoyen
- `iat` (issued at) : timestamp Unix d'émission du document
- `iss` (issuer) : identifiant de l'autorité émettrice (`CTDEC-MLI`)
- `exp` (expiration) : date d'expiration optionnelle du document

## Conséquences positives

- **Vérification asymétrique** : la clé publique du CTDEC suffit pour vérifier l'authenticité —
  n'importe quel agent de police, fonctionnaire consulaire ou application mobile peut vérifier un QR
  code sans accès à la clé privée
- **Unicité temporelle** : le timestamp `iat` rend chaque QR code unique, même pour le même citoyen
  — détection des reproductions
- **Liaison biométrique** : le hash de l'empreinte lie le document à une personne physique sans
  exposer la biométrie brute (hash irréversible)
- **Non-répudiation** : seul le CTDEC possède la clé privée, donc seul le CTDEC peut avoir signé un
  document valide

## Conséquences négatives

- Taille du QR code augmentée (JWT RS256 ~500 octets vs NINA brut 15 octets) — nécessite un QR code
  version 10+ au lieu de version 1
- Gestion de la clé privée RSA critique — compromission = capacité de forger des documents. Atténué
  par HashiCorp Vault
- Rotation de la clé RSA = invalidation de tous les QR codes existants — nécessite une période de
  transition avec double clé

## Alternatives rejetées

- **HS256 (HMAC-SHA256, symétrique)** : la clé de vérification est identique à la clé de signature.
  Tout agent ayant accès à la vérification pourrait également forger des documents — inacceptable
  pour un système d'identité nationale
- **QR code chiffré AES-256** : nécessiterait de distribuer la clé de déchiffrement à chaque point
  de vérification. Problème de distribution de clés symétriques à grande échelle
- **Signature Ed25519** : excellentes performances et clés plus courtes, mais écosystème JWT moins
  mature que RS256. Réservé pour les échanges inter-AES (ADR dédié)

---

## Addendum — 2026-05-25 (Doc 10 v2.0)

Lors de la rédaction du document 10 (`docs/10-BACKEND-DOCUMENT-SERVICE.md` v2.0), trois précisions
sont apportées au design initial. La décision RS256 reste inchangée ; seul le **payload** et le
**mode de signature** sont enrichis.

### A. Payload JWT enrichi

Le payload minimal de la première version (`nina`, `biometric_hash`, `iat`, `iss`, `exp`) est
complété pour adresser la **détection d'altération des champs imprimés** et la **révocation ciblée**
:

- `jti` (UUID v7) — identifiant unique du JWT, **clé de révocation**.
- `fdi.hash` — SHA-256 du JSON canonique (`canonicalJson()`) de l'ensemble des champs imprimés
  (citoyen + serialNumber + langue + documentId + issuedAt). Permet de détecter qu'un faux PDF a été
  imprimé avec un QR authentique mais des données visuelles falsifiées.
- `citizen` (minimisé) — uniquement `nina`, `firstName`, `lastName`, `birthDate`, `sex`,
  `birthPlace.commune`. Pas d'adresse, pas de profession, pas de noms de parents (PII secondaire qui
  peut évoluer, et qui n'a pas sa place dans un jeton valide 180 jours).
- `wm` — 12 premiers caractères de `SHA-256(ip|userAgent|jti)`. Watermark non-PII permettant de
  tracer la fuite d'un PDF (couplé à un filigrane CSS dans le PDF).
- `nbf` (not-before) = `iat`. Discipline standard pour rejeter un jeton arrivé "du futur".
- `aud` = `["urn:nina-aes:verifier"]`. Restreint l'usage à l'écosystème NINA.

`biometric_hash` reste présent (placeholder `null` en P0, valeur réelle en Bloc F).

### B. Signature via Vault Transit (au lieu de kv-v2)

La clé privée RS256 (3072 bits) n'est **plus stockée en `kv-v2`** ni manipulée par le service. Elle
vit exclusivement dans **Vault Transit** (`transit/keys/nina-qr-signing`). Le service envoie le hash
SHA-256 du `signing_input` à `transit/sign/nina-qr-signing/sha2-256` et reçoit la signature. La clé
**ne quitte jamais Vault**.

Conséquences :

- Compromission du conteneur `document-service` ⇒ l'attaquant peut faire signer (audit Vault), mais
  ne peut pas exfiltrer la clé pour signer hors ligne.
- Rotation gérée par Vault avec versioning natif (`latest_version`). Le `kid` du JWT inclut la
  version (`nina-qr-signing-vN`) → coexistence vN/vN+1 sans réémission massive.

Cf. [ADR-026 — Clé QR via Vault Transit](./ADR-026-vault-transit-qr-signing.md) pour la
justification complète et le détail des alternatives rejetées.

### C. Révocation par `jti` (Redis SET avec TTL aligné sur `exp`)

Ajout d'un mécanisme de révocation **O(1)** :

- À l'émission, `jti` est généré (UUID v7 → monotone, indexable).
- Sur révocation (`DELETE /documents/:id`), `jti` est ajouté à la SET Redis `qr:rev:<jti>` avec
  `EX = exp - now()` (au-delà, le JWT est déjà invalide naturellement).
- À la vérification, `RevocationService.isRevoked(jti)` est consulté **avant** de retourner
  `valid: true`.
- En option (Pour aller plus loin §6 du doc 10), publication quotidienne d'une CRL téléchargeable
  pour vérification 100 % offline incluant les révocations.

### D. Conséquences sur la rotation de clé

Initial : "rotation = invalidation de tous les QR existants". Avec Vault Transit + `kid` versionné,
la rotation préserve les jetons signés par v(N-1) tant que JWKS expose les deux clés. La période de
coexistence recommandée est **180 jours** (= TTL d'un FDI), durée pendant laquelle l'ancienne clé
reste vérifiable. Au-delà, JWKS retire la clé v(N-1) ; les FDI émis avec elle deviennent
naturellement invalides (déjà expirés).

### E. Pas de changement sur l'algorithme

RS256 reste retenu. Les alternatives (HS256, AES, Ed25519) listées plus haut restent rejetées pour
les mêmes raisons. Ed25519 est utilisé ailleurs (audit-service, ADR-007) mais pas pour le QR mobile
public.
