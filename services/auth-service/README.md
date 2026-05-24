# `@nina-aes/auth-service`

> **Port** : 3002 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · Keycloak (OAuth2/OIDC)
> **Statut** : Scaffold (5 fichiers, 2 controllers) **Référence** :
> `docs/08-BACKEND-AUTH-SERVICE.md`

---

## 1. Rôle

Intégration Keycloak pour l'authentification de la plateforme NINA-AES : émission de JWT RS256,
refresh tokens, MFA TOTP + SMS pour les agents SIGAC, gestion des realms et clients.

Les autres services NestJS valident les JWT localement via la clé publique exposée par Keycloak —
`auth-service` est en bordure pour les opérations de login / refresh / MFA et sert de passerelle
entre Keycloak et le frontend.

---

## 2. Endpoints

| Méthode | Chemin             | Description                        | Auth   |
| ------- | ------------------ | ---------------------------------- | ------ |
| `POST`  | `/auth/login`      | Login utilisateur (proxy Keycloak) | Public |
| `POST`  | `/auth/refresh`    | Renouvelle le JWT                  | Public |
| `POST`  | `/auth/logout`     | Invalide la session Keycloak       | Bearer |
| `POST`  | `/auth/mfa/init`   | Initie MFA TOTP/SMS                | Bearer |
| `POST`  | `/auth/mfa/verify` | Vérifie le code MFA                | Bearer |
| `GET`   | `/health`          | Liveness                           | —      |

(À confirmer après implémentation Bloc 8.)

---

## 3. Variables d'environnement

| Variable                  | Défaut                  | Rôle                                  |
| ------------------------- | ----------------------- | ------------------------------------- |
| `AUTH_SERVICE_PORT`       | `3002`                  | Port d'écoute HTTP                    |
| `KEYCLOAK_URL`            | `http://localhost:8080` | Endpoint Keycloak                     |
| `KEYCLOAK_REALM`          | `nina-aes`              | Realm Keycloak                        |
| `KEYCLOAK_CLIENT_ID`      | `nina-platform`         | Client ID OIDC                        |
| `KEYCLOAK_CLIENT_SECRET`  | (Vault en prod)         | Client secret OIDC                    |
| `KEYCLOAK_ADMIN`          | `admin`                 | Compte admin Keycloak (bootstrap)     |
| `KEYCLOAK_ADMIN_PASSWORD` | `keycloak_admin_2026!`  | Mot de passe admin (dev — Vault prod) |

---

## 4. Démarrer en local

```powershell
# Prérequis : Keycloak démarré sur 8080 + realm nina-aes provisionné
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/auth-service dev
```

---

## 5. Liens

- Doc canonique : [`docs/08-BACKEND-AUTH-SERVICE.md`](../../docs/08-BACKEND-AUTH-SERVICE.md)
- ADR Keycloak :
  [`docs/adr/ADR-013-keycloak-identity-provider.md`](../../docs/adr/ADR-013-keycloak-identity-provider.md)
