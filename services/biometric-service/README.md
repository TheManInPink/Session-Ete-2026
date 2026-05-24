# `@nina-aes/biometric-service`

> **Port** : 3012 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino **Statut** : Scaffold (3 fichiers,
> 1 controller) — **Bloc F différé** **Référence** : doc dédiée à venir

---

## 1. Rôle

Traitement et vérification biométrique de la plateforme NINA-AES : capture et matching d'empreintes
digitales (lecteur USB ou capteur intégré aux bornes Electron), hachage et template via SDK
fournisseur (Innovatrics / Neurotechnology — à arbitrer), comparaison 1:1 et 1:N contre la base
citoyenne.

> **⚠️ Bloc F différé** — l'implémentation complète attend l'arbitrage du SDK biométrique et la
> livraison des lecteurs sur le terrain. En attendant, le service expose un stub `/health` pour ne
> pas bloquer le squelette de la stack.

---

## 2. Endpoints

| Méthode | Chemin                | Description                           | Auth  |
| ------- | --------------------- | ------------------------------------- | ----- |
| `POST`  | `/biometric/match`    | Comparaison 1:1 (template vs citoyen) | AGENT |
| `POST`  | `/biometric/identify` | Recherche 1:N                         | AGENT |
| `POST`  | `/biometric/enroll`   | Enregistre un nouveau template        | AGENT |
| `GET`   | `/health`             | Liveness                              | —     |

(Spec à figer au démarrage du Bloc F.)

---

## 3. Variables d'environnement

| Variable                 | Défaut       | Rôle                                  |
| ------------------------ | ------------ | ------------------------------------- |
| `BIOMETRIC_SERVICE_PORT` | `3012`       | Port d'écoute HTTP                    |
| `DATABASE_URL`           | (cf. `.env`) | Connexion PostgreSQL (templates hash) |
| `BIOMETRIC_SDK_LICENSE`  | —            | Licence SDK (à arbitrer)              |

---

## 4. Démarrer en local

```powershell
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/biometric-service dev
```

---

## 5. Notes

⚠️ **Aucune empreinte ne doit transiter en logs**, même hachée — le package `@nina-aes/logger`
masque automatiquement les champs `fingerprintHash`, `biometricTemplate`, `biometricHash`,
`photoBase64` (cf. [`packages/logger/src/redaction.ts`](../../packages/logger/src/redaction.ts)).
