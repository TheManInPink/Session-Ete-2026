# `@nina-aes/appointment-service`

> **Port** : 3008 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino **Statut** : Scaffold (3 fichiers,
> 1 controller) **Référence** : `docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md`

---

## 1. Rôle

Gestion des **rendez-vous citoyens** dans les centres d'enrôlement et mairies. Capacité de prise de
RDV via USSD, web (`apps/citizen`), borne Electron en mairie, et back-office agent. Gère les
créneaux par centre, les files prioritaires (femmes enceintes, personnes âgées, handicapés — cf.
`vulnerability-service`), les notifications de rappel.

Source unique pour planifier les visites — évite que le citoyen se déplace pour rien (centre fermé,
agent absent, file de 3 heures).

---

## 2. Endpoints

| Méthode  | Chemin                          | Description                      | Auth       |
| -------- | ------------------------------- | -------------------------------- | ---------- |
| `GET`    | `/appointments/slots/:centerId` | Créneaux disponibles d'un centre | Public     |
| `POST`   | `/appointments`                 | Crée un RDV                      | Bearer JWT |
| `GET`    | `/appointments/me`              | Mes RDV (citoyen authentifié)    | Bearer JWT |
| `DELETE` | `/appointments/:id`             | Annule un RDV                    | Bearer JWT |
| `GET`    | `/appointments/queue/:centerId` | File du jour (back-office agent) | AGENT      |
| `GET`    | `/health`                       | Liveness                         | —          |

(Spec à figer au démarrage du Bloc E.)

---

## 3. Variables d'environnement

| Variable                   | Défaut       | Rôle                                    |
| -------------------------- | ------------ | --------------------------------------- |
| `APPOINTMENT_SERVICE_PORT` | `3008`       | Port d'écoute HTTP                      |
| `DATABASE_URL`             | (cf. `.env`) | Connexion PostgreSQL                    |
| `RABBITMQ_URL`             | (cf. `.env`) | Émet sur `nina.notifications` (rappels) |

---

## 4. Démarrer en local

```powershell
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/appointment-service dev
```

---

## 5. Liens

- Doc canonique :
  [`docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md`](../../docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md)
- Files prioritaires : voir [`services/vulnerability-service`](../vulnerability-service)
