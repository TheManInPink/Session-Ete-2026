# `@nina-aes/enrollment-service`

> **Port** : 3013 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino **Statut** : MVP livré (était à 0
> %) **Référence** : PROMPT MAÎTRE v3.0 — Phase 3.8

---

## 1. Rôle

Collecte initiale des données d'identité d'un citoyen avant création de son enregistrement NINA
officiel. Sert principalement :

- Les centres d'enrôlement CTDEC (Bamako, Kati, Kayes, Sikasso, Ségou, Mopti, ...)
- Les équipes mobiles dans les zones rurales (mode offline-first, sync différée)
- Les bornes en mairie (apps/kiosk)

---

## 2. Endpoints MVP livrés

| Méthode | Chemin                          | Description                                    | Codes d'erreur              |
| ------- | ------------------------------- | ---------------------------------------------- | --------------------------- |
| `POST`  | `/api/v1/enrollment/initiate`   | Démarre un enrôlement, génère un NINA candidat | `E_ENR_001` (date invalide) |
| `GET`   | `/api/v1/enrollment/:id/status` | Consulte le statut                             | `E_ENR_NOT_FOUND`           |
| `GET`   | `/health`                       | Liveness                                       | —                           |

---

## 3. Limitations connues du MVP

- **Storage en mémoire** : les enrôlements sont perdus au redémarrage. À remplacer par Prisma table
  `enrollments` (Prompt 3.8 du v3.0).
- **NINA proposé incomplet** : les codes géographiques sont des placeholders (`0`, `00`, `000`). La
  résolution réelle de `birthLocationId` → région/cercle/commune nécessite une jointure sur
  `@nina-aes/database`.
- **Algorithme checksum simpliste** : la lettre de contrôle utilise un modulo 26 naïf. L'algo RAVEC
  officiel n'est pas public — l'étudiant devra l'obtenir via le CTDEC.
- **Upload justificatif absent** : la délégation à `document-service` pour stocker l'acte de
  naissance scanné est à ajouter.
- **Vérification anti-doublon absente** : la délégation à `ai-service` `/detect-duplicates` est à
  ajouter.
- **Validation finale absente** : la création du citoyen via `identity-service` à la validation
  agent est à ajouter.
- **Endpoint /offline-sync absent** : l'idempotence pour les kits mobiles est à concevoir.
- **Pas d'événements RabbitMQ** : `enrollment.completed` n'est pas encore publié.

---

## 4. Variables d'environnement

| Variable                  | Défaut        | Rôle                      |
| ------------------------- | ------------- | ------------------------- |
| `ENROLLMENT_SERVICE_PORT` | `3013`        | Port d'écoute             |
| `NODE_ENV`                | `development` | Active pino-pretty        |
| `LOKI_URL`                | —             | Endpoint Loki (optionnel) |
| `GIT_SHA`                 | —             | Hash Git du build         |

---

## 5. Démarrer en local

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
pnpm install
pnpm --filter @nina-aes/enrollment-service dev

# Test
curl http://localhost:3013/health
```

---

## 6. Codes d'erreur produits

| Code              | HTTP | Cause                                      |
| ----------------- | ---- | ------------------------------------------ |
| `E_ENR_001`       | 422  | Date de naissance invalide ou non parsable |
| `E_ENR_NOT_FOUND` | 404  | Enrôlement avec cet ID introuvable         |

(Liste à compléter dans `packages/shared-types/src/error-codes.ts` selon Annexe C du v3.0.)
