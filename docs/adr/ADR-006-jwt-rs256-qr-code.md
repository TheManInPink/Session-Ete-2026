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
