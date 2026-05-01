# ADR-013 — Keycloak 26.1 comme Identity Provider

**Statut** : ✅ Accepté **Date** : 2026-04-09 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [08 — Backend Auth Service](../08-BACKEND-AUTH-SERVICE.md)

---

## Contexte

La plateforme NINA-AES a besoin d'un système d'authentification robuste pour :

- **3 applications frontend** (citizen, admin, governance)
- **9 microservices NestJS** qui doivent valider les tokens
- **2 services Python** (ai, anticorruption)
- **Plusieurs rôles** (citizen, agent, admin, governance_viewer)
- **Inscription de citoyens** avec vérification du NINA
- **Audit des connexions** pour la lutte anti-corruption

Quatre options ont été envisagées :

### Option A — Implémentation maison (JWT + bcrypt + PostgreSQL)

- ➕ Contrôle total du code
- ➕ Simple pour débuter
- ➖ **Risque cryptographique** : facile de faire des erreurs (timing attacks, JWT alg confusion,
  rainbow tables sur bcrypt mal salé)
- ➖ 3-6 mois de développement pour atteindre le niveau de sécurité d'une solution éprouvée
- ➖ Pas de console admin pour gérer les utilisateurs
- ➖ Pas de support OIDC natif (impossible de fédérer avec d'autres systèmes)
- ➖ Pas de MFA out-of-the-box
- ➖ Audit/log à implémenter soi-même

### Option B — Auth0 / Clerk / Firebase Auth (SaaS)

- ➕ Production-ready immédiatement
- ➕ Interface admin moderne
- ➖ **Payant** en production (Auth0 : $240/mois à partir de 1000 MAU ; Clerk gratuit mais limité)
- ➖ **Lock-in propriétaire** — migration future coûteuse
- ➖ **Hébergement hors Mali** — problème de souveraineté numérique pour un projet d'identité
  nationale
- ➖ Données utilisateurs stockées chez un tiers US/UE
- ➖ Pas accessible pour un projet académique sans budget

### Option C — Ory Kratos + Hydra

- ➕ Open source, auto-hébergé
- ➕ Architecture moderne (Cloud Native)
- ➖ **Complexité** : 3-4 services distincts à orchestrer (Kratos, Hydra, Keto, Oathkeeper)
- ➖ Courbe d'apprentissage raide (documentation technique dense)
- ➖ Communauté plus petite que Keycloak
- ➖ Pas d'UI admin polyvalente par défaut (il faut coder la sienne)

### Option D — Keycloak 26.1 (choix) ✅

- ➕ **Open source** (Apache 2.0), maintenu par Red Hat
- ➕ **Un seul service** à déployer (1 container Docker)
- ➕ **Console admin web** complète out-of-the-box
- ➕ **OIDC + OAuth2 + SAML** certifiés
- ➕ **MFA** (TOTP, WebAuthn) intégré
- ➕ **Fédération** (LDAP, AD, Google, Facebook, custom OIDC)
- ➕ **Password policies** configurables (déjà utilisé dans le realm)
- ➕ **Brute force protection** intégrée (temporary lock-out)
- ➕ **Themes** personnalisables pour les écrans de login
- ➕ **Communauté énorme** — 20k+ stars GitHub, documentation riche
- ➕ **Audit log intégré** (events stockés dans la DB)
- ➕ **Gratuit**, auto-hébergé → compatible souveraineté Mali
- ➕ Intégration NestJS bien documentée (jwks-rsa, passport-jwt)
- ➖ **Java** → ~300 MB RAM au démarrage (acceptable)
- ➖ Configuration initiale verbose (compensé par `realm-export.json` versionné)

---

## Décision

Adopter **Keycloak 26.1** comme Identity Provider unique de la plateforme NINA-AES.

### Architecture retenue

```
┌─────────────────┐     JWT RS256      ┌──────────────────┐
│  Frontend apps  │ ◄─────────────────►│   auth-service   │
│  (Next.js x 3)  │                    │    (NestJS)      │
└─────────────────┘                    └────────┬─────────┘
                                                │ HTTP
                                                ▼
                                        ┌──────────────────┐
                                        │   Keycloak 26.1  │
                                        │   (realm NINA)   │
                                        └────────┬─────────┘
                                                │
                            ┌───────────────────┼───────────────────┐
                            ▼                   ▼                   ▼
                     ┌──────────┐        ┌──────────┐        ┌──────────┐
                     │PostgreSQL│        │  Redis   │        │  Backup  │
                     │ keycloak │        │ sessions │        │  SQL/JSON│
                     └──────────┘        └──────────┘        └──────────┘
```

### Règles invariantes

1. **Tous les tokens sont émis par Keycloak** — le `auth-service` ne signe jamais ses propres JWT
2. **Tous les services valident les tokens via JWKS** — clé publique récupérée dynamiquement depuis
   Keycloak (pas de secret partagé)
3. **Le `auth-service` est la SEULE façade vers Keycloak** — aucun autre service n'appelle Keycloak
   directement
4. **Les refresh tokens sont suivis dans Redis** pour permettre la révocation immédiate (logout)
5. **Le realm est versionné** dans `infrastructure/keycloak/realm-export.json` — reproductible sur
   n'importe quelle machine
6. **Les mots de passe admin en dev** (`admin_dev`, `Citoyen@2026!`) sont **bannis en production**
   via un secret Vault (doc 05 + doc 26)

---

## Conséquences

### ✅ Positives

- **Sécurité** : on hérite automatiquement de 15 ans d'audits de sécurité sur Keycloak
- **Productivité** : un realm fonctionnel en 30 minutes vs plusieurs semaines pour une impl maison
- **Console admin** : les futurs utilisateurs (agents, admins) peuvent être gérés visuellement
- **Extensibilité** : ajouter MFA, SSO Google, LDAP AES = case à cocher dans la console admin
- **Audit** : les events Keycloak (login success/fail, password reset, etc.) sont loggés
  automatiquement et pourront être importés dans notre audit-service (doc 09)
- **Standards** : OIDC/OAuth2 compatibles avec n'importe quel client moderne (mobile, IoT, services
  tiers)
- **Souveraineté** : déploiement au Mali possible (AWS EU → Orange Cloud Mali futur)

### ⚠️ Négatives / compromis acceptés

- **Surface d'attaque** : Keycloak est une application Java complexe → il faut suivre les CVE et
  patcher rapidement
- **Consommation mémoire** : ~300 Mo RAM vs ~50 Mo pour une impl NestJS pure (acceptable)
- **Lock-in modéré** : la migration depuis Keycloak vers un autre IdP OIDC reste possible (les
  tokens sont standards) mais demande de migrer les utilisateurs + hashs
- **Dépendance réseau** : si Keycloak est down, plus aucune nouvelle connexion possible → mitigé par
  un **cache JWKS de 10 minutes** dans chaque service (les tokens existants continuent de
  fonctionner)
- **Temps de démarrage** : ~15 secondes en dev (vs 2s pour NestJS) → pas bloquant en développement,
  acceptable en prod

### 🔄 Scénarios de migration futurs

Si dans 3 ans le projet passe à un IdP différent (ex: souveraineté AES impose une solution
ouest-africaine) :

1. **Les tokens restent compatibles** (format OIDC standard)
2. **Le code applicatif ne change pas** — seul `KeycloakService` est à réécrire
3. **Les utilisateurs sont exportés** via `kc.sh export` puis importés dans le nouveau système
4. **Les hashs bcrypt restent valides** (format standard)

Ce scénario est documenté dans l'ADR pour garantir qu'on ne s'enferme pas techniquement.

---

## Configuration minimale du realm

Détails complets dans **§ 4.3 du document 08**. Résumé :

| Élément                    | Valeur                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| **Realm**                  | `nina-aes`                                                            |
| **Access token lifespan**  | 15 min (900 s)                                                        |
| **Refresh token lifespan** | 30 min (1800 s) en dev, 24h en prod                                   |
| **SSO session max**        | 10h                                                                   |
| **Password policy**        | 12+ car., majuscule, chiffre, spécial, ≠ username                     |
| **Brute force protection** | 5 échecs → 60s, max 900s                                              |
| **Refresh token rotation** | Activé (`revokeRefreshToken: true`, `refreshTokenMaxReuse: 0`)        |
| **Clients**                | `nina-aes-frontend` (public, PKCE), `nina-aes-backend` (confidential) |
| **Rôles**                  | `citizen` ⊂ `agent` ⊂ `admin` ; `governance_viewer` (isolé)           |

---

## Risques mitigés

| Risque                    | Mitigation                                                                   |
| ------------------------- | ---------------------------------------------------------------------------- |
| **CVE Keycloak critique** | Abonnement à la mailing-list security + CI qui vérifie la version            |
| **Keycloak DB corrompue** | Backup quotidien PostgreSQL + test de restore mensuel (doc 26)               |
| **Perte des clés RS256**  | Clés gérées automatiquement par Keycloak, backupées avec la DB               |
| **Lockout admin**         | Deuxième compte admin créé lors du bootstrap + procédure de reset documentée |
| **Saturation Redis**      | TTL strict sur tous les refresh tokens (auto-cleanup)                        |

---

## Références

- [Keycloak 26 — Release notes](https://www.keycloak.org/docs/latest/release_notes/)
- [Red Hat — Keycloak CVE database](https://access.redhat.com/security/vulnerabilities)
- [OIDC Certified products](https://openid.net/developers/certified/)
- [ADR-003 — Choix de NestJS](./ADR-003-nestjs.md)
- [ADR-010 — Infrastructure Docker Compose](./ADR-010-infrastructure-docker-compose.md)
- [ADR-012 — NestJS Clean Architecture](./ADR-012-nestjs-clean-architecture.md)
