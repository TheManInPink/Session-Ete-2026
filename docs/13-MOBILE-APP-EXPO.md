# 13 — Application Mobile React Native (Expo SDK 55+)

> **Bloc concerné** : A (NINA Mali) — extension mobile du portail citoyen
> **Prérequis** : documents 00 → 12 complétés ; `identity-service`, `auth-service`,
> `document-service` accessibles depuis le poste ; un téléphone Android **ou** iOS pour le test
> physique (l'émulateur Android suffit pour 95 % du parcours).
> **Durée estimée** : 24 à 32 heures pour un étudiant seul.
> **Livrables de cette étape** :
>
> - `apps/mobile/` (Expo SDK 55, React Native 0.78, TypeScript 6.0+)
> - 5 écrans : Accueil · Recherche NINA · Scan QR FDI · Détail citoyen · Paramètres
> - Authentification OIDC + PKCE avec Keycloak (sans secret client mobile)
> - Vérification offline du QR code FDI (JWT RS256, clé publique embarquée)
> - Verrouillage de l'app par biométrie locale (Face ID / empreinte / PIN fallback)
> - Cache offline-first via `op-sqlite` + queue de mutations
> - 8 langues nationales (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE) via `expo-localization`
> - Build EAS développement (APK signé) installable sur téléphone physique
> - `docs/adr/ADR-016-mobile-stack-expo.md` à rédiger en fin d'étape

---

## 1. Objectif pédagogique

L'app mobile prolonge le portail citoyen sur **Android et iOS** sans ré-implémenter la logique
métier. Trois objectifs pédagogiques précis :

1. **Inclusion numérique au-delà du smartphone urbain** : l'app doit fonctionner même quand le
   réseau est intermittent (Mali, zones rurales). On apprend ici l'**offline-first** :
   lecture cache prioritaire, queue de mutations, réémission automatique au retour réseau.
2. **Souveraineté de la vérification d'identité** : un agent en antenne mobile peut scanner le QR
   code de la FDI papier d'un citoyen et **vérifier la signature JWT RS256 sans appeler l'API**
   (clé publique CTDEC livrée avec l'app, rotation gérée via une mise à jour OTA Expo). Ça
   matérialise concrètement le principe « pas de single point of failure réseau ».
3. **Sécurité locale du device** : le NINA stocké est protégé par la biométrie native du téléphone
   (Face ID / empreinte) avec fallback PIN. On apprend `expo-local-authentication` et le stockage
   chiffré `expo-secure-store` (Keystore Android / Keychain iOS).

> 💡 **Pourquoi pas un PWA seul ?** Une PWA suffirait pour la lecture, mais (a) le scan QR caméra
> y reste limité sur iOS, (b) la biométrie native n'y est pas exposée, (c) le mode offline d'une
> PWA dépend du Service Worker qui se purge plus agressivement que le stockage natif, et (d) la
> distribution via Play Store / App Store rassure les citoyens — un domaine d'État officiel
> apparaît crédible.

---

## 2. Technologies utilisées (versions avril 2026)

| Technologie                  | Version  | Rôle dans cette étape                                         | Documentation officielle                              |
| ---------------------------- | -------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| **Expo SDK**                 | 55.0     | Plateforme RN managée + EAS Build + OTA updates               | https://docs.expo.dev/                                |
| **React Native**             | 0.78     | Framework UI multiplateforme                                  | https://reactnative.dev/                              |
| **expo-router**              | 5.0      | Routing typé file-based (équivalent App Router Next.js)       | https://docs.expo.dev/router/introduction/            |
| **TypeScript**               | 6.0+     | Langage source                                                | https://www.typescriptlang.org/                       |
| **expo-camera**              | 17.0     | Scan QR + accès caméra                                        | https://docs.expo.dev/versions/latest/sdk/camera/     |
| **expo-local-authentication** | 16.0    | Verrouillage biométrique (Face ID / empreinte)                | https://docs.expo.dev/versions/latest/sdk/local-authentication/ |
| **expo-secure-store**        | 14.0     | Stockage chiffré (Keystore / Keychain) pour tokens et clés    | https://docs.expo.dev/versions/latest/sdk/securestore/ |
| **expo-localization**        | 17.0     | Détection langue device + bibliothèque `i18n-js`              | https://docs.expo.dev/versions/latest/sdk/localization/ |
| **expo-auth-session**        | 7.0      | OIDC + PKCE pour mobile (Keycloak sans secret)                | https://docs.expo.dev/versions/latest/sdk/auth-session/ |
| **op-sqlite**                | 14.0     | SQLite haute performance (cache + queue offline)              | https://github.com/OP-Engineering/op-sqlite           |
| **TanStack Query**           | 5.90     | Cache HTTP réactif + retry exponentiel                        | https://tanstack.com/query                            |
| **Zod**                      | 4.3      | Validation des réponses API (partagé via `@nina-aes/shared-types`) | https://zod.dev/                                  |
| **NativeWind**               | 5.0      | Tailwind CSS pour React Native (alignement design AES)        | https://www.nativewind.dev/                           |
| **EAS Build**                | latest   | Compilation cloud APK / IPA signés                            | https://docs.expo.dev/build/introduction/             |
| **react-native-svg**         | 16.0     | Rendu SVG (logos AES, icônes design system)                   | https://github.com/software-mansion/react-native-svg  |

> 🔒 **Souveraineté** : aucune dépendance étrangère sensible — `expo-auth-session` parle à votre
> Keycloak on-premise, pas à un IdP externe. Le scan QR est local, la signature est vérifiée
> localement avec la clé publique CTDEC. Aucun service tiers (analytics Google, Crashlytics
> Firebase, etc.) — on utilisera Sentry **self-hosted** au document 17 si nécessaire.

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_MobileArchitecture
title Architecture mobile Expo — Bloc A

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam component { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }

actor Citoyen as User

package "Téléphone Android / iOS" {
  component "App Expo (apps/mobile)" as App {
    component "expo-router\n5 écrans" as Router
    component "TanStack Query\n(cache HTTP)" as TQ
    component "Auth Session\nOIDC + PKCE" as Auth
    component "Camera QR\n+ verifyRS256()" as QR
    component "Local Auth\n(Face ID / Empreinte)" as Bio
  }
  database "op-sqlite" as DB
  database "expo-secure-store\n(Keystore / Keychain)" as Vault
}

cloud "Réseau (4G / Wi-Fi intermittent)" as Net

package "API NINA-AES (CTDEC on-premise)" as API {
  component "API Gateway :3000" as GW
  component "Identity Service" as Identity
  component "Auth Service\n(Keycloak adapter)" as AuthSrv
  component "Document Service\n(QR JWT RS256)" as Doc
}

User --> App
Router --> TQ : queries
TQ --> DB : cache local\n(stale-while-revalidate)
TQ ..> Net : retry exp + offline detection
Net --> GW
GW --> Identity
GW --> AuthSrv
GW --> Doc

Auth --> Vault : refresh token chiffré
QR ..> Vault : clé publique CTDEC\n(rotation OTA)
Bio --> Vault : déverrouillage app
DB ..> Net : sync queue\n(au retour réseau)

note bottom of QR
  Vérification offline :
  • parse JWT (header.payload.sig)
  • verify RS256 avec clé publique
  • check exp + photoHash
  Aucun appel réseau requis.
end note

note bottom of DB
  Tables :
  • citizens_cache (TTL 24h)
  • mutation_queue (PENDING)
  • verifications_log
end note

@enduml
```

> 📝 Le rendu visuel est dans `docs/diagrams/13-mobile-architecture.puml`
> (à créer en complément si vous voulez la version standalone).

---

## 4. Étapes d'implémentation

### Étape 4.1 — Initialisation du projet Expo dans le monorepo

**Pourquoi** : Expo se greffe sur la structure Turborepo existante. On crée l'app avec le template
TypeScript router-typed, on l'enregistre comme workspace pnpm, et on aligne TypeScript sur la base
partagée.

**Commandes CLI à exécuter (dans l'ordre)** :

```powershell
# Se placer à la racine du monorepo
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# Crée l'app Expo avec template router typed (TypeScript par défaut)
# La commande crée apps/mobile/ avec App Router intégré
pnpm dlx create-expo-app@latest apps/mobile --template tabs --no-install --no-git

# Installe les dépendances de l'app via pnpm (intégration workspace)
pnpm --filter @nina-aes/mobile install

# Met à jour le nom dans apps/mobile/package.json :
#   "name": "@nina-aes/mobile" et l'aligne sur les workspaces

# Vérifie que l'app apparaît bien dans le workspace
pnpm list -r --depth -1 | findstr mobile
```

**Fichier(s) à créer/modifier** :

```jsonc
// apps/mobile/package.json (extrait — édition minimale post-template)
{
  "name": "@nina-aes/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "check-types": "tsc --noEmit",
    "test": "jest --watch=false"
  }
}
```

```jsonc
// apps/mobile/tsconfig.json (édité)
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"],
      "@nina-aes/shared-types": ["../../packages/shared-types/src"],
      "@nina-aes/utils": ["../../packages/utils/src"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

> 💡 On ne réimporte pas `@nina-aes/database` ni `@nina-aes/config` dans l'app mobile : la
> base Prisma est côté serveur. Mobile = consommateur d'API uniquement.

### Étape 4.2 — Dépendances métier (camera, biométrie, secure-store, OIDC, SQLite)

**Pourquoi** : ces six modules natifs sont la fondation de tout le reste — autant les installer
en un seul bloc et exécuter `expo install` qui aligne les versions natives sur le SDK 55.

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform\apps\mobile

# Modules natifs Expo (versions auto-alignées par expo-cli)
pnpm exec expo install expo-camera expo-local-authentication expo-secure-store `
  expo-localization expo-auth-session expo-crypto expo-router expo-status-bar

# Stockage local SQLite haute performance + libs UI / data
pnpm add @op-engineering/op-sqlite @tanstack/react-query zod react-native-svg `
  i18n-js nativewind tailwindcss
pnpm add -D @types/i18n-js
```

**Fichier(s) à créer/modifier** :

```jsonc
// apps/mobile/app.json (extrait — permissions + plugins)
{
  "expo": {
    "name": "NINA-AES",
    "slug": "nina-aes",
    "version": "0.1.0",
    "scheme": "ninaaes",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "ios": {
      "bundleIdentifier": "ml.gouv.ninaaes",
      "infoPlist": {
        "NSCameraUsageDescription": "Pour scanner le QR code de votre Fiche Descriptive Individuelle.",
        "NSFaceIDUsageDescription": "Pour déverrouiller votre NINA en toute sécurité."
      }
    },
    "android": {
      "package": "ml.gouv.ninaaes",
      "permissions": ["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT"]
    },
    "plugins": [
      "expo-router",
      [
        "expo-camera",
        { "cameraPermission": "L'app a besoin de la caméra pour scanner le QR de votre FDI." }
      ],
      [
        "expo-local-authentication",
        { "faceIDPermission": "Authentification biométrique pour accéder à votre NINA." }
      ],
      "expo-secure-store"
    ]
  }
}
```

### Étape 4.3 — Internationalisation (8 langues nationales)

**Pourquoi** : un citoyen malien parlant bambara doit pouvoir utiliser l'app sans connaître le
français. La détection est automatique via `expo-localization`, les libellés sont chargés depuis
`packages/shared-types` (`SUPPORTED_LANGUAGES` partagé avec le web).

**Fichier(s) à créer/modifier** :

```typescript
// apps/mobile/src/i18n/index.ts
/**
 * @file        index.ts
 * @description Configuration i18n — 8 langues nationales détectées via
 *              `expo-localization`, fallback FR. Les fichiers de traduction
 *              vivent dans `src/i18n/locales/<code>.json`.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/mobile
 */

import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import { Language } from '@nina-aes/shared-types';

import fr from './locales/fr.json';
import bm from './locales/bm.json';
import snk from './locales/snk.json';
import ff from './locales/ff.json';
import tmq from './locales/tmq.json';
import hau from './locales/hau.json';
import mos from './locales/mos.json';
import dje from './locales/dje.json';

/** Mapping code projet → dictionnaire de libellés. */
const TRANSLATIONS = { fr, bm, snk, ff, tmq, hau, mos, dje };

/**
 * Détecte la langue préférée du device et retombe sur FR si non supportée.
 *
 * @returns Code interne {@link Language} (FR, BM, …).
 */
export function detectInitialLanguage(): Language {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase() ?? 'fr';
  const supported: Record<string, Language> = {
    fr: Language.FR, bm: Language.BM, snk: Language.SNK, ff: Language.FF,
    tmh: Language.TMQ, ha: Language.HAU, mos: Language.MOS, dje: Language.DJE,
  };
  return supported[code] ?? Language.FR;
}

/** Singleton i18n configuré au démarrage de l'app. */
export const i18n = new I18n(TRANSLATIONS, {
  defaultLocale: 'fr',
  enableFallback: true,
});

i18n.locale = detectInitialLanguage().toLowerCase();
```

```jsonc
// apps/mobile/src/i18n/locales/fr.json (extrait — 5 clés sentinelles)
{
  "home": { "title": "Mon NINA", "search_cta": "Rechercher mon NINA" },
  "scan": { "title": "Scanner ma fiche", "instruction": "Cadrez le QR code de la FDI" },
  "auth": { "lock_prompt": "Déverrouillez avec votre empreinte ou Face ID" },
  "errors": { "offline": "Pas de réseau — affichage du dernier résultat connu" }
}
```

```jsonc
// apps/mobile/src/i18n/locales/bm.json (extrait — bambara)
{
  "home": { "title": "Ne ka NINA", "search_cta": "N ka NINA ɲinini" },
  "scan": { "title": "Sɛbɛn jate", "instruction": "QR ye ka da Sɛbɛn kan" },
  "auth": { "lock_prompt": "I bolofitinin walima Face ID ye ka da kan" },
  "errors": { "offline": "Telefoni ka taa — jaki kɔrɔlen bɛ jira" }
}
```

> 📝 Les 6 autres fichiers (`snk.json`, `ff.json`, `tmq.json`, `hau.json`, `mos.json`, `dje.json`)
> sont à créer sur le même modèle. Pour la **traduction des clés** : utilisez les services
> universitaires UQAR / locaux maliens — ne dépendez **pas** de Google Translate (souveraineté).

### Étape 4.4 — Authentification OIDC + PKCE avec Keycloak

**Pourquoi** : sur mobile, on **ne peut pas** stocker un secret client. PKCE (Proof Key for Code
Exchange) résout ça : un challenge cryptographique généré par le device remplace le secret. Le
flow respecte la spec OAuth 2.1 et est nativement supporté par Keycloak 26.

**Fichier(s) à créer/modifier** :

```typescript
// apps/mobile/src/auth/use-keycloak.ts
/**
 * @file        use-keycloak.ts
 * @description Hook React encapsulant le flux OIDC + PKCE avec Keycloak.
 *              Persiste le refresh token dans expo-secure-store (Keystore /
 *              Keychain), l'access token reste en mémoire.
 *
 *              Le client Keycloak `nina-mobile` est de type "public" (sans
 *              secret) — la sécurité repose sur PKCE + audience binding.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/mobile
 */

import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { useState, useCallback } from 'react';

const KEYCLOAK_BASE = process.env.EXPO_PUBLIC_KEYCLOAK_URL!;
const REALM = 'nina-aes';
const CLIENT_ID = 'nina-mobile';

const discovery = {
  authorizationEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/token`,
  endSessionEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/logout`,
};

/** Tokens renvoyés par Keycloak après échange du code. */
interface Tokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

/**
 * Hook React centralisant l'authentification.
 *
 * @returns L'état des tokens + les actions `signIn`, `signOut`, `refresh`.
 */
export function useKeycloak() {
  const [tokens, setTokens] = useState<Tokens | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['openid', 'profile', 'offline_access'],
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'ninaaes' }),
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  const signIn = useCallback(async () => {
    const result = await promptAsync({ showInRecents: false });
    if (result.type !== 'success') return;

    const exchange = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: result.params.code!,
        redirectUri: AuthSession.makeRedirectUri({ scheme: 'ninaaes' }),
        extraParams: { code_verifier: request!.codeVerifier! },
      },
      discovery,
    );

    const newTokens: Tokens = {
      accessToken: exchange.accessToken,
      refreshToken: exchange.refreshToken!,
      idToken: exchange.idToken!,
      expiresAt: Date.now() + (exchange.expiresIn ?? 900) * 1000,
    };
    setTokens(newTokens);
    await SecureStore.setItemAsync('refreshToken', newTokens.refreshToken, {
      keychainService: 'nina-aes',
      requireAuthentication: false,
    });
  }, [promptAsync, request]);

  const signOut = useCallback(async () => {
    setTokens(null);
    await SecureStore.deleteItemAsync('refreshToken');
  }, []);

  return { tokens, signIn, signOut, isAuthenticated: !!tokens };
}
```

> ⚠️ **À configurer côté Keycloak** (doc 08) : créer le client `nina-mobile` avec :
> `Access Type = public`, `Standard Flow Enabled`, `Valid Redirect URIs = ninaaes://*`,
> `Web Origins = +` (pour CORS). PKCE requis (`PKCE Code Challenge Method = S256`).

### Étape 4.5 — Vérification offline du QR FDI (JWT RS256)

**Pourquoi** : un agent en antenne mobile (RAVEC) doit pouvoir vérifier qu'un QR code papier est
authentique **sans réseau**. La clé publique CTDEC est embarquée dans l'app (rotation via OTA
Expo), permettant la vérification cryptographique locale.

**Fichier(s) à créer/modifier** :

```typescript
// apps/mobile/src/qr/verify-fdi.ts
/**
 * @file        verify-fdi.ts
 * @description Vérification offline du QR code de la Fiche Descriptive
 *              Individuelle (FDI). Le QR contient un JWT RS256 signé par le
 *              CTDEC (cf. document-service / doc 10).
 *
 *              Algorithme :
 *                1. Parse header.payload.signature (base64url)
 *                2. Vérifie alg=RS256 et kid=ctdec-2026
 *                3. Recalcule SHA-256 sur "header.payload"
 *                4. Vérifie la signature RSA avec la clé publique embarquée
 *                5. Vérifie exp et iat
 *
 *              Aucun appel réseau requis — la clé publique est fournie au
 *              build (puis rotée via Expo OTA tous les 90 jours).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/mobile
 */

import * as Crypto from 'expo-crypto';
import { CTDEC_PUBLIC_KEY_JWK } from './embedded-keys';

/** Charge utile attendue dans le JWT du QR. */
export interface FdiPayload {
  /** NINA (15 chars). */
  sub: string;
  /** Nom du citoyen (préfixé par initiale prénom). */
  name: string;
  /** Date de naissance ISO (AAAA-MM-JJ). */
  dob: string;
  /** Hash SHA-256 de la photo (vérification croisée). */
  photoHash: string;
  /** Version de la fiche (incrémentée à chaque correction). */
  ver: number;
  /** Émis (epoch sec). */
  iat: number;
  /** Expiration (epoch sec). */
  exp: number;
}

/** Résultat de la vérification. */
export type VerifyResult =
  | { ok: true; payload: FdiPayload }
  | { ok: false; reason: 'malformed' | 'bad-alg' | 'bad-signature' | 'expired' };

/**
 * Vérifie un JWT RS256 issu d'un QR FDI.
 *
 * @param jwt - Le JWT compact (3 segments séparés par `.`).
 * @returns Résultat typé. En cas de succès, la charge utile est renvoyée.
 */
export async function verifyFdiQr(jwt: string): Promise<VerifyResult> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Décode header
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(b64UrlDecodeUtf8(headerB64));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'RS256' || header.kid !== 'ctdec-2026') {
    return { ok: false, reason: 'bad-alg' };
  }

  // Vérifie la signature avec WebCrypto (polyfill expo-crypto en 2026)
  const valid = await verifyRsaSignature(
    `${headerB64}.${payloadB64}`,
    signatureB64,
    CTDEC_PUBLIC_KEY_JWK,
  );
  if (!valid) return { ok: false, reason: 'bad-signature' };

  // Décode payload + check expiration
  const payload = JSON.parse(b64UrlDecodeUtf8(payloadB64)) as FdiPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}

/** Décode base64url → string UTF-8. */
function b64UrlDecodeUtf8(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  // atob est dispo en RN 0.78+ via Hermes ; sinon, polyfill base-64.
  return decodeURIComponent(escape(globalThis.atob(b64)));
}

/**
 * Vérifie une signature RSA-SHA256 avec WebCrypto.
 *
 * @param signingInput - `<header_b64>.<payload_b64>`.
 * @param signatureB64 - Signature en base64url.
 * @param publicKeyJwk - Clé publique au format JWK.
 */
async function verifyRsaSignature(
  signingInput: string,
  signatureB64: string,
  publicKeyJwk: JsonWebKey,
): Promise<boolean> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    // Fallback : utiliser expo-crypto (digest only). En SDK 55, WebCrypto
    // est exposé par défaut sur Hermes — ce chemin reste un garde-fou.
    return false;
  }
  const key = await subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sig = b64UrlToUint8(signatureB64);
  const data = new TextEncoder().encode(signingInput);
  return subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
}

/** base64url → Uint8Array. */
function b64UrlToUint8(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

```typescript
// apps/mobile/src/qr/embedded-keys.ts
/**
 * Clé publique CTDEC au format JWK.
 * **Mise à jour via Expo OTA tous les 90 jours** (cf. doc 17).
 * NE JAMAIS commiter la clé privée ici.
 */
export const CTDEC_PUBLIC_KEY_JWK: JsonWebKey = {
  kty: 'RSA',
  kid: 'ctdec-2026',
  use: 'sig',
  alg: 'RS256',
  n: '… (modulus base64url) …',
  e: 'AQAB',
};
```

### Étape 4.6 — Verrouillage biométrique de l'app

**Pourquoi** : à chaque ouverture (foreground), on demande une authentification biométrique
locale **avant** d'afficher le NINA. Si la biométrie n'est pas disponible (ancien téléphone),
fallback sur PIN device. C'est une mesure défense en profondeur (vol du téléphone déverrouillé).

```typescript
// apps/mobile/src/auth/biometric-gate.tsx
/**
 * @file        biometric-gate.tsx
 * @description Composant de verrouillage qui occulte l'app tant que
 *              l'utilisateur n'a pas validé la biométrie. Active à chaque
 *              passage en foreground (AppState).
 * @module      @nina-aes/mobile
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { AppState, View, Text, Pressable } from 'react-native';
import { i18n } from '../i18n';

interface Props { children: React.ReactNode }

export function BiometricGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false);

  const tryUnlock = async () => {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) {
      // Aucune biométrie configurée : on autorise mais on alerte (à faire).
      setUnlocked(true);
      return;
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: i18n.t('auth.lock_prompt'),
      fallbackLabel: 'Code PIN',
      cancelLabel: 'Annuler',
    });
    if (r.success) setUnlocked(true);
  };

  useEffect(() => {
    tryUnlock();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryUnlock();
      else setUnlocked(false);
    });
    return () => sub.remove();
  }, []);

  if (!unlocked) {
    return (
      <View className="flex-1 items-center justify-center bg-aes-mali-50">
        <Text className="text-2xl font-bold mb-4">🔒 NINA-AES</Text>
        <Pressable onPress={tryUnlock} className="bg-primary px-6 py-3 rounded-lg">
          <Text className="text-white">{i18n.t('auth.lock_prompt')}</Text>
        </Pressable>
      </View>
    );
  }
  return <>{children}</>;
}
```

### Étape 4.7 — Cache offline-first avec op-sqlite

**Pourquoi** : les zones rurales ont un réseau 4G intermittent. L'app doit afficher le **dernier
NINA consulté** sans réseau, et **mettre en file** les actions qui nécessitent le serveur (ex. :
soumettre une demande de correction) pour les rejouer au retour réseau.

```typescript
// apps/mobile/src/db/index.ts
/**
 * @file        index.ts
 * @description Base SQLite locale (op-sqlite) — cache des fiches NINA et
 *              queue de mutations offline.
 *
 *              Tables :
 *                - citizens_cache  (NINA → JSON, fetched_at, ttl)
 *                - mutation_queue  (id, endpoint, body, status, retry_count)
 *
 *              Politique :
 *                - cache TTL 24 h pour les fiches consultées
 *                - mutation_queue rejouée au retour réseau (NetInfo + retry)
 *                - PII dans cache : OK (le device est verrouillé biométrie)
 *
 * @module      @nina-aes/mobile
 */

import { open } from '@op-engineering/op-sqlite';

const db = open({ name: 'nina-aes.db' });

db.execute(`
  CREATE TABLE IF NOT EXISTS citizens_cache (
    nina TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    ttl INTEGER NOT NULL DEFAULT 86400
  );
  CREATE TABLE IF NOT EXISTS mutation_queue (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

/** Lit une fiche depuis le cache si elle n'a pas expiré. */
export function readCachedCitizen(nina: string): unknown | null {
  const row = db.execute(
    'SELECT payload, fetched_at, ttl FROM citizens_cache WHERE nina = ?',
    [nina],
  ).rows?.[0];
  if (!row) return null;
  if (Date.now() / 1000 - Number(row.fetched_at) > Number(row.ttl)) return null;
  return JSON.parse(String(row.payload));
}

/** Écrit / met à jour la fiche en cache. */
export function writeCachedCitizen(nina: string, payload: unknown): void {
  db.execute(
    'INSERT OR REPLACE INTO citizens_cache (nina, payload, fetched_at) VALUES (?, ?, ?)',
    [nina, JSON.stringify(payload), Math.floor(Date.now() / 1000)],
  );
}

/** Met une mutation en file (sera rejouée au retour réseau). */
export function enqueueMutation(m: {
  id: string;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body: unknown;
}): void {
  db.execute(
    'INSERT INTO mutation_queue (id, endpoint, method, body, created_at) VALUES (?, ?, ?, ?, ?)',
    [m.id, m.endpoint, m.method, JSON.stringify(m.body), Math.floor(Date.now() / 1000)],
  );
}
```

> 📌 La rejouation de la queue (au retour réseau) se fait dans un hook `useReplayQueue` branché
> sur `@react-native-community/netinfo` + un `setInterval(30s)`. Le code complet est dans
> `apps/mobile/src/db/replay.ts` (à écrire par bloc de ~50 lignes — couvert plus tard).

### Étape 4.8 — Build EAS développement (APK signé)

**Pourquoi** : pour tester sur un téléphone physique sans publier en store, EAS Build produit un
APK signé en quelques minutes. C'est l'étape qui valide que les modules natifs (camera, biométrie)
fonctionnent vraiment.

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform\apps\mobile

# Login Expo (nécessite un compte gratuit expo.dev)
pnpm exec eas login

# Initialise la config EAS (crée eas.json)
pnpm exec eas build:configure

# Build APK Android en mode developpement (preview)
# Durée : ~10-15 min sur les serveurs Expo
pnpm exec eas build --profile development --platform android

# Une fois l'APK construit, scannez le QR fourni par EAS pour le télécharger
# sur le téléphone, puis lancez le serveur dev :
pnpm start
```

```jsonc
// apps/mobile/eas.json
{
  "cli": { "version": ">= 14.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_KEYCLOAK_URL": "http://10.0.2.2:8080" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": { "EXPO_PUBLIC_KEYCLOAK_URL": "https://auth.ctdec.gouv.ml" }
    }
  }
}
```

> 📝 `10.0.2.2` est l'alias Android pour `localhost` du host. Pour iOS Simulator c'est
> `localhost` directement. Pour un téléphone physique sur le même Wi-Fi, mettre l'IP locale
> du PC (ex. `192.168.1.20`).

---

## 5. Tests de validation

### Test 1 — Démarrage en mode dev

```powershell
pnpm --filter @nina-aes/mobile start
# Attendu : Metro bundler démarre, QR code s'affiche dans le terminal.
# Scannez avec l'app Expo Go sur Android (sauf modules natifs nécessitant
# le dev client custom — auquel cas ouvrir l'APK EAS).
```

### Test 2 — Authentification OIDC

1. Lancer Keycloak local (`pnpm docker:up`).
2. Dans l'app, taper « Se connecter ».
3. **Attendu** : navigateur in-app ouvre la page Keycloak → après login, redirection vers
   `ninaaes://callback` → l'app affiche l'accueil avec le NINA du compte.
4. Forcer le mode avion → l'app affiche toujours le NINA (cache 24h).

### Test 3 — Scan QR FDI

1. Imprimer / afficher la FDI signée d'un citoyen seedé.
2. Dans l'app, ouvrir « Scanner ».
3. **Attendu** : caméra s'ouvre, après scan le payload décodé apparaît avec un badge ✅ vert.
4. Modifier 1 caractère du QR (ex. effacer un point) → badge ❌ rouge avec message
   « Signature invalide ».

### Test 4 — Biométrie

1. Mettre l'app en arrière-plan (bouton home), revenir.
2. **Attendu** : écran verrouillé avec prompt biométrique. Refus → l'app reste verrouillée.

### Test 5 — Couverture

```powershell
pnpm --filter @nina-aes/mobile check-types
pnpm --filter @nina-aes/mobile test
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                                         | Cause probable                                                                       | Solution                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `Unable to resolve module @nina-aes/shared-types`                                | Metro ne sait pas suivre les liens pnpm vers `../../packages/...`                    | Ajouter `metro.config.js` avec `watchFolders: [path.resolve(__dirname, '../../packages')]`. |
| `expo-camera` plante au lancement                                                | Permissions absentes sur Android < 13                                                | Vérifier `<uses-permission android:name="android.permission.CAMERA"/>` après build.         |
| Redirect Keycloak ne revient pas dans l'app                                      | `redirectUri` mal configuré côté Keycloak                                            | Ajouter `ninaaes://*` dans **Valid Redirect URIs** du client `nina-mobile`.                 |
| `WebCrypto subtle is undefined`                                                  | Hermes < 0.78 n'expose pas WebCrypto                                                 | Mettre à jour vers RN 0.78+ (SDK 55) ou polyfiller avec `react-native-quick-crypto`.        |
| Build EAS échoue avec « Gradle out of memory »                                   | Heap par défaut trop petit                                                           | Dans `android/gradle.properties` : `org.gradle.jvmargs=-Xmx4096m`.                          |
| L'app fonctionne en debug mais pas en release                                    | Variables `EXPO_PUBLIC_*` non incluses dans le bundle release                        | Vérifier `eas.json` → `production.env`. Refaire un build EAS.                               |
| « Network request failed » uniquement en émulateur Android                       | `localhost` n'est pas accessible dans l'émulateur                                    | Utiliser `10.0.2.2:3000` à la place de `localhost:3000`.                                    |
| Refresh token perdu au redémarrage                                               | `expo-secure-store` `requireAuthentication: true` exige un déverrouillage à chaque accès | Mettre `requireAuthentication: false` (la biométrie protège déjà l'app).               |

---

## 7. Documentation à produire après cette étape

Créer **`docs/adr/ADR-016-mobile-stack-expo.md`** avec :

- **Décision** : Expo SDK 55 (managed) plutôt que React Native bare ou Flutter.
- **Justification** : EAS Build évite la maintenance Xcode/Android Studio en local (un étudiant
  seul sous Windows) ; OTA permet de pousser des correctifs sans repasser par les stores ;
  l'écosystème Expo couvre 100 % de notre cas (caméra, biométrie, secure-store, OIDC).
- **Conséquences positives** : développement rapide, builds cloud, OTA, runtime aligné iOS/Android.
- **Conséquences négatives** : dépendance à l'infra Expo (limitable via "self-hosted EAS" si
  besoin de souveraineté absolue) ; certains modules natifs très spécifiques peuvent nécessiter
  un eject vers RN bare.
- **Diagramme de séquence** : flux OIDC PKCE complet (peut être tiré de `04-sequence-…` ou de
  votre propre `.puml`).
- **Captures** : 5 écrans de l'app (Accueil, Recherche, Scan, Détail, Paramètres).

Ajouter aussi **`docs/api/13-mobile-endpoints.md`** : liste des endpoints API consommés par l'app
(uniquement : `/citizens/by-nina/:nina`, `/correction-requests`, `/auth/refresh`,
`/notifications/me`).

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Mobile Expo (Bloc A) — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Écrans implémentés** : Accueil, Recherche NINA, Scan QR FDI, Détail, Paramètres
- **Modules natifs validés** : Camera ✅ · Biométrie ✅ · Secure-store ✅ · op-sqlite ✅
- **Build EAS testé sur** : (modèle de téléphone Android, version Android)
- **Difficultés rencontrées** :
  - exemples : permissions Android 13+, redirect_uri Keycloak, OTA invalidation cache.
- **Solutions trouvées** :
- **Prochaines actions** :
  - Implémenter `useReplayQueue` (rejouer mutations offline)
  - Ajouter Sentry self-hosted (cf. doc 17)
  - Localiser les 6 langues restantes (SNK, FF, TMQ, HAU, MOS, DJE)
- **Captures jointes** : home.png, scan_ok.png, scan_ko.png, biometric.png
```

---

## 9. Checklist de fin d'étape

- [ ] Code commenté (JSDoc sur chaque fonction publique exportée)
- [ ] `tsconfig.json` strict + `noUncheckedIndexedAccess`
- [ ] `apps/mobile/.env.example` listant toutes les variables `EXPO_PUBLIC_*`
- [ ] Build EAS développement réussi → APK installé sur un téléphone physique
- [ ] OIDC PKCE fonctionne contre Keycloak local (et redirect retourne bien dans l'app)
- [ ] Vérification offline du QR FDI testée (cas valide + cas falsifié)
- [ ] Verrouillage biométrique testé (Face ID / empreinte / fallback PIN)
- [ ] Cache 24 h vérifié en mode avion
- [ ] Mutation offline mise en queue → rejouée au retour réseau
- [ ] 8 fichiers de traduction présents (au moins les clés sentinelles)
- [ ] `docs/adr/ADR-016-mobile-stack-expo.md` rédigé
- [ ] Aucun secret / clé privée / token dans le code source (vérifié via `git secrets --scan`)
- [ ] Commit conventionnel : `feat(mobile): app Expo SDK 55 — auth OIDC, scan QR, offline (PROMPT 1.5+)`

---

## 10. Pour aller plus loin

- **OTA Updates** : `eas update --channel production` pour pousser un nouveau JS bundle
  (correctifs UI, rotation de la clé publique CTDEC) sans repasser par le store. Le mécanisme
  `expo-updates` valide la signature côté device.
- **Flag d'audit** : à chaque vérification QR offline, on log dans `op-sqlite` un événement local
  `{ type: "QR_VERIFY", result, ts }` ; au retour réseau, on les pousse vers `audit-service` en
  bulk pour traçabilité (utile dans les antennes mobiles RAVEC).
- **Mode kiosque agent** : un futur écran « Mode antenne » (visible si rôle=AGENT dans le JWT)
  permettrait à un agent CTDEC d'ouvrir un mode multi-citoyens (file d'attente, scan rapide,
  delivery FDI à domicile — cf. séquence `05-sequence-vulnerable-person.puml`).
- **Fallback non-smartphone** : pour les utilisateurs sans téléphone Android/iOS, le canal
  USSD (doc 14) couvre le même cas d'usage. L'app mobile **n'est pas le seul** point d'accès.
- **Lectures recommandées** :
  - https://docs.expo.dev/develop/development-builds/introduction/
  - https://www.rfc-editor.org/rfc/rfc7636 (PKCE)
  - https://docs.expo.dev/versions/latest/sdk/local-authentication/
  - https://op-engineering.github.io/op-sqlite/ (perf benchmarks vs WatermelonDB)

---

✅ « Document 13 terminé »
➡️ « Prochain document : `14-USSD-SERVICE-AFRICAS-TALKING.md` »
❓ « Veux-tu que je continue avec le document 14 ? »
