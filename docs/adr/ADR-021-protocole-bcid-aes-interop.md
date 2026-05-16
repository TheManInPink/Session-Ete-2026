# ADR-021 — Protocole BCID-AES custom (mTLS + JWS Ed25519) pour l'interopérabilité Mali ⇄ BFA ⇄ Niger

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [21 — Bloc B Interop AES](../21-BLOC-B-INTEROPERABILITE-AES.md)
**Complète** : [ADR-002 — Microservices](./ADR-002-microservices.md),
[ADR-006 — JWT RS256 QR code](./ADR-006-jwt-rs256-qr-code.md),
[ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md)

---

## Contexte

L'Alliance des États du Sahel (Mali, Burkina Faso, Niger, depuis septembre
2023) nécessite un protocole d'interopérabilité **souverain** pour la
vérification d'identité transfrontalière. Cas d'usage opérationnels :

- Contrôle routier d'un citoyen malien à la frontière BFA
- Ouverture d'un compte bancaire transfrontalier (KYC)
- Scolarisation d'un enfant déplacé interne (Mopti → Ouagadougou)
- Mariage transfrontalier (état civil consulaire)
- Enregistrement d'un décès survenu hors pays d'origine

Trois exigences fondamentales :

1. **Souveraineté absolue** : pas de dépendance à un trust framework
   eIDAS (UE), pas de validation par un tiers (CEDEAO, INTERPOL), pas
   de stack OAuth Federation US (Auth0, Okta).
2. **Privacy by design** : la réponse à un `verify-nina` ne doit
   **jamais** permettre de reconstruire la base citoyens du pays
   émetteur. Schéma minimaliste : `{ exists, valid, vulnerable,
   lastUpdated }`.
3. **Défense en profondeur** : mTLS pour authentifier la gateway peer,
   **plus** JWS Ed25519 pour authentifier le payload applicatif.
   Compromettre l'un ne suffit pas.

Contraintes pratiques :

- **Pas d'infra partagée AES** : chaque pays héberge sa propre gateway,
  protocole pair-à-pair direct (Mali ↔ BFA, Mali ↔ NER, BFA ↔ NER).
- **Faible volumétrie initiale** : ~100-500 verify/jour V1, croissance
  prévue ~10k/jour V2.
- **Disponibilité variable** : les datacenters BFA/NER peuvent être
  injoignables (coupures électriques, instabilité politique).

---

## Décision

**Protocole BCID-AES custom** (Border Citizen Identity — Alliance des
États du Sahel), avec les caractéristiques :

1. **REST sur HTTPS + mTLS strict** : pas de WebSocket, pas de gRPC.
   REST classique pour simplicité d'implémentation et de debug.

2. **Authentification double-couche** :
   - **mTLS** : chaque gateway présente un cert client X.509 émis par
     la **CA AES partagée** (3 root CAs cross-signed Mali / BFA / NER).
     Le hash du cert peer est cross-référencé dans la table
     `aes_partner_keys` côté serveur.
   - **JWS Ed25519** sur le payload applicatif. Algorithme `EdDSA`,
     clés Ed25519 (32 octets, RFC 8032). Verification via JWK
     enregistré dans `aes_partner_keys`.

3. **Schéma de réponse minimaliste** :
   ```json
   {
     "exists": true,
     "valid": true,
     "vulnerable": false,
     "lastUpdated": "2026-04-15"
   }
   ```
   **Jamais** de nom, prénom, photo, biométrie. Le pays demandeur ne
   peut pas constituer une base parallèle des citoyens du pays cible.

4. **Versionnage explicite par path** : `/v1/verify-nina`. `v2`
   ajoutera des verbes (`renew-nina-cross-border`,
   `notify-marriage-event`, etc.). Pas de rupture rétrocompatibilité —
   `v1` reste supporté ≥ 5 ans après `v2`.

5. **Rate limiting contractuel** : 1 000 req/h/pays. Au-delà, HTTP 429.
   Sliding window glissant via Redis sorted set (précision seconde).

6. **Audit cross-border 10 ans** : table `aes_verification_logs` avec
   chaîne Merkle compatible audit-service (cf. ADR-014). Chaque
   verification (demandée OU répondue) est tracée pour preuve
   cryptographique en cas de litige.

7. **Privacy by design — purpose limitation** : chaque requête doit
   inclure un `purpose` enum (`border-control`, `bank-kyc`,
   `school-enrollment`, `healthcare`, `marriage-registration`). Logué
   dans `aes_verification_logs`. Hors-liste = 400.

---

## Conséquences positives

- **Souveraineté préservée** : 100 % open-source, aucune CA externe,
  aucune validation par un tiers. Si demain les 3 pays AES veulent
  intégrer le Tchad, c'est une décision politique entre eux — pas
  besoin de l'accord de l'UE ou de l'ONU.
- **Privacy garantie par construction** : impossible de reconstruire
  une base citoyens à partir des réponses BCID-AES. Le format
  minimaliste est une **propriété du protocole**, pas une discipline
  applicative.
- **Audit cryptographique** : chaque verification est signée + chaînée
  Merkle. Un partenaire mal-intentionné qui ferait des requêtes
  abusives laisse une trace inaltérable.
- **Évolutif** : versioning par path `/v1`, `/v2`. Pas de breaking
  change forcé sur les partenaires.
- **Défense en profondeur** : compromettre la CA AES ne suffit pas (il
  faut aussi voler la clé Ed25519 BFA dans Vault). Compromettre une
  clé Ed25519 ne suffit pas (il faut aussi avoir un cert client
  valide). 2 facteurs indépendants.
- **Audit ANSSI-compatible** : protocole entièrement documenté
  (OpenAPI 3.1) + logs cryptographiques + procédure d'onboarding
  partners. Un auditeur peut tracer chaque requête.

---

## Conséquences négatives

- **Pas de standard externe** : BCID-AES n'est pas eIDAS, pas RFC. Si
  un 4ᵉ pays veut intégrer (Mauritanie, Tchad), il doit implémenter
  notre spec. Coût initial.
- **CA AES partagée = gouvernance politique** : décider qui émet, qui
  révoque, qui rotate la root CA est un problème institutionnel non
  trivial. ADR-021 documente le protocole mais pas la gouvernance.
- **Rotation des clés Ed25519** : si BFA rotate sans coordonner, Mali
  rejette toutes ses requêtes pendant la fenêtre de transition.
  Mitigation : champ `kid` dans le JWS header + table multi-clés
  active simultanément.
- **Pas de couverture eIDAS** : citoyens AES en Europe ne bénéficient
  pas du protocole. Pertinent V3 pour gateway optionnelle eIDAS bridge.
- **Verbosité réseau** : chaque requête = handshake mTLS + JWS sign +
  JWS verify + JWS sign réponse + JWS verify réponse. Overhead ~150 ms
  par appel. Acceptable pour 500/jour, à optimiser à 10k/jour V2.

---

## Note sur la souveraineté numérique

BCID-AES est explicitement **anti-eIDAS** au sens où les 3 pays AES
refusent toute supervision européenne sur leur trust framework
d'identité. Pas par antagonisme, mais par cohérence avec la position
géopolitique AES (sortie CEDEAO, indépendance vis-à-vis des organes
régionaux UEMOA/CEDEAO depuis 2024).

Quatre principes :

1. **CA root AES indépendante** : ni cross-signée par WebPKI, ni par
   eIDAS. Les certs BCID-AES ne sont valides QUE pour le protocole
   BCID-AES.
2. **Clés Ed25519 self-hosted** : générées dans Vault Transit côté
   chaque pays. Jamais exportées hors du datacenter d'origine.
3. **Pas de Cloudflare / Akamai** comme reverse proxy public BCID-AES :
   les gateways sont hébergées directement sur les datacenters
   ministériels (CTDEC Mali, DGEC Burkina, DGE-CIN Niger).
4. **Stockage logs souverain** : `aes_verification_logs` reste sur
   PostgreSQL self-hosted Mali. Réplication MinIO secondaire (cf.
   doc 19) uniquement vers DC AES, pas vers cloud tiers.

---

## Alternatives rejetées

- **eIDAS Node integration** : permet aux citoyens AES d'utiliser leur
  identité numérique en UE. Rejeté car (a) impose la validation UE,
  (b) datacenters UE = juridiction UE sur les logs, (c) incompatible
  avec la position politique AES.

- **OAuth 2.0 Federation / OpenID Connect Federation** : standard
  mature mais (a) impose Authorization Server par pays → 3 AS à
  fédérer, (b) flux interactif (browser redirect) incompatible avec
  notre cas serveur-to-serveur, (c) overkill pour le scope minimal de
  BCID-AES.

- **SAML 2.0** : standard d'authentification fédérée mature mais (a)
  XML-Signature complexe et bug-prone, (b) écosystème déclinant face
  à OIDC, (c) overkill.

- **W3C Verifiable Credentials + DID** : moderne, élégant, basé sur
  cryptographie self-sovereign. Pertinent V3 quand l'écosystème
  mature. V1 = trop early, manque de bibliothèques production-ready
  pour notre stack NestJS+FastAPI.

- **INTERPOL I-24/7** : système de partage d'identité existant entre
  forces de police. Hors scope (criminel ≠ civil), et politiquement
  exclu (gouvernance Lyon = soumise UE).

- **CEDEAO biometric exchange** : protocole proposé par la CEDEAO en
  2022. Rejeté car (a) le Mali a quitté la CEDEAO en 2024, (b) le
  protocole ne couvre que la biométrie pas l'état civil.

- **gRPC** (vs REST) : performances supérieures, schémas Protobuf
  statiquement typés. Rejeté car (a) HTTP/2 mTLS plus complexe à
  configurer côté Ingress Nginx, (b) debugging plus difficile (binary),
  (c) bénéfice perf non significatif pour 500-10k req/jour.

- **gRPC-Web** : alternative REST mature. Mêmes contre-arguments que
  gRPC sur la complexité, sans le bénéfice perf.

- **NoSignature on payload (mTLS seul)** : option « rapide » mais
  rejetée. mTLS seul = compromis le serveur Mali = le pays attaquant
  peut forger n'importe quel payload. Le JWS est la 2ᵉ couche
  défense.

- **JWE (chiffrement)** au lieu de JWS (signature) : confidentialité
  vs intégrité. Rejeté car mTLS fournit déjà la confidentialité
  transport. JWS suffit pour l'intégrité + non-répudiation.

- **RSA 2048** (vs Ed25519) : standard mature mais (a) signatures 4×
  plus longues, (b) verification 10× plus lente, (c) Ed25519 est
  l'algo recommandé par tous les standards modernes (RFC 8037,
  IETF curdle WG).

---

## Suivi

Métriques à observer pendant les 6 mois suivant l'activation :

| Métrique                                                | Cible              | Outil de mesure                              |
| ------------------------------------------------------- | ------------------ | -------------------------------------------- |
| Disponibilité interop Mali                              | > 99.5 %           | Blackbox exporter + Grafana                  |
| Latence p95 `verify-nina`                               | < 800 ms           | Prometheus histogram                         |
| Taux de signatures invalides                            | < 0.1 %            | Logs Loki + Counter Prometheus               |
| Rate limit hits (429) / mois                            | < 50               | Counter `aes_rate_limit_exceeded_total`     |
| Audit Merkle chain breaks                               | 0 toléré           | Alerte critique (cf. doc 17)                 |
| Volumétrie verify-nina / pays / jour                    | tracking only      | Dashboard governance                          |
| Taux d'erreurs métier (404, 410)                        | tracking only      | Dashboard governance                          |
| Temps de réponse onboarding nouveau pays                | < 2 semaines       | Manuel (PARTNER-ONBOARDING.md)               |
| Rotation Ed25519 keys                                   | Trimestrielle      | Vault Transit auto-rotation                  |
| Coût bande passante BCID-AES / mois                     | < 1 GB             | Métriques Ingress Nginx                      |

Si **disponibilité descend sous 99 %**, ou si **un Merkle chain break**
est détecté, déclencher une revue ADR.
