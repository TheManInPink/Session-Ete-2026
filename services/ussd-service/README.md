# `@nina-aes/ussd-service`

> **Port** : 3014 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · Africa's Talking webhook
> **Statut** : MVP livré (était à 0 %) **Référence** : PROMPT MAÎTRE v3.0 — Phase 3.9

---

## 1. Rôle

Accès aux services NINA-AES depuis n'importe quel téléphone basique (feature phone), sans Internet,
sans smartphone, sans compte. Pierre angulaire de l'inclusion numérique dans le Sahel.

**Code court** : `*123*NINA#` (à confirmer avec Orange Mali avant déploiement)

**Langues supportées** : 8 langues nationales — Français, Bamanankan, Sooninké, Fulfulde, Tamasheq,
Hausa, Mooré, Zarma.

---

## 2. Endpoints

| Méthode | Chemin                      | Description                           | Auth                                       |
| ------- | --------------------------- | ------------------------------------- | ------------------------------------------ |
| `POST`  | `/ussd/callback`            | Webhook Africa's Talking — text/plain | **Publique** (IP allowlist + HMAC à venir) |
| `GET`   | `/api/v1/ussd/sessions/:id` | Debug session                         | À protéger ADMIN (TODO)                    |
| `GET`   | `/health`                   | Liveness                              | —                                          |

### Exemple d'appel webhook

```bash
curl -X POST http://localhost:3014/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ATUid_abc123",
    "serviceCode": "*123*1#",
    "phoneNumber": "+22366123456",
    "text": ""
  }'

# Réponse text/plain :
# CON NINA-AES
# 1. Français
# 2. Bamanankan
# 3. Sooninké
# ...
```

---

## 3. Architecture du flow MVP

```
*123*NINA#
├── 1. Sélection langue (8 langues)
│   └── Menu principal dans la langue choisie
│       ├── 1. Vérifier mon NINA          ✅ MVP (validation format)
│       ├── 2. Prendre rendez-vous        ⏳ "À venir" — Prompt 3.9
│       ├── 3. Suivre une demande         ⏳ "À venir" — Prompt 3.9
│       ├── 4. Signaler un problème       ⏳ "À venir" — Prompt 3.9
│       └── 5. Aide / Changer de langue   ✅ MVP
```

---

## 4. Limitations connues du MVP

| Limitation                                 | Impact                                                              | À résoudre dans |
| ------------------------------------------ | ------------------------------------------------------------------- | --------------- |
| Sessions stockées en mémoire (pas Redis)   | Perdues au redémarrage, pas de scaling horizontal                   | Prompt 3.9      |
| Pas d'appel HTTP réel à `identity-service` | Le flow "Vérifier NINA" valide uniquement le format                 | Prompt 3.9      |
| HMAC du webhook non vérifié                | Risque d'usurpation Africa's Talking                                | Prompt 3.9      |
| Rate limit par numéro absent               | Risque d'abus / DoS                                                 | Prompt 3.9      |
| Traductions 7 langues = placeholders       | À faire valider par locuteurs natifs                                | Avant prod      |
| Pas de machine d'états XState formalisée   | Code switch/case lisible mais à formaliser pour les flows complexes | Prompt 3.9      |
| Aucun test unitaire                        | Régressions possibles à chaque modif                                | Prompt 10.1     |

---

## 5. Variables d'environnement

| Variable            | Défaut        | Rôle                      |
| ------------------- | ------------- | ------------------------- |
| `USSD_SERVICE_PORT` | `3014`        | Port d'écoute             |
| `NODE_ENV`          | `development` | Active pino-pretty        |
| `LOKI_URL`          | —             | Endpoint Loki (optionnel) |
| `GIT_SHA`           | —             | Hash Git du build         |

(À venir Prompt 3.9 : `REDIS_URL`, `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_USERNAME`,
`API_GATEWAY_URL`.)

---

## 6. Démarrer en local

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
pnpm install
pnpm --filter @nina-aes/ussd-service dev

# Test webhook (simule Africa's Talking)
curl -X POST http://localhost:3014/ussd/callback `
  -H "Content-Type: application/json" `
  -d '{\"sessionId\":\"test1\",\"serviceCode\":\"*123*1#\",\"phoneNumber\":\"+22366000000\",\"text\":\"\"}'
```

---

## 7. ⚠️ Avertissement important

Les traductions non-françaises du fichier `i18n.ts` sont des **PLACEHOLDERS**. Une mauvaise
traduction d'un menu gouvernemental dans une langue locale est **pire que pas de traduction du
tout** — elle peut induire en erreur, voire offenser. AVANT tout déploiement réel :

1. Faire valider par 2 locuteurs natifs par langue (un homme, une femme, représentatifs de
   différentes régions).
2. Tester sur le terrain dans 3 villages différents par langue.
3. Documenter les ambiguïtés culturelles éventuelles.

Le CTDEC et les associations de promotion des langues nationales sont des interlocuteurs naturels
pour cette validation.
