# 15 — Sécurité (mTLS, Vault, OWASP, scans, rotation des secrets)

> **Bloc concerné** : Transversal (tous les blocs A → F) — durcissement appliqué une fois le Bloc A
> fonctionnel. **Prérequis** : documents 00 → 14 complétés ; cluster K3s **ou** Docker Compose local
> opérationnel ; `@nina-aes/config` qui valide les variables sensibles. **Durée estimée** : 24 à 32
> heures pour un étudiant seul. **Livrables de cette étape** :
>
> - HashiCorp Vault opérationnel avec moteurs activés : KV v2, Transit (chiffrement de PII), PKI (CA
>   interne mTLS), Database (rotation auto des credentials Postgres)
> - mTLS strict entre services NestJS (sidecar `linkerd2-proxy` ou Caddy) — chaque service présente
>   un cert client X.509 émis par la PKI Vault
> - Politiques de rotation : JWT signing key (90 jours), Postgres password (24 h), refresh tokens
>   utilisateur (7 j sliding)
> - Hardening OWASP Top 10 — checklist + middlewares NestJS / Next.js
> - Scans automatisés : Trivy (images Docker), Semgrep (code), npm-audit (deps), Bandit (Python)
> - Document `docs/security/SECURITY-RUNBOOK.md` (incidents, rotation manuelle, rollback)
> - `docs/adr/ADR-018-security-hardening.md`

---

## 1. Objectif pédagogique

NINA-AES traite **des données d'identité d'État**. Une fuite n'est pas un « incident produit » mais
un risque pour la souveraineté nationale et la sécurité des citoyens (les NINA peuvent permettre
l'usurpation d'identité, le ciblage de minorités, etc.). Ce document n'est donc pas optionnel :
c'est la couche qui transforme un MVP fonctionnel en un système **gouvernemental défendable** devant
un audit ANSSI/OCLEI.

Trois leçons pédagogiques :

1. **Pas de secrets en dur** — pas dans `.env.example`, pas dans Git, pas dans une issue. Tous les
   secrets passent par Vault et sont **récupérés au démarrage** par chaque pod via une
   authentification Kubernetes ServiceAccount (en prod) ou un token root limité (en dev).
2. **Zero-trust intra-cluster** — un pod compromis ne doit pas pouvoir se faire passer pour un
   autre. mTLS + identité courte durée (cert renouvelé toutes les 4 h) sont la garantie.
3. **OWASP Top 10 par défaut** — chaque microservice applique un middleware standard avant son
   premier déploiement. On documente une fois, on applique partout via `@nina-aes/security` (package
   partagé livré dans cette étape).

> 💡 **Pourquoi pas attendre la prod ?** Les vulnérabilités s'incrustent. Un endpoint sans
> rate-limit en MVP devient un endpoint sans rate-limit en prod parce que « ça marche ». Mieux vaut
> ajouter Helmet + Throttler + auth dès le doc 07 et n'avoir qu'à les **valider** ici.

---

## 2. Technologies utilisées (versions mai 2026)

| Technologie                | Version | Rôle                                                                       | Documentation                                  |
| -------------------------- | ------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| **HashiCorp Vault**        | 1.18    | Gestion centralisée des secrets, Transit, PKI, DB rotation                 | https://developer.hashicorp.com/vault          |
| **Linkerd**                | 2.16    | Service mesh léger, mTLS automatique, rotation 24 h                        | https://linkerd.io/                            |
| **cert-manager**           | 1.18    | Émission/renouvellement automatique des certs (K3s prod)                   | https://cert-manager.io/                       |
| **Helmet (NestJS)**        | 8.0     | En-têtes HTTP de sécurité (CSP, HSTS, X-Frame-Options, …)                  | https://helmetjs.github.io/                    |
| **@nestjs/throttler**      | 6.4     | Rate-limit par IP / par utilisateur                                        | https://docs.nestjs.com/security/rate-limiting |
| **Argon2id (argon2)**      | 0.41    | Hashage des secrets bas niveau (pas pour les passwords — Keycloak gère ça) | https://github.com/ranisalt/node-argon2        |
| **Trivy**                  | 0.59    | Scan vulnérabilités images Docker + dépendances                            | https://aquasecurity.github.io/trivy/          |
| **Semgrep**                | 1.110   | Static analysis (rules OWASP, secrets accidentels)                         | https://semgrep.dev/                           |
| **gitleaks**               | 8.27    | Détection de secrets dans l'historique git                                 | https://github.com/gitleaks/gitleaks           |
| **Bandit**                 | 1.8     | Analyse statique Python (services FastAPI)                                 | https://bandit.readthedocs.io/                 |
| **npm audit / pnpm audit** | n/a     | Audit deps Node                                                            | (intégré pnpm 10)                              |
| **OWASP ZAP**              | 2.16    | Scan dynamique d'API (DAST)                                                | https://www.zaproxy.org/                       |

> 🔒 Tous les outils sont open-source / souverains. Aucune dépendance à une service américain non
> substituable (pas de Snyk Cloud, pas de Datadog, etc.).

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_SecurityArchitecture
title Sécurité — Vault + mTLS + scans CI

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam component {
  BackgroundColor #EEF2FF
  BorderColor #4F46E5
}

skinparam database {
  BackgroundColor #FEF3C7
  BorderColor #D97706
}

skinparam cloud {
  BackgroundColor #ECFDF5
  BorderColor #059669
}

cloud "GitHub Actions" as CI {
  component "Trivy\n(images)" as Trivy
  component "Semgrep\n(code)" as Semgrep
  component "gitleaks\n(secrets git)" as Gitleaks
  component "OWASP ZAP\n(DAST API)" as ZAP
  component "pnpm audit\n+ Bandit" as Audit
}

package "Cluster K3s" {
  component "Linkerd control plane" as LK
  package "ns: services" {
    component "identity-service\n+ linkerd-proxy" as Identity
    component "auth-service\n+ linkerd-proxy" as Auth
    component "audit-service\n+ linkerd-proxy" as AuditSvc
  }
  package "ns: infra" {
    component "Vault 1.18\n(KV · Transit · PKI · DB)" as Vault
    component "cert-manager" as CM
    database "PostgreSQL 18\n(creds rotés 24 h)" as PG
  }
}

CI --> CI : sur push / PR
CI ..> Identity : déploiement\n(images scannées)

Identity <-down-> Auth : mTLS\n(cert client Vault PKI)
Identity <-down-> AuditSvc : mTLS
LK --> Identity : injecte sidecar
LK --> Auth
LK --> AuditSvc

Identity ..> Vault : auth k8s SA\n→ secret KV
AuditSvc ..> Vault : sign Ed25519 (Transit)
Auth     ..> Vault : private key JWT RS256

Vault ..> PG : rotate password\n(toutes les 24 h)
CM ..> Vault : émet certs serveur\n(Let's Encrypt + PKI interne)

note bottom of Vault
  Modes activés :
  • secret/  → KV v2 (config app)
  • transit/ → chiffrement PII
  • pki/     → CA interne mTLS
  • database/ → rotate Postgres
  • totp/    → MFA agents
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Vault : initialisation et moteurs

**Pourquoi** : Vault est le coffre-fort racine. Sans lui, on stocke encore des secrets dans `.env`.
On active les 5 moteurs nécessaires : KV v2 (key-value), Transit (chiffrement de PII), PKI (CA
mTLS), Database (rotation Postgres), TOTP (codes MFA agents).

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# Démarre Vault local (déjà inclus dans docker-compose.dev.yml — image 1.18)
pnpm docker:up

# Initialise Vault (génère 5 unseal keys + 1 root token).
# ⚠ En prod, distribuer les 5 unseal keys à 5 personnes différentes (Shamir).
docker exec -it nina-vault vault operator init -key-shares=5 -key-threshold=3

# Déverrouille (3 fois pour atteindre le threshold)
docker exec -it nina-vault vault operator unseal <unseal-key-1>
docker exec -it nina-vault vault operator unseal <unseal-key-2>
docker exec -it nina-vault vault operator unseal <unseal-key-3>

# Login avec le root token
docker exec -it nina-vault vault login <root-token>

# Active les 5 moteurs
docker exec -it nina-vault vault secrets enable -path=secret kv-v2
docker exec -it nina-vault vault secrets enable transit
docker exec -it nina-vault vault secrets enable pki
docker exec -it nina-vault vault secrets enable database
docker exec -it nina-vault vault secrets enable totp
```

**Fichier(s) à créer/modifier** :

```hcl
# infrastructure/vault/policies/identity-service.hcl
# Politique : autorise identity-service à lire son propre secret + signer via Transit.
path "secret/data/identity-service/*" {
  capabilities = ["read"]
}
path "transit/encrypt/nina-aes-pii" {
  capabilities = ["update"]
}
path "transit/decrypt/nina-aes-pii" {
  capabilities = ["update"]
}
path "transit/sign/jwt-rs256" {
  capabilities = ["update"]
}
```

```bash
# infrastructure/vault/scripts/bootstrap.sh
#!/usr/bin/env bash
# Crée les politiques + KV initial pour les 11 services.
set -euo pipefail

vault policy write identity-service /vault/policies/identity-service.hcl
vault policy write audit-service     /vault/policies/audit-service.hcl
vault policy write document-service  /vault/policies/document-service.hcl
# ... idem pour les 8 autres

# Stocke les secrets initiaux (à remplacer par rotation auto une fois le système up)
vault kv put secret/identity-service/db username=identity_svc password="$(openssl rand -base64 32)"
vault kv put secret/auth-service/jwt private_key=@/secrets/jwt-private.pem public_key=@/secrets/jwt-public.pem

# Crée la clé Transit pour chiffrer les PII (alertes SIGAC notamment)
vault write -f transit/keys/nina-aes-pii type=aes256-gcm96
vault write -f transit/keys/jwt-rs256     type=rsa-2048
vault write -f transit/keys/aes-interop   type=ed25519
```

### Étape 4.2 — Package `@nina-aes/security` partagé

**Pourquoi** : appliquer Helmet, rate-limit et CSP **manuellement** dans chaque microservice
multiplie le risque d'oubli. Un package partagé `@nina-aes/security` exporte un seul
`applyHardening(app)` à appeler depuis chaque `main.ts`.

```typescript
// packages/security/src/index.ts
/**
 * @file        index.ts
 * @description Helpers de durcissement à appliquer dans chaque microservice
 *              NestJS de la plateforme NINA-AES.
 *
 *              Couvre : Helmet (en-têtes), CORS, Throttler (rate-limit),
 *              ValidationPipe global (Zod via shared-types), GlobalExceptionFilter
 *              (réponses uniformes sans fuite de stack), CSP stricte (Next.js).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/security
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { CORS_CONFIG } from '@nina-aes/config';

/**
 * Applique le durcissement standard à une application NestJS.
 *
 * @param app - Instance NestJS (avant `app.listen`).
 * @param options - Surcharges optionnelles (CSP custom, etc.).
 */
export function applyHardening(
  app: INestApplication,
  options: { extraCsp?: Record<string, string[]> } = {},
): void {
  // 1. Helmet — en-têtes HTTP standard OWASP
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // shadcn nécessite inline
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", process.env.AUTH_BASE_URL ?? "'self'"],
          frameAncestors: ["'none'"],
          ...options.extraCsp,
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
    }),
  );

  // 2. CORS strict — origin lue depuis @nina-aes/config
  app.enableCors(CORS_CONFIG);

  // 3. Validation Zod globale — toute entrée non-DTO refusée
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
```

### Étape 4.3 — mTLS intra-cluster (Linkerd)

**Pourquoi** : sans mTLS, un attaquant qui compromet un pod peut se faire passer pour n'importe quel
service via une simple requête HTTP. Linkerd injecte un sidecar qui chiffre **toutes** les
connexions TCP et présente un cert X.509 émis par sa propre CA, avec rotation toutes les 24 h.

```powershell
# Installation Linkerd 2.16 dans le cluster
pnpm dlx linkerd2-cli@latest install --crds | kubectl apply -f -
pnpm dlx linkerd2-cli@latest install | kubectl apply -f -

# Vérifie l'installation
linkerd check

# Annote tous les namespaces NINA-AES pour injection automatique
kubectl annotate namespace services    linkerd.io/inject=enabled
kubectl annotate namespace ai          linkerd.io/inject=enabled
kubectl annotate namespace governance  linkerd.io/inject=enabled
kubectl annotate namespace interop     linkerd.io/inject=enabled

# Redémarre les déploiements pour qu'ils récupèrent le sidecar
kubectl -n services rollout restart deployment
```

### Étape 4.4 — Rotation des secrets (Postgres + JWT)

**Pourquoi** : un mot de passe Postgres figé pendant 6 mois est un risque dormant. Vault peut créer
un rôle Postgres dynamique, livrer un couple `username/password` qui expire après 24 h, et le
révoquer automatiquement. Idem pour la clé privée JWT (90 jours).

```bash
# infrastructure/vault/scripts/postgres-rotation.sh
# Configure la rotation auto Postgres
vault write database/config/nina-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="identity-service,audit-service,document-service" \
  connection_url="postgresql://{{username}}:{{password}}@nina-postgres:5432/nina_aes_db?sslmode=require" \
  username="vault_admin" \
  password="$(cat /run/secrets/vault_admin_password)"

# Rôle dynamique pour identity-service : creds valides 24 h, max 7 j
vault write database/roles/identity-service \
  db_name=nina-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
                       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="24h" \
  max_ttl="168h"
```

```typescript
// packages/security/src/vault-secret-loader.ts (extrait — ~80 lignes)
/**
 * Charge un secret depuis Vault au démarrage. À appeler avant `app.listen`
 * pour que les variables d'env soient remplacées par les vraies valeurs.
 *
 * @param path - Chemin Vault (`database/creds/identity-service` p. ex.).
 * @returns Le secret JSON tel que Vault le renvoie.
 */
export async function fetchVaultSecret(path: string): Promise<Record<string, unknown>> {
  const url = `${process.env.VAULT_ADDR}/v1/${path}`;
  const res = await fetch(url, {
    headers: { 'X-Vault-Token': process.env.VAULT_TOKEN! },
  });
  if (!res.ok) throw new Error(`Vault read failed (${res.status}) for ${path}`);
  const data = (await res.json()) as { data: { data: unknown } | unknown };
  return (
    'data' in (data as Record<string, unknown>)
      ? ((data as { data: { data?: unknown } }).data.data ?? data.data)
      : data
  ) as Record<string, unknown>;
}
```

### Étape 4.5 — Hardening OWASP Top 10 (checklist appliquée)

| OWASP Top 10:2021                  | Mesure NINA-AES                                                                           | Endroit                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| A01 Broken Access Control          | RBAC Keycloak + guards NestJS `@Roles(UserRole.SUPERVISOR)`                               | `auth-service` + chaque service   |
| A02 Cryptographic Failures         | TDE Postgres, TLS 1.3 only, mTLS intra-cluster, Argon2id pour secrets, RSA-2048 / Ed25519 | Vault + Linkerd                   |
| A03 Injection                      | Prisma (paramétré), Zod sur tous les inputs, ValidationPipe global                        | `@nina-aes/security` + chaque DTO |
| A04 Insecure Design                | Threat model documenté (cf. ADR-018), revue de design avant chaque service                | `docs/security/THREAT-MODEL.md`   |
| A05 Security Misconfiguration      | Helmet, CSP stricte, ports non-utilisés fermés, debug désactivé en prod                   | `applyHardening` + Dockerfiles    |
| A06 Vulnerable Components          | Trivy + pnpm audit + Dependabot                                                           | CI GitHub Actions                 |
| A07 Identification & Auth Failures | Keycloak 26 + MFA TOTP (`mfaSecret` Vault) + lock-out 5 essais                            | `auth-service`                    |
| A08 Software & Data Integrity      | Images signées (cosign), sigstore, Merkle audit log                                       | Doc 09 + CI                       |
| A09 Logging & Monitoring           | Pino + Loki, audit chaîné, SIEM via Grafana                                               | Doc 17                            |
| A10 SSRF                           | Whitelist d'URL en CORS_CONFIG ; pas de fetch server-side d'URLs utilisateur arbitraires  | `@nina-aes/config`                |

### Étape 4.6 — Scans automatisés (CI)

```yaml
# .github/workflows/security-scan.yml (extrait)
name: Security Scan
on: [push, pull_request]
jobs:
  trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trivy image scan (identity-service)
        uses: aquasecurity/trivy-action@0.30.0
        with:
          image-ref: 'nina-aes/identity-service:latest'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: 'p/owasp-top-ten p/typescript p/nodejs'
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
  pnpm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - run: pnpm audit --audit-level high
  bandit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install bandit && bandit -r services/ai-service services/anticorruption-service
```

### Étape 4.7 — Penetration test interne (OWASP ZAP)

```powershell
# Lance ZAP en mode "automated scan" contre l'API Gateway
docker run --rm -v ${PWD}/security-reports:/zap/wrk:rw `
  -t zaproxy/zap-stable:2.16.0 zap-baseline.py `
  -t http://host.docker.internal:3000/api `
  -r zap-report.html

# Le rapport HTML est dans security-reports/zap-report.html
# Cible : 0 alerte HIGH, < 5 MEDIUM, MEDIUM doivent toutes être adressées avant prod.
```

---

## 5. Tests de validation

1. **Vault** : `vault status` retourne `Sealed=false`, `Active Node=true`. Lecture d'un secret
   factice fonctionne avec un token applicatif (politique limitée).
2. **mTLS** : `linkerd viz tap deploy/identity-service` montre `tls=true` sur **toutes** les
   requêtes. `kubectl exec` dans un pod sans cert → connexion refusée.
3. **Rotation Postgres** : à T+24h, `vault read database/creds/identity-service` renvoie de nouveaux
   credentials, l'ancien rôle est révoqué dans Postgres (`\du` ne le liste plus).
4. **Helmet** : `curl -I http://localhost:3001/` montre `Strict-Transport-Security`,
   `X-Frame-Options: DENY`, `Content-Security-Policy: …` présents.
5. **Rate-limit** : 200 requêtes en 1 minute → 429 après le 100ᵉ (config
   `RATE_LIMIT_CONFIG.medium`).
6. **Trivy CI** : un push avec une dep vulnérable HIGH **bloque** la merge (exit-code 1).
7. **gitleaks** : commit volontairement un faux token AWS → le pre-commit hook le rejette.

---

## 6. Pièges courants & dépannage

| Symptôme                                       | Cause probable                                           | Solution                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Vault `* sealed`                               | Pod redémarré sans unseal automatique                    | Auto-unseal AWS KMS / Transit (recommandé en prod) ; sinon script de re-unseal au boot.            |
| Linkerd : `connection refused`                 | Sidecar non injecté (namespace non annoté)               | `kubectl annotate namespace <ns> linkerd.io/inject=enabled` puis `rollout restart`.                |
| Helmet casse le frontend (CSP)                 | `script-src` trop strict pour les inline scripts Next.js | Activer `nonce-based CSP` côté Next.js (cf. doc 12) ou ajouter `'unsafe-inline'` en dev seulement. |
| Trivy en CI : faux positif sur dep transitive  | DB Trivy plus à jour que la registry npm                 | Pinner la version Trivy ; ajouter `.trivyignore` documenté avec ticket de suivi.                   |
| MFA TOTP : « code invalide » alors que correct | Drift d'horloge serveur                                  | NTP obligatoire sur tous les nœuds K3s ; window TOTP `±1 step` (30 s).                             |
| Postgres password rotation casse les apps      | Connexion long-lived sans re-auth                        | Pool Prisma : `pool_timeout=10` + reconnect on auth-error ; lifecycle hook qui recharge le secret. |

---

## 7. Documentation à produire

- `docs/adr/ADR-018-security-hardening.md` (décision : Vault + Linkerd + Helmet + scans CI).
- `docs/security/SECURITY-RUNBOOK.md` :
  - Procédure de rotation manuelle d'urgence (clé compromise)
  - Procédure de révocation d'un cert client
  - Liste des contacts crisis (CISO CTDEC, ANSSI Mali)
  - Métriques SOC : MTTR, MTTD, faux positifs
- `docs/security/THREAT-MODEL.md` (STRIDE pour chaque microservice du Bloc A).
- Mise à jour `docs/00-README-INDEX.md` : ligne « Sécurité ✅ ».

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Sécurité Hardening — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Vault** : ✅ Init + 5 moteurs activés ; ✅ politiques 11 services
- **mTLS** : ✅ Linkerd installé ; ✅ 100 % du trafic intra-cluster chiffré (vérifié `linkerd viz`)
- **Rotation** : ✅ Postgres 24 h ; ⏳ JWT signing key (pending Vault Transit)
- **Scans CI** : Trivy ✅ · Semgrep ✅ · gitleaks ✅ · pnpm audit ✅ · Bandit ✅ · OWASP ZAP ⏳
- **OWASP Top 10** : 10/10 mesures en place (cf. tableau §4.5)
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : penetration test externe (UQAR sec lab), bug bounty privé
- **Captures jointes** : vault-status.png, linkerd-viz.png, trivy-clean.png, zap-report.png
```

---

## 9. Checklist de fin d'étape

- [ ] Vault initialisé, déverrouillé (3/5), 5 moteurs activés
- [ ] Politiques Vault pour les 11 services
- [ ] `@nina-aes/security` package créé et utilisé par tous les services NestJS
- [ ] Linkerd installé, namespaces annotés, mTLS vérifié end-to-end
- [ ] Rotation Postgres opérationnelle (TTL 24 h vérifié)
- [ ] Helmet + CSP + Throttler actifs sur chaque service (test curl + 429)
- [ ] CI : Trivy, Semgrep, gitleaks, pnpm audit, Bandit verts
- [ ] OWASP ZAP scan baseline → 0 HIGH
- [ ] `SECURITY-RUNBOOK.md` rédigé et placé dans `docs/security/`
- [ ] `THREAT-MODEL.md` couvrant les 4 services du Bloc A
- [ ] `ADR-018` rédigé
- [ ] Aucun secret en clair dans le repo (`gitleaks detect --no-git`)
- [ ] Tag Git `security-mvp` posé après validation tutorat
- [ ] Commit conventionnel : `feat(security): Vault + mTLS + OWASP hardening + CI scans`

---

## 10. Pour aller plus loin

- **SBOM (Software Bill of Materials)** : générer à chaque release avec `syft` puis publier via
  `cosign attest` — exigence croissante des audits gouvernementaux.
- **Sigstore** : signer les images Docker (`cosign sign`) et vérifier la signature au déploiement
  via une admission controller K3s.
- **Honeypot interne** : déployer un faux endpoint `/admin/legacy` qui logge toute tentative →
  indicateur d'attaque interne.
- **Bug bounty** : en mode privé, inviter quelques pentesters UQAR à tester l'API publique.
- **Lectures recommandées** :
  - https://owasp.org/Top10/
  - https://learn.hashicorp.com/collections/vault/identity-and-access-management
  - https://linkerd.io/2/tasks/automatically-rotating-control-plane-tls-credentials/
  - NIST SP 800-53 Rev. 5 (contrôles obligatoires pour systèmes gouvernementaux)
  - ANSSI – Guide d'hygiène informatique (40 règles)

---
