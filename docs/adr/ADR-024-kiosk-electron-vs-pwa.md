# ADR-024 — Electron 31 (vs PWA, vs native Win32, vs Android Tablet) pour les bornes en mairie

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [24 — Bloc E Bornes kiosque](../24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md)
**Cf. aussi** : [doc 13 — Mobile App Expo](../13-MOBILE-APP-EXPO.md) comme
référence UI/UX cross-device (pas d'ADR dédié, cf. `DOCUMENTATION-MAP.md` §4.3)

---

## Contexte

Le Bloc E vise à déployer des bornes physiques en mairie pour les
citoyens non-équipés (~40 % de la population sans smartphone, ~30 %
analphabétisme rural). Chaque borne doit :

1. Fonctionner en mode **kiosque verrouillé** (impossible de sortir de
   l'app, pas d'accès au système Windows/Linux sous-jacent).
2. Piloter du **matériel physique** : caméra USB pour QR scan,
   imprimante thermique 80mm ESC/POS, écran tactile, clavier virtuel.
3. Tenir une **panne réseau de 24 h** sans crasher (cache + queue offline).
4. **S'auto-mettre à jour** depuis un serveur souverain interne avec
   signature cryptographique des binaires.
5. **Réutiliser** un maximum de code de `apps/citizen` (design system,
   API client, i18n 8 langues, types Zod).

Quatre options évaluées : Electron, Progressive Web App (PWA), native
Win32 (C#/.NET), tablette Android dédiée.

---

## Décision

**Electron 31 (LTS)** + `electron-builder` + React 19 + Vite 6.

Caractéristiques retenues :

- **Mode kiosque natif Electron** : `BrowserWindow({ kiosk: true,
  fullscreen: true, frame: false, closable: false })` + désactivation
  globalShortcut F11/F12/Alt+F4 + blocage Ctrl+Alt+Suppr via registre
  Windows.
- **Réutilisation à 80 %** de `packages/ui`, `@nina-aes/api-client`,
  `@nina-aes/i18n` du Bloc A.
- **Sécurité Electron stricte** : `contextIsolation: true`, `sandbox:
  true`, `nodeIntegration: false`, CSP strict.
- **IPC bridge propre** via `preload/index.ts` qui expose
  `window.nina.{ scan, print, sync, online, telemetry }` — pas d'accès
  Node.js direct depuis le renderer.
- **Auto-update signé Ed25519** depuis `updates.nina-aes.uqar.ca`
  (serveur souverain, pas GitHub release public).
- **better-sqlite3** pour cache local + queue offline (sync différée
  toutes les 30s quand online).
- **node-thermal-printer** pour le pilotage ESC/POS USB.
- **@zxing/browser** pour QR scan via `getUserMedia`.

Build : MSI (Windows 10/11 IoT) + AppImage (Ubuntu 24.04 LTS Server
+ minimal X11). Pas de macOS (CTDEC n'utilise pas Mac en mairie).

---

## Conséquences positives

- **Réutilisation maximale** : 80 % du code citizen-app est utilisé tel
  quel (composants UI, i18n, API client). Économie ~30 h dev.
- **Pilotage hardware natif** : Electron a accès complet à Node.js dans
  le main process → drivers thermal printer, USB scanners, etc.
  Inenvisageable en PWA.
- **Mode kiosque éprouvé** : Electron est utilisé en kiosque par de gros
  industriels (Bloomberg Terminal, Tesla en showroom). Pattern stable
  documenté.
- **Auto-update fiable** : `electron-updater` est mature, support
  Windows + Linux, signature des binaires.
- **Compétences alignées** : la stack React/TS est déjà maîtrisée par
  l'étudiant solo. Pas de C#/.NET / Java Android à apprendre.
- **Souveraineté** : Electron est open-source (MIT, OpenJS Foundation).
  Pas de dépendance fournisseur ni de SaaS de runtime.
- **Distribution simple** : 1 MSI = 1 install sans dépendance, pas
  besoin de Microsoft Store.

---

## Conséquences négatives

- **Empreinte mémoire** : Electron consomme ~250-400 MB RAM au repos
  (Chromium + Node embarqués). Acceptable pour un mini-PC ≥ 4 GB,
  mais exclu des machines à 2 GB.
- **Taille du build** : MSI ~150 MB (vs ~20 MB en Win32 natif). Tenable
  pour 1 install initiale, mais l'update incrémental Electron (~30 MB
  par release) est important sur connexion lente.
- **Updates fréquentes Chromium** : Electron 31 LTS = support 1 an,
  ensuite migration vers Electron 32+. À budgéter ~8 h tous les 12 mois.
- **Pas web-distributable** : on perd la facilité d'une PWA (« ouvre ton
  navigateur »). Mais pour des bornes physiques c'est OK, on installe
  une fois.
- **Touch screen calibration** : pas automatique. Setup script
  `xinput_calibrator` requis sur Linux ; sur Windows 10 IoT, calibration
  via panneau de contrôle.
- **Risque évasion** : un attaquant qui aurait accès physique pourrait
  exploiter une faille kiosque non documentée. Mitigation : pas de port
  USB exposé hors caméra (boîtier scellé), monitoring télémétrie pour
  détecter les redémarrages anormaux.

---

## Note sur la souveraineté numérique

Trois mitigations :

1. **Auto-update sur serveur interne uniquement** : pas de connexion
   à GitHub.com ou updates.electronjs.org. Notre serveur
   `updates.nina-aes.uqar.ca` (MinIO + signature Ed25519) sert les
   manifests YAML.
2. **Pas de télémétrie Electron par défaut** : Electron envoie des
   crash reports vers Sentry/GitHub par défaut. Désactivé via
   `app.disableHardwareAcceleration()` + suppression des handlers
   `crash-reporter`. Toute télémétrie passe par NOTRE endpoint
   `/admin/kiosk/heartbeat`.
3. **Chromium policy entreprise** : politiques Group Policy ou config
   JSON pour bloquer toute communication sortante non explicitement
   autorisée (whitelist d'URLs).

---

## Alternatives rejetées

- **Progressive Web App (PWA)** dans Chromium en mode kiosque
  (`chromium --kiosk https://citizen.nina-aes.ml`) : option « simple »
  mais (a) impossible de piloter l'imprimante thermique USB depuis le
  navigateur, (b) accès limité à `getUserMedia` (QR scan OK mais
  fragile), (c) auto-update du navigateur non contrôlé par nous, (d)
  service workers limités pour le mode offline 24 h. Rejeté.

- **Native Win32 (C# WPF / WinForms)** : performance maximale, contrôle
  total. Rejeté car (a) duplication du code citizen-app en C#
  (~80 h dev), (b) pas multi-plateforme (Windows-only), (c) compétences
  C# absentes pour l'étudiant solo.

- **Native Linux (Qt / GTK)** : équivalent multi-plateforme natif.
  Rejeté pour les mêmes raisons + écosystème moins mature.

- **Tablette Android dédiée** (Samsung Tab Active, ~400 €/unité) :
  attrayant car (a) tactile natif, (b) batterie intégrée, (c) cellulaire
  4G possible. Rejeté car (a) imprimante thermique USB OTG instable
  Android, (b) coût matériel × ~200 mairies = 80 000 € vs ~30 000 € en
  mini-PC reconditionné, (c) lock-in Google Play (souveraineté
  compromise), (d) cycle obsolescence Android ~3 ans (vs 5-7 ans pour
  mini-PC).

- **Tablette LineageOS (Android dégooglisé)** : intéressant pour la
  souveraineté mais (a) compatibilité matérielle limitée, (b)
  maintenance updates manuelle, (c) imprimante thermique USB OTG
  toujours problématique.

- **Tauri** (alternative Rust + WebView OS) : empreinte mémoire 5×
  inférieure à Electron. Très attractif. Rejeté V1 car (a) écosystème
  encore jeune (v2 sortie fin 2024), (b) compétences Rust absentes, (c)
  drivers thermal printer Rust moins matures que Node.js. **Migration
  Tauri envisagée V3** (~6 mois après stabilisation).

- **Wails** (Go + WebView) : similaire Tauri, en Go. Mêmes
  contre-arguments.

- **Pas de borne, juste un téléphone d'agent mairie** : option
  « low-tech » mais ne résout pas l'accessibilité (l'agent doit faire la
  manip pour le citoyen, charge sur le personnel).

---

## Suivi

| Métrique                                          | Cible           | Outil                                |
| ------------------------------------------------- | --------------- | ------------------------------------ |
| Uptime borne / mois                                | > 99 %          | Télémétrie heartbeat                  |
| Transactions complétées / borne / jour            | tracking only   | Dashboard `apps/admin`                |
| Crashes Electron / borne / semaine                | < 1             | Crash reports vers Loki              |
| Délai moyen transaction (home → succès)           | < 3 min         | Analytics télémétrie                  |
| Temps de boot à plein opérationnel                | < 30 s          | Manuel + watchdog                     |
| Erreurs imprimante thermique / mois               | < 5             | Counter télémétrie `printer_errors` |
| Queue offline saturée (> 100 items)                | 0 toléré        | Alerte télémétrie                     |
| Taux d'évasion mode kiosque détectée              | **0**           | Audit `kiosk-lock` logs              |
| Auto-update success rate                          | > 95 %          | Logs updater                          |
| Lectures QR ratées (sur 100)                      | < 10 %          | Compteur scan                         |

Si **taux d'évasion mode kiosque > 0**, ou si **uptime < 95 %**,
intervention immédiate. Migration Tauri envisagée si Electron consume
plus de 600 MB RAM ou pose des problèmes de sécurité majeurs.
