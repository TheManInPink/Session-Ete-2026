# `@nina-aes/governance-service`

> **Port** : 3010 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino **Statut** : Scaffold (3 fichiers,
> 1 controller) **Référence** : `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md`

---

## 1. Rôle

Module gouvernance de la plateforme NINA-AES : gestion des élus locaux, des ressources des
collectivités, agrégation statistique anonymisée pour le pilotage public. Sert d'API consommée par
l'app `apps/governance` (frontend Next.js dédié au pilotage politique).

Ne traite **pas** les données citoyennes nominatives — uniquement des agrégats k-anonymisés et la
cartographie des élus / ressources / projets locaux.

---

## 2. Endpoints

| Méthode | Chemin                         | Description                         | Auth   |
| ------- | ------------------------------ | ----------------------------------- | ------ |
| `GET`   | `/governance/officials`        | Liste des élus locaux               | Public |
| `GET`   | `/governance/resources`        | Ressources des collectivités        | Public |
| `GET`   | `/governance/stats/region/:id` | Agrégats anonymisés par région      | Public |
| `POST`  | `/governance/officials`        | Ajoute un élu (workflow validation) | ADMIN  |
| `GET`   | `/health`                      | Liveness                            | —      |

(Spec à figer au démarrage du Bloc C.)

---

## 3. Variables d'environnement

| Variable                  | Défaut        | Rôle                 |
| ------------------------- | ------------- | -------------------- |
| `GOVERNANCE_SERVICE_PORT` | `3010`        | Port d'écoute HTTP   |
| `DATABASE_URL`            | (cf. `.env`)  | Connexion PostgreSQL |
| `NODE_ENV`                | `development` | Active pino-pretty   |

---

## 4. Démarrer en local

```powershell
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/governance-service dev
```

---

## 5. Liens

- Doc canonique :
  [`docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md`](../../docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md)
- Frontend associé : [`apps/governance`](../../apps/governance)
