# 23 — Bloc D : SIGAC anti-corruption (Isolation Forest + LSTM + BERT + lanceurs d'alerte chiffrés)

> **Bloc concerné** : D (Priorité P2) — Système Intégré de Gouvernance
> Anti-Corruption.
> **Prérequis** : Bloc A complet (notamment audit-service ADR-014) ;
> ai-service livré doc 11 (pipeline ML existant pour NINA errors) ;
> sécurité doc 15 (Vault Transit pour chiffrement asymétrique signaleurs).
> **Durée estimée** : 14 à 20 heures pour un étudiant seul.
> **Livrables de cette étape** :
>
> - **`anticorruption-service` (port 3009, FastAPI Python)** — déjà
>   scaffold présent (cf. CHANGELOG §2), à étoffer avec 4 composants ML.
> - **3 modèles ML complémentaires** :
>   - **Isolation Forest** (scikit-learn 1.7) — détection d'anomalies
>     comportementales sur les agents (qui valide trop, qui rejette trop,
>     qui exporte des listes inhabituelles)
>   - **LSTM** (PyTorch 2.5) — analyse temporelle des patterns d'activité
>     (pics anormaux d'enrôlement, séquences suspectes)
>   - **BERT multilingue** (`bert-base-multilingual-cased` ou
>     `Davlan/afro-xlmr-base` pour bambara/peul) — classification NLP
>     des signalements textuels
> - **Scoring d'intégrité 5 facteurs** par agent (0-100, calculé hebdo) :
>   anomalie comportementale, exhaustivité audit, signalements reçus,
>   feedback citoyens, conformité formation
> - **Canal de signalement `*123*ALERTE#`** (USSD) anonyme avec
>   chiffrement asymétrique (Vault Transit Ed25519) — seul le procureur
>   désigné peut déchiffrer
> - **Workflow lanceur d'alerte** : sandbox cryptographique, pas de
>   leak de l'identité du signaleur dans les logs internes
> - **Dashboard SIGAC** dans `apps/governance` (réservé `INSPECTOR`,
>   `PROSECUTOR`)
> - `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md`

---

## 1. Objectif pédagogique

La corruption est le risque institutionnel #1 d'un système d'identité
gouvernemental. Un agent CTDEC corrompu peut :

- Délivrer des NINA fictifs (faux citoyens) en échange de pot-de-vin
- Modifier les données d'un citoyen réel (changement d'identité)
- Exporter des listes de citoyens à des fins de chantage / surveillance
- Couvrir des fraudes via complicité hiérarchique

Trois leçons pédagogiques :

1. **Le ML ne remplace pas l'enquête, il la cible**. Isolation Forest +
   LSTM + BERT ne « détectent pas la corruption ». Ils **flaggent des
   anomalies** qui justifient une investigation humaine par l'OCLEI
   (Office Central de Lutte contre l'Enrichissement Illicite). Le score
   d'intégrité n'est PAS une décision administrative.

2. **Protéger le lanceur d'alerte = chiffrer + minimiser**. Un signaleur
   doit pouvoir reporter une fraude sans qu'aucun admin système ne
   puisse savoir QUI a signalé. Conception : chiffrement asymétrique
   client-side, seul le procureur a la clé privée.

3. **L'audit Merkle (ADR-014) est la base de toute détection**. Sans
   chaîne d'audit immuable, un agent corrompu peut effacer ses traces.
   SIGAC consomme directement la table `audit_logs` (read-only) et y
   applique les modèles ML.

> 💡 **Différence avec ADR-015** : ADR-015 = stack ML pour détecter les
> ERREURS NINA (orthographe, doublons). ADR-023 = stack ML pour détecter
> les COMPORTEMENTS suspects + classifier des signalements. Pipelines
> distincts, modèles différents.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                              | Version    | Rôle                                              |
| -------------------------------------- | ---------- | ------------------------------------------------- |
| **FastAPI**                            | `0.135`    | `anticorruption-service` (port 3009)              |
| **scikit-learn**                       | `1.7.x`    | Isolation Forest pour anomalie agents             |
| **PyTorch**                            | `2.5.x`    | LSTM analyse séries temporelles                   |
| **Transformers (Hugging Face)**        | `4.50.x`   | BERT multilingue / AfroXLMR pour NLP             |
| **`Davlan/afro-xlmr-base`**            | -          | Modèle pré-entraîné bambara/peul/haoussa         |
| **MLflow**                             | `2.20.x`   | Tracking expériences + registry modèles           |
| **PyJWT / cryptography (Python)**      | `43.x`     | Chiffrement asymétrique signalements              |
| **Africa's Talking USSD**              | -          | Canal `*123*ALERTE#` (cf. doc 14)                 |
| **Celery + Redis**                     | `5.x`      | Worker async pour scoring batch hebdo            |
| **PostgreSQL**                         | `18`       | Stockage scores + signalements chiffrés          |
| **Vault Transit Ed25519**              | `1.20`     | Clé asymétrique procureur                         |

> 🔒 Tous les modèles sont **fine-tunables localement** sur GPU CTDEC
> (pas de cloud GPU US). Hugging Face Hub utilisé en mirror local
> (`huggingface-hub-mirror` self-hosted).

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_SIGAC
title SIGAC — pipeline anti-corruption

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }

actor "Signaleur\n(citoyen ou\nlanceur d'alerte)" as Whistle
actor "Inspecteur\nOCLEI" as Inspector
actor "Procureur" as Pros

rectangle "anticorruption-service\n:3009 (FastAPI)" as SIGAC {
  rectangle "Isolation Forest\n(anomalie agents)" as IF
  rectangle "LSTM\n(séries temporelles)" as LSTM
  rectangle "BERT/AfroXLMR\n(classif NLP)" as BERT
  rectangle "Integrity Scoring\n5 facteurs" as Score
  rectangle "Whistleblower\nEncrypt module" as WB
}

database "Postgres\nintegrity_scores\nwhistleblower_reports\naudit_logs (read-only)" as PG
rectangle "Vault Transit\nEd25519 procureur" as Vault
rectangle "USSD *123*ALERTE#\n(Africa's Talking)" as USSD
rectangle "MLflow Registry\n(modèles versionnés)" as MLR

Whistle --> USSD : « ALERTE » menu
USSD --> WB : signalement texte
WB ..> Vault : encrypt(payload, pubKey procureur)
WB --> PG : whistleblower_reports

SIGAC --> PG : read audit_logs
IF --> PG : features agents
LSTM --> PG : séries Δ/jour
BERT --> WB : classify signalement

Score --> PG : score 0-100 / agent / semaine

Inspector --> SIGAC : consult dashboard
Inspector --> PG : lister anomalies flag
Pros ..> Vault : decrypt signalement avec sa clé privée

MLR <.. IF
MLR <.. LSTM
MLR <.. BERT

note bottom of WB
  Workflow privacy :
  1. Citoyen tape *123*ALERTE#
  2. Saisit son message (max 160 chars)
  3. Le service génère un ID anonyme (random uuid)
  4. Chiffre {message, timestamp} avec
     la clé publique du procureur (Ed25519)
  5. Stocke en DB : id, ciphertext, classification BERT, hash
  6. Le NUMÉRO de téléphone n'est PAS enregistré
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Modèle Prisma SIGAC

```prisma
// packages/database/prisma/schema.prisma — extensions Bloc D

model IntegrityScore {
  id              BigInt    @id @default(autoincrement())
  userId          String                              // user.id agent
  weekStart       DateTime                            // début de semaine ISO
  overallScore    Int                                 // 0-100
  factorAnomaly   Int                                 // Isolation Forest score
  factorAudit     Int                                 // exhaustivité logs audit
  factorReports   Int                                 // signalements reçus contre lui
  factorFeedback  Int                                 // feedback citoyens (notes)
  factorTraining  Int                                 // conformité formation
  flaggedForInvestigation Boolean @default(false)
  modelVersion    String                              // ex: "isolation-forest-v3"
  computedAt      DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@unique([userId, weekStart])
  @@index([overallScore, weekStart])
  @@map("integrity_scores")
}

model WhistleblowerReport {
  id              String    @id @default(uuid())     // pseudonyme anonyme
  ciphertext      String    @db.Text                 // payload chiffré asymétrique
  cipherKid       String                              // identifiant clé procureur utilisée
  classification  WhistleClassification              // BERT output
  severity        WhistleSeverity                    // LOW | MEDIUM | HIGH | CRITICAL
  receivedAt      DateTime  @default(now())
  acknowledgedBy  String?                            // procureur ayant déchiffré
  acknowledgedAt  DateTime?
  status          WhistleStatus  @default(RECEIVED)
  // PAS de phoneNumber, PAS de citizenId, PAS de IP

  @@index([classification, severity])
  @@index([status])
  @@map("whistleblower_reports")
}

enum WhistleClassification {
  CORRUPTION_FINANCIAL
  ABUSE_OF_POWER
  IDENTITY_FRAUD
  DATA_LEAK
  HARASSMENT
  OTHER
}

enum WhistleSeverity { LOW MEDIUM HIGH CRITICAL }
enum WhistleStatus {
  RECEIVED              // chiffré, pas encore déchiffré
  ACKNOWLEDGED          // procureur a déchiffré
  UNDER_INVESTIGATION
  CLOSED_FOUNDED        // fondé
  CLOSED_UNFOUNDED      // non fondé
  CLOSED_DUPLICATE
}
```

---

### Étape 4.2 — Isolation Forest : détection d'anomalies agents

```python
# services/anticorruption-service/app/ml/anomaly.py
from sklearn.ensemble import IsolationForest
import pandas as pd
import numpy as np
import mlflow

class AgentAnomalyDetector:
    """
    Détecte les agents dont le comportement s'écarte de la norme.

    Features (par agent / semaine glissante 30j) :
      - validations_count
      - rejections_count
      - avg_validation_time_seconds
      - night_activity_ratio    (% d'actions hors 8h-18h)
      - rare_endpoint_ratio     (% d'appels à endpoints peu utilisés)
      - cross_region_actions    (actions sur d'autres régions que rattachée)
      - failed_auth_attempts
      - exports_size_total_mb
    """

    def __init__(self, contamination: float = 0.02):
        self.contamination = contamination
        self.model: IsolationForest | None = None
        self.feature_names = [
            'validations_count', 'rejections_count', 'avg_validation_time_seconds',
            'night_activity_ratio', 'rare_endpoint_ratio', 'cross_region_actions',
            'failed_auth_attempts', 'exports_size_total_mb',
        ]

    def fit(self, df: pd.DataFrame) -> None:
        X = df[self.feature_names].values
        self.model = IsolationForest(
            n_estimators=200,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X)
        # Log dans MLflow
        with mlflow.start_run(run_name="isolation_forest_agents"):
            mlflow.log_param("contamination", self.contamination)
            mlflow.log_param("n_estimators", 200)
            mlflow.log_metric("training_samples", len(df))
            mlflow.sklearn.log_model(self.model, "model")

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        """Retourne un DataFrame avec scoring 0-100 (100 = très anormal)."""
        if self.model is None:
            raise RuntimeError("Model not fitted")
        X = df[self.feature_names].values
        # decision_function : positif = normal, négatif = anormal
        raw = self.model.decision_function(X)
        # Normaliser en 0-100 (100 = anormal)
        anomaly_score = (1 - (raw - raw.min()) / (raw.max() - raw.min() + 1e-9)) * 100
        df = df.copy()
        df['anomaly_score'] = anomaly_score.astype(int)
        df['flagged'] = anomaly_score > 75
        return df
```

**Tâche hebdomadaire (Celery)** :

```python
# services/anticorruption-service/app/tasks/weekly_scoring.py
@celery.task(name='sigac.compute_weekly_scores')
def compute_weekly_scores():
    week_start = previous_monday()
    df_agents = fetch_agent_features(week_start)        # query audit_logs
    detector = load_latest_model('isolation_forest_agents')
    scored = detector.score(df_agents)

    for _, row in scored.iterrows():
        upsert_integrity_score(
            user_id=row['user_id'],
            week_start=week_start,
            factor_anomaly=int(row['anomaly_score']),
            # ... autres facteurs calculés ailleurs
        )

        if row['flagged']:
            notify_inspector(f"Agent {row['user_id']} score anomalie={row['anomaly_score']}")
```

---

### Étape 4.3 — LSTM : analyse temporelle

```python
# services/anticorruption-service/app/ml/temporal.py
import torch
import torch.nn as nn

class ActivityLSTM(nn.Module):
    """
    Input : séquence des dernières N=30 jours d'activité par agent
    [validations_per_day, rejections_per_day, night_ratio, ...]
    Output : probabilité que la prochaine journée soit anormale (0-1)
    """

    def __init__(self, n_features: int = 8, hidden_size: int = 64):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden_size, batch_first=True, num_layers=2, dropout=0.2)
        self.fc = nn.Linear(hidden_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        # x: (batch, seq_len=30, n_features=8)
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return self.sigmoid(self.fc(last)).squeeze(-1)
```

**Entraînement** : sur audit_logs des 12 derniers mois, label = jour
ayant donné lieu à un signalement fondé.

---

### Étape 4.4 — BERT multilingue : classification des signalements

```python
# services/anticorruption-service/app/ml/classifier.py
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch

LABELS = ['CORRUPTION_FINANCIAL', 'ABUSE_OF_POWER', 'IDENTITY_FRAUD',
          'DATA_LEAK', 'HARASSMENT', 'OTHER']

class WhistleClassifier:
    def __init__(self, model_name: str = "Davlan/afro-xlmr-base"):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(
            f"./fine-tuned/{model_name}",                # fine-tuned localement
            num_labels=len(LABELS),
        )
        self.model.eval()

    @torch.no_grad()
    def classify(self, text: str) -> tuple[str, float]:
        inputs = self.tokenizer(text, return_tensors='pt', truncation=True, max_length=256)
        logits = self.model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        idx = int(probs.argmax().item())
        return LABELS[idx], float(probs[idx])
```

> 💡 **Fine-tuning** : on alimente le modèle avec un dataset synthétique
> de ~5 000 signalements pré-annotés (en français + bambara translittéré),
> généré algorithmiquement à partir de templates métier. Pas de leak de
> vraies données NINA.

---

### Étape 4.5 — Workflow lanceur d'alerte chiffré

```python
# services/anticorruption-service/app/whistleblower/encrypt.py
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import hashes, serialization
import requests
import os

VAULT_ADDR = os.environ['VAULT_ADDR']
VAULT_TOKEN = os.environ['VAULT_TOKEN']

def encrypt_whistleblower_report(plaintext: str) -> tuple[str, str]:
    """
    Chiffre un signalement avec la clé publique du procureur via Vault Transit.

    Retourne (ciphertext, kid) — le kid permet de retrouver la version de clé.
    """
    response = requests.post(
        f"{VAULT_ADDR}/v1/transit/encrypt/sigac-whistleblower",
        headers={'X-Vault-Token': VAULT_TOKEN},
        json={'plaintext': base64encode(plaintext)},
    )
    response.raise_for_status()
    data = response.json()['data']
    return data['ciphertext'], f"v{data['key_version']}"
```

**Endpoint USSD (intégré dans `ussd-service`, cf. doc 14)** :

```ts
// services/ussd-service/src/menus/alerte.menu.ts
async function handleAlerteMenu(session: UssdSession, input: string): Promise<UssdResponse> {
  // L'utilisateur saisit son message (max 160 chars USSD)
  if (input.length > 160 || input.length < 10) {
    return { type: 'END', text: 'Message invalide. Min 10, max 160 caractères.' };
  }

  // Classification BERT côté SIGAC
  const classified = await sigacClient.classify(input);

  // Chiffrement asymétrique
  const { ciphertext, kid } = await sigacClient.encryptReport(input);

  // Stockage avec ID pseudonyme (PAS le numéro téléphone)
  await sigacClient.storeReport({
    id: uuid(),
    ciphertext,
    cipherKid: kid,
    classification: classified.label,
    severity: classified.severity,
  });

  return {
    type: 'END',
    text: `Signalement reçu. ID: ${shortId}. Le procureur sera notifié. Merci pour votre vigilance citoyenne.`,
  };
}
```

> 🔒 **Important** : la session USSD ne stocke JAMAIS le `phoneNumber`
> dans le `whistleblower_reports`. Africa's Talking conserve le numéro
> côté opérateur (pour la facturation), mais nos logs internes
> n'enregistrent qu'un UUID anonyme.

---

### Étape 4.6 — Dashboard SIGAC dans `apps/governance`

3 widgets clés :

- **Heatmap intégrité par région** : couleur = score moyen agents
- **Top 10 agents flaggés** : tableau avec drill-down sur audit_logs
- **Signalements à traiter** : queue procureur (ciphertext non
  déchiffrable côté UI, juste classification + severity)

---

## 5. Validation locale

```powershell
# 1) Entraîner Isolation Forest sur données synthétiques
docker exec nina-anticorruption-service python -m app.cli train-anomaly

# 2) Test scoring agent
docker exec nina-anticorruption-service python -m app.cli score-week --week=2026-W18

# 3) Tester le canal USSD *123*ALERTE# en simulateur Africa's Talking
# Saisir "Le directeur de mon CTDEC demande de l'argent pour mon NINA"
# Vérifier que classification BERT = CORRUPTION_FINANCIAL

# 4) Tester la lecture procureur
vault read -format=json transit/decrypt/sigac-whistleblower \
  ciphertext=<ciphertext-from-db> \
  | jq -r .data.plaintext | base64 -d

# 5) Dashboard
curl https://localhost:3010/sigac/dashboard | jq .
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                | Cause probable                                  | Solution                                                |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Isolation Forest flagge trop d'agents (>10 %)          | Contamination trop élevée                       | Baisser `contamination=0.01` ; re-fitter                |
| LSTM ne converge pas                                    | Séries trop courtes (< 30 jours)                | Padding + masking ; ou attendre 60+ jours de données   |
| BERT mauvaise classif sur bambara                       | Modèle fine-tuné insuffisamment                | Ajouter 1k exemples bambara + ré-entraîner             |
| Procureur ne peut pas déchiffrer                        | Mauvaise version clé (rotation)                 | Identifier `cipherKid` puis utiliser cette version    |
| Numéro téléphone leaké dans logs                        | Logger pas configuré redact (cf. doc 17)        | Vérifier `LOG_REDACT_PII=true` + tester logger        |
| Score intégrité = 0 pour un agent inactif               | Pas de features cette semaine                  | Marquer comme "INSUFFICIENT_DATA" plutôt que 0       |
| MLflow ne stocke pas le modèle                          | URI tracking pas configurée                    | `export MLFLOW_TRACKING_URI=http://mlflow.observability` |
| Volume signalements > 1000/jour                         | Spam / attaque DDoS USSD                       | Rate limit côté Africa's Talking + alerte               |
| BERT lent (> 5s par classif)                            | Pas de GPU disponible                          | Quantization int8 + batch inference                    |

---

## 7. Documentation à produire

- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md`
- `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` — engagement éthique +
  procédure procureur.
- `docs/sigac/MODEL-CARDS.md` — fiches modèles (data, biais, limitations).
- `docs/sigac/SCORING-RUNBOOK.md` — comment interpréter un score.
- Mise à jour `docs/CHANGELOG.md` §21.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc D SIGAC — JJ/MM/2026
- Isolation Forest : ✅ trained, F1=0.78 sur dataset test
- LSTM : ✅ AUC=0.85
- BERT/AfroXLMR : ✅ accuracy 89 % sur 5 classes
- Whistleblower chiffrement : ✅ E2E test vert
- USSD *123*ALERTE# : ✅ Africa's Talking sandbox OK
- Dashboard SIGAC : ✅ 3 widgets fonctionnels
```

---

## 9. Checklist de fin d'étape

- [ ] Migration Prisma `sigac` (2 tables + 4 enums)
- [ ] Isolation Forest entraîné + enregistré MLflow
- [ ] LSTM PyTorch entraîné sur 12 mois audit_logs
- [ ] BERT/AfroXLMR fine-tuné sur dataset synthétique 5k signalements
- [ ] Endpoint USSD `*123*ALERTE#` opérationnel + numéro téléphone
  non logué
- [ ] Chiffrement Vault Transit Ed25519 ; procureur peut déchiffrer
- [ ] Cron Celery hebdo scoring agents
- [ ] Dashboard SIGAC dans `apps/governance` (réservé INSPECTOR/PROSECUTOR)
- [ ] `WHISTLEBLOWER-PROTOCOL.md` rédigé (engagement éthique)
- [ ] `MODEL-CARDS.md` rédigés pour les 3 modèles
- [ ] Audit Merkle sur `integrity_scores` (immutabilité)
- [ ] `ADR-023` rédigé
- [ ] `docs/CHANGELOG.md` §21 mis à jour
- [ ] Tag Git `sigac-mvp` posé
- [ ] Commit : `feat(sigac): Isolation Forest + LSTM + BERT + whistleblower + ADR-023`

---

## 10. Pour aller plus loin

- **Graph Neural Networks** : modéliser le réseau « qui valide qui »
  via PyTorch Geometric — détecter les clans de collusion.
- **Differential privacy** sur les scores d'intégrité agrégés exposés
  publiquement (transparence sans rendre l'individu identifiable).
- **Procédure de recours agent** : un agent flaggé doit avoir un canal
  formel pour contester son score (cf. RGPD article 22 droit à
  l'explication des décisions automatisées).
- **Pen-test du module whistleblower** : audit indépendant pour valider
  que l'identité du signaleur est mathématiquement impossible à
  retrouver depuis les logs internes.

---

_Document 23 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
