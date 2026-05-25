# ADR-026 — Signature des QR FDI via Vault Transit (clé hors-process)

## Statut

Accepté — 2026-05-25

## Contexte

[ADR-006](./ADR-006-jwt-rs256-qr-code.md) acte le choix **RS256** pour signer le QR code de la Fiche
Descriptive Individuelle (FDI). La rédaction initiale supposait que la **clé privée RSA** serait
stockée dans HashiCorp Vault au format `kv-v2` puis **chargée en mémoire** par le service
`document-service` au démarrage (pattern PEM → `crypto.createSign('RSA-SHA256')`).

La revue de sécurité menée pendant la rédaction du document 10 v2.0 a mis en évidence trois
faiblesses de ce pattern :

1. **Exfiltration possible** — un attaquant qui obtient un shell dans le conteneur
   `document-service` (RCE via une CVE Puppeteer, par exemple) peut lire la clé en RAM via
   `/proc/<pid>/maps`, en faire une copie, et **signer des FDI hors-ligne** indéfiniment.
2. **Audit incomplet** — Vault enregistre l'**accès initial** au secret kv, mais pas les
   **opérations de signature** ultérieures. Impossible de reconstituer "quels documents ont été
   signés depuis hier" sans corréler les logs applicatifs (faillibles).
3. **Rotation coûteuse** — toute rotation de la clé impose un redémarrage du service pour recharger
   le matériel cryptographique, ou un mécanisme de polling complexe.

Le module `transit` de Vault répond à ces trois faiblesses : la clé est **générée et conservée** par
Vault, jamais exfiltrable, chaque appel `transit/sign` est audité, et le versioning natif permet la
rotation sans redémarrage applicatif.

## Décision

La clé privée RSA 3072 bits utilisée pour signer les QR FDI est :

1. **Générée par Vault** via `vault write -f transit/keys/nina-qr-signing type=rsa-3072` (jamais
   exposée en clair, même au moment de la création — propriété `exportable=false`).
2. **Utilisée exclusivement** via l'endpoint `transit/sign/nina-qr-signing/sha2-256` (le service
   envoie un hash SHA-256, Vault retourne la signature PKCS#1 v1.5 base64).
3. **Référencée dans le JWT** par un `kid` qui inclut la version courante de la clé
   (`nina-qr-signing-v{N}`), permettant aux vérifieurs de retrouver la bonne clé publique dans le
   JWKS exposé sur `https://auth.nina-aes.ml/.well-known/jwks-qr.json`.
4. **Soumise à une politique Vault minimale** (`infrastructure/vault/policies/document-service.hcl`)
   accordant au service uniquement `update` sur `transit/sign/...` et `read` sur la clé. Aucun droit
   de lecture sur la clé privée, aucun droit de rotation manuelle, aucun droit `export`.
5. **Rotée tous les 180 jours** par le CronJob `vault-rotation.yaml` (cf. doc 15) avec coexistence
   de v(N-1) et v(N) pendant 180 jours pour préserver les FDI existants.

L'implémentation est portée par le helper `transitSign()` du package `@nina-aes/vault-client`,
**déjà présent** (introduit en mai 2026 pour `auth-service`, cf. CHANGELOG patch 2026-05-25 §0).

## Conséquences positives

- **Clé privée jamais en RAM applicative** — l'exfiltration via RCE ne permet plus que de faire
  signer des documents pendant la durée de compromission, ce qui sera détecté immédiatement par un
  pic d'appels `transit/sign` dans les audits Vault (alerte Grafana sur `vault_audit_total`).
- **Audit cryptographique complet** — chaque signature est tracée par Vault avec `client_token` qui
  l'a demandée, payload hashé, timestamp. Reconstruction forensique 100 % fiable.
- **Rotation à chaud** — `vault write -f transit/keys/nina-qr-signing/rotate` crée v(N+1) sans
  redémarrage. Le service récupère `latest_version` à chaque signature.
- **Coexistence de versions** — les FDI signées par v(N-1) restent vérifiables tant que JWKS expose
  les deux clés. Pas de big-bang d'invalidation.
- **Politique de moindre privilège** — le service ne peut **que** signer, pas lire ni exporter la
  clé. Compromission ≠ exfiltration.

## Conséquences négatives

- **Latence supplémentaire** — chaque génération de FDI ajoute un round-trip HTTP vers Vault (~3 ms
  local, ~15 ms cross-pod). Mesure : p95 reste < 1500 ms (cf. doc 10 §13.1).
- **Dépendance dure à Vault** — un Vault sealed ou down ⇒ aucune FDI ne peut être émise. Atténué par
  : (a) Vault HA en prod, (b) cache opérationnel des `latest_version` côté service, (c) circuit
  breaker avec dégradation contrôlée (refus 503 lisible côté UI).
- **Algorithme contraint** — Vault Transit supporte RS256 et PS256, mais pas (encore) Ed25519 pour
  JWT QR. Si Ed25519 devient un requis (par exemple imposé par un standard wallet UE), bascule vers
  une clé software ou HSM dédié.
- **Coût Vault Enterprise** — en environnement gouvernemental à terme, le module Transit en HA + DR
  exige Vault Enterprise. La phase MVP utilise Vault OSS (HA suffisante).

## Note souveraineté

Vault est un logiciel **open-source** (Mozilla Public License v2) hébergeable on-premise au CTDEC
(rue Baba Diarra BP 215, Bamako). Aucune dépendance vers HashiCorp Cloud ni autre tiers étranger. La
clé `nina-qr-signing` reste physiquement dans les bases du CTDEC et juridiquement sous souveraineté
malienne. Conforme au principe directeur §13.1 de [`CLAUDE.md`](../../CLAUDE.md).

## Alternatives rejetées

- **Clé en `kv-v2`** — c'est le design initial. Rejeté pour les 3 faiblesses listées au Contexte.
- **Clé en local PEM file (Kubernetes Secret monté)** — pire encore : la clé est lisible par tout ce
  qui peut lire le filesystem du conteneur, et n'est même pas chiffrée au repos par défaut.
- **Signature via Keycloak** (réutilisation de la clé Keycloak JWT pour les sessions) — viole le
  principe de séparation des préoccupations. Une compromission de Keycloak ne devrait pas permettre
  de forger des documents d'identité. Et Keycloak n'expose pas d'API de signature de payload
  arbitraire (uniquement ses propres tokens).
- **HSM physique (YubiHSM 2, Thales Luna)** — meilleure sécurité physique mais (a) coût matériel
  important, (b) opérations complexes (PKCS#11), (c) pas adapté à l'environnement K3s du MVP. Retenu
  comme évolution future (cf. doc 10 §18.3).
- **Signature côté client mobile (Web Crypto API)** — non applicable : le service génère le PDF côté
  serveur, le mobile est consommateur en aval.

## Métriques de suivi

| Indicateur                           | Cible             | Source                                       |
| ------------------------------------ | ----------------- | -------------------------------------------- |
| Latence p95 `transit/sign`           | < 30 ms           | Prometheus `vault_request_duration_seconds`  |
| Taux d'erreur `transit/sign`         | < 0.1 % / jour    | Vault audit log + alerte Grafana             |
| Période de coexistence v(N-1) / v(N) | ≥ 180 jours       | `vault read transit/keys/nina-qr-signing`    |
| Nombre de signatures / FDI émise     | exactement 1      | Corrélation Vault audit ↔ DB `documents`     |
| Pics anormaux de `transit/sign`      | détection < 5 min | Alerte Grafana `rate(vault_audit_total[1m])` |

## Implémentation matérialisée

- ✅ `packages/vault-client/src/index.ts` : `transitSign(keyName, payloadBase64)` livré (mai 2026)
- ⏳ `infrastructure/vault/policies/document-service.hcl` : à créer dans ce même change set
- ⏳ Init script `infrastructure/vault/init/05-create-qr-key.sh` : à créer (génération initiale de
  la clé `nina-qr-signing` au boot Vault dev)
- ⏳ `services/document-service/src/qr/qr-signer.service.ts` : implémentation décrite dans doc 10
  §9.9, scaffold à produire en PROMPT 3.4

## Complète

- [ADR-006](./ADR-006-jwt-rs256-qr-code.md) — choix de l'algorithme RS256
- [ADR-013](./ADR-013-keycloak-identity-provider.md) — séparation Keycloak (sessions) vs Vault
  (signature documents)
- [ADR-019](./ADR-019-backup-recovery-strategy.md) — backup du module Transit Vault inclus dans la
  stratégie de DRP
