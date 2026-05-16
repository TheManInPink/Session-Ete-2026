# 24 — Bloc E : Bornes interactives en mairie (Electron mode kiosque)

> **Bloc concerné** : E (Priorité P2) — bornes physiques déployées dans
> les mairies / centres CTDEC pour permettre aux citoyens non-équipés
> (pas de smartphone, pas d'ordi) d'accéder aux services NINA-AES.
> **Prérequis** : Bloc A complet (frontend citizen apps livré) ;
> appointment-service opérationnel ; document-service pour génération
> FDI ; observabilité doc 17.
> **Durée estimée** : 8 à 10 heures pour un étudiant seul.
> **Livrables de cette étape** :
>
> - **App Electron 31** packagée Windows + Linux (`apps/kiosk`)
> - **Mode kiosque verrouillé** : aucune sortie d'app possible (pas
>   d'`Alt+F4`, pas de menu, fullscreen permanent)
> - **Interface ultra-simplifiée** : pictogrammes, 4 boutons gros
>   format, navigation linéaire, FR + 7 langues nationales (i18n
>   réutilise `packages/i18n`)
> - **Lecteur QR intégré** (caméra USB / webcam) pour scan d'une
>   pièce d'identité préexistante (CNI papier, FDI imprimée)
> - **Impression récépissés** : génération PDF puis envoi à
>   l'imprimante thermique 80mm (driver ESC/POS via `node-thermal-printer`)
> - **Mode offline gracieux** : cache local 24h des données
>   essentielles (régions, cercles, type RDV) ; sync différée via
>   queue locale SQLite
> - **Auto-update via Electron Updater + serveur souverain interne**
>   (PAS GitHub release public — sécurité)
> - **Télémétrie minimale** : heartbeat toutes les 5 min vers
>   `apps/admin` (état kiosque, dernière transaction, queue offline)
> - `docs/adr/ADR-024-kiosk-electron-vs-pwa.md`

---

## 1. Objectif pédagogique

40 % des citoyens maliens n'ont pas de smartphone. Le portail web
(`apps/citizen`) ne leur est inaccessible. Les bornes interactives en
mairie permettent un accès physique guidé. Trois leçons :

1. **L'accessibilité = boucle visible**. Une borne ne marche que si la
   personne en face peut accomplir sa tâche en < 3 minutes sans aide.
   Conception extrême : pictogrammes plutôt que texte (analphabétisme
   ~30 % en zone rurale), boutons gros format (motricité réduite),
   feedback sonore + vibration tactile.

2. **Mode kiosque = sécurité physique**. Si un citoyen sort de l'app
   Electron, il accède au système Windows/Linux sous-jacent et peut
   compromettre la borne. Verrouillage strict : auto-restart sur
   crash, écran de veille avec session reset, pas d'accès clavier
   physique (clavier virtuel seulement).

3. **Offline graceful = pas d'angoisse réseau**. Une coupure Internet
   de 30 min ne doit pas planter la borne. Cache local + queue de
   sync différée + bandeau « Synchronisation en cours ».

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                          | Version    | Rôle                                              |
| ---------------------------------- | ---------- | ------------------------------------------------- |
| **Electron**                       | `31.x`     | Runtime kiosk app                                 |
| **electron-builder**               | `25.x`     | Packaging Windows MSI + Linux AppImage           |
| **electron-updater**               | `6.3`      | Auto-update depuis serveur souverain interne     |
| **React 19**                       | -          | UI (réutilise `packages/ui` design system)        |
| **Vite 6**                         | -          | Bundler renderer process                          |
| **TypeScript 6**                   | -          | Typages partagés via `@nina-aes/shared-types`     |
| **node-thermal-printer**           | `4.5`      | Driver ESC/POS pour imprimante thermique 80mm    |
| **@zxing/library**                 | `0.21`     | Lecteur QR code via getUserMedia caméra USB      |
| **better-sqlite3**                 | `11.x`     | Cache local + queue offline                      |
| **Pino + transport custom**        | `9.x`      | Logs locaux + ship différé vers Loki (cf. doc 17) |
| **Tailwind CSS**                   | `4.x`      | Styles cohérents avec citizen app                 |
| **i18next**                        | `25.x`     | 8 langues (cf. `packages/i18n`)                   |

> 🔒 Electron 31 LTS, support sécurité jusqu'à 2027. Pas d'Electron Forge
> (cycle de vie incertain) — `electron-builder` plus stable.

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
rectangle "Borne (mini-PC Linux)" as Hardware {
  rectangle "Electron 31\nMain process" as Main {
    rectangle "BrowserWindow\nfullscreen kiosk" as BW
    rectangle "Auto-updater" as AU
    rectangle "IPC handlers\n(print, scan, sync)" as IPC
  }
  rectangle "Renderer\nReact 19 + Tailwind" as Renderer
  rectangle "Imprimante\nthermique 80mm" as Printer
  rectangle "Caméra USB\n(QR scan)" as Camera
  database "SQLite local\ncache + queue" as LocalDB
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
IPC --> LocalDB : queue + cache
IPC --> API : REST avec retry
Renderer <--> BW : preload bridge (contextIsolation)

AU --> UpdSrv : check version /24h
LocalDB --> API : flush queue when online
Main --> Telem : heartbeat /5min

note bottom of Main
  Sécurité Electron :
  - contextIsolation: true
  - nodeIntegration: false
  - sandbox: true
  - preload.ts comme seul pont
  - CSP strict côté renderer
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
│   │   ├── updater.ts        # auto-update logic
│   │   └── kiosk-lock.ts     # désactive Alt+F4, Ctrl+Alt+Del, etc.
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

**Main process (kiosque verrouillé)** :

```ts
// apps/kiosk/src/main/window.ts
import { BrowserWindow, app, globalShortcut } from 'electron';
import { join } from 'node:path';

export function createKioskWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,              // mode kiosque natif Electron
    autoHideMenuBar: true,
    frame: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.loadFile(join(__dirname, '../renderer/index.html'));
  win.setMenuBarVisibility(false);

  // Empêche le mode développeur en prod
  win.webContents.on('before-input-event', (event, input) => {
    const blocked = [
      'F11', 'F12',
      input.control && input.key === 'r',
      input.control && input.shift && input.key === 'I',
      input.alt && input.key === 'F4',
    ];
    if (blocked.some(Boolean)) event.preventDefault();
  });

  return win;
}

app.whenReady().then(() => {
  // Désactive Ctrl+Alt+Del, etc. (Windows uniquement, Linux à
  // gérer via desktop environment — gnome-control-center)
  if (process.platform === 'win32') {
    require('child_process').execSync(
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v DisableTaskMgr /t REG_DWORD /d 1 /f',
    );
  }

  // Bloque Win+L (verrouillage écran)
  globalShortcut.register('Super+L', () => false);

  createKioskWindow();
});
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
  telemetry: (event: string, payload?: unknown) => ipcRenderer.send('telemetry:event', event, payload),
});
```

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
        icon="/icons/scan-nina.svg"           // pictogramme 256×256
        label={t('home.scan')}                // « Vérifier mon NINA »
        onClick={() => onNavigate('/scan')}
      />
      <BigButton
        icon="/icons/book.svg"
        label={t('home.book')}                // « Prendre RDV »
        onClick={() => onNavigate('/book')}
      />
      <BigButton
        icon="/icons/print.svg"
        label={t('home.print')}               // « Imprimer ma FDI »
        onClick={() => onNavigate('/print')}
      />
      <BigButton
        icon="/icons/report.svg"
        label={t('home.report')}              // « Signaler une erreur »
        onClick={() => onNavigate('/report')}
      />
    </div>
  );
}
```

**`BigButton` design** : 600×400 px, gros pictogramme + label en 48 pt,
fond contrasté, focus ring marqué (4 px), `aria-label`, son de clic
optionnel.

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
    const controls = reader.current.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
      if (result) {
        const text = result.getText();
        // Format attendu : NINA JWS depuis FDI imprimée
        const nina = extractNinaFromJws(text);
        if (nina) {
          onResult(nina);
          controls.stop();
        }
      }
    });
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
    interface: 'usb',                              // ou 'tcp://192.168.x.x' en réseau
    options: { timeout: 5000 },
    width: 48,                                     // 80mm = 48 chars
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

### Étape 4.5 — Mode offline + queue sync

```ts
// apps/kiosk/src/main/ipc/sync.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { ApiClient } from '@nina-aes/api-client';

const db = new Database(join(app.getPath('userData'), 'kiosk-local.db'));
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
  CREATE TABLE IF NOT EXISTS cache_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

export async function flushQueue(api: ApiClient): Promise<void> {
  const rows = db.prepare(`SELECT * FROM sync_queue ORDER BY id LIMIT 50`).all();
  for (const row of rows) {
    try {
      await api.request({ method: row.method, url: row.endpoint, data: JSON.parse(row.payload) });
      db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(row.id);
    } catch (err) {
      db.prepare(`UPDATE sync_queue SET retries = retries + 1, last_error = ? WHERE id = ?`)
        .run((err as Error).message, row.id);
      if (row.retries >= 5) {
        // Abandonner après 5 tentatives, alerter via télémétrie
        logger.error('Abandon sync', { id: row.id, error: err });
        db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(row.id);
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

### Étape 4.6 — Auto-update via serveur souverain

```yaml
# apps/kiosk/electron-builder.yml
publish:
  - provider: generic
    url: https://updates.nina-aes.uqar.ca/kiosk/${channel}/
    # PAS GitHub release (public) — serveur interne signé
    channel: stable

# Le manifest YAML est signé Ed25519 par CTDEC
# electron-updater vérifie la signature avant d'appliquer la maj
```

```ts
// apps/kiosk/src/main/updater.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.autoDownload = false;
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', async (info) => {
  // Vérifier signature Ed25519 du manifest avant de télécharger
  const valid = await verifyUpdateSignature(info);
  if (!valid) {
    logger.error('Signature update invalide — abandon', info);
    return;
  }
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', () => {
  // Appliquer hors heures ouvrées (entre 02:00 et 04:00)
  scheduleRestart('02:00', () => autoUpdater.quitAndInstall());
});
```

---

### Étape 4.7 — Télémétrie heartbeat

```ts
// apps/kiosk/src/main/ipc/telemetry.ts
import { ipcMain } from 'electron';

setInterval(async () => {
  await api.post('/admin/kiosk/heartbeat', {
    deviceId: getDeviceId(),
    version: app.getVersion(),
    queueSize: db.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get().n,
    lastTransactionAt: getLastTransactionTimestamp(),
    uptime: process.uptime(),
    online: await isOnline(),
  });
}, 5 * 60 * 1000);
```

Sur `apps/admin`, un onglet « Bornes en mairie » affiche un tableau des
~50-200 bornes déployées avec leur statut (en ligne / queue size /
dernière transaction / version).

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
#    qu'elle est mise en queue, rallumer wifi, vérifier qu'elle est
#    poussée vers l'API.

# 6) Test mode kiosque verrouillé : essayer Alt+F4, Win, Ctrl+Alt+Suppr
#    → tous bloqués
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                    | Cause probable                            | Solution                                                |
| ----------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Borne sort de fullscreen après inactivité                  | Économiseur d'écran Windows actif         | Désactiver dans Group Policy + `powercfg /change`      |
| QR scan ne marche pas                                       | Caméra pas accessible                     | `getUserMedia` permissions + `--enable-features=...` flags Chromium |
| Imprimante thermique : papier coincé                        | Mauvaise tension papier                   | Manuel d'opérateur + alerte télémétrie « ERROR_PAPER_JAM » |
| Mode kiosque crash silently                                 | Renderer process crash sans restart       | `app.on('renderer-process-crashed', recreateWindow)`   |
| Auto-update boucle infinie                                  | Signature invalide ignorée                | Logger les détails verify ; ne JAMAIS appliquer sans validation |
| Queue offline saturée (> 1000 items)                        | Sync échoue depuis longtemps              | Alerte télémétrie ; intervention humaine + dump SQLite  |
| Multiples langues : caractères bambara mal rendus           | Police par défaut sans support Unicode    | Embarquer Noto Sans Bambara dans `resources/fonts/`     |
| Heure système dérive (pas de NTP)                           | Borne sans Internet long                  | Synchroniser via API heartbeat (récupérer `Date` serveur) |
| `node-thermal-printer` : `Error: USB device not found`     | Driver libusb-win32 absent (Windows)      | Installer Zadig + driver générique Epson                |
| Touch screen mal calibré                                    | Drivers vendor pas installés              | Inclure `xinput_calibrator` script setup                |

---

## 7. Documentation à produire

- `docs/adr/ADR-024-kiosk-electron-vs-pwa.md` — décision Electron vs PWA.
- `docs/deployment/KIOSK-INSTALL-GUIDE.md` — procédure d'installation
  physique sur un mini-PC en mairie (drivers, imprimante, calibration
  touchscreen, etc.).
- `docs/deployment/KIOSK-OPS-RUNBOOK.md` — opérations courantes
  (mise à jour, debug à distance via télémétrie, reset usine).
- Mise à jour `docs/CHANGELOG.md` §22.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc E Bornes kiosque — JJ/MM/2026
- App Electron 31 buildée Windows + Linux
- Mode kiosque verrouillé testé sur Win 10 + Ubuntu 22
- 4 écrans principaux (Scan / RDV / Print / Report) opérationnels
- Impression thermique testée sur Epson TM-T20III
- QR scan via Logitech C270
- Mode offline 24h validé
- Auto-update signé Ed25519 fonctionnel
- Heartbeat télémétrie ok sur apps/admin
- Pilote installation : 3 bornes déployées en mairie Bamako Commune III
```

---

## 9. Checklist de fin d'étape

- [ ] `apps/kiosk` scaffold avec Electron 31 + Vite 6 + React 19
- [ ] Mode kiosque verrouillé sur Windows + Linux
- [ ] Preload sécurisé (contextIsolation + sandbox)
- [ ] 4 écrans principaux livrés (Home / Scan / Book / Print / Report)
- [ ] Pictogrammes 256×256 + clavier virtuel
- [ ] i18n 8 langues (FR + BM + SNK + FF + HAU + TMQ + DJE + MOS)
- [ ] Lecteur QR via @zxing/browser
- [ ] Imprimante thermique testée (Epson TM-T20III ou équivalent)
- [ ] SQLite local cache 24h + queue offline
- [ ] Auto-update signé Ed25519 depuis `updates.nina-aes.uqar.ca`
- [ ] Heartbeat télémétrie toutes les 5 min
- [ ] Onglet « Bornes » dans `apps/admin`
- [ ] Build MSI Windows + AppImage Linux
- [ ] Tests E2E Playwright (mode `electron`) sur le rendu
- [ ] `KIOSK-INSTALL-GUIDE.md` + `KIOSK-OPS-RUNBOOK.md` rédigés
- [ ] `ADR-024` rédigé
- [ ] `docs/CHANGELOG.md` §22 mis à jour
- [ ] Tag Git `kiosk-mvp` posé
- [ ] Commit : `feat(kiosk): Electron 31 + ESC/POS print + offline + ADR-024`

---

## 10. Pour aller plus loin

- **Mode pilote 5 mairies** : avant déploiement national, valider en
  conditions réelles dans 5 mairies pilotes (Bamako Commune III, Kayes,
  Mopti, Tombouctou rural, Sikasso urbain) avec retours utilisateurs.
- **Caméra IR + détection présence** : économiser l'énergie en
  mode veille quand personne devant la borne.
- **NFC pour lecture CNI biométrique** : V3 quand les nouvelles CNI Mali
  intégreront une puce NFC.
- **Synthèse vocale 8 langues** : pour l'accessibilité non-voyants.
  Hugging Face TTS (XTTS-v2 fine-tuné bambara).
- **Recyclage matériel** : utiliser des mini-PC reconditionnés (Lenovo
  M720q d'occasion ~150 €) plutôt que neufs — coût + impact environnemental.

---

_Document 24 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
