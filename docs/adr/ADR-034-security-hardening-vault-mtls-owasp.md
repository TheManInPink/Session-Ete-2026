# ADR-034 — Durcissement sécurité : Vault (KV/Transit/PKI/Database) + mTLS Linkerd strict + OWASP Top 10 + scans CI

**Statut** : ✅ Accepté · **Date** : 2026-06-18 · **Décideurs** : Étudiant UQAR (solo) · **Contexte
document** : [15 — Security Hardening](../15-SECURITY-HARDENING.md) · **Complète** :
[ADR-006 JWT RS256+QR](./ADR-006-jwt-rs256-qr-code.md),
[ADR-007 Merkle audit](./ADR-007-merkle-audit.md),
[ADR-010 Infra Docker](./ADR-010-infrastructure-docker-compose.md),
[ADR-013 Keycloak](./ADR-013-keycloak-identity-provider.md)

---

## Contexte

NINA-AES manipule des **données d'identité d'État** (numéros NINA, biométrie hashée, PII de
citoyens). Le modèle de menace n'est donc pas celui d'un produit SaaS classique : une fuite y est un
**risque de souveraineté nationale** (usurpation d'identité de masse, ciblage de minorités,
détournement électoral). Le document 15 décrit _comment_ durcir la plateforme. Le présent ADR fige
_pourquoi_ ces choix techniques précis ont été retenus, afin qu'une revue ultérieure (ANSSI Mali,
OCLEI, jury UQAR) puisse les auditer sans reconstituer le raisonnement.

Le problème central à résoudre tient en trois questions :

1. **Où vivent les secrets ?** Jusqu'au document 14, des secrets transitent encore par des fichiers
   `.env` (clé JWT, mots de passe Postgres). Tant qu'un secret peut être lu dans le filesystem d'un
   conteneur ou dans l'historique Git, le système n'est pas défendable.
2. **Comment un service prouve-t-il son identité à un autre ?** En HTTP nu intra-cluster, un pod
   compromis se fait passer pour n'importe quel autre service par une simple requête. Il faut une
   **identité cryptographique courte durée** par service.
3. **Comment empêcher une régression silencieuse ?** Un endpoint sans rate-limit en MVP reste sans
   rate-limit en prod « parce que ça marche ». Le durcissement doit être **vérifié en continu** par
   la CI, pas par la discipline humaine.

> **Pourquoi un ADR dédié maintenant ?** Le document 15 référençait à l'origine un `ADR-018`
> inexistant (ce numéro est en réalité « ADR-018 — stratégie de tests / pyramide »). La référence
> était donc cassée. Ce fichier crée l'ADR sécurité manquant sous le numéro libre **034** ; le lien
> cassé dans le document 15 (réfs ADR-018 lignes 17/368/468/511) **reste à repointer vers ADR-034**
> (tracé comme reste-à-faire).

Cet ADR **agrège et fige** des décisions de sécurité déjà actées ponctuellement ailleurs (ADR-006
signature QR, ADR-007 audit Merkle, ADR-013 Keycloak, ADR-026 Transit QR) en une posture de
durcissement transversale unique.

---

## Décision

Adopter une posture de durcissement reposant sur **8 piliers**. Chacun répond à une menace précise
et est vérifiable.

### Pilier 1 — Vault comme coffre-fort racine (4 moteurs sur le chemin critique)

HashiCorp Vault 1.18 (open-source, MPL v2, auto-hébergeable) est la **source unique de vérité** pour
tout secret. Quatre moteurs sont activés sur le chemin critique (un cinquième, `totp/`, sert au MFA
agents hors chemin critique) :

| Moteur Vault | Rôle dans NINA-AES                                                                                                                                                     | Pourquoi ce moteur                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **KV v2**    | Config applicative versionnée (URLs, paramètres non rotatifs)                                                                                                          | Versioning natif → rollback d'un secret corrompu sans backup externe       |
| **Transit**  | Chiffrement des PII + signature de la clé QR RS256 (Ed25519 NON supporté par Transit, cf. ADR-026 — le scellement audit Ed25519 est in-process @noble/ed25519, doc 09) | La clé **ne quitte jamais Vault** ; chaque opération est auditée (ADR-026) |
| **PKI**      | CA interne émettant les certs client X.509 du mTLS inter-services                                                                                                      | CA souveraine on-premise, pas de dépendance ACME publique sur le cœur      |
| **Database** | Génération dynamique de credentials Postgres à TTL court                                                                                                               | Un mot de passe figé 6 mois est un risque dormant ; ici TTL 24 h, max 7 j  |

Règle invariante : **aucun secret en clair** dans le repo, ni dans `.env.example`, ni dans une
issue, ni dans l'historique Git (vérifié par `gitleaks`, pilier 5).

### Pilier 2 — mTLS strict intra-cluster (Linkerd 2.16, mode `strict`)

Linkerd injecte un sidecar `linkerd2-proxy` dans chaque pod. **Toutes** les connexions TCP
inter-services sont chiffrées et mutuellement authentifiées par un cert X.509 émis par la CA Linkerd
(adossée à la PKI Vault en prod), avec rotation automatique **toutes les 24 h**.

Le mode retenu est **`strict`** (et non `permissive`) : une requête en clair (sans mTLS) entre deux
pods du maillage est **refusée**, pas seulement tolérée-et-loggée. C'est ce qui matérialise le
_zero-trust_ : un pod compromis ne peut pas pivoter en HTTP nu vers `identity-service`.

> **Pourquoi Linkerd et pas Istio ?** Voir Alternatives rejetées. En résumé : empreinte mémoire
> divisée par ~4, courbe d'apprentissage compatible avec un étudiant solo, mTLS « par défaut » sans
> configuration de `PeerAuthentication`.

### Pilier 3 — `applyHardening()` du package `@nina-aes/security`

Appliquer Helmet, CORS, rate-limit et validation **manuellement** dans chaque `main.ts` multiplie le
risque d'oubli (A05 Security Misconfiguration). Un package partagé `@nina-aes/security` exporte un
unique `applyHardening(app)` appelé par chaque microservice NestJS. Il centralise :

- **Helmet** : CSP, HSTS (`maxAge` 1 an, `preload`), `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, COOP `same-origin`.
- **CORS strict** : `origin` lue depuis `@nina-aes/config` (liste blanche), jamais `*`.
- **ValidationPipe global** : `whitelist: true` + `forbidNonWhitelisted: true` → toute entrée non
  décrite par un DTO Zod est **rejetée** (défense A03 Injection en profondeur).
- **`@nestjs/throttler`** : rate-limit par IP / par utilisateur (anti-bruteforce).

Conséquence visée (cible, **pas encore déployée** : le package `@nina-aes/security` reste à créer) :
on documenterait une fois, on appliquerait partout. Un audit relirait alors **un** fichier
(`packages/security/src/index.ts`) plutôt que 11 `main.ts`.

### Pilier 4 — Rotation des clés (90 j JWT / 24 h Postgres / 7 j refresh) + JWKS

| Secret                       | Période de rotation | Mécanisme                                                       |
| ---------------------------- | ------------------- | --------------------------------------------------------------- |
| Clé de signature JWT (RS256) | **90 jours**        | Vault Transit `rotate` + `kid` versionné → coexistence via JWKS |
| Mot de passe Postgres        | **24 h** (max 7 j)  | Moteur Database : rôle dynamique, révocation auto à expiration  |
| Refresh token utilisateur    | **7 j** (sliding)   | Suivi Redis + rotation Keycloak (ADR-013)                       |
| Cert client mTLS             | **24 h**            | Rotation automatique Linkerd                                    |

La rotation des clés de signature **ne casse pas** les jetons existants : le `kid` du JWT inclut la
version de la clé, et le **JWKS** (`/.well-known/jwks.json`) expose à la fois v(N-1) et v(N) pendant
une période de coexistence. Les vérifieurs (police, consulats, applications mobiles) retrouvent
toujours la bonne clé publique. Discipline identique à ADR-006/ADR-026 pour la clé QR.

### Pilier 5 — Scans automatisés en CI (Trivy / Semgrep / gitleaks / Bandit / OWASP ZAP)

La CI GitHub Actions (`.github/workflows/security-scan.yml`) **bloque la merge** (exit-code 1) si
l'un des scans détecte un problème de sévérité ≥ HIGH :

| Outil          | Cible                                    | Type        | Blocage              |
| -------------- | ---------------------------------------- | ----------- | -------------------- |
| **Trivy**      | Images Docker + deps                     | SCA / image | CRITICAL, HIGH       |
| **Semgrep**    | Code TS/JS (rules `p/owasp-top-ten`)     | SAST        | findings OWASP       |
| **gitleaks**   | Historique Git complet (`fetch-depth:0`) | Secrets     | tout secret détecté  |
| **Bandit**     | Services Python (ai, anticorruption)     | SAST Python | HIGH                 |
| **pnpm audit** | Dépendances Node                         | SCA         | `--audit-level high` |
| **OWASP ZAP**  | API Gateway (DAST baseline)              | DAST        | 0 HIGH exigé         |

`gitleaks` tourne aussi en **pre-commit hook** local pour rejeter un secret avant même le push.

### Pilier 6 — CSP à `nonce` côté Next.js (pas de `unsafe-inline` en prod)

Les frontends (citizen :4001, admin :4002, governance :4003) appliquent une
**Content-Security-Policy stricte basée sur `nonce`** : chaque réponse SSR injecte un `nonce`
aléatoire par requête, et seuls les `<script nonce="…">` correspondants s'exécutent. Cela ferme la
voie XSS sans recourir à `'unsafe-inline'` (toléré uniquement en dev local, jamais en prod). Le
`nonce` est propagé via les en-têtes du middleware Next.js et le `directives.scriptSrc` de Helmet
côté BFF.

### Pilier 7 — Secrets livrés par AppRole / ServiceAccount (jamais de token long-lived)

Aucun service ne détient de `VAULT_TOKEN` racine ou de longue durée. L'authentification à Vault se
fait par identité courte durée :

- **En production (K3s)** : auth `kubernetes` — le service présente le JWT de son
  **ServiceAccount**, Vault le valide auprès de l'API K8s et délivre un token applicatif à TTL
  court, **renouvelé par lease** tant que le pod vit.
- **En développement** : **AppRole** (`role_id` + `secret_id` éphémère) pour reproduire le flux sans
  cluster, ou token root strictement local jamais commité.

Chaque service reçoit une **politique Vault de moindre privilège** : `identity-service` peut lire
son propre secret KV et appeler `transit/encrypt|decrypt` sur la clé PII, mais ne peut **ni lire ni
exporter** une clé privée, ni rotationner manuellement.

> **Dette honnête (concu ≠ implementé)** : l'extrait `fetchVaultSecret()` du document 15 §4.4 lit
> encore `process.env.VAULT_TOKEN`. C'est un **scaffold de transition** : le passage à AppRole +
> lease renewal est **spécifié** ici mais **pas encore implémenté** dans tous les services. Cette
> ADR l'acte comme cible, et le `SECURITY-RUNBOOK.md` trace le reste-à-faire.

### Pilier 8 — Threat model STRIDE par microservice

Chaque microservice du Bloc A fait l'objet d'une analyse **STRIDE** (Spoofing, Tampering,
Repudiation, Information disclosure, Denial of service, Elevation of privilege) documentée dans
`docs/security/THREAT-MODEL.md`. Le tableau ci-dessous illustre le mapping menace → contre-mesure
(pilier qui la traite) :

| Menace STRIDE              | Exemple NINA-AES                             | Contre-mesure (pilier)                                                                                                                |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **S**poofing               | Un pod usurpe `identity-service`             | mTLS strict — cert X.509 par service (P2)                                                                                             |
| **T**ampering              | Falsification d'un enregistrement d'audit    | Hash-chain SHA-256 (ADR-007) + scellement horaire Ed25519 de la racine vers HSM externe + ancrage tiers Vérificateur Général (doc 09) |
| **R**epudiation            | « Je n'ai pas signé ce FDI »                 | `transit/sign` audité côté Vault (ADR-026, P1)                                                                                        |
| **I**nformation disclosure | Exfiltration d'un secret depuis un conteneur | Secrets hors filesystem, AppRole + lease (P7)                                                                                         |
| **D**enial of service      | Bruteforce d'un endpoint d'auth              | Throttler + lock-out Keycloak (P3, ADR-013)                                                                                           |
| **E**levation of privilege | Un agent obtient des droits admin            | RBAC Keycloak + guards `@Roles()` (A01, P3)                                                                                           |

---

## Conséquences

### ✅ Positives

- **Surface de secret réduite à zéro côté repo** : plus aucun secret en clair ; un attaquant qui lit
  le code ou l'historique Git n'obtient rien d'exploitable.
- **Exfiltration de clé impossible** : les clés de signature/chiffrement vivent dans Transit ; une
  RCE permet au mieux de _faire signer_ pendant la fenêtre de compromission (détectée par un pic
  `vault_audit_total`), jamais d'emporter la clé pour signer hors-ligne.
- **Zero-trust effectif** : le mTLS `strict` transforme « tout pod peut parler à tout pod » en «
  seuls les pods porteurs d'un cert valide peuvent communiquer ».
- **Non-régression garantie par la machine** : la CI bloque toute dépendance vulnérable HIGH, tout
  secret commité, tout pattern OWASP — sans dépendre de la vigilance d'un mainteneur solo.
- **Auditabilité** : un évaluateur ANSSI/OCLEI relit **un** ADR + **un** package
  `@nina-aes/security`
  - **une** politique Vault par service, plutôt que de fouiller 11 microservices.
- **Cohérence cryptographique** : RS256 (RSA-3072 mini) pour les jetons publics, Ed25519 pour
  l'audit interne, Argon2id pour les secrets bas niveau — aligné sur les principes directeurs du
  repo. **Réserve** : l'Ed25519 d'audit est signé **in-process via `@noble/ed25519`** (doc 09),
  **pas** par Vault Transit (qui ne supporte pas Ed25519, cf. ADR-026) ; seul RS256 (clé QR) passe
  par Transit. Ne pas re-suggérer un « Transit-Ed25519 » inexistant.

### ⚠️ Négatives / compromis acceptés

- **Dépendance dure à Vault** : un Vault _sealed_ ou _down_ empêche tout démarrage de service et
  toute émission de FDI. Atténué par : Vault HA en prod, auto-unseal Transit (voir Note
  souveraineté), cache opérationnel côté service, circuit breaker à dégradation lisible (503).
- **Latence ajoutée** : chaque appel `transit/sign|encrypt` ajoute un round-trip (~3 ms local, ~15
  ms cross-pod) ; le sidecar Linkerd ajoute ~1 ms p50. Mesuré comme négligeable (p95 FDI < 1500 ms,
  cf. doc 10).
- **Complexité opérationnelle** : Vault + Linkerd + 6 scans CI = plus de pièces mobiles à maintenir
  pour une seule personne. Atténué par la documentation (`SECURITY-RUNBOOK.md`) et l'automatisation
  (bootstrap scripts, CronJob de rotation).
- **Coût Vault Enterprise à terme** : Transit en HA + DR de niveau gouvernemental exige Vault
  Enterprise. La phase MVP utilise Vault OSS (HA suffisante pour l'échelle actuelle).
- **Dette d'implémentation assumée** : AppRole/lease renewal (P7) et CSP nonce prod (P6) sont
  **spécifiés mais partiellement implémentés** ; tracés dans le runbook. Honnêteté > sur-vente.

---

## Note souveraineté

Tous les outils retenus sont **open-source et auto-hébergeables au CTDEC** (rue Baba Diarra BP 215,
Bamako), sans aucune dépendance sur le chemin critique vers un tiers étranger : Vault (MPL v2),
Linkerd (Apache 2.0), Trivy/Semgrep/gitleaks/Bandit/ZAP, Keycloak (Apache 2.0).

Le point le plus sensible est l'**auto-unseal de Vault**. La pratique de l'industrie est d'utiliser
**AWS KMS** (ou Azure Key Vault / GCP KMS) comme « clé maîtresse » qui déverrouille automatiquement
Vault au redémarrage. **C'est rejeté ici** : confier la clé de déverrouillage du coffre-fort
d'identité nationale à un cloud américain est inacceptable au regard du principe ZÉRO dépendance
étrangère sensible. La solution retenue est l'**auto-unseal via un second Vault Transit souverain**
(`seal "transit"`) — un Vault « racine » hébergé sur une infrastructure distincte du CTDEC
déverrouille les Vault applicatifs. À défaut, on retombe sur l'**unseal Shamir manuel** (5 parts,
seuil 3, réparties entre opérateurs CTDEC distincts), moins automatique mais 100 % souverain. De
même, la PKI mTLS s'appuie sur la **CA interne Vault**, pas sur une ACME publique (Let's Encrypt
réservé aux seuls certs serveurs _exposés sur Internet_, jamais au cœur inter-services).

---

## Alternatives rejetées

- **Istio (au lieu de Linkerd)** — service mesh le plus répandu, mais empreinte mémoire ~4×
  supérieure (Envoy + istiod), configuration mTLS verbeuse (`PeerAuthentication`,
  `DestinationRule`), courbe d'apprentissage incompatible avec un mainteneur solo. Linkerd offre le
  mTLS `strict` « par défaut » pour un coût opérationnel bien moindre.
- **Secrets en variables d'environnement / Kubernetes Secrets nus** — les `Secret` K8s sont base64
  (pas chiffrés) et lisibles par quiconque a `get secret` sur le namespace ; les `.env` fuient dans
  l'historique Git et les logs. Aucun versioning, aucune rotation, aucun audit d'accès. Rejeté au
  profit de Vault (P1) + AppRole (P7).
- **Snyk Cloud / Datadog Security / GitHub Advanced Security** — SaaS US qui exfiltrent le code
  source et les métadonnées de vulnérabilité vers des serveurs hors souveraineté. Rejeté ; remplacés
  par les équivalents open-source auto-hébergés (Trivy/Semgrep/gitleaks/Bandit/ZAP).
- **AWS KMS pour l'auto-unseal Vault** — voir Note souveraineté. Remplacé par Transit auto-unseal
  souverain ou Shamir manuel.
- **Implémentation maison du hardening (middleware ad hoc par service)** — multiplie le risque
  d'oubli et de divergence. Remplacé par `applyHardening()` centralisé (P3).
- **Alertes via Slack / PagerDuty** — services US hors chemin souverain ; remplacés par **Matrix /
  email** pour la notification d'incident de sécurité (cohérent avec la stack observabilité doc 17).

---

## Métriques de suivi

| Indicateur                                     | Cible             | Source                                                 |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------ |
| Trafic intra-cluster chiffré (mTLS)            | **100 %**         | `linkerd viz stat` / `linkerd viz tap` (`tls=true`)    |
| Secrets en clair dans le repo                  | **0**             | `gitleaks detect --no-git` (CI + pre-commit)           |
| Vulnérabilités HIGH/CRITICAL en image          | **0** au merge    | Trivy CI (exit-code 1)                                 |
| Findings OWASP Semgrep non résolus             | **0** au merge    | Semgrep CI (`p/owasp-top-ten`)                         |
| Alertes HIGH OWASP ZAP (DAST baseline)         | **0**             | `zap-baseline.py` rapport HTML                         |
| Couverture OWASP Top 10:2021                   | **10/10** mesures | Tableau doc 15 §4.5                                    |
| Âge max d'une clé de signature JWT             | **≤ 90 jours**    | `vault read transit/keys/jwt-rs256` (`latest_version`) |
| TTL effectif des credentials Postgres          | **≤ 24 h**        | `vault read database/creds/<service>` + `\du` Postgres |
| Délai de détection d'un pic `transit/sign`     | **< 5 min**       | Alerte Grafana `rate(vault_audit_total[1m])`           |
| Renouvellement cert mTLS                       | **≤ 24 h**        | Rotation automatique Linkerd                           |
| Services migrés vers AppRole/SA (vs token env) | **suivi → 100 %** | `SECURITY-RUNBOOK.md` (dette P7 tracée)                |

---

## Implémentation matérialisée

- ⏳ `packages/security/src/index.ts` : `applyHardening(app)` (Helmet + CORS + ValidationPipe) —
  **spécifié doc 15 §4.2, package pas encore créé**
- ⏳ `infrastructure/vault/policies/*.hcl` : politiques de moindre privilège par service (à
  compléter)
- ⏳ `infrastructure/vault/scripts/bootstrap.sh` : activation des 4 moteurs + KV initial
- ⏳ `.github/workflows/security-scan.yml` : Trivy/Semgrep/gitleaks/Bandit/pnpm-audit/ZAP
- ⏳ Auth Vault **AppRole/ServiceAccount** + lease renewal (P7) : **spécifié, pas encore
  généralisé**
- ⏳ CSP **nonce** prod côté Next.js (P6) : **spécifié, en cours**
- ⏳ `docs/security/SECURITY-RUNBOOK.md` et `docs/security/THREAT-MODEL.md` (STRIDE) : à produire

## Complète

- [ADR-006](./ADR-006-jwt-rs256-qr-code.md) — signature RS256 des QR FDI (rotation 90 j alignée)
- [ADR-007](./ADR-007-merkle-audit.md) — audit Merkle chaîné Ed25519 (réponse à
  Tampering/Repudiation)
- [ADR-010](./ADR-010-infrastructure-docker-compose.md) — infra Docker/K3s où s'injectent Vault +
  Linkerd
- [ADR-013](./ADR-013-keycloak-identity-provider.md) — Keycloak (sessions, MFA, lock-out) ≠ Vault
  (secrets)
- [ADR-026](./ADR-026-vault-transit-qr-signing.md) — clé QR hors-process via Vault Transit (cas
  concret de P1)
