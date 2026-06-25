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
> - Document `docs/security/THREAT-MODEL.md` (STRIDE par microservice + protection des lanceurs
>   d'alerte)
> - `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` (ADR sécurité **dédié** — **ne pas**
>   confondre avec `ADR-018` qui porte sur la stratégie de tests/pyramide)

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
Auth     ..> Vault : sign JWT Ed25519 (Transit)

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

**Auto-unseal souverain (prod) — PAS d'AWS KMS.** En production, déverrouiller Vault à la main à
chaque redémarrage est intenable. La solution HashiCorp « par défaut » documentée partout est
l'auto-unseal **AWS KMS** : **interdit ici** (dépendance cloud étrangère sur le chemin critique de
souveraineté). Deux options souveraines :

1. **Vault Transit auto-unseal (recommandé, 100 % logiciel)** — un **petit cluster Vault interne**
   (« unsealer », lui-même scellé en Shamir, sur un nœud durci) expose un moteur Transit dont la clé
   sert à sceller/desceller le **cluster Vault applicatif**. Au boot, le cluster applicatif appelle
   l'unsealer et se déverrouille seul, sans clé humaine.
2. **Shamir + HSM on-premise** — clé maître protégée par un HSM physique souverain (PKCS#11), gardé
   en salle sécurisée CTDEC.

```hcl
# infrastructure/vault/config/vault-app.hcl (cluster applicatif)
# Auto-unseal via Transit d'un cluster Vault INTERNE (souverain) — pas de KMS US.
seal "transit" {
  address    = "https://vault-unsealer.infra.svc.nina.internal:8200"
  mount_path = "transit/"      # moteur Transit de l'unsealer
  key_name   = "autounseal"    # clé dédiée au descellement
  # Le token d'accès à l'unsealer est lui-même livré via auth K8s (pas en clair).
}
```

> 🛡️ L'unsealer ne contient **aucun** secret applicatif : sa seule fonction est de garder la clé de
> descellement. Compromettre le cluster applicatif ne donne pas la clé maître ; compromettre
> l'unsealer ne donne pas les secrets. Séparation des pouvoirs.

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
path "transit/sign/jwt-signing" {
  capabilities = ["update"]
}
```

> 🔐 **Pourquoi `jwt-signing` et plus `jwt-rs256` ?** Les jetons NINA-AES sont signés en **Ed25519**
> (courbe Edwards, signatures courtes, rapides, résistantes aux mauvaises implémentations) ou, si un
> vérificateur tiers impose RSA, en **RSA-3072 minimum**. **RSA-2048 est sous la barre ANSSI** pour
> un système d'identité d'État avec horizon > 2030 : on ne l'utilise nulle part sur le chemin
> critique. Voir `ADR-006` (format JWT) et `ADR-034` (durcissement crypto).

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

# Clé de signature JWT : Ed25519 par défaut (souverain, court, rapide).
# ⚠ NE PAS utiliser rsa-2048 (sous la barre ANSSI). Si un vérificateur tiers
#   impose RSA, créer une clé rsa-3072 dédiée à CE vérificateur uniquement.
vault write -f transit/keys/jwt-signing type=ed25519
# Variante RSA-3072 (uniquement si interop tierce l'exige) :
# vault write -f transit/keys/jwt-rsa3072 type=rsa-3072

# Clé d'interopérabilité AES (échanges signés inter-États) — Ed25519
vault write -f transit/keys/aes-interop type=ed25519
```

#### Étape 4.1 bis — PKI Vault (root CA + intermediate + rôle + émission + renouvellement)

**Pourquoi détailler la PKI ?** Le mTLS intra-cluster (§4.3) repose sur une **autorité de
certification interne**. Plutôt qu'une CA externe (souveraineté), on monte une chaîne **à deux
niveaux** dans Vault : une **root CA** hors-ligne (clé longue durée, jamais exposée aux services)
qui ne sert qu'à signer une **intermediate CA** courte durée ; c'est l'intermediate qui émet les
certs clients/serveurs des services. Compromettre l'intermediate ne compromet pas la racine, et on
peut la révoquer/réémettre sans tout reconstruire.

```bash
# infrastructure/vault/scripts/pki-bootstrap.sh
#!/usr/bin/env bash
# Monte la PKI à deux niveaux pour le mTLS interne NINA-AES.
set -euo pipefail

# --- 1. Root CA : moteur PKI dédié, TTL long (10 ans), clé Ed25519 ---
vault secrets enable -path=pki-root pki
vault secrets tune -max-lease-ttl=87600h pki-root          # 10 ans
# Génère la racine EN INTERNE (la clé privée ne sort JAMAIS de Vault)
vault write -field=certificate pki-root/root/generate/internal \
  common_name="NINA-AES Root CA (CTDEC)" \
  key_type="ed25519" \
  ttl=87600h > /tmp/root_ca.crt
# Point de distribution CRL/AIA (révocation publiable côté cluster)
vault write pki-root/config/urls \
  issuing_certificates="https://vault.nina.internal/v1/pki-root/ca" \
  crl_distribution_points="https://vault.nina.internal/v1/pki-root/crl"

# --- 2. Intermediate CA : moteur séparé, TTL court (1 an), signée par la root ---
vault secrets enable -path=pki-int pki
vault secrets tune -max-lease-ttl=8760h pki-int            # 1 an
# (a) l'intermediate génère sa CSR
vault write -field=csr pki-int/intermediate/generate/internal \
  common_name="NINA-AES Intermediate CA" \
  key_type="ed25519" > /tmp/int.csr
# (b) la root signe la CSR
vault write -field=certificate pki-root/root/sign-intermediate \
  csr=@/tmp/int.csr format=pem_bundle ttl=8760h > /tmp/int.crt
# (c) on réinjecte le cert signé dans le moteur intermediate
vault write pki-int/intermediate/set-signed certificate=@/tmp/int.crt

# --- 3. Rôle d'émission : ce que les services ont le droit de demander ---
# Cert client/serveur court (24 h) ; SAN limités au domaine interne.
vault write pki-int/roles/nina-service \
  allowed_domains="svc.nina.internal" \
  allow_subdomains=true \
  allow_bare_domains=false \
  key_type="ed25519" \
  max_ttl="24h" \
  ttl="24h"

# --- 4. Émission d'un cert pour identity-service (côté service, via son AppRole) ---
# Le service appelle CETTE commande au démarrage ; il reçoit cert + clé + chaîne.
vault write pki-int/issue/nina-service \
  common_name="identity-service.svc.nina.internal" \
  ttl="24h"
```

> ♻️ **Renouvellement** : le cert expire en 24 h, donc chaque service **re-émet** son cert via un
> cron sidecar (ou `vault agent` avec `template` + `command` de reload). L'intermediate, elle, est
> renouvelée annuellement par l'opérateur ; la root (10 ans) reste **hors-ligne** (clé scellée dans
> Vault, opérations root déclenchées manuellement sous double contrôle). La **révocation** se fait
> via `vault write pki-int/revoke serial_number=<n>` puis publication de la CRL — procédure
> détaillée dans `docs/security/SECURITY-RUNBOOK.md`.

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
 * Détermine si l'on tourne en production.
 * En prod on durcit la CSP (pas de `'unsafe-inline'`) ; en dev on tolère
 * l'inline pour ne pas casser le HMR Next.js.
 */
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Applique le durcissement standard à une application NestJS.
 *
 * Couvre Helmet (en-têtes), CORS liste blanche et ValidationPipe Zod.
 * ⚠ Le rate-limit (Throttler) NE se branche PAS ici : c'est un module
 * (`ThrottlerModule`) + un guard global déclaré au niveau du `AppModule`
 * (voir le bloc « SecurityModule » ci-dessous), car un `APP_GUARD` doit être
 * enregistré dans le graphe d'injection de dépendances, pas au runtime sur
 * l'instance `app`.
 *
 * @param app - Instance NestJS (avant `app.listen`).
 * @param options - Surcharges optionnelles (CSP custom, etc.).
 */
export function applyHardening(
  app: INestApplication,
  options: { extraCsp?: Record<string, string[]> } = {},
): void {
  // 1. Helmet — en-têtes HTTP standard OWASP.
  //    En PROD : pas de 'unsafe-inline' pour les styles. Les frontends Next.js
  //    injectent un nonce par requête (cf. §4.2 bis) ; les API NestJS pures ne
  //    servant pas de HTML, leur styleSrc reste 'self'.
  const styleSrc = IS_PROD ? ["'self'"] : ["'self'", "'unsafe-inline'"];

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc, // 'unsafe-inline' UNIQUEMENT hors prod
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

  // 2. CORS strict — origin lue depuis @nina-aes/config (liste blanche A10/SSRF)
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

**Câblage réel du rate-limit (Throttler).** `applyHardening` ne suffit pas : un `APP_GUARD` global
doit vivre dans le graphe DI. On exporte donc un `SecurityModule` que chaque service importe dans
son `AppModule`. **Sans ce module, l'affirmation « rate-limit actif » du §4.5 serait fausse.**

```typescript
// packages/security/src/security.module.ts
/**
 * @file        security.module.ts
 * @description Branche @nestjs/throttler GLOBALEMENT : un ThrottlerGuard
 *              enregistré comme APP_GUARD protège TOUS les endpoints sans
 *              annotation par contrôleur. Importé une fois dans chaque AppModule.
 * @module      @nina-aes/security
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    // 100 requêtes / 60 s par défaut (profil "medium" de RATE_LIMIT_CONFIG).
    // Le store par défaut est en mémoire ; en multi-pod, brancher le storage
    // Redis (@nest-lab/throttler-storage-redis) pour un compteur partagé.
    ThrottlerModule.forRoot([{ name: 'medium', ttl: 60_000, limit: 100 }]),
  ],
  providers: [
    // Guard GLOBAL : s'applique à chaque route sans avoir à l'annoter.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class SecurityModule {}
```

```typescript
// services/identity-service/src/app.module.ts (extrait d'intégration)
import { Module } from '@nestjs/common';
import { SecurityModule } from '@nina-aes/security';

@Module({
  imports: [
    SecurityModule, // ← active le ThrottlerGuard global pour CE service
    // ... autres modules métier
  ],
})
export class AppModule {}
```

#### Étape 4.2 bis — CSP à base de nonce côté Next.js (retrait de `'unsafe-inline'`)

**Pourquoi** : `'unsafe-inline'` dans `styleSrc`/`scriptSrc` annule une grande partie de la
protection XSS de la CSP — n'importe quel `<style>`/`<script>` injecté est exécuté. En production,
on le **remplace par un nonce** (jeton aléatoire par requête) : seuls les éléments portant ce nonce
sont acceptés. Le middleware Next.js génère le nonce, le pose dans la CSP **et** le passe au rendu.

```typescript
// apps/citizen/middleware.ts
/**
 * @file        middleware.ts
 * @description Génère un nonce CSP par requête et l'injecte dans l'en-tête
 *              Content-Security-Policy. Supprime tout besoin de 'unsafe-inline'
 *              en production. Next.js relit ce nonce et l'applique aux <script>
 *              et styles inline qu'il émet lui-même.
 */
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  // Nonce VRAIMENT aléatoire : 16 octets = 128 bits d'entropie réelle, tirés du
  // CSPRNG via crypto.getRandomValues (Web Crypto). On encode ces octets bruts
  // en base64 avec btoa(). Pourquoi pas `Buffer.from(crypto.randomUUID())` ?
  //   1) randomUUID() = UUIDv4 = 122 bits d'entropie (6 bits version/variant
  //      sont fixes), donc PAS 128 bits ;
  //   2) on base64-encoderait la *chaîne texte* (36 caractères hex + tirets),
  //      pas 16 octets aléatoires — c'est l'entropie de la chaîne, pas des octets ;
  //   3) `Buffer` n'est pas garanti dans le runtime Edge de Next.js, alors que
  //      crypto.getRandomValues + btoa sont natifs Web et donc portables.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  // CSP stricte : style-src et script-src acceptent UNIQUEMENT ce nonce + 'self'.
  // 'strict-dynamic' laisse les scripts noncés charger leurs dépendances.
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`, // ← plus aucun 'unsafe-inline'
    `img-src 'self' data: blob:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ].join('; ');

  // On propage le nonce au rendu via un en-tête de requête lu par le layout.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
```

> 💡 Le `layout.tsx` lit `headers().get('x-nonce')` et le passe aux composants `<Script nonce={…}>`.
> Détails et exemple complet : **doc 12 (frontends)**. En dev seulement, on retombe sur
> `'unsafe-inline'` pour préserver le HMR (cf. branche `IS_PROD` du §4.2).

### Étape 4.3 — mTLS intra-cluster (Linkerd **mode strict**)

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

**⚠ L'injection seule ne suffit PAS.** Par défaut Linkerd est **permissif** : il chiffre le trafic
maillé mais **accepte aussi** le trafic en clair (non-mTLS) — un pod compromis sans cert peut donc
quand même joindre un service. Le test §5.2 « connexion refusée sans cert » serait alors **faux**.
Pour le rendre vrai, on passe en **mode strict** via une ressource `Server` (qui marque un port
comme maillé) + une politique d'autorisation qui n'accepte que des **identités mTLS** authentifiées.

```yaml
# infrastructure/k8s/policy/identity-server.yaml
# 1) Déclare le port HTTP d'identity-service comme "maillé".
#    proxyProtocol: HTTP/2 (h2) — Linkerd refuse alors le trafic non conforme.
apiVersion: policy.linkerd.io/v1beta3
kind: Server
metadata:
  name: identity-http
  namespace: services
spec:
  podSelector:
    matchLabels: { app: identity-service }
  port: 3001
  proxyProtocol: HTTP/2
---
# 2) AuthorizationPolicy : SEULES les identités mTLS listées peuvent appeler ce
#    Server. Tout appel sans cert client valide (= sans identité maillée) est
#    REFUSÉ par le proxy (connection refused), y compris depuis un pod du cluster.
apiVersion: policy.linkerd.io/v1alpha1
kind: AuthorizationPolicy
metadata:
  name: identity-allow-mesh
  namespace: services
spec:
  targetRef:
    group: policy.linkerd.io
    kind: Server
    name: identity-http
  requiredAuthenticationRefs:
    - group: policy.linkerd.io
      kind: MeshTLSAuthentication
      name: callers-identity
---
# 3) Identités clientes autorisées (ServiceAccounts maillés des appelants).
#    Ici : seuls auth-service et api-gateway peuvent appeler identity-service.
apiVersion: policy.linkerd.io/v1alpha1
kind: MeshTLSAuthentication
metadata:
  name: callers-identity
  namespace: services
spec:
  identities:
    - 'auth-service.services.serviceaccount.identity.linkerd.cluster.local'
    - 'api-gateway.services.serviceaccount.identity.linkerd.cluster.local'
```

> 🔒 **Défaut-refus à l'échelle du namespace** : pour que l'absence de politique vaille
> _interdiction_ (et non _autorisation_), poser l'annotation
> `config.linkerd.io/default-inbound-policy: deny` sur le namespace `services`. À partir de là,
> **tout** port maillé sans `AuthorizationPolicy` explicite rejette le trafic — c'est ce qui rend le
> test « connexion refusée sans cert » réellement vrai.

```powershell
# Applique les politiques puis bascule le namespace en deny-by-default
kubectl apply -f infrastructure/k8s/policy/identity-server.yaml
kubectl annotate namespace services config.linkerd.io/default-inbound-policy=deny --overwrite
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

**Authentification Vault : jamais de token long-lived.** Le brouillon initial passait un
`X-Vault-Token` lu dans `process.env.VAULT_TOKEN` — c'est précisément ce que la consigne « pas de
VAULT_TOKEN long-lived » **interdit** : un tel token traîne dans l'environnement, fuit dans les
logs/dumps et ne s'auto-révoque pas. À la place, en prod, le pod **prouve son identité** avec le JWT
de son **ServiceAccount Kubernetes** (monté par le kubelet, rotation automatique) ; Vault le valide
via la méthode d'auth `kubernetes` et renvoie un **token applicatif court** (lease) que l'on
**renouvelle** tant que le pod vit.

```bash
# infrastructure/vault/scripts/k8s-auth.sh — configuration côté Vault (une fois)
#!/usr/bin/env bash
set -euo pipefail

# Active la méthode d'auth Kubernetes
vault auth enable kubernetes

# Vault apprend à valider les JWT de ServiceAccount via l'API du cluster
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443"

# Lie le ServiceAccount "identity-service" à sa politique, token TTL 1 h renouvelable
vault write auth/kubernetes/role/identity-service \
  bound_service_account_names="identity-service" \
  bound_service_account_namespaces="services" \
  policies="identity-service" \
  ttl="1h" \
  max_ttl="24h"
```

```typescript
// packages/security/src/vault-secret-loader.ts (extrait — ~110 lignes)
/**
 * @file        vault-secret-loader.ts
 * @description Authentifie le pod auprès de Vault via son ServiceAccount K8s
 *              (AUCUN VAULT_TOKEN long-lived), récupère un token de lease court,
 *              puis charge un secret. Le lease est renouvelé en arrière-plan.
 * @module      @nina-aes/security
 */

/** Token de lease courant + délai de renouvellement, mis à jour à chaque login. */
let cachedToken: { value: string; renewableEverySec: number } | null = null;

/**
 * S'authentifie auprès de Vault avec le JWT du ServiceAccount Kubernetes.
 * Le JWT est monté par le kubelet à un chemin standard (auto-roté), donc
 * aucun secret n'est codé en dur ni stocké dans l'environnement.
 *
 * @returns Un token Vault à durée de vie courte (lease).
 */
async function loginWithKubernetes(): Promise<{ value: string; renewableEverySec: number }> {
  // Le kubelet projette le JWT du SA ici (rotation automatique côté cluster).
  const fs = await import('node:fs/promises');
  const saJwt = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8');

  const res = await fetch(`${process.env.VAULT_ADDR}/v1/auth/kubernetes/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `role` = rôle Vault créé par k8s-auth.sh ; `jwt` = preuve d'identité du pod.
    body: JSON.stringify({ role: process.env.VAULT_ROLE, jwt: saJwt }),
  });
  if (!res.ok) throw new Error(`Vault k8s login failed (${res.status})`);

  const json = (await res.json()) as {
    auth: { client_token: string; lease_duration: number };
  };
  // On renouvelle bien avant l'expiration (à mi-vie) pour éviter toute coupure.
  return {
    value: json.auth.client_token,
    renewableEverySec: Math.floor(json.auth.lease_duration / 2),
  };
}

/**
 * Renouvelle périodiquement le token de lease tant que le pod vit.
 * Si le renouvellement échoue (lease expiré côté Vault), on se ré-authentifie.
 */
function startLeaseRenewal(): void {
  if (!cachedToken) return;
  setInterval(async () => {
    try {
      const res = await fetch(`${process.env.VAULT_ADDR}/v1/auth/token/renew-self`, {
        method: 'POST',
        headers: { 'X-Vault-Token': cachedToken!.value },
      });
      if (!res.ok) cachedToken = await loginWithKubernetes(); // fallback re-login
    } catch {
      cachedToken = await loginWithKubernetes();
    }
  }, cachedToken.renewableEverySec * 1000).unref(); // .unref() : ne bloque pas l'arrêt
}

/**
 * Charge un secret depuis Vault au démarrage. À appeler avant `app.listen`.
 * Récupère/renouvelle le token de lease de façon transparente.
 *
 * @param path - Chemin Vault (`database/creds/identity-service` p. ex.).
 * @returns Le secret JSON tel que Vault le renvoie.
 */
export async function fetchVaultSecret(path: string): Promise<Record<string, unknown>> {
  if (!cachedToken) {
    cachedToken = await loginWithKubernetes();
    startLeaseRenewal();
  }
  const url = `${process.env.VAULT_ADDR}/v1/${path}`;
  const res = await fetch(url, {
    // Token de lease COURT obtenu via le SA — jamais un VAULT_TOKEN statique.
    headers: { 'X-Vault-Token': cachedToken.value },
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

> 🧪 **En dev local** (Docker Compose, pas de K8s) : on tolère un token root **court** injecté par
> `pnpm vault:bootstrap`, jamais commité. Le code détecte l'absence de
> `/var/run/secrets/kubernetes.io/serviceaccount/token` et retombe sur `VAULT_DEV_TOKEN` — chemin
> **non** disponible en prod.

### Étape 4.5 — Hardening OWASP Top 10 (checklist appliquée)

| OWASP Top 10:2021                  | Mesure NINA-AES                                                                                                                                                                                                                                                                                                                                                                                                                                            | Endroit                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A01 Broken Access Control          | RBAC Keycloak + guards NestJS `@Roles(UserRole.SUPERVISOR)`                                                                                                                                                                                                                                                                                                                                                                                                | `auth-service` + chaque service   |
| A02 Cryptographic Failures         | Chiffrement-au-repos PII via Vault Transit (`nina-aes-pii`, AES-256-GCM, cf. §4.8) + chiffrement de volume LUKS/dm-crypt côté infra (**pas** de TDE natif Postgres — cette feature n'existe pas dans Postgres upstream), TLS 1.3 only, mTLS intra-cluster, Argon2id pour secrets, JWT **Ed25519** (RSA-3072 mini si interop tierce — **jamais** RSA-2048)                                                                                                  | Vault + Linkerd                   |
| A03 Injection                      | Prisma (paramétré), Zod sur tous les inputs, ValidationPipe global                                                                                                                                                                                                                                                                                                                                                                                         | `@nina-aes/security` + chaque DTO |
| A04 Insecure Design                | Threat model STRIDE (cf. ADR-034) + anti-corrélation lanceurs d'alerte & minimisation RGPD-like (§4.8)                                                                                                                                                                                                                                                                                                                                                     | `docs/security/THREAT-MODEL.md`   |
| A05 Security Misconfiguration      | Helmet, CSP stricte, ports non-utilisés fermés, debug désactivé en prod                                                                                                                                                                                                                                                                                                                                                                                    | `applyHardening` + Dockerfiles    |
| A06 Vulnerable Components          | Trivy + pnpm audit + Dependabot                                                                                                                                                                                                                                                                                                                                                                                                                            | CI GitHub Actions                 |
| A07 Identification & Auth Failures | Keycloak 26 + MFA TOTP (`mfaSecret` Vault) + lock-out 5 essais                                                                                                                                                                                                                                                                                                                                                                                             | `auth-service`                    |
| A08 Software & Data Integrity      | Images signées (cosign), sigstore ; journal d'audit en **hash-chain SHA-256 append-only** (ADR-007, `hash(N)=SHA-256(hash(N-1)+entry(N))` — **pas** un arbre de Merkle) : intégrité forte **uniquement si** le hash racine est ancré périodiquement chez un tiers (registre signé remis au Vérificateur Général/OCLEI) ; sans cet ancrage, un admin DB peut recalculer toute la chaîne et reforger un journal cohérent. **Ancrage tiers = à implémenter.** | Doc 09 + CI                       |
| A09 Logging & Monitoring           | Pino + Loki, audit chaîné, SIEM via Grafana                                                                                                                                                                                                                                                                                                                                                                                                                | Doc 17                            |
| A10 SSRF                           | Pas de `fetch` server-side d'URL fournie par l'utilisateur ; si un fetch sortant devient nécessaire, allowlist d'hôtes dédiée + blocage des plages IP privées/link-local (notamment `169.254.169.254`). **CORS ≠ anti-SSRF** : CORS protège l'_inbound_ (qui peut t'appeler), pas l'_outbound_ (ce que ton serveur va chercher).                                                                                                                           | `@nina-aes/config`                |

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

### Étape 4.8 — Protection des lanceurs d'alerte + minimisation RGPD-like

**Pourquoi un volet dédié ?** NINA-AES gère des **signalements anti-corruption** (service
`anticorruption-service`, alertes SIGAC). Un lanceur d'alerte qui dénonce un fonctionnaire corrompu
court un **risque physique** si son identité fuit. Or les fuites ne viennent pas que d'une base
volée : elles viennent des **métadonnées** (qui a posté, depuis quelle IP, à quelle heure, corrélé à
quel agent connecté au même moment). La sécurité « classique » (chiffrement, mTLS) ne suffit pas —
il faut une **anti-corrélation** délibérée. C'est un objectif de conception (A04 Insecure Design),
pas un add-on.

**Mesures de protection des lanceurs d'alerte (anti-corrélation)** :

| Vecteur de désanonymisation      | Mesure NINA-AES                                                                                                                                                                 | État                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Corrélation par **IP**           | Pas de stockage d'IP brute pour les soumissions de signalement ; au pire un hash salé à TTL court ; entrée via réseau anonymisant côté client documentée dans `THREAT-MODEL.md` | **conçu** (à implémenter) |
| Corrélation par **timing**       | Délai aléatoire (jitter) + lots (batching) à l'enregistrement du signalement pour casser le lien « connexion agent ↔ dépôt alerte »                                             | **conçu** (à implémenter) |
| Corrélation par **logs**         | Les logs applicatifs **excluent** l'identité du lanceur d'alerte (champ `whistleblower_id` jamais journalisé) ; audit chaîné stocke un pseudonyme, pas l'identité réelle        | **conçu**                 |
| Accès au **dossier d'alerte**    | Chiffrement Transit dédié (clé `nina-aes-pii`) + RBAC le plus strict (seul l'OCLEI déchiffre) ; séparation des rôles enquêteur/admin                                            | **partiellement conçu**   |
| **Métadonnées** de fichier joint | Strip EXIF/metadata des pièces jointes avant stockage                                                                                                                           | **conçu** (à implémenter) |

> ⚠ **Honnêteté d'ingénierie** : à ce stade ces protections sont **spécifiées** (conçues) mais la
> plupart ne sont **pas encore implémentées** dans le code. Le STRIDE par service de
> `docs/security/THREAT-MODEL.md` (volet « Information Disclosure » d'`anticorruption-service`) en
> fait le suivi, et `docs/security/SECURITY-RUNBOOK.md` décrit la procédure si une fuite de
> corrélation est suspectée. Ne JAMAIS présenter ces contrôles comme « actifs » tant que le test
> d'anti-corrélation n'est pas passé.

**Minimisation RGPD-like (loi malienne 2017-070 sur les données personnelles + esprit RGPD)** :

- **Minimisation** : ne collecter que les champs strictement nécessaires à chaque cas d'usage ; pas
  de « au cas où ». Chaque DTO Zod (`@nina-aes/shared-types`) est la frontière contractuelle.
- **Rétention** : durées de conservation explicites par type de donnée ; suppression/anonymisation
  automatique à expiration (job planifié). Les signalements anonymes ne conservent **aucune** donnée
  d'identification au-delà de l'instruction.
- **Droits des personnes** : accès, rectification, effacement (sauf obligation légale d'archivage de
  l'état civil) ; traçabilité des accès aux PII via l'audit chaîné (doc 09).
- **Chiffrement au repos** : toutes les PII passent par Transit (`nina-aes-pii`, AES-256-GCM) avant
  stockage ; la base ne voit que du chiffré.

> 📎 **Renvois** : modèle de menace complet → `docs/security/THREAT-MODEL.md` (STRIDE par
> microservice du Bloc A, dont `anticorruption-service`) ; procédures d'incident, de rotation de clé
> compromise et de réponse à une suspicion de désanonymisation →
> `docs/security/SECURITY-RUNBOOK.md`.

---

## 5. Tests de validation

1. **Vault** : `vault status` retourne `Sealed=false`, `Active Node=true`. Lecture d'un secret
   factice fonctionne avec un token applicatif (politique limitée).
2. **mTLS (mode strict)** : `linkerd viz tap deploy/identity-service` montre `tls=true` sur
   **toutes** les requêtes. Depuis un pod **non maillé** (sans cert client, ex.
   `kubectl run tmp --image=curlimages/curl …` dans un namespace sans injection),
   `curl identity-service:3001` → **connexion refusée** par le proxy. ⚠ Ce test n'est valide qu'avec
   le `Server` + `AuthorizationPolicy` + `default-inbound-policy: deny` du §4.3 ; en mode permissif
   par défaut, la connexion **passerait** (faux négatif).
3. **Auth Vault sans token statique** : aucun `VAULT_TOKEN` long-lived dans l'environnement des pods
   (`kubectl exec … env | grep VAULT_TOKEN` → vide) ; le login passe par `auth/kubernetes/login` et
   le lease se renouvelle (vérifiable dans les logs Vault `token renewal`).
4. **Rotation Postgres** : à T+24h, `vault read database/creds/identity-service` renvoie de nouveaux
   credentials, l'ancien rôle est révoqué dans Postgres (`\du` ne le liste plus).
5. **Helmet** : `curl -I http://localhost:3001/` montre `Strict-Transport-Security`,
   `X-Frame-Options: DENY`, `Content-Security-Policy: …` présents.
6. **CSP nonce (prod)** : `curl -I https://citizen.nina.internal/` montre un
   `Content-Security-Policy` **sans** `'unsafe-inline'` et avec `'nonce-…'` ; recharger deux fois →
   le nonce change à chaque requête.
7. **Rate-limit** : 200 requêtes en 1 minute → 429 après le 100ᵉ (config
   `RATE_LIMIT_CONFIG.medium`), grâce au `ThrottlerGuard` global du `SecurityModule`.
8. **Anti-corrélation lanceur d'alerte** : déposer un signalement de test, puis `grep` les logs
   (`whistleblower_id`, IP) → **aucune** occurrence ; vérifier le jitter à l'enregistrement. (Tant
   que la mesure est « conçue mais non implémentée », ce test échoue **et c'est documenté** comme
   tel dans `THREAT-MODEL.md` — ne pas le cocher prématurément.)
9. **Trivy CI** : un push avec une dep vulnérable HIGH **bloque** la merge (exit-code 1).
10. **gitleaks** : commit volontairement un faux token → le pre-commit hook le rejette.
11. **Ancrage tiers du journal d'audit (A08 — reste-à-faire)** : à terme, vérifier que le hash
    racine de la hash-chain (ADR-007) est publié périodiquement dans un registre signé remis au
    Vérificateur Général/OCLEI, et qu'un journal recalculé après falsification d'une entrée **ne
    correspond plus** à l'ancre publiée. Tant que l'ancrage n'est pas implémenté, ce test échoue
    **et c'est documenté** comme tel — ne pas le cocher prématurément (la hash-chain seule est
    falsifiable par un admin DB, qui est précisément le modèle de menace interne du SIGAC).

---

## 6. Pièges courants & dépannage

| Symptôme                                       | Cause probable                                                                                | Solution                                                                                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vault `* sealed`                               | Pod redémarré sans unseal automatique                                                         | **Auto-unseal souverain** : Vault Transit (un cluster Vault interne « unsealer » scelle le cluster applicatif) **ou** Shamir + HSM on-premise. **Jamais AWS KMS** (dépendance étrangère sur le chemin critique). Détails ci-dessous. |
| Linkerd : `connection refused` **attendu**     | Mode strict actif (`default-inbound-policy: deny`) sans `AuthorizationPolicy` pour l'appelant | Ajouter l'identité de l'appelant dans le `MeshTLSAuthentication` du §4.3. Si **non** attendu : sidecar non injecté → `kubectl annotate namespace <ns> linkerd.io/inject=enabled` + `rollout restart`.                                |
| Helmet casse le frontend (CSP)                 | En prod, `'unsafe-inline'` retiré mais nonce non propagé                                      | Vérifier que le middleware Next.js (§4.2 bis) pose `x-nonce` ET l'applique aux `<Script nonce>` (cf. doc 12). En **dev seulement**, la branche `IS_PROD` retombe sur `'unsafe-inline'`.                                              |
| Trivy en CI : faux positif sur dep transitive  | DB Trivy plus à jour que la registry npm                                                      | Pinner la version Trivy ; ajouter `.trivyignore` documenté avec ticket de suivi.                                                                                                                                                     |
| MFA TOTP : « code invalide » alors que correct | Drift d'horloge serveur                                                                       | NTP obligatoire sur tous les nœuds K3s ; window TOTP `±1 step` (30 s).                                                                                                                                                               |
| Postgres password rotation casse les apps      | Connexion long-lived sans re-auth                                                             | Pool Prisma : `pool_timeout=10` + reconnect on auth-error ; lifecycle hook qui recharge le secret.                                                                                                                                   |

---

## 7. Documentation à produire

- `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` (décision : Vault + Linkerd + Helmet +
  scans CI).
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
- [ ] **Mode strict** Linkerd : `Server` + `AuthorizationPolicy` + `default-inbound-policy: deny` ;
      test « pod non maillé → connexion refusée » passé
- [ ] PKI Vault montée (root CA hors-ligne + intermediate + rôle `nina-service`) ; renouvellement
      cert 24 h vérifié
- [ ] Auto-unseal **souverain** configuré (Transit interne ou Shamir+HSM) — **pas d'AWS KMS**
- [ ] Auth Vault via ServiceAccount K8s + lease renewal ; **aucun** `VAULT_TOKEN` long-lived en prod
- [ ] JWT signés en **Ed25519** (ou RSA-3072 si interop) — **aucune** clé RSA-2048
- [ ] Rotation Postgres opérationnelle (TTL 24 h vérifié)
- [ ] Helmet + CSP (nonce en prod, **sans** `'unsafe-inline'`) + Throttler global actifs (test
      curl + 429)
- [ ] Anti-corrélation lanceurs d'alerte (§4.8) suivie dans `THREAT-MODEL.md` ; statut « conçu vs
      implémenté » honnête
- [ ] CI : Trivy, Semgrep, gitleaks, pnpm audit, Bandit verts
- [ ] OWASP ZAP scan baseline → 0 HIGH
- [ ] `SECURITY-RUNBOOK.md` rédigé et placé dans `docs/security/`
- [ ] `THREAT-MODEL.md` couvrant les 4 services du Bloc A
- [ ] `ADR-034` rédigé
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
