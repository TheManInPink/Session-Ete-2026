# `@nina-aes/document-service`

> **Port** : 3004 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · Puppeteer · pdf-lib · MinIO (S3)
> **Statut** : Scaffold (5 fichiers, 2 controllers) **Référence** :
> `docs/10-BACKEND-DOCUMENT-SERVICE.md`

---

## 1. Rôle

Génération et stockage des documents de la plateforme NINA-AES, principalement la **Fiche
Descriptive Individuelle (FDI)** en PDF : rendu Puppeteer + post-traitement pdf-lib (signature,
watermark), QR code JWT RS256 pour vérification hors-ligne, stockage MinIO (S3-compatible) dans le
bucket `nina-documents`.

Génère aussi les PDFs de scans (`nina-scans`), les photos d'identité (`nina-photos`) sont gérées en
upload direct via api-gateway.

---

## 2. Endpoints

| Méthode | Chemin              | Description                              | Auth       |
| ------- | ------------------- | ---------------------------------------- | ---------- |
| `POST`  | `/documents/fdi`    | Génère la Fiche Descriptive d'un citoyen | Bearer JWT |
| `GET`   | `/documents/:id`    | Récupère un document (presigned URL)     | Bearer JWT |
| `POST`  | `/documents/verify` | Vérifie le QR JWT d'une FDI              | Public     |
| `GET`   | `/health`           | Liveness                                 | —          |

(À confirmer après implémentation Bloc 10.)

---

## 3. Variables d'environnement

| Variable                 | Défaut             | Rôle                               |
| ------------------------ | ------------------ | ---------------------------------- |
| `DOCUMENT_SERVICE_PORT`  | `3004`             | Port d'écoute HTTP                 |
| `MINIO_ENDPOINT`         | `localhost`        | Hôte MinIO                         |
| `MINIO_PORT`             | `9000`             | Port MinIO API                     |
| `MINIO_ACCESS_KEY`       | `nina_minio_admin` | Access key MinIO                   |
| `MINIO_SECRET_KEY`       | `minio_dev_2026!`  | Secret key MinIO                   |
| `MINIO_BUCKET_DOCUMENTS` | `nina-documents`   | Bucket pour PDF générés            |
| `QR_JWT_SECRET`          | (Vault en prod)    | Clé privée RS256 pour signer le QR |

---

## 4. Démarrer en local

```powershell
# Prérequis : minio + buckets initialisés (scripts/init-minio.sh)
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/document-service dev

# Console MinIO : http://localhost:9001
```

---

## 5. Liens

- Doc canonique : [`docs/10-BACKEND-DOCUMENT-SERVICE.md`](../../docs/10-BACKEND-DOCUMENT-SERVICE.md)
- Buckets provisionnés par [`scripts/init-minio.sh`](../../scripts/init-minio.sh)
