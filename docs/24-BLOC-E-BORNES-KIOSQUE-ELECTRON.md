# 24 — Bloc E : Bornes interactives en mairie (Electron mode kiosque)

> **Bloc concerné** : E (Priorité P2) — bornes physiques déployées dans les mairies / centres CTDEC
> pour permettre aux citoyens non-équipés (pas de smartphone, pas d'ordi) d'accéder aux services
> NINA-AES. **Prérequis** : Bloc A complet (frontend citizen apps livré) ; appointment-service
> opérationnel ; document-service pour génération FDI ; observabilité doc 17. **Durée estimée** : 8
> à 10 heures pour un étudiant seul. **Livrables de cette étape** :
>
> - **App Electron 37** (majeure supportée) packagée Windows + Linux (`apps/kiosk`)
> - **Identité machine de la borne** : certificat device X.509 provisionné à l'enrôlement, mTLS vers
>   l'API Gateway, révocable au vol (cf. §4.1bis et ADR-034)
> - **Mode kiosque verrouillé** : sortie d'app empêchée au niveau applicatif **ET** durcissement OS
>   réel (SecureBoot, chiffrement disque, compte kiosk restreint) — cf. §4.8
> - **Interface ultra-simplifiée** : pictogrammes, 4 boutons gros format, navigation linéaire, FR +
>   7 langues nationales (i18n réutilise `packages/i18n`)
> - **Reset PII + timeout entre citoyens** : effacement mémoire/état + retour accueil après
>   inactivité (cf. §4.9) — aucune donnée du citoyen précédent visible au suivant
> - **Lecteur QR intégré** (caméra USB / webcam) pour scan d'une pièce d'identité préexistante (CNI
>   papier, FDI imprimée)
> - **Impression récépissés** : génération PDF puis envoi à l'imprimante thermique 80mm (driver
>   ESC/POS via `node-thermal-printer`)
> - **Mode offline gracieux** : cache local 24h des données essentielles (régions, cercles, type
>   RDV) ; sync différée via queue locale **SQLite chiffrée au repos (SQLCipher)** — contient des
>   PII
> - **Auto-update via Electron Updater + serveur souverain interne** (PAS GitHub release public),
>   **signature Ed25519 vérifiée + clé CTDEC épinglée** dans le binaire (cf. §4.6)
> - **Télémétrie minimale** : heartbeat toutes les 5 min vers `apps/admin` (état kiosque, dernière
>   transaction, queue offline)
> - `docs/adr/ADR-024-kiosk-electron-vs-pwa.md`

---

## 1. Objectif pédagogique

40 % des citoyens maliens n'ont pas de smartphone. Le portail web (`apps/citizen`) ne leur est
inaccessible. Les bornes interactives en mairie permettent un accès physique guidé. Trois leçons :

1. **L'accessibilité = boucle visible**. Une borne ne marche que si la personne en face peut
   accomplir sa tâche en < 3 minutes sans aide. Conception extrême : pictogrammes plutôt que texte
   (analphabétisme ~30 % en zone rurale), boutons gros format (motricité réduite), feedback sonore +
   vibration tactile.

2. **Sécurité d'une borne = couche OS, pas couche app**. Le verrouillage applicatif Electron
   (`kiosk: true`, blocage de raccourcis) est du **confort UX**, pas une frontière de sécurité : un
   attaquant physique branche un clavier USB, force un reboot, ou présente une clé USB de boot. La
   vraie défense est au niveau machine : SecureBoot, chiffrement disque (LUKS/BitLocker), compte
   utilisateur **kiosk restreint sans droits admin**, BIOS verrouillé, ports désactivés (cf. §4.8).
   Leçon honnête : **on ne sécurise pas une borne en interceptant `Win+L` en JavaScript** — c'est
   non interceptable de toute façon. On la sécurise en empêchant l'OS de faire quoi que ce soit
   d'autre que lancer l'app kiosk.

3. **La borne est un client comme un autre — elle doit s'authentifier**. Sans identité machine,
   n'importe qui peut rejouer les appels API d'une borne volée. Chaque borne porte un **certificat
   device X.509** provisionné à l'enrôlement et présenté en **mTLS** ; au vol, on révoque le cert
   (CRL/OCSP) et la borne est coupée du backend (cf. §4.1bis).

4. **Offline graceful = pas d'angoisse réseau**. Une coupure Internet de 30 min ne doit pas planter
   la borne. Cache local **chiffré (SQLCipher)** + queue de sync différée + bandeau «
   Synchronisation en cours ». Le cache contenant des PII, il ne doit JAMAIS être en clair sur le
   disque d'une borne en lieu public.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                           | Version | Rôle                                                          |
| ----------------------------------- | ------- | ------------------------------------------------------------- |
| **Electron**                        | `37.x`  | Runtime kiosk app (majeure supportée — voir note ci-dessous)  |
| **electron-builder**                | `26.x`  | Packaging Windows MSI + Linux AppImage                        |
| **electron-updater**                | `6.6`   | Auto-update depuis serveur souverain interne                  |
| **React 19**                        | -       | UI (réutilise `packages/ui` design system)                    |
| **Vite 6**                          | -       | Bundler renderer process                                      |
| **TypeScript 6**                    | -       | Typages partagés via `@nina-aes/shared-types`                 |
| **node-thermal-printer**            | `4.5`   | Driver ESC/POS pour imprimante thermique 80mm                 |
| **@zxing/library**                  | `0.21`  | Lecteur QR code via getUserMedia caméra USB                   |
| **better-sqlite3-multiple-ciphers** | `11.x`  | Cache local + queue offline **chiffrés au repos (SQLCipher)** |
| **@noble/ed25519**                  | `2.x`   | Vérification in-process de la signature d'update (cf. §4.6)   |
| **Pino + transport custom**         | `9.x`   | Logs locaux + ship différé vers Loki (cf. doc 17)             |
| **Tailwind CSS**                    | `4.x`   | Styles cohérents avec citizen app                             |
| **i18next**                         | `25.x`  | 8 langues (cf. `packages/i18n`)                               |

> 🔒 **Choix de version Electron — honnêteté sur le support.** Electron n'a **pas de canal « LTS »**
> : le projet ne maintient (correctifs de sécurité backportés) que les **3 dernières majeures
> stables**, avec une nouvelle majeure ~toutes les 8 semaines. Affirmer « Electron 31 LTS supporté
> jusqu'à 2027 » est **faux** : la 31 est EOL. On cible donc une majeure **dans la fenêtre de
> support au moment du build** (au 18/06/2026 : la `37.x`) et on **réévalue la version à chaque
> cycle de packaging** — c'est une dette de maintenance assumée, pas un acquis. Pas d'Electron Forge
> (cycle de vie incertain) — `electron-builder` plus stable.
>
> ⚠️ `better-sqlite3` standard **ne chiffre pas** ; on utilise le fork
> `better-sqlite3-multiple-ciphers` (compatible API) qui embarque SQLCipher, car la base contient
> des PII (NINA, références RDV) sur une borne en lieu public (cf. §4.5).

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_Kiosk
title Borne kiosque — architecture Electron

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }

actor "Citoyen\n(en mairie)" as User
rectangle "Borne (mini-PC Linux)\nSecureBoot + LUKS + compte kiosk restreint" as Hardware {
  rectangle "Electron 37\nMain process" as Main {
    rectangle "BrowserWindow\nfullscreen kiosk" as BW
    rectangle "Auto-updater\n(verify Ed25519 + pin)" as AU
    rectangle "IPC handlers\n(print, scan, sync)" as IPC
    rectangle "Cert device X.509\n(TPM/secure store)" as DevCert
  }
  rectangle "Renderer\nReact 19 + Tailwind" as Renderer
  rectangle "Imprimante\nthermique 80mm" as Printer
  rectangle "Caméra USB\n(QR scan)" as Camera
  database "SQLite local CHIFFRÉE\n(SQLCipher) cache + queue" as LocalDB
}

rectangle "Backend NINA-AES" {
  rectangle "API Gateway\nidentity + appointment + document" as API
  rectangle "Auto-update server\n(MinIO + signed manifests)" as UpdSrv
  rectangle "Telemetry endpoint\n(apps/admin)" as Telem
}

User --> BW : touch screen
BW --> IPC
IPC --> Printer : ESC/POS
IPC --> Camera : getUserMedia
IPC --> LocalDB : queue + cache (chiffrés)
IPC --> API : REST + mTLS (cert device)
DevCert --> API : présente le cert client X.509
Renderer <--> BW : preload bridge (contextIsolation)

AU --> UpdSrv : check version /24h (manifest signé Ed25519)
LocalDB --> API : flush queue when online
Main --> Telem : heartbeat /5min (mTLS)

note bottom of Main
  Sécurité applicative Electron (≠ frontière de sécurité,
  voir durcissement OS §4.8) :
  - contextIsolation: true
  - nodeIntegration: false
  - sandbox: true
  - preload.ts comme seul pont
  - CSP strict côté renderer
  Identité + transport :
  - cert device X.509 + mTLS (§4.1bis)
  - update Ed25519 vérifié + clé CTDEC pinnée (§4.6)
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Bootstrap projet `apps/kiosk`

```text
apps/kiosk/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts          # entry main process
│   │   ├── window.ts         # BrowserWindow kiosk
│   │   ├── ipc/
│   │   │   ├── print.ts
│   │   │   ├── scan.ts
│   │   │   ├── sync.ts
│   │   │   └── telemetry.ts
│   │   ├── updater.ts        # auto-update logic + verifyUpdateSignature
│   │   ├── device-identity.ts # cert device X.509 + agent mTLS (§4.1bis)
│   │   ├── secure-db.ts      # ouverture SQLCipher (clé dérivée du device)
│   │   ├── session-reset.ts  # reset PII + timeout entre citoyens (§4.9)
│   │   └── kiosk-lock.ts     # blocage raccourcis = UX seulement (≠ sécurité)
│   ├── preload/
│   │   └── index.ts          # contextBridge → window.nina
│   └── renderer/
│       ├── App.tsx           # React tree
│       ├── screens/
│       │   ├── HomeScreen.tsx        # 4 boutons pictogrammes
│       │   ├── ScanNinaScreen.tsx
│       │   ├── BookAppointmentScreen.tsx
│       │   ├── PrintFdiScreen.tsx
│       │   └── ReportIssueScreen.tsx
│       ├── components/
│       │   ├── BigButton.tsx
│       │   ├── VirtualKeyboard.tsx
│       │   └── ConnectivityBanner.tsx
│       └── i18n/             # réutilise packages/i18n
└── resources/
    ├── icons/                # pictogrammes 256×256
    └── installer/            # MSI assets
```

**Main process (fenêtre kiosk)** :

> ⚠️ **Honnêteté sécurité.** Le code ci-dessous configure une fenêtre plein écran et **dissuade**
> les sorties accidentelles (raccourcis usuels). Ce n'est **PAS** une frontière de sécurité :
>
> - `globalShortcut.register('Super+L', …)` **ne bloque pas** `Win+L` : ce raccourci est intercepté
>   par le compositeur Windows (`winlogon`) **avant** d'atteindre une application — aucune app
>   utilisateur ne peut l'annuler. Le code « le bloque » est un **leurre**.
> - `reg add … /v DisableTaskMgr` **exige des droits admin** : sur un compte kiosk correctement
>   restreint (cf. §4.8) il **échoue** ; et s'il réussit c'est que le compte est trop privilégié,
>   donc déjà compromis. À supprimer.
>
> La vraie défense est **au niveau OS** (§4.8 : SecureBoot, chiffrement disque, compte kiosk sans
> droits, shell remplacé, ports verrouillés). On garde donc ici uniquement le blocage de raccourcis
> **comme confort UX** et on documente clairement sa portée.

```ts
// apps/kiosk/src/main/window.ts
import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

/**
 * Crée la fenêtre kiosk plein écran.
 *
 * NOTE DE SÉCURITÉ : `kiosk: true` et le blocage de raccourcis ci-dessous
 * relèvent de l'UX (éviter qu'un citoyen sorte par mégarde), PAS de la
 * sécurité. Un attaquant physique contourne tout cela (clavier USB, reboot,
 * boot USB). La frontière de sécurité réelle est posée par le durcissement
 * OS décrit en §4.8 (SecureBoot, LUKS/BitLocker, compte kiosk restreint).
 *
 * @returns la BrowserWindow kiosk prête à charger le renderer.
 */
export function createKioskWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true, // plein écran natif Electron (confort, pas sécurité)
    autoHideMenuBar: true,
    frame: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // renderer isolé du contexte Node
      nodeIntegration: false, // pas de require() côté renderer
      sandbox: true, // renderer en sandbox Chromium
      webSecurity: true, // same-origin policy active
    },
  });

  win.loadFile(join(__dirname, '../renderer/index.html'));
  win.setMenuBarVisibility(false);

  // UX uniquement : dissuade les sorties accidentelles (devtools, reload).
  // N'EST PAS une mesure de sécurité — un clavier physique branché contourne.
  win.webContents.on('before-input-event', (event, input) => {
    const blocked = [
      input.key === 'F11',
      input.key === 'F12',
      input.control && input.key.toLowerCase() === 'r', // reload
      input.control && input.shift && input.key.toUpperCase() === 'I', // devtools
    ];
    if (blocked.some(Boolean)) event.preventDefault();
  });

  return win;
}

app.whenReady().then(() => {
  // Auto-restart applicatif sur crash renderer (résilience, pas sécurité).
  createKioskWindow();
});

// NOTE : on NE tente PAS de bloquer Win+L / Ctrl+Alt+Suppr / Task Manager
// depuis Electron — c'est techniquement impossible (interception OS) et
// donnerait une fausse impression de sécurité. Voir §4.8 pour le vrai
// durcissement OS (le seul efficace).
```

**Preload (bridge sécurisé)** :

```ts
// apps/kiosk/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nina', {
  scan: () => ipcRenderer.invoke('scan:start'),
  print: (pdfBuffer: Buffer) => ipcRenderer.invoke('print:thermal', pdfBuffer),
  sync: () => ipcRenderer.invoke('sync:trigger'),
  online: () => ipcRenderer.invoke('connectivity:status'),
  telemetry: (event: string, payload?: unknown) =>
    ipcRenderer.send('telemetry:event', event, payload),
});
```

---

### Étape 4.1bis — Identité machine de la borne (cert device X.509 + mTLS)

**POURQUOI.** Sans identité machine, le backend ne distingue pas un appel d'une borne légitime d'un
appel forgé par n'importe quel client réseau. Une borne **volée** ou un opérateur malveillant peut
rejouer les endpoints `appointment`/`document` à volonté. On veut donc que **chaque borne prouve son
identité** à chaque requête, et qu'on puisse **la révoquer instantanément** au vol. La réponse
standard et souveraine (pas de dépendance KMS étrangère) : un **certificat client X.509** par
borne + **mTLS** vers l'API Gateway, aligné sur la stratégie mTLS interne d'ADR-034.

**COMMENT — provisioning à l'enrôlement.** La borne n'est PAS auto-enrôlée : un agent CTDEC
l'inscrit physiquement. Lors de cet enrôlement :

1. La borne génère une paire de clés **dans un secure store** (TPM 2.0 si présent, sinon DPAPI
   Windows / `secret-service` Linux) — la **clé privée ne quitte jamais** la machine.
2. Elle émet une **CSR** (Certificate Signing Request) contenant un `deviceId` unique.
3. L'agent CTDEC approuve ; la **CA interne NINA-AES** (offline, souveraine — cf. ADR-034) signe un
   cert client à durée courte (90 jours) avec le `deviceId` en `Subject`/SAN.
4. Le cert + chaîne sont stockés sur la borne ; la clé privée reste dans le secure store.

> 🔒 **Honnêteté : conçu, non implémenté.** La CA interne, l'endpoint d'enrôlement et la rotation
> automatique des certs sont **spécifiés ici, pas encore codés**. Le code ci-dessous montre la
> **consommation** du cert (agent mTLS) ; l'émission/signature relève d'`enrollment-service` + de la
> PKI décrite dans ADR-034.

```ts
// apps/kiosk/src/main/device-identity.ts
import { Agent } from 'node:https';
import { readFileSync } from 'node:fs';
import { app } from 'electron';
import { join } from 'node:path';

/**
 * Construit l'agent HTTPS mTLS de la borne.
 *
 * Le cert client (X.509) identifie la borne auprès de l'API Gateway ; la clé
 * privée est lue depuis le secure store local (jamais en clair dans le repo,
 * jamais transmise). Le `ca` épingle la CA interne NINA-AES : on REFUSE tout
 * serveur qui ne présente pas un cert signé par cette CA souveraine (pas de
 * confiance dans les CA publiques du système — anti-MITM).
 *
 * @returns un Agent réutilisable pour tous les appels backend de la borne.
 * @throws si le matériel cryptographique de la borne est absent/illisible
 *         (borne non enrôlée → on REFUSE de démarrer le réseau).
 */
export function createMtlsAgent(): Agent {
  const secureDir = join(app.getPath('userData'), 'device-pki');
  // Cert client de la borne (signé par la CA interne à l'enrôlement).
  const cert = readFileSync(join(secureDir, 'device.crt'));
  // Clé privée : ici sur disque protégé OS ; en prod, déléguer au TPM via
  // un module natif (la clé ne doit pas être exportable).
  const key = readFileSync(join(secureDir, 'device.key'));
  // CA interne NINA-AES (épinglée) — on ne fait PAS confiance au magasin système.
  const ca = readFileSync(join(secureDir, 'nina-internal-ca.crt'));

  return new Agent({
    cert,
    key,
    ca,
    rejectUnauthorized: true, // refuse toute chaîne non signée par notre CA
    minVersion: 'TLSv1.3',
  });
}
```

> 🔒 **Honnêteté : `getDeviceDbKey` conçu, non implémenté.** Le module `secure-db.ts` (§4.5) importe
> `getDeviceDbKey` depuis ce fichier (`./device-identity`) pour dériver la clé SQLCipher. **Cette
> fonction n'est PAS encore codée** : le code montré ci-dessus n'expose que `createMtlsAgent`. La
> dérivation réelle — telle que **spécifiée, pas implémentée** — serait : (1) déceller un secret 32
> octets depuis le **secure store OS** (TPM 2.0 si présent, sinon DPAPI Windows / `secret-service`
> Linux), (2) le passer en **HKDF-SHA-256** avec un `info` constant (p. ex.
> `"nina-kiosk-db-key:v1"`) pour obtenir une clé 32 octets dédiée à la base, (3) renvoyer cette clé
> en **hex**. Tant que ce maillon n'existe pas, la promesse « clé dérivée du device, jamais en clair
> » du §4.5 est une **conception**, pas un acquis — c'est elle qui transforme « SQLCipher activé »
> en sécurité réelle. Esquisse de la signature à fournir (à coder) :
>
> ```ts
> // apps/kiosk/src/main/device-identity.ts (À IMPLÉMENTER — non codé)
> import { hkdf } from '@noble/hashes/hkdf';
> import { sha256 } from '@noble/hashes/sha2';
>
> /**
>  * Dérive la clé SQLCipher (32 octets, hex) de la base locale à partir d'un
>  * secret scellé dans le secure store de la borne (TPM/DPAPI/secret-service).
>  * Le secret ne quitte jamais le matériel ; la clé n'est jamais codée en dur.
>  *
>  * NON IMPLÉMENTÉ : `unsealDeviceSecret()` reste à coder (binding TPM/DPAPI).
>  * @returns la clé de chiffrement de la base, en hexadécimal (64 caractères).
>  */
> export function getDeviceDbKey(): string {
>   const secret = unsealDeviceSecret(); // 32 o. depuis TPM/DPAPI/secret-service
>   const salt = readDeviceSalt(); // sel par-borne, stocké à l'enrôlement
>   const keyBytes = hkdf(sha256, secret, salt, 'nina-kiosk-db-key:v1', 32);
>   return Buffer.from(keyBytes).toString('hex'); // 64 hex → forme raw-key SQLCipher
> }
> ```

**Révocation au vol.** Le `deviceId` d'une borne déclarée volée est ajouté à la **CRL** (ou marqué
révoqué via **OCSP**) côté CA interne ; l'API Gateway (qui termine le mTLS) rejette alors toute
connexion présentant ce cert. La borne est coupée du backend **même si elle est encore allumée**.
Couplé au heartbeat (§4.7), `apps/admin` peut aussi marquer la borne « perdue » et déclencher un
**wipe distant** du cache SQLCipher au prochain démarrage réseau.

> Référence : ADR-034 (mTLS interne, PKI souveraine), `docs/security/THREAT-MODEL.md` (menace «
> borne volée / endpoint usurpé »).

---

### Étape 4.2 — Écran d'accueil ultra-simplifié

```tsx
// apps/kiosk/src/renderer/screens/HomeScreen.tsx
import { BigButton } from '../components/BigButton';
import { useTranslation } from 'react-i18next';

export function HomeScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-8 p-12 h-screen bg-gradient-to-br from-blue-50 to-amber-50">
      <BigButton
        icon="/icons/scan-nina.svg" // pictogramme 256×256
        label={t('home.scan')} // « Vérifier mon NINA »
        onClick={() => onNavigate('/scan')}
      />
      <BigButton
        icon="/icons/book.svg"
        label={t('home.book')} // « Prendre RDV »
        onClick={() => onNavigate('/book')}
      />
      <BigButton
        icon="/icons/print.svg"
        label={t('home.print')} // « Imprimer ma FDI »
        onClick={() => onNavigate('/print')}
      />
      <BigButton
        icon="/icons/report.svg"
        label={t('home.report')} // « Signaler une erreur »
        onClick={() => onNavigate('/report')}
      />
    </div>
  );
}
```

**`BigButton` design** : 600×400 px, gros pictogramme + label en 48 pt, fond contrasté, focus ring
marqué (4 px), `aria-label`, son de clic optionnel.

---

### Étape 4.3 — Lecteur QR + scanner CNI

```tsx
// apps/kiosk/src/renderer/screens/ScanNinaScreen.tsx
import { useEffect, useRef } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export function ScanNinaScreen({ onResult }: { onResult: (nina: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reader = useRef(new BrowserQRCodeReader());

  useEffect(() => {
    if (!videoRef.current) return;
    const controls = reader.current.decodeFromVideoDevice(
      undefined,
      videoRef.current,
      (result, err) => {
        if (result) {
          const text = result.getText();
          // Format attendu : NINA JWS depuis FDI imprimée
          const nina = extractNinaFromJws(text);
          if (nina) {
            onResult(nina);
            controls.stop();
          }
        }
      },
    );
    return () => controls.stop();
  }, []);

  return (
    <div className="flex flex-col items-center p-8">
      <h1 className="text-4xl mb-4">Présentez votre FDI ou CNI à la caméra</h1>
      <video ref={videoRef} className="w-3/4 rounded-2xl shadow-lg" />
      <p className="mt-6 text-2xl">Le scan se fait automatiquement…</p>
    </div>
  );
}
```

---

### Étape 4.4 — Impression thermique 80mm

```ts
// apps/kiosk/src/main/ipc/print.ts
import { ipcMain } from 'electron';
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';
import PDFDocument from 'pdfkit';

ipcMain.handle('print:thermal', async (_event, ticketData) => {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'usb', // ou 'tcp://192.168.x.x' en réseau
    options: { timeout: 5000 },
    width: 48, // 80mm = 48 chars
  });

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) throw new Error('Imprimante déconnectée');

  printer.alignCenter();
  printer.bold(true).setTextSize(1, 1);
  printer.println('RÉPUBLIQUE DU MALI');
  printer.println('NINA-AES — Récépissé');
  printer.bold(false).newLine();
  printer.alignLeft();
  printer.println(`Date : ${new Date().toLocaleDateString('fr-FR')}`);
  printer.println(`NINA : ${ticketData.nina}`);
  printer.println(`Type : ${ticketData.type}`);
  printer.println(`Référence : ${ticketData.ref}`);
  printer.newLine();
  printer.printQR(ticketData.qrCode, { cellSize: 8 });
  printer.newLine();
  printer.println('Présenter ce récépissé lors de votre RDV.');
  printer.cut();

  await printer.execute();
  return { ok: true };
});
```

---

### Étape 4.5 — Mode offline + queue sync (SQLite chiffrée + dead-letter)

**POURQUOI chiffrer.** Le cache et la queue contiennent des **PII** (NINA scannés, références RDV,
parfois nom). Une borne est en **lieu public** ; un disque non chiffré volé = fuite de données. On
utilise donc **SQLCipher** (via `better-sqlite3-multiple-ciphers`, API compatible) avec une clé
**dérivée de l'identité device** (secure store / TPM), jamais codée en dur.

> 🔒 **Honnêteté : la dérivation de clé (`getDeviceDbKey`) n'est pas encore codée.** `secure-db.ts`
> ci-dessous **importe** `getDeviceDbKey` depuis `device-identity.ts`, mais cette fonction reste à
> implémenter (HKDF d'un secret scellé TPM/DPAPI/`secret-service` → 32 octets hex). Voir l'encadré
> et l'esquisse de signature en **§4.1bis**. Tant qu'elle n'existe pas, « SQLCipher chiffré au repos
> » est **conçu**, pas livré : c'est ce maillon qui fait la sécurité réelle, pas l'activation du
> PRAGMA.

**POURQUOI dead-letter (et pas drop).** Abandonner silencieusement une demande après 5 échecs =
**perte de données citoyen** (un RDV demandé qui disparaît). On déplace plutôt l'entrée vers une
table **`dead_letter`** : rien n'est détruit, l'incident est tracé, l'opérateur peut rejouer ou
inspecter, et la télémétrie alerte.

```ts
// apps/kiosk/src/main/secure-db.ts
import Database from 'better-sqlite3-multiple-ciphers';
import { app } from 'electron';
import { join } from 'node:path';
import { getDeviceDbKey } from './device-identity';

/**
 * Ouvre la base locale CHIFFRÉE au repos (SQLCipher).
 *
 * La clé est dérivée du matériel d'identité de la borne (secure store / TPM) ;
 * elle n'est JAMAIS en clair dans le code ni le repo. Sans le device, le
 * fichier `.db` volé est illisible.
 *
 * SÉCURITÉ — forme raw-key NON ambiguë. `getDeviceDbKey()` renvoie 32 octets
 * en HEX (64 caractères [0-9a-f]). On les passe à SQLCipher via la syntaxe
 * raw-key `key="x'<hex>'"` plutôt que d'interpoler une chaîne libre dans le
 * PRAGMA : une clé contenant un guillemet double tronquerait/corromprait
 * silencieusement la clé effective (clé plus faible que voulue) et ouvrirait
 * une surface d'injection PRAGMA. On ASSERTE d'abord le format hex strict ;
 * ainsi aucun caractère ne peut casser la chaîne SQL.
 *
 * @returns une connexion better-sqlite3 chiffrée, prête à l'emploi.
 * @throws si la clé dérivée n'est pas un hex 32 octets (format inattendu).
 */
export function openSecureDb(): Database.Database {
  const db = new Database(join(app.getPath('userData'), 'kiosk-local.db'));

  // Garde-fou : la clé DOIT être exactement 64 hex (32 octets). Toute autre
  // forme est refusée AVANT d'atteindre le PRAGMA (anti-injection, anti-clé
  // tronquée). Mieux vaut refuser de démarrer que chiffrer avec une clé faible.
  const keyHex = getDeviceDbKey();
  if (!/^[0-9a-f]{64}$/.test(keyHex)) {
    throw new Error('Clé SQLCipher invalide : 64 caractères hexadécimaux attendus');
  }

  // Active SQLCipher : PRAGMA key DOIT précéder toute autre requête.
  db.pragma(`cipher='sqlcipher'`);
  // Raw-key explicite `x'<hex>'` : SQLCipher prend la clé telle quelle (pas de
  // dérivation KDF d'une passphrase, pas d'ambiguïté de quoting). Le format hex
  // ayant été asserté ci-dessus, aucun guillemet ne peut s'y glisser.
  db.pragma(`key="x'${keyHex}'"`); // clé dérivée du device, hors repo
  return db;
}
```

```ts
// apps/kiosk/src/main/ipc/sync.ts
import { app } from 'electron';
import { ApiClient } from '@nina-aes/api-client';
import { openSecureDb } from '../secure-db';

const db = openSecureDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    retries INTEGER DEFAULT 0,
    last_error TEXT
  );
  -- File de la mort : entrées non livrables conservées (jamais détruites)
  -- pour inspection/rejeu humain — PAS de perte de données citoyen.
  CREATE TABLE IF NOT EXISTS dead_letter (
    id INTEGER PRIMARY KEY,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    failed_at INTEGER NOT NULL,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS cache_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const MAX_RETRIES = 5;

/**
 * Vide la queue de sync vers le backend (appels mTLS via l'ApiClient).
 *
 * En cas d'échec répété (> MAX_RETRIES), l'entrée n'est PAS supprimée mais
 * déplacée en `dead_letter` : aucune demande citoyen n'est perdue
 * silencieusement ; une alerte télémétrie est levée pour intervention.
 *
 * @param api client backend déjà configuré en mTLS (cert device — §4.1bis).
 */
export async function flushQueue(api: ApiClient): Promise<void> {
  const rows = db.prepare(`SELECT * FROM sync_queue ORDER BY id LIMIT 50`).all();
  for (const row of rows) {
    try {
      await api.request({ method: row.method, url: row.endpoint, data: JSON.parse(row.payload) });
      db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(row.id);
    } catch (err) {
      const retries = row.retries + 1;
      db.prepare(`UPDATE sync_queue SET retries = ?, last_error = ? WHERE id = ?`).run(
        retries,
        (err as Error).message,
        row.id,
      );
      if (retries >= MAX_RETRIES) {
        // Dead-letter : on CONSERVE l'entrée (pas de drop) puis on la retire
        // de la queue active, dans une transaction atomique.
        const move = db.transaction(() => {
          db.prepare(
            `INSERT INTO dead_letter (id, endpoint, method, payload, created_at, failed_at, last_error)
             VALUES (@id, @endpoint, @method, @payload, @created_at, @failed_at, @last_error)`,
          ).run({ ...row, failed_at: Date.now(), last_error: (err as Error).message });
          db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(row.id);
        });
        move();
        // Alerte opérateur via télémétrie (intervention humaine requise).
        logger.error('Entrée déplacée en dead_letter', { id: row.id, error: err });
        sendTelemetry('SYNC_DEAD_LETTER', { id: row.id });
      }
    }
  }
}

// Trigger automatique : check connectivité toutes les 30s
setInterval(async () => {
  if (await isOnline()) await flushQueue(api);
}, 30_000);
```

---

### Étape 4.6 — Auto-update via serveur souverain (signature Ed25519 réelle + pinning)

**POURQUOI c'est critique.** L'auto-update **remplace le binaire qui tourne en root-équivalent sur
la borne**. Si la vérification de signature est absente ou fausse, un attaquant capable d'usurper
`updates.nina-aes.uqar.ca` (DNS spoof, MITM, serveur compromis) **pousse un binaire arbitraire** =
**RCE** sur toutes les bornes. La vérification de signature n'est donc **pas optionnelle** : c'est
la seule chose qui empêche la chaîne d'update de devenir une porte dérobée nationale.

> ⚠️ Dans la version précédente de ce doc, `verifyUpdateSignature` était **appelée mais jamais
> définie** — c.-à-d. une promesse de sécurité non tenue. On la **définit réellement** ci-dessous :
> Ed25519 via `@noble/ed25519` (in-process, conforme au canon — Vault Transit ne supporte pas
> Ed25519), avec la **clé publique CTDEC épinglée dans le binaire** (pas récupérée du serveur, sinon
> l'attaquant fournirait sa propre clé).

```yaml
# apps/kiosk/electron-builder.yml
publish:
  - provider: generic
    url: https://updates.nina-aes.uqar.ca/kiosk/${channel}/
    # PAS GitHub release (public) — serveur interne souverain
    channel: stable
    # Le transport est en plus protégé par mTLS (cert device, §4.1bis) :
    # le serveur d'update n'accepte que des bornes authentifiées.
```

```ts
// apps/kiosk/src/main/updater.ts
import { autoUpdater } from 'electron-updater';
// NOTE CRYPTO (load-bearing) : @noble/ed25519 v2.x n'expose PAS de SHA-512
// SYNCHRONE par défaut. Les variantes synchrones `verify`/`sign` LANCENT donc
// une exception tant que `ed.etc.sha512Sync` n'est pas câblé — ce qui ferait
// échouer verifyUpdateSignature à CHAQUE appel (try/catch → false → tout update
// bloqué, y compris les légitimes). On utilise la variante ASYNC `verifyAsync`,
// exactement comme le code de prod du repo (services/audit-service/src/audit/
// signing.service.ts, qui appelle `ed.signAsync`/`ed.verifyAsync` pour la même
// raison). Alternative équivalente : câbler le hash sync une seule fois au boot —
//   import { sha512 } from '@noble/hashes/sha2';
//   ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
// — puis utiliser `verify`. L'async sans hook reste la convention du repo.
import { verifyAsync } from '@noble/ed25519';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Clé publique Ed25519 de CTDEC, ÉPINGLÉE dans le binaire au build.
 *
 * POURQUOI en dur : si on la téléchargeait depuis le serveur d'update, un
 * attaquant qui usurpe ce serveur fournirait SA clé et SA signature — la
 * vérification deviendrait inutile. Le pinning ancre la confiance dans le
 * binaire signé, distribué hors-bande. La rotation de cette clé = nouvelle
 * release applicative (procédure documentée dans KIOSK-OPS-RUNBOOK).
 *
 * 32 octets, encodés hex. Valeur de PLACEHOLDER — à remplacer par la vraie
 * clé publique CTDEC au moment du build de release.
 */
const CTDEC_UPDATE_PUBKEY_HEX = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Vérifie la signature Ed25519 d'un paquet d'update avant installation.
 *
 * Modèle : le serveur publie, à côté du fichier d'update `<file>`, un fichier
 * `<file>.sig` = signature Ed25519 (64 octets) du SHA-256 du paquet, produite
 * par CTDEC avec la clé privée correspondant à la pubkey épinglée ci-dessus.
 *
 * Le scellement Ed25519 est fait IN-PROCESS via @noble/ed25519 (Vault Transit
 * ne supporte pas Ed25519 — cf. ADR-026/ADR-034 ; cohérent avec doc 09).
 *
 * @param updateFilePath chemin local du paquet téléchargé à vérifier.
 * @param signaturePath  chemin du fichier `.sig` (64 octets bruts).
 * @returns `true` SEULEMENT si la signature est valide pour la clé pinnée.
 */
export async function verifyUpdateSignature(
  updateFilePath: string,
  signaturePath: string,
): Promise<boolean> {
  try {
    // 1) Hash SHA-256 du binaire téléchargé (ce qui a été signé par CTDEC).
    const fileBytes = readFileSync(updateFilePath);
    const digest = createHash('sha256').update(fileBytes).digest(); // 32 octets

    // 2) Signature détachée (64 octets) et clé publique pinnée (32 octets).
    const signature = readFileSync(signaturePath); // Uint8Array 64 o
    const pubKey = Buffer.from(CTDEC_UPDATE_PUBKEY_HEX, 'hex'); // 32 o

    // 3) Vérification Ed25519 in-process via la variante ASYNC (verifyAsync) :
    //    la variante SYNCHRONE `verify` jetterait faute de SHA-512 sync câblé
    //    en @noble/ed25519 v2.x → false systématique. Échoue → on REFUSE l'update.
    return await verifyAsync(signature, digest, pubKey);
  } catch (err) {
    // En cas de doute (fichier manquant, parse, etc.) on REFUSE : fail-closed.
    logger.error('verifyUpdateSignature: échec/erreur — update REFUSÉ', { err });
    return false;
  }
}

autoUpdater.autoDownload = false;
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-downloaded', async (info) => {
  // On vérifie APRÈS téléchargement, AVANT installation. Le chemin du paquet
  // et de sa signature `.sig` sont fournis par electron-updater / le manifest.
  const ok = await verifyUpdateSignature(info.downloadedFile, `${info.downloadedFile}.sig`);
  if (!ok) {
    // Signature invalide = potentielle tentative de RCE → on jette le paquet
    // et on alerte. JAMAIS d'installation sans signature valide (fail-closed).
    logger.error('Signature update INVALIDE — paquet rejeté', { version: info.version });
    sendTelemetry('UPDATE_SIGNATURE_INVALID', { version: info.version });
    return;
  }
  // Appliquer hors heures ouvrées (entre 02:00 et 04:00).
  scheduleRestart('02:00', () => autoUpdater.quitAndInstall());
});

autoUpdater.on('update-available', () => {
  // Téléchargement explicite (autoDownload=false) ; la vérif a lieu ensuite.
  autoUpdater.downloadUpdate();
});
```

> 🔒 **Honnêteté : conçu, non implémenté — et précision sur le `false`.** La signature `.sig` côté
> serveur, la cérémonie de clé CTDEC et la procédure de rotation sont **spécifiées, pas codées**. Le
> `CTDEC_UPDATE_PUBKEY_HEX` ci-dessus est un **placeholder de 64 zéros** (ligne
> `const CTDEC_UPDATE_PUBKEY_HEX = '00…00'`) ; le build de release doit l'injecter.
>
> Soyons exacts sur la cause du `false` tant que ce placeholder est en place :
> `verifyUpdateSignature` renvoie `false` **parce que la clé publique pinnée est nulle** (aucune
> signature ne peut être valide pour la clé-zéro), **pas** parce qu'un mécanisme « fail-closed voulu
> » se déclencherait. Le fail-closed du `try/catch` (fichier manquant, parse) est un filet _en plus_
> ; il ne doit pas servir d'alibi pour ne jamais exercer le chemin **valide**.
>
> ⚠️ **Test positif requis (sinon le chemin valide n'est jamais exercé).** Le test négatif du §5
> point 7 (paquet avec `.sig` invalide → `false`) ne prouve QUE le refus. Il faut **en plus** un
> test **positif** : générer une vraie paire Ed25519 de test, signer le SHA-256 d'un paquet,
> injecter cette clé publique de test dans `CTDEC_UPDATE_PUBKEY_HEX`, puis vérifier que
> `verifyUpdateSignature` renvoie **`true`**. Sans ce test, on ne sait pas distinguer « contrôle
> correct » de « contrôle qui répond toujours `false` » (ce qui était précisément le bug de l'appel
> synchrone corrigé ci-dessus).

---

### Étape 4.7 — Télémétrie heartbeat

```ts
// apps/kiosk/src/main/ipc/telemetry.ts
import { ipcMain } from 'electron';

setInterval(
  async () => {
    await api.post('/admin/kiosk/heartbeat', {
      deviceId: getDeviceId(),
      version: app.getVersion(),
      queueSize: db.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get().n,
      lastTransactionAt: getLastTransactionTimestamp(),
      uptime: process.uptime(),
      online: await isOnline(),
    });
  },
  5 * 60 * 1000,
);
```

Sur `apps/admin`, un onglet « Bornes en mairie » affiche un tableau des ~50-200 bornes déployées
avec leur statut (en ligne / queue size / dernière transaction / version).

> 🔒 **Autorisation côté backend — OBLIGATOIRE, à implémenter.** Le `deviceId` envoyé dans le corps
> du heartbeat est **non fiable** tant qu'il n'est pas vérifié : l'endpoint `/admin/kiosk/heartbeat`
> **DOIT valider que le `deviceId` du corps correspond au `CN`/`SAN` du certificat client mTLS
> présenté** (terminé par l'API Gateway, propagé au handler). Sans ce contrôle, une borne pourtant
> authentifiée peut **usurper le `deviceId` d'une autre** : IDOR sur la flotte (statut/queue d'une
> autre borne) et **désanonymisation d'emplacement** (savoir où est telle borne). En cas de
> divergence → rejeter (403) et lever une alerte télémétrie `HEARTBEAT_DEVICEID_MISMATCH`. Ce guard
> n'est **pas encore codé** côté `apps/admin` ; il est requis avant tout déploiement.
>
> 🔒 **Anti-rejeu / anti-bruteforce sur l'enrôlement CSR (§4.1bis), à implémenter côté
> `enrollment-service`.** L'émission d'un cert device sur présentation d'une CSR doit être protégée
> : **nonce/jeton d'enrôlement à usage unique et à courte durée** (anti-rejeu d'une CSR capturée),
> **rate-limiting** par agent CTDEC et par IP (anti-bruteforce), et **journalisation auditée** de
> chaque approbation. Sans cela, une CSR rejouée ou un enrôlement massivement tenté peut faire
> émettre des certs device illégitimes.

---

### Étape 4.8 — Durcissement OS réel (la VRAIE sécurité physique)

**POURQUOI cette section existe.** Tout ce qui précède côté Electron (kiosk window, blocage de
raccourcis) est **contournable par un attaquant physique** en quelques secondes. La sécurité d'une
borne en lieu public se joue **sous** l'application, au niveau du système d'exploitation et du
matériel. Cette section décrit le durcissement **réel** ; c'est lui qui compte, pas le
`kiosk: true`.

> 🔒 **Honnêteté : procédure d'intégration système, pas du code applicatif.** Ces étapes relèvent de
> l'**image OS de la borne** (à industrialiser dans `KIOSK-INSTALL-GUIDE.md`), elles ne sont **pas**
> dans `apps/kiosk`. Recommandation : **Linux** (immuable type Ubuntu Core / Fedora Silverblue) pour
> réduire la surface, mais les deux OS sont couverts ci-dessous.

**Couche matériel / boot**

- **SecureBoot activé** + **mot de passe BIOS/UEFI** : empêche le boot d'un OS/clé USB non signé.
- **Boot USB/PXE désactivé**, ordre de boot verrouillé : pas de boot externe.
- **TPM 2.0** : ancre la clé du chiffrement disque et (si dispo) la clé privée du cert device
  (§4.1bis).

**Couche disque (anti-vol de PII)**

- **Chiffrement intégral du disque** : **LUKS** (Linux) ou **BitLocker** (Windows), scellé au TPM.
  Un disque retiré et lu ailleurs est illisible. Complète le chiffrement applicatif SQLCipher (§4.5)
  — défense en profondeur.

**Couche compte / session (le cœur)**

- **Compte `kiosk` non-administrateur**, sans `sudo` / sans groupe Administrateurs.
- **Auto-login** sur ce compte restreint **uniquement** ; **shell remplacé par l'app kiosk** (pas
  d'explorer.exe / pas de bureau GNOME complet) :
  - Linux : session minimale (cage/weston ou X minimal) lançant directement l'app ; pas de terminal.
  - Windows : **Assigned Access / Shell Launcher** (kiosk mode Windows) — l'app remplace le shell ;
    Ctrl+Alt+Suppr restreint via **stratégie de groupe** (la seule façon correcte — PAS `reg add`
    depuis l'app).
- **Watchdog systemd / service** qui **relance l'app** si elle crash (résilience).

**Couche périphériques / réseau**

- **USB storage désactivé** (udev rules / stratégie) sauf périphériques whitelistés (imprimante,
  caméra, lecteur QR) ; pas de clavier USB non prévu si possible.
- **Pare-feu sortant restrictif** : la borne ne parle qu'à l'API Gateway et au serveur d'update.
- **Mises à jour OS** gérées via l'image (immuable) ou un canal interne — jamais de dépôt public non
  maîtrisé sur le chemin critique (souveraineté).

| Mesure                    | Linux                              | Windows                                 |
| ------------------------- | ---------------------------------- | --------------------------------------- |
| Boot signé                | SecureBoot + GRUB password         | SecureBoot + mot de passe UEFI          |
| Chiffrement disque        | LUKS (scellé TPM)                  | BitLocker (scellé TPM)                  |
| Compte restreint          | user sans `sudo`, session minimale | compte standard + Assigned Access       |
| Shell = app kiosk         | cage/weston → app                  | Shell Launcher v2 → app                 |
| Verrou raccourcis système | compositeur minimal (pas de DE)    | Group Policy (Ctrl+Alt+Suppr, Task Mgr) |
| USB storage off           | règles udev                        | stratégie « Removable Storage Access »  |

> ⚠️ À retenir : **on ne configure RIEN de tout cela depuis le code Electron**. Le `reg add` de
> l'ex- version était à la fois inefficace (échoue sans admin) et dangereux (suggère qu'un compte
> trop privilégié est OK). Le durcissement vit dans l'**image OS**.

---

### Étape 4.9 — Reset PII + timeout entre citoyens

**POURQUOI.** Plusieurs citoyens utilisent la **même** borne à la suite. Si l'état (NINA scanné, RDV
en cours, récépissé affiché) n'est pas effacé, le **citoyen suivant voit les données du précédent**
— fuite de PII directe. De plus, une personne qui s'éloigne sans finir laisse une session ouverte.
Il faut donc : (1) un **timeout d'inactivité** qui ramène à l'accueil, (2) un **wipe explicite** de
toute PII en mémoire à chaque retour accueil / fin de parcours.

```ts
// apps/kiosk/src/main/session-reset.ts
import { BrowserWindow } from 'electron';

const IDLE_TIMEOUT_MS = 60_000; // 60 s sans interaction → reset
let idleTimer: NodeJS.Timeout | undefined;

/**
 * (Ré)arme le minuteur d'inactivité de la session citoyen.
 *
 * À chaque interaction (touch, navigation), le renderer appelle ceci via IPC.
 * Sans interaction pendant IDLE_TIMEOUT_MS, on force un reset complet : retour
 * accueil + effacement de toute PII (cf. resetSession côté renderer).
 *
 * @param win la fenêtre kiosk à réinitialiser.
 */
export function armIdleTimer(win: BrowserWindow): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Demande au renderer de purger son état PII puis de revenir à l'accueil.
    win.webContents.send('session:reset');
    // Purge aussi le cache HTTP/session du renderer (formulaires, mémoire).
    win.webContents.session.clearStorageData({
      storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers'],
    });
  }, IDLE_TIMEOUT_MS);
}
```

```ts
// Côté renderer (extrait) : purge de l'état PII à chaque retour accueil.
// IMPORTANT : on N'ÉCRIT PAS les PII (NINA, nom) dans localStorage/IndexedDB ;
// elles vivent UNIQUEMENT en mémoire React et sont remises à zéro ici.
window.nina.onSessionReset(() => {
  resetAllScreensState(); // vide les champs, NINA scanné, RDV en cours…
  navigate('/'); // retour à l'écran d'accueil
});
```

> Le timeout déclenche aussi un **bandeau « Session terminée pour votre sécurité »** de 5 s avant le
> retour accueil, pour ne pas couper brutalement un citoyen lent. Aucune PII n'est persistée sur le
> disque côté renderer ; la seule persistance PII est la **queue SQLCipher chiffrée** (§4.5), purgée
> à l'envoi.

---

## 5. Validation locale

```powershell
# 1) Dev mode
pnpm --filter @nina-aes/kiosk dev

# 2) Build local
pnpm --filter @nina-aes/kiosk build:win        # MSI
pnpm --filter @nina-aes/kiosk build:linux      # AppImage

# 3) Test impression thermique (sur poste avec imprimante USB)
node apps/kiosk/scripts/test-print.js

# 4) Test QR scan (webcam intégrée)
pnpm --filter @nina-aes/kiosk dev:scan-only

# 5) Test offline : couper wifi, faire une demande RDV, vérifier
#    qu'elle est mise en queue (SQLCipher), rallumer wifi, vérifier
#    qu'elle est poussée vers l'API.

# 6) Test dead-letter : forcer l'API à échouer > 5 fois, vérifier que
#    l'entrée passe en table `dead_letter` (PAS supprimée) + télémétrie.

# 7) Test signature update — NÉGATIF : fournir un paquet avec .sig INVALIDE
#    → verifyUpdateSignature renvoie false, update REFUSÉ (fail-closed).
#
# 7bis) Test signature update — POSITIF (OBLIGATOIRE, sinon le chemin valide
#    n'est jamais exercé) : générer une paire Ed25519 de TEST, signer le SHA-256
#    d'un paquet, injecter la clé publique de test dans CTDEC_UPDATE_PUBKEY_HEX,
#    puis vérifier que verifyUpdateSignature renvoie TRUE. Sans ce test, un
#    contrôle qui renverrait TOUJOURS false (cf. ex-bug de l'appel sync) passerait
#    pour « fonctionnel ». Exemple de génération de fixture :
#    node -e "const ed=require('@noble/ed25519');const{sha512}=require('@noble/hashes/sha2');ed.etc.sha512Sync=(...m)=>sha512(ed.etc.concatBytes(...m));const sk=ed.utils.randomPrivateKey();console.log('pub',Buffer.from(ed.getPublicKey(sk)).toString('hex'));"

# 8) Test reset PII : scanner un NINA, attendre le timeout (60 s),
#    vérifier le retour accueil ET l'absence totale de l'ancien NINA.

# 9) Test mTLS : démarrer SANS le cert device → la borne refuse de
#    joindre le backend (rejectUnauthorized).

# NB — Le "verrouillage clavier" (Win+L, Ctrl+Alt+Suppr) ne se teste PAS
# au niveau app : il N'EST PAS interceptable depuis Electron. Il se valide
# sur l'IMAGE OS durcie (§4.8) : compte kiosk, Group Policy, Shell Launcher.
```

---

## 6. Pièges courants & dépannage

| Symptôme                                               | Cause probable                         | Solution                                                                   |
| ------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| Borne sort de fullscreen après inactivité              | Économiseur d'écran Windows actif      | Désactiver dans Group Policy + `powercfg /change`                          |
| Citoyen sort de l'app via clavier USB / reboot         | Sécurité au niveau APP seulement       | Durcir l'OS (§4.8) : compte kiosk, Shell Launcher, USB off, SecureBoot     |
| `.db` volé révèle des PII                              | SQLite non chiffrée                    | `better-sqlite3-multiple-ciphers` (SQLCipher) + LUKS/BitLocker (§4.5/§4.8) |
| Borne volée appelle encore l'API                       | Pas d'identité machine                 | Cert device X.509 + mTLS, révocation CRL/OCSP (§4.1bis)                    |
| Demande RDV perdue après 5 échecs sync                 | Drop silencieux de la queue            | Dead-letter (entrée conservée) + alerte télémétrie (§4.5)                  |
| NINA du citoyen précédent visible                      | Pas de reset d'état entre sessions     | Timeout inactivité + wipe PII mémoire (§4.9)                               |
| Electron EOL = CVE non patchées                        | Version hors fenêtre de support        | Réévaluer la majeure à chaque build (PAS de "LTS Electron" — §2)           |
| QR scan ne marche pas                                  | Caméra pas accessible                  | `getUserMedia` permissions + `--enable-features=...` flags Chromium        |
| Imprimante thermique : papier coincé                   | Mauvaise tension papier                | Manuel d'opérateur + alerte télémétrie « ERROR_PAPER_JAM »                 |
| Mode kiosque crash silently                            | Renderer process crash sans restart    | `app.on('renderer-process-crashed', recreateWindow)`                       |
| Auto-update boucle infinie                             | Signature invalide ignorée             | Logger les détails verify ; ne JAMAIS appliquer sans validation            |
| Queue offline saturée (> 1000 items)                   | Sync échoue depuis longtemps           | Alerte télémétrie ; intervention humaine + dump SQLite                     |
| Multiples langues : caractères bambara mal rendus      | Police par défaut sans support Unicode | Embarquer Noto Sans Bambara dans `resources/fonts/`                        |
| Heure système dérive (pas de NTP)                      | Borne sans Internet long               | Synchroniser via API heartbeat (récupérer `Date` serveur)                  |
| `node-thermal-printer` : `Error: USB device not found` | Driver libusb-win32 absent (Windows)   | Installer Zadig + driver générique Epson                                   |
| Touch screen mal calibré                               | Drivers vendor pas installés           | Inclure `xinput_calibrator` script setup                                   |

---

## 7. Documentation à produire

- `docs/adr/ADR-024-kiosk-electron-vs-pwa.md` — décision Electron vs PWA.
- `docs/deployment/KIOSK-INSTALL-GUIDE.md` — procédure d'installation physique sur un mini-PC en
  mairie **incluant le durcissement OS §4.8** (SecureBoot, LUKS/BitLocker, compte kiosk, Shell
  Launcher), drivers, imprimante, calibration touchscreen, **provisioning du cert device §4.1bis**.
- `docs/deployment/KIOSK-OPS-RUNBOOK.md` — opérations courantes (mise à jour, debug à distance via
  télémétrie, reset usine, **rotation clé d'update CTDEC**, **révocation cert d'une borne volée**,
  **rejeu de la table `dead_letter`**).
- Aligner avec `docs/security/THREAT-MODEL.md` (borne volée, update malveillant) et ADR-034
  (mTLS/PKI).
- Mise à jour `docs/CHANGELOG.md` §22.

---

## 8. Mini-rapport d'étape (template)

> ⚠️ **Template À REMPLIR — ne rien pré-cocher.** `apps/kiosk/` n'existe pas encore sur le disque
> (cf. §4.1bis/§4.5/§4.6 : plusieurs maillons sont « conçus, non implémentés »). Les cases
> ci-dessous sont donc **À FAIRE** : ne cocher `[x]` qu'après avoir **réellement** exécuté le test
> correspondant sur du code livré. Pré-cocher un résultat de test pour du code inexistant = faux
> rapport.

```markdown
### Rapport — Bloc E Bornes kiosque — JJ/MM/2026

- [ ] App Electron 37 (majeure supportée) buildée Windows + Linux
- [ ] Durcissement OS validé sur image (SecureBoot + LUKS/BitLocker + compte kiosk + Shell Launcher)
- [ ] Cert device X.509 + mTLS vers API Gateway
- [ ] Test révocation (CRL/OCSP) exécuté — résultat : **à renseigner**
- [ ] 4 écrans principaux (Scan / RDV / Print / Report) opérationnels
- [ ] Impression thermique testée (modèle : **à renseigner**)
- [ ] QR scan testé (caméra : **à renseigner**)
- [ ] Mode offline 24h validé ; cache/queue SQLCipher chiffrés (clé `getDeviceDbKey` codée)
- [ ] Dead-letter testé (entrée conservée après 5 échecs, pas de drop)
- [ ] verifyUpdateSignature Ed25519 (`verifyAsync`) — test NÉGATIF (paquet invalide REFUSÉ)
- [ ] verifyUpdateSignature Ed25519 — test POSITIF (paquet valide → TRUE, §5 point 7bis)
- [ ] Reset PII + timeout 60 s entre citoyens validé
- [ ] Heartbeat télémétrie reçu sur apps/admin (deviceId vérifié contre CN/SAN mTLS)
- [ ] Pilote installation : nombre de bornes déployées et lieu — **à renseigner après déploiement
      réel**
```

---

## 9. Checklist de fin d'étape

- [ ] `apps/kiosk` scaffold avec Electron 37 (majeure supportée) + Vite 6 + React 19
- [ ] Durcissement OS §4.8 (SecureBoot + LUKS/BitLocker + compte kiosk + Shell Launcher + USB off)
- [ ] Identité machine : cert device X.509 provisionné à l'enrôlement + agent mTLS (§4.1bis)
- [ ] Révocation borne volée testée (CRL/OCSP côté API Gateway)
- [ ] Preload sécurisé (contextIsolation + sandbox)
- [ ] 4 écrans principaux livrés (Home / Scan / Book / Print / Report)
- [ ] Pictogrammes 256×256 + clavier virtuel
- [ ] i18n 8 langues (FR + BM + SNK + FF + HAU + TMQ + DJE + MOS)
- [ ] Lecteur QR via @zxing/browser
- [ ] Imprimante thermique testée (Epson TM-T20III ou équivalent)
- [ ] `getDeviceDbKey` codé : dérivation HKDF d'un secret scellé TPM/DPAPI/`secret-service`
      (§4.1bis/§4.5)
- [ ] Cache 24h + queue offline **chiffrés SQLCipher** (`better-sqlite3-multiple-ciphers`, raw-key
      hex)
- [ ] Dead-letter au-delà de 5 échecs (pas de drop) + alerte télémétrie (§4.5)
- [ ] Reset PII + timeout inactivité entre citoyens (§4.9)
- [ ] `verifyUpdateSignature` Ed25519 réel via `verifyAsync` (`@noble/ed25519`) + clé CTDEC pinnée
      (§4.6)
- [ ] Test POSITIF verifyUpdateSignature (paquet valide signé → TRUE) ET test négatif (§5 points
      7/7bis)
- [ ] Auto-update depuis `updates.nina-aes.uqar.ca` (transport mTLS, signature vérifiée)
- [ ] Heartbeat télémétrie toutes les 5 min (mTLS) — `deviceId` validé contre CN/SAN du cert (§4.7)
- [ ] Anti-rejeu / anti-bruteforce sur l'enrôlement CSR côté `enrollment-service` (§4.1bis)
- [ ] Onglet « Bornes » dans `apps/admin`
- [ ] Build MSI Windows + AppImage Linux
- [ ] Tests E2E Playwright (mode `electron`) sur le rendu
- [ ] `KIOSK-INSTALL-GUIDE.md` (+ durcissement OS, provisioning cert) + `KIOSK-OPS-RUNBOOK.md`
      rédigés
- [ ] `ADR-024` rédigé ; alignement ADR-034 (mTLS/PKI) + THREAT-MODEL
- [ ] `docs/CHANGELOG.md` §22 mis à jour
- [ ] Tag Git `kiosk-mvp` posé
- [ ] Commit :
      `feat(kiosk): Electron 37 + mTLS device + SQLCipher + update Ed25519 vérifié + ADR-024`

---

## 10. Pour aller plus loin

- **Mode pilote 5 mairies** : avant déploiement national, valider en conditions réelles dans 5
  mairies pilotes (Bamako Commune III, Kayes, Mopti, Tombouctou rural, Sikasso urbain) avec retours
  utilisateurs.
- **Caméra IR + détection présence** : économiser l'énergie en mode veille quand personne devant la
  borne.
- **NFC pour lecture CNI biométrique** : V3 quand les nouvelles CNI Mali intégreront une puce NFC.
- **Synthèse vocale 8 langues** : pour l'accessibilité non-voyants. Hugging Face TTS (XTTS-v2
  fine-tuné bambara).
- **Recyclage matériel** : utiliser des mini-PC reconditionnés (Lenovo M720q d'occasion ~150 €)
  plutôt que neufs — coût + impact environnemental.

---

_Document 24 — Version 1.1 (hardening sécurité borne) — Juin 2026_ _NINA-AES Platform — UQAR —
CONFIDENTIEL_
