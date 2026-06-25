# 13 — Application Mobile React Native (Expo SDK 53)

> **Bloc concerné** : A (NINA Mali) — extension mobile du portail citoyen **Prérequis** : documents
> 00 → 12 complétés ; `identity-service`, `auth-service`, `document-service` accessibles depuis le
> poste ; un téléphone Android **ou** iOS pour le test physique (l'émulateur Android suffit pour 95
> % du parcours). **Durée estimée** : 24 à 32 heures pour un étudiant seul. **Livrables de cette
> étape** :
>
> - `apps/mobile/` (Expo SDK 53, React Native 0.79, TypeScript 5.9)
> - 5 écrans : Accueil · Recherche NINA · Scan QR FDI · Détail citoyen · Paramètres
> - Authentification OIDC + PKCE avec Keycloak (sans secret client mobile)
> - Vérification offline du QR code FDI (JWT RS256, **JWKS embarqué multi-`kid`**, allowlist
>   d'algorithmes stricte, **anti-replay local** de la fiche papier, révocation `jti`/NINA —
>   **lecture OK ; la SYNCHRO PULL de la révocation reste à écrire** (`db/replay.ts`), donc la liste
>   est vide tant qu'elle n'est pas implémentée)
> - Verrouillage de l'app par biométrie locale (Face ID / empreinte) avec **fallback code device
>   réel** (`DEVICE_PASSCODE` / `DEVICE_CREDENTIAL`)
> - Cache offline-first **chiffré (SQLCipher sur op-sqlite)** + queue de mutations
> - 8 langues nationales (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE) via `expo-localization`
> - Build EAS développement (APK signé) installable sur téléphone physique
> - `docs/adr/ADR-016-mobile-stack-expo.md` à rédiger en fin d'étape

> ⚠️ **Versions — honnêteté** : au moment de la rédaction (avril 2026), le couple stable réel est
> **Expo SDK 53 + React Native 0.79 + TypeScript 5.9**. L'ancien brouillon mentionnait « SDK 55 / RN
> 0.78 / TS 6.0 » : ce triplet est **incohérent** (RN 0.78 est antérieur à 0.79, et TS 6.0 n'est pas
> publié). On s'aligne donc sur le canal stable. Quand un SDK plus récent sortira, ne mettez à jour
> qu'**après** avoir vérifié la matrice de compatibilité `op-sqlite` ⇄ `react-native-quick-crypto`.

---

## 1. Objectif pédagogique

L'app mobile prolonge le portail citoyen sur **Android et iOS** sans ré-implémenter la logique
métier. Trois objectifs pédagogiques précis :

1. **Inclusion numérique au-delà du smartphone urbain** : l'app doit fonctionner même quand le
   réseau est intermittent (Mali, zones rurales). On apprend ici l'**offline-first** : lecture cache
   prioritaire, queue de mutations, réémission automatique au retour réseau.
2. **Souveraineté de la vérification d'identité** : un agent en antenne mobile peut scanner le QR
   code de la FDI papier d'un citoyen et **vérifier la signature JWT RS256 sans appeler l'API**.
   Mais « sans réseau » ne veut pas dire « sans rigueur cryptographique » : on embarque un **JWKS**
   (JSON Web Key Set) avec **plusieurs `kid`** (clé courante + précédente) pour absorber une
   rotation sans casser les fiches déjà émises, on **rejette `alg=none` et les algorithmes
   symétriques `HS*` AVANT tout parse** (sinon un attaquant forge un JWT signé avec la clé publique
   elle-même), et on maintient une **liste de révocation** (`jti` / NINA) **conçue** pour être
   synchronisée au retour réseau. ⚠️ **Honnêteté** : la _lecture_ de cette liste (`isRevoked`) est
   implémentée, mais le _pull_ réseau qui la remplit (`db/replay.ts`) reste **à écrire** — tant
   qu'il n'existe pas, la table est **vide** et `isRevoked()` renvoie toujours `false`. La signature
   seule ne prouve PAS l'unicité de présentation d'une fiche papier : on ajoute donc un
   **anti-replay local** (§4.5) pour couvrir la fenêtre où la révocation n'est pas encore active. Ça
   matérialise concrètement le principe « pas de single point of failure réseau » **sans** ouvrir un
   trou de sécurité de confiance — et **sans sur-vendre** un mécanisme inerte.
3. **Sécurité locale du device** : le NINA stocké est protégé par la biométrie native du téléphone
   (Face ID / empreinte) avec **fallback sur le code de déverrouillage réel du device**
   (`DEVICE_PASSCODE`), jamais un déverrouillage « gratuit ». On apprend
   `expo-local-authentication`, le stockage chiffré `expo-secure-store` (Keystore Android / Keychain
   iOS) **et** le chiffrement de la base de cache via **SQLCipher** (la clé vit dans le
   secure-store) : la PII en cache n'est **jamais** en clair sur le disque.

> 💡 **Pourquoi pas un PWA seul ?** Une PWA suffirait pour la lecture, mais (a) le scan QR caméra y
> reste limité sur iOS, (b) la biométrie native n'y est pas exposée, (c) le mode offline d'une PWA
> dépend du Service Worker qui se purge plus agressivement que le stockage natif, et (d) la
> distribution via Play Store / App Store rassure les citoyens — un domaine d'État officiel apparaît
> crédible.

---

## 2. Technologies utilisées (versions avril 2026)

| Technologie                   | Version | Rôle dans cette étape                                                        | Documentation officielle                                        |
| ----------------------------- | ------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Expo SDK**                  | 53.0    | Plateforme RN managée + EAS Build + OTA updates                              | https://docs.expo.dev/                                          |
| **React Native**              | 0.79    | Framework UI multiplateforme                                                 | https://reactnative.dev/                                        |
| **expo-router**               | 5.0     | Routing typé file-based (équivalent App Router Next.js)                      | https://docs.expo.dev/router/introduction/                      |
| **TypeScript**                | 5.9     | Langage source                                                               | https://www.typescriptlang.org/                                 |
| **expo-camera**               | 16.0    | Scan QR + accès caméra                                                       | https://docs.expo.dev/versions/latest/sdk/camera/               |
| **expo-local-authentication** | 16.0    | Verrouillage biométrique (Face ID / empreinte) + `DEVICE_PASSCODE`           | https://docs.expo.dev/versions/latest/sdk/local-authentication/ |
| **expo-secure-store**         | 14.0    | Stockage chiffré (Keystore / Keychain) pour tokens et **clé SQLCipher**      | https://docs.expo.dev/versions/latest/sdk/securestore/          |
| **expo-localization**         | 16.0    | Détection langue device + bibliothèque `i18n-js`                             | https://docs.expo.dev/versions/latest/sdk/localization/         |
| **expo-auth-session**         | 6.0     | OIDC + PKCE pour mobile (Keycloak sans secret)                               | https://docs.expo.dev/versions/latest/sdk/auth-session/         |
| **op-sqlite**                 | 14.0    | SQLite haute performance, **build SQLCipher** (cache chiffré + queue)        | https://github.com/OP-Engineering/op-sqlite                     |
| **react-native-quick-crypto** | 1.x     | Crypto native (vérif RSA des QR) — remplace le WebCrypto Hermes hypothétique | https://github.com/margelo/react-native-quick-crypto            |
| **TanStack Query**            | 5.90    | Cache HTTP réactif + retry exponentiel                                       | https://tanstack.com/query                                      |
| **Zod**                       | 4.3     | Validation des réponses API (partagé via `@nina-aes/shared-types`)           | https://zod.dev/                                                |
| **NativeWind**                | 4.1     | Tailwind CSS pour React Native (alignement design AES)                       | https://www.nativewind.dev/                                     |
| **EAS Build**                 | latest  | Compilation cloud APK / IPA signés                                           | https://docs.expo.dev/build/introduction/                       |
| **react-native-svg**          | 15.0    | Rendu SVG (logos AES, icônes design system)                                  | https://github.com/software-mansion/react-native-svg            |

> ⚠️ **Crypto — pas de WebCrypto Hermes hypothétique** : Hermes n'expose **pas**
> `globalThis.crypto.subtle` de façon fiable. La vérification RSA des QR FDI passe donc par
> **`react-native-quick-crypto`** (module natif, OpenSSL). On n'écrit **aucun** code qui « espère »
> que `subtle` existe : c'est une dépendance explicite, pas un fallback.

> 🔒 **Souveraineté** : aucune dépendance étrangère sensible — `expo-auth-session` parle à votre
> Keycloak on-premise, pas à un IdP externe. Le scan QR est local, la signature est vérifiée
> localement contre le **JWKS CTDEC embarqué** (multi-`kid`). Aucun service tiers (analytics Google,
> Crashlytics Firebase, etc.) — on utilisera Sentry **self-hosted** au document 17 si nécessaire.

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
  database "op-sqlite\n(SQLCipher chiffré)" as DB
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
QR ..> Vault : JWKS CTDEC multi-kid\n+ clé SQLCipher\n(rotation OTA)
Bio --> Vault : déverrouillage app\n(biométrie OU code device)
DB ..> Net : sync queue + révocation\n(au retour réseau)

note bottom of QR
  Vérification offline :
  • allowlist alg STRICTE
    (rejette none / HS* AVANT parse)
  • parse JWT (header.payload.sig)
  • sélection kid dans JWKS embarqué
  • verify RS256 (quick-crypto)
  • check exp / iat / nbf
  • check révocation (jti / NINA)
  Aucun appel réseau requis.
end note

note bottom of DB
  Base SQLCipher (clé en secure-store) :
  • citizens_cache (TTL 24h)
  • mutation_queue (PENDING)
  • qr_verify_log (hash-chaîné)
  • revocations (jti / NINA)
end note

@enduml
```

> 📝 Le rendu visuel est dans `docs/diagrams/13-mobile-architecture.puml` (à créer en complément si
> vous voulez la version standalone).

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
    "test": "jest --watch=false",
  },
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
      "@nina-aes/utils": ["../../packages/utils/src"],
    },
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
}
```

> 💡 On ne réimporte pas `@nina-aes/database` ni `@nina-aes/config` dans l'app mobile : la base
> Prisma est côté serveur. Mobile = consommateur d'API uniquement.

### Étape 4.2 — Dépendances métier (camera, biométrie, secure-store, OIDC, SQLite)

**Pourquoi** : ces six modules natifs sont la fondation de tout le reste — autant les installer en
un seul bloc et exécuter `expo install` qui aligne les versions natives sur le SDK 53.

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform\apps\mobile

# Modules natifs Expo (versions auto-alignées par expo-cli sur le SDK 53)
pnpm exec expo install expo-camera expo-local-authentication expo-secure-store `
  expo-localization expo-auth-session expo-crypto expo-router expo-status-bar

# Stockage local SQLite chiffré (op-sqlite + SQLCipher) + crypto native + libs UI / data
# react-native-quick-crypto = vérification RSA des QR (PAS de WebCrypto Hermes hypothétique)
pnpm add @op-engineering/op-sqlite react-native-quick-crypto `
  @tanstack/react-query zod react-native-svg @react-native-community/netinfo `
  i18n-js nativewind tailwindcss
pnpm add -D @types/i18n-js

# IMPORTANT — activer le build SQLCipher de op-sqlite.
# Sans cette option, op-sqlite compile en SQLite STANDARD (cache PII en CLAIR sur le disque).
# Déclaré dans app.json -> plugins (voir bloc app.json ci-dessous), recompilé au prochain build EAS.
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
        "NSFaceIDUsageDescription": "Pour déverrouiller votre NINA en toute sécurité.",
      },
    },
    "android": {
      "package": "ml.gouv.ninaaes",
      // USE_BIOMETRIC suffit (USE_FINGERPRINT est déprécié depuis Android 9).
      "permissions": ["CAMERA", "USE_BIOMETRIC"],
    },
    "plugins": [
      "expo-router",
      [
        "expo-camera",
        { "cameraPermission": "L'app a besoin de la caméra pour scanner le QR de votre FDI." },
      ],
      [
        "expo-local-authentication",
        { "faceIDPermission": "Authentification biométrique pour accéder à votre NINA." },
      ],
      "expo-secure-store",
      // Active le build SQLCipher de op-sqlite : la base de cache est chiffrée AES-256
      // au repos (clé fournie au runtime depuis le secure-store). Sans ce flag, la PII
      // citoyenne resterait en clair dans le fichier .db du sandbox app.
      ["@op-engineering/op-sqlite", { "sqlcipher": true }],
      // Crypto native (OpenSSL) — fournit le module utilisé par verify-fdi.ts.
      "react-native-quick-crypto",
    ],
  },
}
```

> 🔒 **Pourquoi `sqlcipher: true` est non négociable** : le brouillon initial affirmait « PII dans
> cache : OK (le device est verrouillé biométrie) ». C'est **faux** côté défense en profondeur — un
> device rooté/jailbreaké, une sauvegarde ADB ou une extraction physique lisent le fichier `.db`
> **sans** déverrouiller l'écran. Le verrou biométrique protège l'**UI**, pas le **disque**. La PII
> doit être chiffrée au repos par SQLCipher, la clé restant dans le Keystore/Keychain.

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
import { Language, SUPPORTED_LANGUAGES } from '@nina-aes/shared-types';

import fr from './locales/fr.json';
import bm from './locales/bm.json';
import snk from './locales/snk.json';
import ff from './locales/ff.json';
import tmq from './locales/tmq.json';
import hau from './locales/hau.json';
import mos from './locales/mos.json';
import dje from './locales/dje.json';

/**
 * Mapping code interne projet → dictionnaire de libellés.
 * Les clés correspondent aux valeurs de l'enum {@link Language} (FR, BM, …),
 * en minuscules pour servir de `locale` i18n-js.
 */
const TRANSLATIONS: Record<string, object> = {
  fr,
  bm,
  snk,
  ff,
  tmq,
  hau,
  mos,
  dje,
};

/**
 * Table BCP-47 / ISO-639 (code device) → code interne {@link Language}.
 *
 * On la DÉRIVE de `SUPPORTED_LANGUAGES` (source de vérité partagée avec le web
 * et l'USSD) pour éviter tout drift de codes. Attention aux pièges réels :
 *   - Tamasheq renvoyé par les devices = `tmh` (ISO-639-2), pas `tmq`.
 *   - Hausa = `ha` (ISO-639-1), pas `hau`.
 *   - `iOS`/`Android` peuvent renvoyer un sous-tag région (`fr-ML`) : on ne
 *     garde que la partie langue (avant le `-`).
 */
const ISO_TO_LANGUAGE: Record<string, Language> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.iso639.toLowerCase(), l.code]),
);

/**
 * Détecte la langue préférée du device et retombe sur FR si non supportée.
 *
 * @returns Code interne {@link Language} (FR, BM, …).
 */
export function detectInitialLanguage(): Language {
  const raw = Localization.getLocales()[0]?.languageCode?.toLowerCase() ?? 'fr';
  // Normalise un éventuel sous-tag région (`fr-ML` → `fr`).
  const code = raw.split('-')[0]!;
  return ISO_TO_LANGUAGE[code] ?? Language.FR;
}

/** Singleton i18n configuré au démarrage de l'app. */
export const i18n = new I18n(TRANSLATIONS, {
  defaultLocale: 'fr',
  enableFallback: true,
});

// `Language.FR` → 'fr' : la locale i18n-js est le code interne en minuscules,
// qui sert aussi de nom de fichier dans `locales/<code>.json`.
i18n.locale = detectInitialLanguage().toLowerCase();
```

```jsonc
// apps/mobile/src/i18n/locales/fr.json (extrait — clés sentinelles)
{
  "home": { "title": "Mon NINA", "search_cta": "Rechercher mon NINA" },
  "scan": { "title": "Scanner ma fiche", "instruction": "Cadrez le QR code de la FDI" },
  "auth": {
    "lock_prompt": "Déverrouillez avec votre empreinte, Face ID ou code",
    "use_device_code": "Utiliser le code du téléphone",
    "no_device_lock": "Configurez un code de déverrouillage sur votre téléphone pour protéger votre NINA.",
  },
  "common": { "cancel": "Annuler" },
  "errors": { "offline": "Pas de réseau — affichage du dernier résultat connu" },
}
```

```jsonc
// apps/mobile/src/i18n/locales/bm.json (extrait — bambara)
{
  "home": { "title": "Ne ka NINA", "search_cta": "N ka NINA ɲinini" },
  "scan": { "title": "Sɛbɛn jate", "instruction": "QR ye ka da Sɛbɛn kan" },
  "auth": {
    "lock_prompt": "I bolofitinin, Face ID walima i ka kode ye ka da kan",
    "use_device_code": "Telefɔni kode kɛ",
    "no_device_lock": "I ka telefɔni datugu kode sigi walisa ka i ka NINA lakana.",
  },
  "common": { "cancel": "A dabila" },
  "errors": { "offline": "Telefoni ka taa — jaki kɔrɔlen bɛ jira" },
}
```

> 📝 Les 6 autres fichiers (`snk.json`, `ff.json`, `tmq.json`, `hau.json`, `mos.json`, `dje.json`)
> sont à créer sur le même modèle. Pour la **traduction des clés** : utilisez les services
> universitaires UQAR / locaux maliens — ne dépendez **pas** de Google Translate (souveraineté).

### Étape 4.4 — Authentification OIDC + PKCE avec Keycloak

**Pourquoi** : sur mobile, on **ne peut pas** stocker un secret client. PKCE (Proof Key for Code
Exchange) résout ça : un challenge cryptographique généré par le device remplace le secret. Le flow
respecte la spec OAuth 2.1 et est nativement supporté par Keycloak 26.

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

#### 4.4 bis — Certificate pinning (épinglage TLS)

**Pourquoi** : PKCE protège le flux d'autorisation, mais **pas** l'app contre un MITM TLS (proxy
d'entreprise, AC malveillante installée sur un device compromis, Wi-Fi public hostile). On épingle
donc la chaîne TLS du domaine souverain `*.ctdec.gouv.ml` : l'app **rejette** toute connexion dont
la clé publique de certificat ne correspond pas aux empreintes embarquées. C'est une exigence OWASP
MASVS (résistance MITM) et cohérente avec la souveraineté (pas de confiance aveugle au magasin d'AC
du device).

> 🔒 **On épingle la clé publique (SPKI pin), PAS le certificat entier** : épingler le SPKI survit
> au renouvellement du certificat tant que la paire de clés est conservée. On embarque **deux
> empreintes** (clé courante + clé de secours / backup pin) pour ne pas bricker l'app lors d'une
> rotation. La rotation des pins suit la même logique OTA que le JWKS (§4.5) : **ajouter avant de
> basculer**.

```jsonc
// apps/mobile/app.json (extrait — ajout du plugin de pinning au tableau "plugins")
// On utilise react-native-ssl-pinning (ou le config-plugin équivalent) ; le
// fetch applicatif passe par ce module au lieu du fetch global pour les appels
// vers l'API souveraine. Les empreintes sont des SHA-256 du SubjectPublicKeyInfo.
[
  "react-native-ssl-pinning",
  {
    "domains": {
      "api.ctdec.gouv.ml": {
        "publicKeyHashes": [
          "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // pin courant
          "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", // backup pin
        ],
      },
      "auth.ctdec.gouv.ml": {
        "publicKeyHashes": [
          "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
          "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=",
        ],
      },
    },
  },
]
```

> 📝 **CONCU / non implémenté** : le client HTTP applicatif (wrapper `fetch` épinglé branché sur
> TanStack Query) reste à écrire dans `apps/mobile/src/api/client.ts`. En **dev local** (Keycloak
> HTTP `10.0.2.2`), le pinning est désactivé via un flag `EXPO_PUBLIC_PINNING=off` — il n'est ACTIF
> qu'en build `production`. Ne jamais désactiver le pinning dans un build store.

### Étape 4.5 — Vérification offline du QR FDI (JWT RS256, JWKS multi-`kid`)

**Pourquoi** : un agent en antenne mobile (RAVEC) doit pouvoir vérifier qu'un QR code papier est
authentique **sans réseau**. C'est exactement le genre de surface où une vérification JWT « naïve »
ouvre des failles classiques. Quatre exigences de sécurité **non négociables** :

1. **Allowlist d'algorithmes STRICTE, appliquée AVANT le parse de la signature.** Le piège
   historique : un attaquant change `alg` en `none` (signature vide acceptée) ou en `HS256`
   (algorithme symétrique) en utilisant **la clé publique RSA comme secret HMAC**. Comme la clé
   publique est embarquée dans l'app, il forge alors un JWT « valide ». On rejette donc `none` et
   tout `HS*` **avant** d'aller plus loin — on n'accepte QUE `RS256`.
2. **JWKS embarqué multi-`kid`** (clé courante + précédente) au lieu d'un `kid` unique codé en dur.
   Lors d'une rotation, les fiches déjà émises avec l'ancienne clé doivent rester vérifiables ; on
   embarque donc au moins deux clés et on **sélectionne par `kid`**. Procédure OTA : on AJOUTE la
   nouvelle clé au JWKS **avant** que le CTDEC ne bascule la signature dessus.
3. **Révocation** : une liste locale `jti` / NINA permet d'invalider une fiche compromise même
   offline (dans la fenêtre de fraîcheur de la liste). ⚠️ **État réel** : la _lecture_ (`isRevoked`)
   est écrite ; le _pull_ qui remplit la liste (`db/replay.ts`) est **CONÇU / à écrire** — donc la
   liste est **vide** et la révocation est **inactive tant que ce pull n'est pas implémenté**. On ne
   compte donc pas dessus seul : l'**anti-replay local** (point 5) couvre la ré-présentation
   offline.
4. **Bornes temporelles complètes** : `exp` (expiration), `iat` (pas émis dans le futur, tolérance
   d'horloge) et `nbf` (not-before) si présent.
5. **Anti-replay local de la fiche papier** : on marque chaque `jti` « vu » sur ce device et on
   signale une ré-présentation dans une fenêtre courte (bloquant pour un acte de délivrance). La
   signature seule ne prouve PAS l'unicité de présentation d'une fiche papier copiée.

> 🔒 **Crypto** : la vérification RSA passe par **`react-native-quick-crypto`** (module natif). On
> **n'utilise PAS** `globalThis.crypto.subtle` : Hermes ne l'expose pas de façon fiable, et un code
> qui « espère » qu'il existe finit par retourner `false` silencieusement (donc tout QR refusé) ou
> pire, par être contourné. Voir le canon §2.

**Fichier(s) à créer/modifier** :

```typescript
// apps/mobile/src/qr/embedded-jwks.ts
/**
 * @file        embedded-jwks.ts
 * @description JWKS CTDEC embarqué — clé de signature COURANTE + PRÉCÉDENTE.
 *              Sert à vérifier les QR FDI hors-ligne.
 *
 *              ⚠️ Ce sont des clés PUBLIQUES (RSA). NE JAMAIS commiter de clé
 *              privée ici. Rotation par Expo OTA (cf. doc 17 et §10).
 *
 *              PROCÉDURE DE ROTATION (ordre IMPÉRATIF) :
 *                1. Le CTDEC génère la nouvelle paire (kid `ctdec-2027`).
 *                2. On AJOUTE la clé publique `ctdec-2027` à ce JWKS et on
 *                   pousse l'OTA → tous les devices acceptent désormais les
 *                   DEUX kid.
 *                3. SEULEMENT APRÈS propagation de l'OTA, le CTDEC bascule la
 *                   signature des nouvelles fiches sur `ctdec-2027`.
 *                4. À T+90j (toutes les vieilles fiches expirées), on RETIRE
 *                   `ctdec-2026` du JWKS via une nouvelle OTA.
 *              Inverser cet ordre = fiches non vérifiables pendant la bascule.
 *
 * @module      @nina-aes/mobile
 */

/** Un JWK RSA de signature (clé publique uniquement). */
export interface RsaPublicJwk {
  kty: 'RSA';
  kid: string;
  use: 'sig';
  alg: 'RS256';
  n: string; // modulus base64url
  e: string; // exponent (AQAB)
}

/**
 * JWKS embarqué : clé COURANTE en tête, PRÉCÉDENTE ensuite.
 * La sélection se fait par `kid`, jamais par position.
 */
export const CTDEC_JWKS: { keys: readonly RsaPublicJwk[] } = {
  keys: [
    {
      kty: 'RSA',
      kid: 'ctdec-2026',
      use: 'sig',
      alg: 'RS256',
      n: '… (modulus base64url clé COURANTE) …',
      e: 'AQAB',
    },
    {
      kty: 'RSA',
      kid: 'ctdec-2025',
      use: 'sig',
      alg: 'RS256',
      n: '… (modulus base64url clé PRÉCÉDENTE) …',
      e: 'AQAB',
    },
  ],
};

/** Algorithmes ACCEPTÉS — allowlist stricte (jamais `none`, jamais `HS*`). */
export const ALLOWED_ALGS = ['RS256'] as const;
```

```typescript
// apps/mobile/src/qr/verify-fdi.ts
/**
 * @file        verify-fdi.ts
 * @description Vérification offline du QR code de la Fiche Descriptive
 *              Individuelle (FDI). Le QR contient un JWT RS256 signé par le
 *              CTDEC (cf. document-service / doc 10).
 *
 *              Pipeline durci :
 *                1. Parse header SEUL ; rejette si alg ∉ allowlist (avant tout
 *                   travail crypto) → bloque alg=none / HS* / confusion de clé.
 *                2. Sélectionne la clé par `kid` dans le JWKS embarqué.
 *                3. Vérifie la signature RSA-SHA256 (react-native-quick-crypto).
 *                4. Vérifie exp / iat (anti-future) / nbf.
 *                5. Vérifie la liste de révocation locale (jti / NINA).
 *                6. ANTI-REPLAY LOCAL : marque le `jti` comme « vu » et, s'il a
 *                   déjà été présenté dans une fenêtre courte ET que le contexte
 *                   est un ACTE de délivrance (pas une simple consultation),
 *                   signale `replay-suspected`.
 *
 *              ⚠️ HONNÊTETÉ — la signature seule ne prouve PAS l'unicité de
 *              présentation d'une fiche PAPIER : une FDI papier volée/photocopiée
 *              porte une signature parfaitement valide et peut être re-présentée
 *              à l'infini. La révocation (étape 5) ne couvre ce cas QUE si le pull
 *              réseau a déjà tourné (cf. db/replay.ts, à écrire) ; entre-temps la
 *              liste est vide. L'anti-replay local (étape 6) est le garde-fou
 *              offline qui détecte la RÉ-utilisation de la même fiche sur ce
 *              device, indépendamment de la révocation serveur.
 *
 *              Aucun appel réseau requis — le JWKS est fourni au build (rotation
 *              OTA), la liste de révocation est synchronisée quand le réseau
 *              revient (best-effort, voir db/revocations.ts).
 *
 * @module      @nina-aes/mobile
 */

// Module natif OpenSSL — PAS de WebCrypto Hermes (cf. canon §2).
import QuickCrypto from 'react-native-quick-crypto';
import { CTDEC_JWKS, ALLOWED_ALGS, type RsaPublicJwk } from './embedded-jwks';
import { isRevoked } from '../db/revocations';
import { markFdiSeen } from '../db/seen-fdi';

/** Tolérance d'horloge (secondes) pour iat/nbf/exp — devices mal réglés. */
const CLOCK_SKEW_SEC = 120;

/**
 * Fenêtre d'anti-replay (secondes) : si le MÊME `jti` est re-présenté en deçà de
 * ce délai sur ce device, on le considère « déjà vu ». Configurable selon le
 * débit terrain attendu (un agent ne re-scanne pas la même fiche en 5 min).
 */
const REPLAY_WINDOW_SEC = 300;

/**
 * Contexte de la vérification.
 *   - `consultation` : simple lecture (badge informatif) → replay = WARNING.
 *   - `delivrance`   : acte officiel (remise de FDI, signature d'un registre) →
 *                      replay = BLOQUANT (on ne délivre pas deux fois sur la
 *                      même fiche papier).
 */
export type VerifyContext = 'consultation' | 'delivrance';

/** Charge utile attendue dans le JWT du QR. */
export interface FdiPayload {
  /** NINA (15 chars). */
  sub: string;
  /** Identifiant unique du jeton (clé de révocation). */
  jti: string;
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
  /** Not-before (epoch sec, optionnel). */
  nbf?: number;
  /** Expiration (epoch sec). */
  exp: number;
}

/** Résultat de la vérification. */
export type VerifyResult =
  | { ok: true; payload: FdiPayload }
  // Signature/claims OK mais la MÊME fiche papier a déjà été présentée dans la
  // fenêtre courte. En `consultation` c'est un AVERTISSEMENT non bloquant (le
  // payload reste exploitable, l'UI affiche un bandeau « déjà vu ») ; en
  // `delivrance` ce cas ne remonte JAMAIS ici — il devient `replay-suspected`
  // (ok:false) car on REFUSE l'acte.
  | { ok: true; warning: 'replay-suspected'; payload: FdiPayload }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'bad-alg' // alg refusé (none / HS* / inconnu)
        | 'unknown-kid' // kid absent du JWKS embarqué
        | 'bad-signature'
        | 'expired'
        | 'not-yet-valid' // nbf dans le futur
        | 'future-iat' // émis dans le futur (horloge / forgerie)
        | 'revoked'
        | 'replay-suspected'; // fiche papier déjà présentée → bloquant pour un ACTE
    };

/**
 * Vérifie un JWT RS256 issu d'un QR FDI.
 *
 * @param jwt     - Le JWT compact (3 segments séparés par `.`).
 * @param context - `consultation` (défaut, lecture) ou `delivrance` (acte
 *                  officiel). Pilote la sévérité de l'anti-replay : warning en
 *                  consultation, BLOCAGE en délivrance.
 * @returns Résultat typé. En cas de succès, la charge utile est renvoyée ;
 *          un `warning: 'replay-suspected'` peut accompagner un succès de
 *          consultation.
 */
export async function verifyFdiQr(
  jwt: string,
  context: VerifyContext = 'consultation',
): Promise<VerifyResult> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // (1) Parse le header SEUL et applique l'allowlist AVANT tout travail crypto.
  //     C'est l'étape qui bloque alg=none, HS256 (confusion de clé) et tout alg
  //     non explicitement autorisé.
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(b64UrlDecodeUtf8(headerB64));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!header.alg || !(ALLOWED_ALGS as readonly string[]).includes(header.alg)) {
    return { ok: false, reason: 'bad-alg' };
  }

  // (2) Sélection de la clé par kid dans le JWKS embarqué (multi-kid).
  const jwk = CTDEC_JWKS.keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown-kid' };

  // (3) Vérification de signature RSA-SHA256 via module natif.
  const valid = verifyRsaSignature(`${headerB64}.${payloadB64}`, signatureB64, jwk);
  if (!valid) return { ok: false, reason: 'bad-signature' };

  // (4) Bornes temporelles : on ne décode le payload qu'APRÈS signature OK.
  let payload: FdiPayload;
  try {
    payload = JSON.parse(b64UrlDecodeUtf8(payloadB64)) as FdiPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp + CLOCK_SKEW_SEC < now) return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SEC > now) {
    return { ok: false, reason: 'not-yet-valid' };
  }
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_SEC > now) {
    return { ok: false, reason: 'future-iat' };
  }

  // (5) Révocation locale (jti prioritaire, NINA en repli).
  //     ⚠️ Inerte tant que db/replay.ts (pull réseau) n'est pas écrit : la table
  //     est vide → isRevoked() renvoie false. Voir l'avertissement en tête.
  if (isRevoked({ jti: payload.jti, nina: payload.sub })) {
    return { ok: false, reason: 'revoked' };
  }

  // (6) ANTI-REPLAY LOCAL : marque ce jti comme « vu » sur ce device et indique
  //     s'il l'avait DÉJÀ été dans la fenêtre courte. C'est le garde-fou offline
  //     contre la ré-présentation d'une fiche papier volée/photocopiée — la
  //     signature, elle, reste valide indéfiniment, donc elle ne suffit PAS.
  const alreadySeen = markFdiSeen(payload.jti, REPLAY_WINDOW_SEC);
  if (alreadySeen) {
    // En délivrance (acte), on REFUSE : pas de double remise sur la même fiche.
    if (context === 'delivrance') {
      return { ok: false, reason: 'replay-suspected' };
    }
    // En consultation, on n'empêche pas la lecture mais on remonte un warning.
    return { ok: true, warning: 'replay-suspected', payload };
  }

  return { ok: true, payload };
}

/** Décode base64url → string UTF-8. */
function b64UrlDecodeUtf8(s: string): string {
  const b64 = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  // Buffer est fourni par react-native-quick-crypto (polyfill global).
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * Convertit un JWK RSA public en clé PEM SPKI, puis vérifie RSA-SHA256.
 *
 * On passe par react-native-quick-crypto (API style `crypto` Node, adossée à
 * OpenSSL natif). Aucune dépendance à `crypto.subtle` (absent sur Hermes).
 *
 * @param signingInput - `<header_b64>.<payload_b64>`.
 * @param signatureB64 - Signature en base64url.
 * @param jwk - Clé publique RSA sélectionnée par kid.
 * @returns `true` si la signature est valide.
 */
function verifyRsaSignature(
  signingInput: string,
  signatureB64: string,
  jwk: RsaPublicJwk,
): boolean {
  // createPublicKey accepte directement le format JWK (clé publique RSA).
  const publicKey = QuickCrypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifier = QuickCrypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  // La signature JWT est en base64url ; on la repasse en base64 standard.
  const sig = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return verifier.verify(publicKey, sig);
}
```

> 🔒 **Pourquoi rejeter `alg` AVANT le parse complet et la sélection de clé** : si on lit d'abord la
> signature ou le payload, on a déjà donné prise à des attaques de confusion d'algorithme. La règle
> est : **header → allowlist → kid → signature → claims**. Jamais l'inverse.

> 🔒 **Anti-replay de la fiche papier (le trou d'autorisation résiduel)** : une signature RS256
> valide prouve l'**authenticité** d'une FDI, pas l'**unicité de présentation**. Pour un agent
> RAVEC, une fiche papier volée ou photocopiée se re-scanne indéfiniment avec un verdict ✅. Deux
> garde-fous, tous deux **best-effort** et explicitement non parfaits :
>
> 1. **Révocation `jti`/NINA** (étape 5) — efficace MAIS dépend du pull réseau `db/replay.ts` (**à
>    écrire**) ; tant qu'il n'existe pas, la liste est vide et n'attrape rien.
> 2. **Anti-replay local** (étape 6, `db/seen-fdi.ts`) — détecte la ré-présentation du **même
>    `jti`** sur **ce device** dans une fenêtre courte. Verdict modulé par le `context` :
>    **avertissement** en `consultation`, **blocage** en `delivrance` (on ne remet pas deux fois une
>    FDI sur la même fiche).
>
> Limite assumée : l'anti-replay local ne corrèle pas les scans **entre** agents — un attaquant qui
> présente la même fiche à dix agents différents passe dix fois. La corrélation inter-agents reste
> du ressort de l'ancrage serveur (push `qr_verify_log` → `audit-service`, §4.7) et de la
> révocation. On ne présente donc PAS ce mécanisme comme une preuve d'unicité absolue.

```typescript
// apps/mobile/src/db/revocations.ts
/**
 * @file        revocations.ts
 * @description Liste de révocation locale des fiches FDI (jti / NINA).
 *              Permet d'invalider une fiche compromise même hors-ligne, dans
 *              la limite de fraîcheur de la dernière synchronisation.
 *
 *              CONCU / PARTIELLEMENT IMPLÉMENTÉ : la table et la lecture
 *              `isRevoked` sont décrites ici ; la synchro réseau (pull depuis
 *              document-service au retour réseau) est branchée dans
 *              `db/replay.ts` (voir §4.7) et reste à écrire.
 *
 *              Modèle de menace : la révocation offline est best-effort. Un
 *              device jamais reconnecté ne verra pas les révocations récentes —
 *              c'est une limite ASSUMÉE, atténuée par `exp` court sur les QR.
 *
 * @module      @nina-aes/mobile
 */

import { db } from './index';

/**
 * Table de révocation (créée dans db/index.ts) :
 *   revocations(jti TEXT, nina TEXT, revoked_at INTEGER, synced_at INTEGER)
 * On indexe sur jti ET nina pour permettre la révocation par l'un ou l'autre.
 */

/**
 * Indique si une fiche est révoquée localement.
 *
 * @param ids - `jti` (prioritaire) et/ou `nina` à tester.
 * @returns `true` si une entrée de révocation correspond.
 */
export function isRevoked(ids: { jti?: string; nina?: string }): boolean {
  // jti est l'identifiant le plus précis (révoque UNE émission de fiche).
  if (ids.jti) {
    const row = db.execute('SELECT 1 FROM revocations WHERE jti = ? LIMIT 1', [ids.jti]).rows?.[0];
    if (row) return true;
  }
  // NINA révoque TOUTES les fiches du citoyen (ex. usurpation avérée).
  if (ids.nina) {
    const row = db.execute('SELECT 1 FROM revocations WHERE nina = ? LIMIT 1', [ids.nina])
      .rows?.[0];
    if (row) return true;
  }
  return false;
}

/**
 * Remplace la liste de révocation locale par le delta reçu du serveur.
 * Appelée par la synchro réseau (voir db/replay.ts).
 *
 * @param entries - Lignes de révocation fraîchement pull depuis document-service.
 */
export function upsertRevocations(
  entries: ReadonlyArray<{ jti: string; nina: string; revokedAt: number }>,
): void {
  const now = Math.floor(Date.now() / 1000);
  for (const e of entries) {
    db.execute(
      'INSERT OR REPLACE INTO revocations (jti, nina, revoked_at, synced_at) VALUES (?, ?, ?, ?)',
      [e.jti, e.nina, e.revokedAt, now],
    );
  }
}
```

```typescript
// apps/mobile/src/db/seen-fdi.ts
/**
 * @file        seen-fdi.ts
 * @description Anti-replay LOCAL des fiches FDI papier.
 *
 *              POURQUOI : un QR FDI papier porte une signature RS256 qui reste
 *              valide jusqu'à `exp`. La vérification cryptographique prouve que
 *              la fiche est AUTHENTIQUE, mais PAS qu'elle n'a pas déjà été
 *              présentée — une fiche volée/photocopiée se re-scanne à l'infini.
 *              Ce module enregistre chaque `jti` vu sur CE device et signale une
 *              ré-présentation à l'intérieur d'une fenêtre courte.
 *
 *              LIMITES ASSUMÉES (honnêteté) :
 *                - Protection PAR DEVICE : ne corrèle pas les scans entre agents
 *                  (la corrélation inter-devices est la révocation côté serveur).
 *                - Best-effort offline : complète, sans la remplacer, la
 *                  révocation `jti`/NINA (qui, elle, dépend du pull réseau).
 *
 * @module      @nina-aes/mobile
 */

import { db } from './index';

/**
 * Marque un `jti` comme vu et indique s'il l'avait DÉJÀ été dans la fenêtre.
 *
 * Idempotent : un `INSERT … ON CONFLICT` met à jour `last_seen`/`seen_count`.
 * On lit l'état AVANT mise à jour pour décider du verdict de replay.
 *
 * @param jti       - Identifiant unique du jeton FDI.
 * @param windowSec - Fenêtre d'anti-replay en secondes.
 * @returns `true` si ce `jti` avait déjà été vu dans la fenêtre (replay suspecté).
 */
export function markFdiSeen(jti: string, windowSec: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  // État courant avant mise à jour (NULL si jamais vu).
  const prev = db.execute('SELECT last_seen FROM seen_fdi WHERE jti = ? LIMIT 1', [jti]).rows?.[0];
  const replay = prev != null && now - Number(prev.last_seen) <= windowSec;

  // Upsert : première vue → insertion ; vue suivante → maj last_seen + compteur.
  db.execute(
    `INSERT INTO seen_fdi (jti, first_seen, last_seen, seen_count)
       VALUES (?, ?, ?, 1)
     ON CONFLICT(jti) DO UPDATE SET
       last_seen  = excluded.last_seen,
       seen_count = seen_count + 1`,
    [jti, now, now],
  );
  return replay;
}
```

### Étape 4.6 — Verrouillage biométrique de l'app

**Pourquoi** : à chaque ouverture (foreground), on exige une authentification locale **avant**
d'afficher le NINA. C'est une mesure de défense en profondeur (vol du téléphone déverrouillé).

> 🔒 **Bug de sécurité corrigé** : le brouillon initial faisait `setUnlocked(true)` quand **aucune
> biométrie n'était enrôlée** — autrement dit, sur un téléphone sans empreinte configurée (cas
> fréquent au Mali), l'app s'ouvrait **sans aucune authentification**. C'est l'inverse de
> l'objectif. Correction : si la biométrie n'est pas enrôlée, on **exige le code de déverrouillage
> RÉEL du device** (`DEVICE_PASSCODE`) via `authenticateAsync`. expo-local-authentication sait
> demander le code device : on passe `authenticationType`/`disableDeviceFallback: false` et on
> **n'ouvre JAMAIS l'app sans une `r.success === true`**. Si le device n'a NI biométrie NI code (cas
> rare, device non sécurisé), on affiche un blocage explicite invitant l'utilisateur à configurer un
> verrou.

```typescript
// apps/mobile/src/auth/biometric-gate.tsx
/**
 * @file        biometric-gate.tsx
 * @description Composant de verrouillage qui occulte l'app tant que
 *              l'utilisateur n'a pas validé une authentification LOCALE RÉELLE
 *              (biométrie OU code de déverrouillage du device). Réactivé à
 *              chaque passage en foreground (AppState).
 *
 *              Règle d'or : on n'appelle `setUnlocked(true)` QUE sur un succès
 *              d'`authenticateAsync`. Aucun chemin n'ouvre l'app « gratuitement ».
 *
 * @module      @nina-aes/mobile
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { AppState, View, Text, Pressable } from 'react-native';
import { i18n } from '../i18n';

interface Props {
  children: React.ReactNode;
}

/** État de capacité d'authentification du device. */
type AuthCapability = 'biometric-or-device' | 'device-only' | 'none';

export function BiometricGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [capability, setCapability] = useState<AuthCapability>('biometric-or-device');

  /**
   * Détermine ce que le device peut offrir : biométrie enrôlée, code device
   * seul, ou rien (device sans verrou).
   */
  const detectCapability = async (): Promise<AuthCapability> => {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHw && enrolled) return 'biometric-or-device';
    // Pas de biométrie enrôlée : on vérifie qu'un verrou device (PIN/motif/mdp)
    // existe au moins, sinon on ne PEUT PAS authentifier de façon sûre.
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    // SecurityLevel.SECRET = code/motif/mdp device présent.
    if (level === LocalAuthentication.SecurityLevel.SECRET) return 'device-only';
    return 'none';
  };

  const tryUnlock = async () => {
    const cap = await detectCapability();
    setCapability(cap);

    // Device sans aucun verrou : on REFUSE d'ouvrir l'app (PII en jeu).
    if (cap === 'none') {
      setUnlocked(false);
      return;
    }

    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: i18n.t('auth.lock_prompt'),
      // On AUTORISE le repli sur le code device réel (PIN/motif/mot de passe).
      // C'est ce qui remplace l'ancien `setUnlocked(true)` non sécurisé.
      disableDeviceFallback: false,
      fallbackLabel: i18n.t('auth.use_device_code'),
      cancelLabel: i18n.t('common.cancel'),
    });

    // SEUL un succès réel déverrouille. Jamais d'ouverture par défaut.
    setUnlocked(r.success === true);
  };

  useEffect(() => {
    void tryUnlock();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tryUnlock();
      else setUnlocked(false); // re-verrouille dès qu'on quitte le foreground.
    });
    return () => sub.remove();
  }, []);

  if (!unlocked) {
    return (
      <View className="flex-1 items-center justify-center bg-aes-mali-50">
        <Text className="text-2xl font-bold mb-4">🔒 NINA-AES</Text>
        {capability === 'none' ? (
          // Device non sécurisé : message explicite, pas de bouton « ouvrir ».
          <Text className="text-center px-6 text-red-700">
            {i18n.t('auth.no_device_lock')}
          </Text>
        ) : (
          <Pressable onPress={() => void tryUnlock()} className="bg-primary px-6 py-3 rounded-lg">
            <Text className="text-white">{i18n.t('auth.lock_prompt')}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return <>{children}</>;
}
```

> 📝 Clés i18n à ajouter (sentinelles) : `auth.use_device_code`, `auth.no_device_lock` (« Configurez
> un code de déverrouillage sur votre téléphone pour protéger votre NINA. »), `common.cancel`.

### Étape 4.7 — Cache offline-first avec op-sqlite

**Pourquoi** : les zones rurales ont un réseau 4G intermittent. L'app doit afficher le **dernier
NINA consulté** sans réseau, et **mettre en file** les actions qui nécessitent le serveur (ex. :
soumettre une demande de correction) pour les rejouer au retour réseau.

```typescript
// apps/mobile/src/db/index.ts
/**
 * @file        index.ts
 * @description Base SQLite locale CHIFFRÉE (op-sqlite + SQLCipher) — cache des
 *              fiches NINA, queue de mutations offline, journal QR et révocations.
 *
 *              Tables :
 *                - citizens_cache  (NINA → JSON, fetched_at, ttl)
 *                - mutation_queue  (id, endpoint, body, status, retry_count)
 *                - qr_verify_log   (journal hash-chaîné des vérifications QR)
 *                - revocations     (jti / NINA révoqués)
 *
 *              Politique :
 *                - cache TTL 24 h pour les fiches consultées
 *                - mutation_queue rejouée au retour réseau (NetInfo + retry)
 *                - PII dans cache : CHIFFRÉE AU REPOS par SQLCipher. Le verrou
 *                  biométrique protège l'UI ; SQLCipher protège le DISQUE
 *                  (device rooté, backup ADB, extraction physique).
 *
 * @module      @nina-aes/mobile
 */

import { open } from '@op-engineering/op-sqlite';
import { getOrCreateDbKey } from './db-key';

/**
 * Ouvre la base avec SQLCipher activé.
 *
 * La clé de chiffrement (256 bits) est générée au premier lancement et stockée
 * dans le secure-store (Keystore/Keychain) — JAMAIS en dur, JAMAIS dérivée d'une
 * constante. `getOrCreateDbKey()` la lit ou la crée (voir db-key.ts).
 *
 * ⚠️ Nécessite le build SQLCipher d'op-sqlite (plugin `sqlcipher: true` dans
 * app.json, §4.2). En SQLite standard, `encryptionKey` est ignoré silencieusement
 * → la base resterait EN CLAIR. À vérifier par le test 6 (§5).
 */
export const db = open({
  name: 'nina-aes.db',
  encryptionKey: getOrCreateDbKey(),
});

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
  CREATE TABLE IF NOT EXISTS qr_verify_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    nina TEXT,
    result TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS revocations (
    jti TEXT,
    nina TEXT,
    revoked_at INTEGER NOT NULL,
    synced_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revocations_jti  ON revocations(jti);
  CREATE INDEX IF NOT EXISTS idx_revocations_nina ON revocations(nina);
  CREATE TABLE IF NOT EXISTS seen_fdi (
    jti        TEXT PRIMARY KEY,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1
  );
`);

/** Lit une fiche depuis le cache si elle n'a pas expiré. */
export function readCachedCitizen(nina: string): unknown | null {
  const row = db.execute('SELECT payload, fetched_at, ttl FROM citizens_cache WHERE nina = ?', [
    nina,
  ]).rows?.[0];
  if (!row) return null;
  if (Date.now() / 1000 - Number(row.fetched_at) > Number(row.ttl)) return null;
  return JSON.parse(String(row.payload));
}

/** Écrit / met à jour la fiche en cache. */
export function writeCachedCitizen(nina: string, payload: unknown): void {
  db.execute('INSERT OR REPLACE INTO citizens_cache (nina, payload, fetched_at) VALUES (?, ?, ?)', [
    nina,
    JSON.stringify(payload),
    Math.floor(Date.now() / 1000),
  ]);
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

```typescript
// apps/mobile/src/db/db-key.ts
/**
 * @file        db-key.ts
 * @description Génère/lit la clé de chiffrement SQLCipher (256 bits) depuis le
 *              secure-store. La clé n'est JAMAIS en dur ni dérivée d'une
 *              constante : elle est aléatoire et propre au device.
 *
 *              Note : lecture synchrone via le miroir SecureStore (op-sqlite
 *              ouvre la base au démarrage). En pratique, on initialise la clé
 *              dans un bootstrap async AVANT le premier `open()` ; ce module
 *              expose la valeur déjà résolue.
 *
 * @module      @nina-aes/mobile
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DB_KEY_NAME = 'nina-db-sqlcipher-key';
let cachedKey: string | null = null;

/**
 * À appeler au bootstrap (async) AVANT d'ouvrir la base.
 * Crée la clé si absente, la met en cache mémoire pour `getOrCreateDbKey()`.
 */
export async function bootstrapDbKey(): Promise<void> {
  let key = await SecureStore.getItemAsync(DB_KEY_NAME, { keychainService: 'nina-aes' });
  if (!key) {
    // 32 octets aléatoires → hex (clé SQLCipher).
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(DB_KEY_NAME, key, {
      keychainService: 'nina-aes',
      // La clé DB ne doit pas exiger une auth à CHAQUE accès (la base est
      // ouverte au boot) ; le verrou d'UI est assuré par BiometricGate.
      requireAuthentication: false,
    });
  }
  cachedKey = key;
}

/** Renvoie la clé déjà résolue par `bootstrapDbKey()`. */
export function getOrCreateDbKey(): string {
  if (!cachedKey) {
    throw new Error('bootstrapDbKey() doit être appelé avant open() de la base.');
  }
  return cachedKey;
}
```

```typescript
// apps/mobile/src/db/qr-log.ts
/**
 * @file        qr-log.ts
 * @description Journal local des vérifications QR (QR_VERIFY), HASH-CHAÎNÉ.
 *
 *              Chaque entrée chaîne le hash de la précédente (SHA-256 linéaire),
 *              comme l'audit serveur (ADR-007) : on peut détecter une troncature
 *              ou une réécriture locale du journal. ATTENTION — honnêteté : tant
 *              que la racine n'est pas ANCRÉE côté audit-service (push au retour
 *              réseau + scellement serveur), un attaquant ayant la clé SQLCipher
 *              pourrait RE-calculer toute la chaîne. La chaîne locale n'est donc
 *              PAS « inaltérable » seule ; elle devient probante UNE FOIS ancrée
 *              serveur. Le push bulk est dans replay.ts (à écrire).
 *
 * @module      @nina-aes/mobile
 */

import * as Crypto from 'expo-crypto';
import { db } from './index';

const GENESIS = '0'.repeat(64);

/**
 * Ajoute une entrée au journal QR_VERIFY en la chaînant à la précédente.
 *
 * @param e - NINA (si lisible) + résultat de la vérification.
 */
export async function appendQrVerifyLog(e: { nina: string | null; result: string }): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);
  // Récupère le dernier maillon pour chaîner.
  const last = db.execute('SELECT entry_hash FROM qr_verify_log ORDER BY seq DESC LIMIT 1')
    .rows?.[0];
  const prevHash = last ? String(last.entry_hash) : GENESIS;
  // entry_hash = SHA-256( prev_hash | ts | nina | result )
  const entryHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${prevHash}|${ts}|${e.nina ?? ''}|${e.result}`,
  );
  db.execute(
    'INSERT INTO qr_verify_log (ts, nina, result, prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?)',
    [ts, e.nina, e.result, prevHash, entryHash],
  );
}
```

> 🔒 **QR_VERIFY hash-chaîné, pas « inaltérable »** : conformément au canon audit (ADR-007), le
> journal local est une **hash-chain SHA-256 linéaire**. Elle ne devient probante qu'une fois la
> racine **ancrée côté `audit-service`** (push bulk au retour réseau, scellement serveur — cf. doc
> 09). Sans cet ancrage, un attaquant disposant de la clé SQLCipher peut recalculer la chaîne. On ne
> prétend donc JAMAIS « inaltérable » côté device : on dit « chaînée localement, ancrée serveur ».

> 📌 La rejouation de la queue + la synchro révocations + le push du journal QR (au retour réseau)
> se font dans un hook `useReplayQueue` branché sur `@react-native-community/netinfo` + un
> `setInterval(30s)`. Le code complet est dans `apps/mobile/src/db/replay.ts` (CONCU / à écrire — il
> appelle `upsertRevocations()` pour pull la révocation et POST le `qr_verify_log` non synchronisé
> en bulk vers `audit-service`).

### Étape 4.8 — Build EAS développement (APK signé)

**Pourquoi** : pour tester sur un téléphone physique sans publier en store, EAS Build produit un APK
signé en quelques minutes. C'est l'étape qui valide que les modules natifs (camera, biométrie)
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
      "env": { "EXPO_PUBLIC_KEYCLOAK_URL": "http://10.0.2.2:8080" },
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": { "EXPO_PUBLIC_KEYCLOAK_URL": "https://auth.ctdec.gouv.ml" },
    },
  },
}
```

> 📝 `10.0.2.2` est l'alias Android pour `localhost` du host. Pour iOS Simulator c'est `localhost`
> directement. Pour un téléphone physique sur le même Wi-Fi, mettre l'IP locale du PC (ex.
> `192.168.1.20`).

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

### Test 3 — Scan QR FDI (signature + algorithmes + révocation)

1. Imprimer / afficher la FDI signée d'un citoyen seedé.
2. Dans l'app, ouvrir « Scanner ».
3. **Attendu** : caméra s'ouvre, après scan le payload décodé apparaît avec un badge ✅ vert.
4. Modifier 1 caractère du QR (ex. effacer un point) → badge ❌ rouge « Signature invalide ».
5. **Test alg=none** : forger un JWT avec `{"alg":"none"}` et signature vide → **rejeté**
   (`bad-alg`) AVANT toute vérification.
6. **Test confusion HS256** : forger un JWT `{"alg":"HS256"}` signé HMAC avec la clé publique RSA
   comme secret → **rejeté** (`bad-alg`).
7. **Test kid inconnu** : `{"alg":"RS256","kid":"ctdec-9999"}` → **rejeté** (`unknown-kid`).
8. **Test rotation** : signer avec la clé PRÉCÉDENTE (`ctdec-2025`) → **accepté** (multi-kid OK).
9. **Test révocation** : insérer le `jti` du QR dans `revocations` → re-scan **rejeté** (`revoked`).

### Test 4 — Biométrie / verrou device

1. Mettre l'app en arrière-plan (bouton home), revenir.
2. **Attendu** : écran verrouillé avec prompt biométrique. Refus → l'app reste verrouillée.
3. **Cas sans biométrie enrôlée** (désactiver l'empreinte du device de test, garder un code PIN
   device) : **attendu** = prompt demandant le **code de déverrouillage du device** ; l'app **ne
   s'ouvre PAS** sans succès.
4. **Cas device sans aucun verrou** : **attendu** = écran de blocage explicite, aucun accès au NINA.

### Test 5 — Couverture

```powershell
# Vérification de types + tests unitaires (verify-fdi, biometric-gate, qr-log)
pnpm --filter @nina-aes/mobile check-types
pnpm --filter @nina-aes/mobile test
```

### Test 6 — Chiffrement de la base (SQLCipher)

```powershell
# But : prouver que le fichier .db n'est PAS lisible en clair.
# 1) Récupérer le fichier depuis un device/émulateur de debug :
adb exec-out run-as ml.gouv.ninaaes cat databases/nina-aes.db > nina-aes.db

# 2) Tenter de l'ouvrir SANS clé avec un sqlite3 standard :
#    Attendu = "file is not a database" (en-tête SQLCipher chiffré, PAS "SQLite format 3").
sqlite3 nina-aes.db ".tables"
```

> 🔒 Si `.tables` liste les tables sans clé, **SQLCipher n'est pas actif** : le build a compilé du
> SQLite standard (vérifier le plugin §4.2) — la PII serait en clair. C'est un échec de test
> bloquant.

### Test 7 — Journal QR_VERIFY chaîné

1. Effectuer 3 scans (valide, falsifié, valide).
2. Inspecter `qr_verify_log` : chaque `prev_hash` doit égaler l'`entry_hash` de la ligne précédente.
3. **Attendu** : altérer une ligne casse la chaîne au maillon suivant (détectable). Rappel : la
   chaîne n'est probante qu'une fois **ancrée serveur** (audit-service), pas seule sur le device.

---

## 6. Pièges courants & dépannage

| Symptôme                                                   | Cause probable                                                                                | Solution                                                                                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unable to resolve module @nina-aes/shared-types`          | Metro ne sait pas suivre les liens pnpm vers `../../packages/...`                             | Ajouter `metro.config.js` avec `watchFolders: [path.resolve(__dirname, '../../packages')]`.                                                                                         |
| `expo-camera` plante au lancement                          | Permissions absentes sur Android < 13                                                         | Vérifier `<uses-permission android:name="android.permission.CAMERA"/>` après build.                                                                                                 |
| Redirect Keycloak ne revient pas dans l'app                | `redirectUri` mal configuré côté Keycloak                                                     | Ajouter `ninaaes://*` dans **Valid Redirect URIs** du client `nina-mobile`.                                                                                                         |
| `crypto.subtle is undefined` au scan QR                    | Hermes n'expose pas WebCrypto de façon fiable — le code ne DOIT pas en dépendre               | Utiliser `react-native-quick-crypto` (déjà imposé en §2/§4.5), pas `globalThis.crypto.subtle`.                                                                                      |
| Base `.db` lisible en clair après extraction               | op-sqlite compilé en SQLite STANDARD (plugin `sqlcipher` absent) ou `encryptionKey` non passé | Vérifier `sqlcipher: true` dans app.json + clé via `bootstrapDbKey()` ; refaire un build EAS.                                                                                       |
| QR forgé accepté avec `alg: none` / `HS256`                | Vérification JWT sans allowlist d'algorithme appliquée AVANT le parse                         | Garder le pipeline §4.5 : header → `ALLOWED_ALGS` → kid → signature. Ne jamais accepter `none`/`HS*`.                                                                               |
| Build EAS échoue avec « Gradle out of memory »             | Heap par défaut trop petit                                                                    | Dans `android/gradle.properties` : `org.gradle.jvmargs=-Xmx4096m`.                                                                                                                  |
| L'app fonctionne en debug mais pas en release              | Variables `EXPO_PUBLIC_*` non incluses dans le bundle release                                 | Vérifier `eas.json` → `production.env`. Refaire un build EAS.                                                                                                                       |
| « Network request failed » uniquement en émulateur Android | `localhost` n'est pas accessible dans l'émulateur                                             | Utiliser `10.0.2.2:3000` à la place de `localhost:3000`.                                                                                                                            |
| Refresh token perdu au redémarrage                         | `expo-secure-store` `requireAuthentication: true` exige un déverrouillage à chaque accès      | Garder `requireAuthentication: false` pour le refresh token : le verrou d'UI (`BiometricGate`) protège déjà l'accès applicatif, et le token reste chiffré par le Keystore/Keychain. |

---

## 7. Documentation à produire après cette étape

Créer **`docs/adr/ADR-016-mobile-stack-expo.md`** avec :

- **Décision** : Expo SDK 53 (managed) plutôt que React Native bare ou Flutter.
- **Justification** : EAS Build évite la maintenance Xcode/Android Studio en local (un étudiant seul
  sous Windows) ; OTA permet de pousser des correctifs sans repasser par les stores ; l'écosystème
  Expo couvre 100 % de notre cas (caméra, biométrie, secure-store, OIDC).
- **Conséquences positives** : développement rapide, builds cloud, OTA, runtime aligné iOS/Android.
- **Conséquences négatives** : dépendance à l'infra Expo (limitable via "self-hosted EAS" si besoin
  de souveraineté absolue) ; certains modules natifs très spécifiques peuvent nécessiter un eject
  vers RN bare.
- **Diagramme de séquence** : flux OIDC PKCE complet (peut être tiré de `04-sequence-…` ou de votre
  propre `.puml`).
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
- [ ] Vérification offline du QR FDI testée : valide + falsifié + `alg=none` + `HS256` + kid inconnu
- [ ] JWKS embarqué **multi-kid** (clé courante + précédente) ; rotation testée (signature ancienne
      clé OK)
- [ ] Allowlist d'algorithmes stricte appliquée AVANT le parse (jamais `none` / `HS*`)
- [ ] Révocation locale `jti`/NINA effective offline (re-scan d'un jti révoqué → rejeté)
- [ ] Bornes temporelles vérifiées : `exp` + `iat` (anti-future) + `nbf`
- [ ] Crypto via `react-native-quick-crypto` (aucune dépendance à `crypto.subtle` Hermes)
- [ ] Verrouillage testé : biométrie + **fallback code device réel** + blocage si device sans verrou
- [ ] **SQLCipher actif** : `nina-aes.db` illisible sans clé (Test 6 passé)
- [ ] Certificate pinning actif en build production (pins courant + backup embarqués)
- [ ] Journal `qr_verify_log` hash-chaîné ; push bulk vers `audit-service` (ancrage) câblé ou tracé
      « à faire »
- [ ] Cache 24 h vérifié en mode avion
- [ ] Mutation offline mise en queue → rejouée au retour réseau
- [ ] 8 fichiers de traduction présents (au moins les clés sentinelles) + clés `auth.*` du gate
- [ ] `docs/adr/ADR-016-mobile-stack-expo.md` rédigé
- [ ] Aucun secret / clé privée / token / clé SQLCipher dans le code source (vérifié via
      `git secrets --scan`)
- [ ] Commit conventionnel :
      `feat(mobile): app Expo SDK 53 — auth OIDC, scan QR durci, offline chiffré (PROMPT 1.5+)`

---

## 10. Pour aller plus loin

- **OTA Updates** : `eas update --channel production` pour pousser un nouveau JS bundle (correctifs
  UI, **rotation du JWKS CTDEC** et des **pins TLS**) sans repasser par le store. Le mécanisme
  `expo-updates` valide la signature côté device. **Rappel d'ordre** : pour le JWKS comme pour les
  pins, on **ajoute** la nouvelle clé/empreinte AVANT de basculer la production dessus.
- **Flag d'audit (hash-chaîné, ancré serveur)** : à chaque vérification QR offline, on appende au
  journal local `qr_verify_log` une entrée **chaînée SHA-256** (cf. `db/qr-log.ts`, §4.7). Au retour
  réseau, `replay.ts` pousse les entrées non synchronisées vers `audit-service` en bulk, où la
  racine est **scellée/ancrée** (ADR-007). Sans cet ancrage, la chaîne locale n'est PAS «
  inaltérable » (un porteur de la clé SQLCipher peut la recalculer) — on ne la présente jamais comme
  telle.
- **Mode kiosque agent** : un futur écran « Mode antenne » (visible si rôle=AGENT dans le JWT)
  permettrait à un agent CTDEC d'ouvrir un mode multi-citoyens (file d'attente, scan rapide,
  delivery FDI à domicile — cf. séquence `05-sequence-vulnerable-person.puml`).
- **Fallback non-smartphone** : pour les utilisateurs sans téléphone Android/iOS, le canal USSD
  (doc 14) couvre le même cas d'usage. L'app mobile **n'est pas le seul** point d'accès.
- **Lectures recommandées** :
  - https://docs.expo.dev/develop/development-builds/introduction/
  - https://www.rfc-editor.org/rfc/rfc7636 (PKCE)
  - https://docs.expo.dev/versions/latest/sdk/local-authentication/
  - https://op-engineering.github.io/op-sqlite/ (perf benchmarks vs WatermelonDB)

---
