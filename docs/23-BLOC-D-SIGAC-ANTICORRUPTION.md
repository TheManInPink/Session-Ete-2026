# 23 — Bloc D : SIGAC anti-corruption (Isolation Forest + LSTM + BERT + lanceurs d'alerte chiffrés)

> **Bloc concerné** : D (Priorité P2) — Système Intégré de Gouvernance Anti-Corruption.
> **Prérequis** : Bloc A complet (notamment audit-service ADR-014) ; ai-service livré doc 11
> (pipeline ML existant pour NINA errors) ; sécurité doc 15 (`15-SECURITY-HARDENING.md`) + ADR
> sécurité dédié `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` (Vault Transit, mTLS,
> mapping OWASP — **à créer/référencer**). **Durée estimée** : 14 à 20 heures pour un étudiant seul.
>
> > ⚠️ **CORRECTIF CRYPTOGRAPHIQUE P0 (v1.1)** — La v1.0 annonçait un « chiffrement Ed25519 » pour
> > le canal lanceurs d'alerte. **C'est une erreur de conception** : **Ed25519 est un algorithme de
> > _signature_, PAS de chiffrement**. Vault Transit (et libsodium) **refusent** une clé `ed25519`
> > pour `encrypt`/`decrypt`. En l'état, la v1.0 n'offrait **AUCUNE confidentialité** au signaleur.
> > La v1.1 remplace ce schéma par un **chiffrement asymétrique réel côté client/borne** avec la clé
> > **publique** du procureur (sealed box X25519 + XSalsa20-Poly1305 _ou_ RSA-OAEP via clé Vault
> > Transit `rsa-4096`). Voir §4.5. Toute la suite du document reflète ce correctif.
>
> **Livrables de cette étape** :
>
> - **`anticorruption-service` (port 3009, FastAPI Python)** — déjà scaffold présent (cf. CHANGELOG
>   §2), à étoffer avec 4 composants ML.
> - **3 modèles ML complémentaires** :
>   - **Isolation Forest** (scikit-learn 1.7) — détection d'anomalies comportementales sur les
>     agents (qui valide trop, qui rejette trop, qui exporte des listes inhabituelles)
>   - **LSTM** (PyTorch 2.5) — analyse temporelle des patterns d'activité (pics anormaux
>     d'enrôlement, séquences suspectes)
>   - **BERT multilingue** (`bert-base-multilingual-cased` ou `Davlan/afro-xlmr-base` pour
>     bambara/peul) — classification NLP des signalements textuels
> - **Scoring d'intégrité 5 facteurs** par agent (0-100, calculé hebdo) : anomalie comportementale,
>   exhaustivité audit, signalements reçus, feedback citoyens, conformité formation
> - **Canal de signalement `*123*ALERTE#`** (USSD) anonyme avec **chiffrement asymétrique réel**
>   (sealed box X25519/XSalsa20-Poly1305 côté borne, _ou_ RSA-OAEP via Vault Transit `rsa-4096`) —
>   **seul le procureur** désigné détient la clé privée et peut déchiffrer ; le serveur ne voit
>   **jamais** le plaintext, il ne stocke que le ciphertext.
> - **Workflow lanceur d'alerte** : scellement côté client/borne, pas de leak de l'identité du
>   signaleur dans les logs internes, **recovery M-of-N (Shamir)** de la clé privée procureur,
>   anti-corrélation (bucketisation severité/timestamp, pas d'IP, pas de correlation-id traçable).
> - **Model Cards** (`docs/sigac/MODEL-CARDS.md`) avec analyse de **biais/fairness par langue
>   nationale** (français/bambara/peul/songhaï/tamasheq) + **droit de contestation RGPD** (art. 22)
>   au design + mapping **OWASP Top 10 2021**.
> - **Dashboard SIGAC** dans `apps/governance` (réservé `INSPECTOR`, `PROSECUTOR`)
> - `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md`

---

## 1. Objectif pédagogique

La corruption est le risque institutionnel #1 d'un système d'identité gouvernemental. Un agent CTDEC
corrompu peut :

- Délivrer des NINA fictifs (faux citoyens) en échange de pot-de-vin
- Modifier les données d'un citoyen réel (changement d'identité)
- Exporter des listes de citoyens à des fins de chantage / surveillance
- Couvrir des fraudes via complicité hiérarchique

Trois leçons pédagogiques :

1. **Le ML ne remplace pas l'enquête, il la cible**. Isolation Forest + LSTM + BERT ne « détectent
   pas la corruption ». Ils **flaggent des anomalies** qui justifient une investigation humaine par
   l'OCLEI (Office Central de Lutte contre l'Enrichissement Illicite). Le score d'intégrité n'est
   PAS une décision administrative.

2. **Protéger le lanceur d'alerte = chiffrer (correctement) + minimiser + dé-corréler**. Un
   signaleur doit pouvoir reporter une fraude sans qu'aucun admin système ne puisse savoir QUI a
   signalé, NI lire CE QUI a été signalé. Conception :
   - **POURQUOI un chiffrement _asymétrique_ ?** Parce qu'on veut que **n'importe qui** puisse
     _écrire_ un signalement (chiffrer avec une clé publiquement diffusée), mais qu'une **seule**
     personne — le procureur — puisse le _lire_ (déchiffrer avec sa clé privée hors-ligne). Avec du
     symétrique, la clé de déchiffrement vivrait sur le serveur → tout admin DB lirait tout.
   - **POURQUOI PAS Ed25519 ?** ⚠️ Erreur fréquente (présente en v1.0). **Ed25519 est une primitive
     de _signature_** (prouver l'origine/l'intégrité), pas un algorithme de **chiffrement**.
     `transit/encrypt` sur une clé `ed25519` **échoue** (`"unsupported operation"`). On chiffre avec
     **X25519** (échange de clés Diffie-Hellman sur la même courbe) encapsulé dans une **sealed
     box** libsodium (X25519 + XSalsa20-Poly1305), _ou_ avec **RSA-OAEP** (clé Vault Transit
     `rsa-4096`). Ne JAMAIS confondre courbe de signature (Ed25519) et courbe d'échange (X25519).
   - **POURQUOI scellement côté client/borne ?** Pour que le **plaintext n'existe jamais** côté
     serveur. Le serveur reçoit déjà du ciphertext ; il ne peut ni le lire, ni le logger, ni le
     fuiter sous contrainte. C'est la différence entre « confidentialité » et « confiance dans
     l'admin ».
   - **POURQUOI dé-corréler ?** Même chiffré, un signalement peut trahir son auteur par
     **corrélation de métadonnées** : un timestamp à la seconde + une IP + un correlation-id d'audit
     suffisent à recouper « qui était au guichet à 14h03:12 ». On **bucketise** (heure arrondie au
     jour), on **chiffre** classification/severité dans le payload, on **ne stocke ni IP ni numéro
     ni correlation-id** réutilisable.

3. **L'audit Merkle (ADR-014) est la base de toute détection**. Sans chaîne d'audit immuable, un
   agent corrompu peut effacer ses traces. SIGAC consomme directement la table `audit_logs`
   (read-only) et y applique les modèles ML.

> 💡 **Différence avec ADR-015** : ADR-015 = stack ML pour détecter les ERREURS NINA (orthographe,
> doublons). ADR-023 = stack ML pour détecter les COMPORTEMENTS suspects + classifier des
> signalements. Pipelines distincts, modèles différents.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                       | Version  | Rôle                                                                                                                                                         |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FastAPI**                     | `0.135`  | `anticorruption-service` (port 3009)                                                                                                                         |
| **scikit-learn**                | `1.7.x`  | Isolation Forest pour anomalie agents                                                                                                                        |
| **PyTorch**                     | `2.5.x`  | LSTM analyse séries temporelles                                                                                                                              |
| **Transformers (Hugging Face)** | `4.50.x` | BERT multilingue / AfroXLMR pour NLP                                                                                                                         |
| **`Davlan/afro-xlmr-base`**     | -        | Modèle pré-entraîné bambara/peul/haoussa                                                                                                                     |
| **MLflow**                      | `2.20.x` | Tracking expériences + registry modèles                                                                                                                      |
| **PyNaCl (libsodium)**          | `1.5.x`  | **Sealed box** X25519 + XSalsa20-Poly1305 (scellement borne)                                                                                                 |
| **`cryptography` (Python)**     | `43.x`   | RSA-OAEP SHA-256 (variante Vault Transit `rsa-4096`)                                                                                                         |
| **Africa's Talking USSD**       | -        | Canal `*123*ALERTE#` (cf. doc 14)                                                                                                                            |
| **Celery + Redis**              | `5.x`    | Worker async pour scoring batch hebdo                                                                                                                        |
| **PostgreSQL**                  | `18`     | Stockage scores + signalements chiffrés                                                                                                                      |
| **Vault Transit `rsa-4096`**    | `1.20`   | Clé asymétrique procureur (variante RSA-OAEP) — **type `rsa-4096`, JAMAIS `ed25519`**                                                                        |
| **Vault Transit `ed25519`**     | `1.20`   | **Signature seule** de l'accusé de réception procureur (PAS de chiffrement)                                                                                  |
| **SSS (`ssss` / lib `sss`)**    | `0.5`    | Recovery M-of-N (3 parts sur 5) de la clé privée procureur — **outil SSS dédié, PAS le Shamir interne de Vault** (qui ne protège QUE l'unseal/root de Vault) |

> 🔒 Tous les modèles sont **fine-tunables localement** sur GPU CTDEC (pas de cloud GPU US). Hugging
> Face Hub utilisé en mirror local (`huggingface-hub-mirror` self-hosted).

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
rectangle "Borne USSD / passerelle\n(scellement client-side)\nsealed box X25519" as Gw
rectangle "Vault Transit\nrsa-4096 procureur\n(variante RSA-OAEP)\nclé privée scindée 3-of-5\nvia SSS externe (PAS le Shamir interne Vault)" as Vault
rectangle "USSD *123*ALERTE#\n(Africa's Talking)" as USSD
rectangle "MLflow Registry\n(modèles versionnés)" as MLR

Whistle --> USSD : « ALERTE » menu
USSD --> Gw : signalement texte (transit chiffré TLS)
Gw ..> Gw : seal(payload, **pubKey** procureur)\nplaintext jamais transmis au serveur
Gw --> WB : ciphertext + classif bucketisée
WB --> PG : whistleblower_reports (ciphertext only)

SIGAC --> PG : read audit_logs
IF --> PG : features agents
LSTM --> PG : séries Δ/jour
BERT --> Gw : classify (sur borne ou enclave) puis bucketise

Score --> PG : score 0-100 / agent / semaine

Inspector --> SIGAC : consult dashboard
Inspector --> PG : lister anomalies flag\n(classif + severité bucketisées, PAS le contenu)
Pros ..> Vault : decrypt avec sa **clé privée**\n(reconstituable via Shamir M-of-N)

MLR <.. IF
MLR <.. LSTM
MLR <.. BERT

note bottom of WB
  Workflow privacy (corrigé v1.1) :
  1. Citoyen tape *123*ALERTE#
  2. Saisit son message (max 160 chars)
  3. La BORNE génère un ID anonyme (random uuid v4)
  4. La BORNE scelle {message} avec la clé PUBLIQUE
     du procureur — **X25519 sealed box** (libsodium)
     ou **RSA-OAEP** (Vault transit rsa-4096).
     ⚠️ JAMAIS Ed25519 (= signature, pas chiffrement).
  5. Stocke en DB : id, ciphertext, kid,
     classif/severité **bucketisées**, jour (pas l'heure).
  6. PAS de numéro, PAS d'IP, PAS de correlation-id,
     PAS de timestamp précis → anti-corrélation.
  7. Le serveur ne voit JAMAIS le plaintext.
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
  id              String    @id @default(uuid())     // pseudonyme anonyme (uuid v4, non corrélable)
  // ciphertext = sortie de la sealed box X25519 (ou RSA-OAEP). Le serveur ne peut PAS le lire :
  // il n'a que la clé PUBLIQUE. classification/severité réelles sont DANS le payload chiffré.
  ciphertext      String    @db.Text                 // payload scellé côté borne (jamais déchiffrable serveur)
  scheme          WhistleCipherScheme @default(SEALED_BOX_X25519) // schéma de scellement (audit/migration)
  cipherKid       String                              // identifiant version de clé publique procureur utilisée
  // ⚠️ ANTI-CORRÉLATION : on ne stocke en clair que des buckets GROSSIERS, pas la vérité fine.
  // La classification/severité PRÉCISES ne servent qu'au tri procureur après déchiffrement.
  classificationBucket WhistleClassBucket            // bucket grossier (FINANCIAL_OR_POWER / FRAUD_OR_LEAK / OTHER)
  severityBucket  WhistleSeverityBucket              // bucket grossier (LOW_MED / HIGH_CRIT) — pas 4 niveaux distincts
  receivedDay     DateTime  @db.Date                 // JOUR seulement (pas l'heure) → bucketisation temporelle
  // PAS de receivedAt précis, PAS de phoneNumber, PAS de citizenId, PAS de IP, PAS de correlationId
  acknowledgedBy  String?                            // procureur ayant déchiffré (rempli APRÈS lecture)
  acknowledgedAt  DateTime?                          // horodatage de l'accusé procureur (≠ moment du signalement)
  status          WhistleStatus  @default(RECEIVED)

  @@index([classificationBucket, severityBucket])
  @@index([status])
  @@map("whistleblower_reports")
}

/// Schéma cryptographique utilisé pour sceller le signalement (traçabilité + migration de clé).
enum WhistleCipherScheme {
  SEALED_BOX_X25519    // libsodium crypto_box_seal : X25519 + XSalsa20-Poly1305 (recommandé borne)
  RSA_OAEP_4096        // Vault Transit rsa-4096, padding OAEP SHA-256 (variante HSM/Vault)
}

/// Buckets GROSSIERS de classification stockés en clair (anti-corrélation). La classe BERT fine
/// (6 valeurs de WhistleClassification) reste DANS le ciphertext, lisible du seul procureur.
enum WhistleClassBucket {
  FINANCIAL_OR_POWER   // regroupe CORRUPTION_FINANCIAL + ABUSE_OF_POWER
  FRAUD_OR_LEAK        // regroupe IDENTITY_FRAUD + DATA_LEAK
  OTHER_BUCKET         // regroupe HARASSMENT + OTHER
}

/// Buckets GROSSIERS de severité (2 niveaux au lieu de 4) pour réduire l'entropie identifiante.
enum WhistleSeverityBucket {
  LOW_MED              // regroupe LOW + MEDIUM
  HIGH_CRIT            // regroupe HIGH + CRITICAL
}

/// Classification FINE (sortie BERT). N'EST PLUS une colonne en clair : elle vit DANS le payload
/// chiffré (lisible du seul procureur). Conservée comme type partagé borne/procureur.
enum WhistleClassification {
  CORRUPTION_FINANCIAL
  ABUSE_OF_POWER
  IDENTITY_FRAUD
  DATA_LEAK
  HARASSMENT
  OTHER
}

/// Severité FINE. Idem : transportée DANS le ciphertext, pas stockée en clair (anti-corrélation).
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

**Entraînement** : sur audit_logs des 12 derniers mois, label = jour ayant donné lieu à un
signalement fondé.

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

> 💡 **Fine-tuning** : on alimente le modèle avec un dataset synthétique de ~5 000 signalements
> pré-annotés (en français + bambara translittéré), généré algorithmiquement à partir de templates
> métier. Pas de leak de vraies données NINA.

---

### Étape 4.5 — Workflow lanceur d'alerte : chiffrement asymétrique RÉEL (correctif P0)

> ⚠️ **Ce que la v1.0 faisait de FAUX** (ne pas reproduire) :
>
> 1. Elle appelait `transit/encrypt/sigac-whistleblower` sur une clé **`ed25519`** → impossible :
>    Ed25519 ne chiffre pas, Vault renvoie `unsupported operation`. **Aucune confidentialité.**
> 2. Le chiffrement se faisait **côté serveur**, avec le **plaintext envoyé au serveur** → le
>    serveur (et tout admin/log/dump réseau) voyait le contenu en clair avant chiffrement. Faux
>    modèle de menace : on protège contre l'admin DB, pas contre l'admin DB.
> 3. Elle utilisait un **`VAULT_TOKEN` long-lived** en variable d'environnement → secret statique
>    fuyable, jamais renouvelé. Interdit (cf. conventions sécurité repo + ADR-034).
>
> **Principe corrigé** : le scellement se fait **sur la borne / passerelle USSD** (le « client »),
> avec la **clé publique** du procureur diffusée publiquement. Le serveur ne reçoit **que** le
> ciphertext. Deux schémas au choix (voir ADR-034) :
>
> - **Recommandé — Sealed box libsodium** (X25519 + XSalsa20-Poly1305). La borne génère une paire
>   X25519 **éphémère**, dérive un secret partagé avec la clé publique du procureur, chiffre, puis
>   **jette** sa clé privée éphémère. Personne — pas même la borne après coup — ne peut
>   redéchiffrer.
> - **Variante — RSA-OAEP** (clé Vault Transit **`rsa-4096`**, padding OAEP SHA-256) : utile si la
>   clé privée doit vivre dans un HSM/Vault plutôt que sur papier. **Type `rsa-4096`, jamais
>   `ed25519`.**

**Module de scellement client (à embarquer sur la borne / dans le `ussd-service`)** :

```python
# services/anticorruption-service/app/whistleblower/seal_client.py
#
# CE CODE TOURNE CÔTÉ "CLIENT" (borne USSD / passerelle), PAS sur le serveur de stockage.
# Objectif : produire un ciphertext que SEUL le procureur (clé privée) pourra ouvrir.
# Le serveur de stockage ne détient QUE la clé publique → il ne peut jamais déchiffrer.
#
# Dépendance : PyNaCl (binding libsodium). `pip install pynacl==1.5.*`

from __future__ import annotations

import base64
import json
from dataclasses import dataclass

from nacl.public import PublicKey, SealedBox  # libsodium crypto_box_seal


@dataclass(frozen=True)
class SealedReport:
    """Résultat du scellement, prêt à être POSTé au serveur (qui ne voit que ça)."""

    ciphertext_b64: str  # sealed box base64 — INDÉCHIFFRABLE sans la clé privée procureur
    cipher_kid: str      # version de la clé publique procureur utilisée (rotation/traçabilité)
    scheme: str          # "SEALED_BOX_X25519" (cf. enum Prisma WhistleCipherScheme)


def seal_report(
    plaintext_message: str,
    fine_classification: str,
    fine_severity: str,
    prosecutor_pubkey_b64: str,
    cipher_kid: str,
) -> SealedReport:
    """
    Scelle un signalement de lanceur d'alerte AVEC LA CLÉ PUBLIQUE DU PROCUREUR.

    POURQUOI cette fonction vit côté borne et pas côté serveur ?
        Parce que le plaintext ne doit JAMAIS transiter ni résider sur le serveur de
        stockage. Une sealed box libsodium (crypto_box_seal) génère une paire X25519
        ÉPHÉMÈRE à chaque appel, chiffre, puis détruit la clé privée éphémère : même la
        borne ne peut pas redéchiffrer après coup. Seul le détenteur de la clé privée
        procureur (hors-ligne / HSM) peut ouvrir le message.

    POURQUOI mettre la classification/severité FINES dans le payload chiffré ?
        Parce qu'elles sont identifiantes par recoupement. Le serveur ne stocke en clair
        que des BUCKETS grossiers (cf. bucketize_*). La vérité fine ne sert qu'au procureur
        après déchiffrement.

    Args:
        plaintext_message:      le texte brut du signalement (≤ 160 chars USSD).
        fine_classification:    la classe BERT précise (ex. "CORRUPTION_FINANCIAL").
        fine_severity:          la severité précise (ex. "CRITICAL").
        prosecutor_pubkey_b64:  clé PUBLIQUE X25519 du procureur, encodée base64. Publiée
                                largement (affichée en CTDEC, site OCLEI, etc.). PAS un secret.
        cipher_kid:             identifiant de version de cette clé publique (ex. "proc-x25519-v2").

    Returns:
        SealedReport — uniquement du ciphertext + métadonnées de clé. Aucune donnée en clair.

    Raises:
        ValueError: si la clé publique fournie n'a pas la longueur X25519 attendue (32 octets).
    """
    # 1) Reconstituer l'objet clé publique X25519 du procureur depuis sa forme base64.
    pubkey_raw = base64.b64decode(prosecutor_pubkey_b64)
    if len(pubkey_raw) != 32:
        # Garde-fou : une clé Ed25519 fait aussi 32 octets MAIS n'est PAS une clé d'échange.
        # On documente le risque ; la vraie défense est la séparation des clés côté Vault.
        raise ValueError("Clé publique X25519 invalide (32 octets attendus).")
    prosecutor_pubkey = PublicKey(pubkey_raw)

    # 2) Construire le payload SENSIBLE qui restera caché du serveur :
    #    message + classification/severité FINES. (Buckets grossiers seulement en clair côté DB.)
    payload = json.dumps(
        {
            "message": plaintext_message,
            "classification": fine_classification,
            "severity": fine_severity,
            # NB : volontairement PAS de timestamp précis, PAS de numéro, PAS d'IP ici non plus.
        },
        ensure_ascii=False,
    ).encode("utf-8")

    # 3) Sceller : SealedBox génère en interne une paire X25519 éphémère, fait l'échange
    #    Diffie-Hellman avec la clé publique procureur, chiffre via XSalsa20-Poly1305
    #    (la construction NaCl "box" classique de crypto_box_seal — PAS XChaCha20),
    #    puis jette la clé privée éphémère. -> "anonymous public-key encryption".
    sealed = SealedBox(prosecutor_pubkey).encrypt(payload)

    return SealedReport(
        ciphertext_b64=base64.b64encode(sealed).decode("ascii"),
        cipher_kid=cipher_kid,
        scheme="SEALED_BOX_X25519",
    )
```

**Variante RSA-OAEP via Vault Transit (`rsa-4096`)** — si la clé privée doit rester dans Vault/HSM
plutôt que sur papier. On chiffre toujours avec la **clé publique** ; on n'envoie **jamais** le
plaintext au serveur de stockage, et **jamais** de `VAULT_TOKEN` long-lived :

```python
# services/anticorruption-service/app/whistleblower/seal_vault_rsa.py
#
# Variante : la borne récupère UNE FOIS la clé PUBLIQUE rsa-4096 exportée de Vault Transit
# (endpoint /transit/keys/.../public, lecture publique), puis chiffre LOCALEMENT en RSA-OAEP.
# Aucune clé privée, aucun VAULT_TOKEN ne quitte Vault. Le déchiffrement (procureur) appelle
# transit/decrypt avec un token COURT obtenu par AppRole — voir note plus bas.

import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


def seal_report_rsa_oaep(plaintext_payload: bytes, prosecutor_rsa_pubkey_pem: bytes) -> str:
    """
    Chiffre un payload avec la clé PUBLIQUE rsa-4096 du procureur (RSA-OAEP SHA-256).

    POURQUOI RSA-OAEP et pas RSA brut (PKCS#1 v1.5) ?
        OAEP ajoute un padding aléatoire prouvé sûr contre les attaques à chiffré choisi ;
        PKCS#1 v1.5 est vulnérable (Bleichenbacher). On exige donc OAEP.

    POURQUOI type Vault `rsa-4096` et JAMAIS `ed25519` ?
        Vault Transit ne fait du chiffrement qu'avec des clés RSA (rsa-2048/3072/4096) ou
        AES. Une clé `ed25519` ne sert qu'à SIGNER ; `transit/encrypt` la refuse. RSA-4096
        donne ~128 bits de sécurité, conforme aux conventions repo (RSA-3072 mini).

    Args:
        plaintext_payload:          payload sérialisé (message + classif fine), en octets.
        prosecutor_rsa_pubkey_pem:  clé PUBLIQUE rsa-4096 du procureur au format PEM (exportée
                                    une fois de Vault, diffusable — ce n'est PAS un secret).

    Returns:
        Le ciphertext encodé base64 (à stocker tel quel ; déchiffrable du seul procureur).
    """
    # Charger la clé publique RSA depuis sa forme PEM (texte lisible, non secret).
    public_key = serialization.load_pem_public_key(prosecutor_rsa_pubkey_pem)

    # Chiffrer en RSA-OAEP avec MGF1/SHA-256 (padding aléatoire => même message => ciphertext différent).
    ciphertext = public_key.encrypt(
        plaintext_payload,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ciphertext).decode("ascii")
```

> 🔑 **Auth Vault SANS `VAULT_TOKEN` long-lived** (correctif P0). Le **déchiffrement** (côté
> procureur uniquement) s'authentifie à Vault via **AppRole** (ou ServiceAccount Kubernetes en prod
> K3s), pas via un token statique. Le `role_id` est non-secret ; le `secret_id` est à usage unique /
> TTL court ; le token de session obtenu a un **lease court** renouvelé automatiquement (cf.
> ADR-034). On ne met **jamais** `VAULT_TOKEN` dans `.env`, l'image Docker ou les manifests.
>
> ```powershell
> # PowerShell — login AppRole du poste procureur, token de lease court (jamais persisté)
> # $RoleId est diffusable ; $SecretId est éphémère (généré juste avant, TTL 90s, use_limit=1)
> $login = vault write -format=json auth/approle/login `
>   role_id=$Env:SIGAC_PROC_ROLE_ID secret_id=$SecretId | ConvertFrom-Json
> # On exporte le token pour la SEULE durée de la session de déchiffrement, puis on le révoque.
> $Env:VAULT_TOKEN = $login.auth.client_token
> # ... déchiffrement ...  puis :
> vault token revoke -self    # le token ne survit pas à la session
> ```

**Recovery M-of-N (Shamir) de la clé privée procureur** — un procureur peut être empêché, muté ou
décédé. Sans secours, **tous les signalements deviennent illisibles à jamais** (perte de preuve). On
scinde donc la clé privée en **5 parts**, dont **3 suffisent** à la reconstituer, confiées à des
gardiens distincts (président OCLEI, magistrat tutélaire, notaire, etc.) :

```powershell
# PowerShell — scinder la clé privée procureur en 5 parts, seuil de reconstitution = 3.
# POURQUOI 3-of-5 ? Aucun gardien seul (ni même 2) ne peut lire les signalements (anti-abus),
# mais la perte/absence de 2 gardiens n'empêche pas la reconstitution (résilience).
# La clé privée n'est JAMAIS écrite en clair sur disque : on la pipe directement au split.

# 1) Récupérer / générer la clé privée procureur HORS Vault-de-prod (cérémonie air-gapped).
#    (Génération sur poste air-gapped, jamais sur un serveur exposé.)

# 2) Scinder en parts Shamir avec un VRAI outil de Secret Sharing autonome.
#    ⚠️ PIÈGE : `vault operator generate-root` / `operator rekey` ne servent QU'À reconstituer le
#    root token / la clé d'unseal de VAULT LUI-MÊME. Le Shamir intégré de Vault NE SAIT PAS scinder
#    une clé applicative externe (X25519/RSA du procureur) : il ne produit donc PAS proc_key.share*.
#    On utilise un outil SSS dédié, ex. `ssss` (Shamir's Secret Sharing Scheme, paquet `ssss`) :
#
#    # ssss-split lit le secret sur stdin ; -t 3 = seuil de reconstitution, -n 5 = nombre de parts.
#    # La clé privée procureur (base64) est piped directement, jamais écrite en clair sur disque.
base64 -w0 proc_key_private.raw | ssss-split -t 3 -n 5 -w proc_key > proc_key.shares
#    # -> 5 lignes "proc_key-1-..." ... "proc_key-5-...". On les répartit en 5 fichiers parts :
#    awk 'NR==1{print > "proc_key.share1"} ... NR==5{print > "proc_key.share5"}' proc_key.shares
#    # Reconstitution (≥ 3 parts) : `cat share1 share3 share5 | ssss-combine -t 3 | base64 -d`.
#    # Équivalent souverain pur-libsodium possible via la lib `sss` (Daan Sprenkels) si l'on préfère
#    # une dépendance auditable plutôt que le binaire `ssss` — documenter le choix dans l'ADR-034.

# 3) Distribuer 1 part par gardien (canaux séparés, jamais regroupées sur une même machine).
# 4) Détruire la copie complète en clair après split (shred).
```

> 🛡️ **Cérémonie documentée** dans `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` : qui sont les 5 gardiens,
> où sont stockées les parts (coffres physiques séparés), procédure de reconstitution sous contrôle
> judiciaire, journalisation de chaque reconstitution (audit Merkle ADR-014).

**Endpoint USSD (intégré dans `ussd-service`, cf. doc 14)** — le scellement se fait **sur la
borne**, le serveur ne reçoit que du ciphertext + buckets grossiers :

```ts
// services/ussd-service/src/menus/alerte.menu.ts
//
// IMPORTANT : la classification BERT et le scellement se font sur la borne / passerelle.
// Le service de stockage ne reçoit JAMAIS le texte en clair, seulement le ciphertext.
async function handleAlerteMenu(session: UssdSession, input: string): Promise<UssdResponse> {
  // L'utilisateur saisit son message (max 160 chars USSD).
  if (input.length > 160 || input.length < 10) {
    return { type: 'END', text: 'Message invalide. Min 10, max 160 caractères.' };
  }

  // 1) Classification BERT — exécutée DANS l'enclave borne (ou service local), pas dans le store.
  //    On en dérive immédiatement des BUCKETS grossiers (anti-corrélation), la classe fine
  //    précise partira chiffrée dans le ciphertext.
  const classified = await localClassifier.classify(input); // { label, severity }
  const classBucket = bucketizeClassification(classified.label); // FINANCIAL_OR_POWER | ...
  const sevBucket = bucketizeSeverity(classified.severity); // LOW_MED | HIGH_CRIT

  // 2) Scellement asymétrique RÉEL avec la CLÉ PUBLIQUE du procureur (sealed box X25519).
  //    `sealReport` appelle le module Python seal_client (ou un binding libsodium natif borne).
  //    Le plaintext NE quitte JAMAIS la borne en clair.
  const { ciphertextB64, cipherKid, scheme } = await sealReport({
    message: input,
    fineClassification: classified.label,
    fineSeverity: classified.severity,
  });

  // 3) Stockage : on n'envoie au serveur QUE du ciphertext + buckets + le JOUR (pas l'heure).
  //    PAS de numéro, PAS d'IP, PAS de correlation-id, PAS de timestamp précis.
  await sigacClient.storeReport({
    id: crypto.randomUUID(), // uuid v4 non corrélable
    ciphertext: ciphertextB64,
    scheme, // "SEALED_BOX_X25519"
    cipherKid,
    classificationBucket: classBucket,
    severityBucket: sevBucket,
    receivedDay: new Date().toISOString().slice(0, 10), // YYYY-MM-DD seulement
  });

  return {
    type: 'END',
    // shortId = préfixe non-réversible (hash tronqué) juste pour que le citoyen note une référence.
    text: `Signalement reçu. Réf: ${shortId}. Le procureur sera notifié. Merci pour votre vigilance citoyenne.`,
  };
}
```

> 🔒 **Garanties de confidentialité (résumé)** :
>
> - **Contenu** : illisible du serveur (chiffré pour la seule clé privée procureur).
> - **Identité** : ni numéro, ni IP, ni correlation-id ; UUID v4 aléatoire ; notre périmètre ne
>   stocke jamais le numéro du signaleur.
> - **Métadonnées** : classification/severité **bucketisées** (2 niveaux, 3 classes), **jour** sans
>   heure → réduit l'entropie permettant de recouper « qui était là à quelle minute ».
> - **Logs internes** : `LOG_REDACT_PII=true` (cf. doc 17) ; le plaintext n'existe nulle part côté
>   serveur, donc rien à rédiger sur ce chemin.
>
> ⚠️ **RISQUE RÉSIDUEL DE DÉSANONYMISATION — opérateur USSD tiers (à NE PAS sous-estimer)** : Le
> canal `*123*ALERTE#` transite par **Africa's Talking**, un agrégateur USSD **étranger** (hors
> AES). Même si NINA ne stocke jamais le numéro, **l'opérateur, lui, voit et conserve le MSISDN du
> signaleur** (CDR de facturation/routage), associé à l'horodatage précis de la session. C'est un
> **point de désanonymisation hors de notre contrôle** sur le chemin critique lanceur d'alerte : une
> réquisition judiciaire, une fuite ou une coopération de l'opérateur peut relier un signalement à
> un numéro. **Mitigation de souveraineté visée** (cf. ADR-034) : router `*123*ALERTE#` via un
> **agrégateur USSD national** ou un **SMSC/USSD-GW on-premise** (CTDEC / opérateur AES), de sorte
> que le MSISDN ne quitte jamais le périmètre souverain ; à défaut, ce risque est **accepté et
> documenté** comme résiduel (il NE doit pas être présenté comme « anonyme de bout en bout » tant
> que l'opérateur tiers reste sur le chemin). Voir aussi OWASP **A04** ci-dessous.

---

### Étape 4.6 — Dashboard SIGAC dans `apps/governance`

3 widgets clés :

- **Heatmap intégrité par région** : couleur = score moyen agents
- **Top 10 agents flaggés** : tableau avec drill-down sur audit_logs
- **Signalements à traiter** : queue procureur (ciphertext **non déchiffrable côté UI** — le
  navigateur n'a pas la clé privée ; on n'affiche que les **buckets** grossiers
  `classificationBucket` + `severityBucket` + le jour). Le déchiffrement réel se fait **localement**
  sur le poste procureur (clé privée hors-ligne / Shamir reconstitué), jamais dans le serveur web.

---

## 5. Validation locale

```powershell
# 1) Entraîner Isolation Forest sur données synthétiques
docker exec nina-anticorruption-service python -m app.cli train-anomaly

# 2) Test scoring agent
docker exec nina-anticorruption-service python -m app.cli score-week --week=2026-W18

# 3) Tester le canal USSD *123*ALERTE# en simulateur Africa's Talking
# Saisir "Le directeur de mon CTDEC demande de l'argent pour mon NINA"
# Vérifier que la classe FINE = CORRUPTION_FINANCIAL (dans le payload chiffré)
# et que la DB ne stocke en clair que classificationBucket=FINANCIAL_OR_POWER (anti-corrélation).

# 4a) Lecture procureur — schéma SEALED BOX X25519 (recommandé) : déchiffrement LOCAL avec la
#     clé privée procureur (reconstituée via Shamir si besoin). JAMAIS côté serveur.
#     Exemple Python (poste procureur, hors-ligne) :
#   python -c "import base64,sys; from nacl.public import PrivateKey, SealedBox; \
#     sk=PrivateKey(base64.b64decode(open('proc_x25519.key','rb').read())); \
#     print(SealedBox(sk).decrypt(base64.b64decode(sys.argv[1])).decode())" '<ciphertext-b64-from-db>'

# 4b) Lecture procureur — VARIANTE RSA-OAEP : le ciphertext en DB est du base64 BRUT RSA-OAEP
#     (produit par seal_vault_rsa.py via la clé PUBLIQUE exportée), PAS au format "vault:v1:...".
#     ⚠️ On NE PEUT donc PAS le passer à `transit/decrypt` : l'endpoint /decrypt de Vault Transit
#     n'accepte QUE son propre enveloppe "vault:vN:" (il gère en interne le versionnage de clé) et
#     rejette un blob OAEP externe avec "invalid ciphertext". Le déchiffrement se fait LOCALEMENT
#     avec la clé PRIVÉE rsa-4096 du procureur (poste hors-ligne), symétrique de l'encrypt local :
python -c "import base64,sys; \
  from cryptography.hazmat.primitives import hashes, serialization; \
  from cryptography.hazmat.primitives.asymmetric import padding; \
  sk=serialization.load_pem_private_key(open('proc_rsa4096.key','rb').read(), password=None); \
  print(sk.decrypt(base64.b64decode(sys.argv[1]), \
    padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)).decode())" \
  '<ciphertext-b64-from-db>'
#
# ALTERNATIVE (si l'on veut vraiment garder la clé privée DANS Vault/HSM) : il faut alors chiffrer
# AUSSI via Vault — remplacer, dans seal_vault_rsa.py, l'encrypt local `cryptography` par un appel
# `transit/encrypt/sigac-whistleblower-rsa` (qui produit un ciphertext "vault:v1:..."), et SEULEMENT
# dans ce cas le `vault read transit/decrypt/... ciphertext="vault:v1:..."` redevient valide.
# encrypt et decrypt DOIVENT rester du même côté (les deux locaux, OU les deux via Vault).

# 5) Vérifier qu'AUCUN plaintext n'a jamais touché le serveur de stockage :
#    grep le journal du store — il ne doit y avoir QUE des ciphertext/buckets, jamais de message clair.

# 6) Dashboard (n'affiche que des buckets, jamais de contenu déchiffré)
curl https://localhost:3010/sigac/dashboard | jq .
```

---

## 6. Pièges courants & dépannage

| Symptôme                                         | Cause probable                                              | Solution                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Isolation Forest flagge trop d'agents (>10 %)    | Contamination trop élevée                                   | Baisser `contamination=0.01` ; re-fitter                                                        |
| LSTM ne converge pas                             | Séries trop courtes (< 30 jours)                            | Padding + masking ; ou attendre 60+ jours de données                                            |
| BERT mauvaise classif sur bambara                | Modèle fine-tuné insuffisamment                             | Ajouter 1k exemples bambara + ré-entraîner                                                      |
| `unsupported operation` à l'`encrypt`            | Clé Vault de type `ed25519` (signature)                     | **Recréer une clé `rsa-4096`** (ou passer en sealed box X25519) ; Ed25519 ≠ chiffrement         |
| Procureur ne peut pas déchiffrer                 | Mauvaise version clé (`cipherKid`) ou part Shamir manquante | Identifier `cipherKid` → bonne version ; réunir ≥ 3 parts Shamir                                |
| `VAULT_TOKEN` en clair détecté dans `.env`/image | Reste de la v1.0 (token long-lived)                         | **Supprimer** ; passer à AppRole/K8s SA, lease court (cf. ADR-034)                              |
| Signaleur ré-identifiable malgré chiffrement     | Métadonnées trop fines (heure, IP, corr-id)                 | Bucketiser severité/classif, stocker le **jour** seul, retirer IP/corr-id                       |
| Numéro téléphone leaké dans logs                 | Logger pas configuré redact (cf. doc 17)                    | Vérifier `LOG_REDACT_PII=true` + tester logger ; le plaintext ne doit jamais atteindre le store |
| Score intégrité = 0 pour un agent inactif        | Pas de features cette semaine                               | Marquer comme "INSUFFICIENT_DATA" plutôt que 0                                                  |
| MLflow ne stocke pas le modèle                   | URI tracking pas configurée                                 | `export MLFLOW_TRACKING_URI=http://mlflow.observability`                                        |
| Volume signalements > 1000/jour                  | Spam / attaque DDoS USSD                                    | Rate limit côté Africa's Talking + alerte                                                       |
| BERT lent (> 5s par classif)                     | Pas de GPU disponible                                       | Quantization int8 + batch inference                                                             |

---

## 6 bis. Sécurité, équité et droits (correctifs P0/P1)

### 6 bis.1 — Mapping OWASP Top 10 2021 (appliqué à SIGAC)

> Aligné sur `15-SECURITY-HARDENING.md` §4.5 et l'ADR sécurité dédié
> `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md`. On distingue **conçu** (spécifié ici)
> et **implémenté** (réellement codé) — voir colonne « État ».

| OWASP Top 10:2021                  | Risque SIGAC concret                                                                                                                     | Mesure                                                                                                                                                                                                                               | État                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| A01 Broken Access Control          | Un agent lit les scores d'un autre / accède aux signalements                                                                             | RBAC `@Roles(INSPECTOR, PROSECUTOR)` ; dashboard réservé ; `whistleblower_reports` non lisible hors procureur                                                                                                                        | Conçu                                             |
| A02 Cryptographic Failures         | **Faux chiffrement Ed25519 (v1.0) → zéro confidentialité**                                                                               | **Corrigé v1.1** : sealed box X25519 / RSA-OAEP `rsa-4096`, scellement client-side, TLS 1.3 transit                                                                                                                                  | Conçu                                             |
| A03 Injection                      | Texte de signalement malveillant vers BERT / DB                                                                                          | Payload traité comme données (jamais évalué), Prisma paramétré, validation longueur USSD                                                                                                                                             | Conçu                                             |
| A04 Insecure Design                | Désanonymisation par corrélation de métadonnées **+ MSISDN retenu par l'opérateur USSD tiers (Africa's Talking)** sur le chemin critique | Bucketisation classif/severité, jour sans heure, ni IP ni corr-id ; threat model whistleblower. **Risque résiduel opérateur** : viser un agrégateur USSD national / SMSC on-prem (cf. §4.5 + ADR-034), sinon **accepté & documenté** | Conçu (mitigation souveraine **non implémentée**) |
| A05 Security Misconfiguration      | `VAULT_TOKEN` long-lived dans l'env                                                                                                      | **Corrigé v1.1** : AppRole/K8s SA, lease court, token jamais persisté                                                                                                                                                                | Conçu                                             |
| A06 Vulnerable Components          | PyTorch/Transformers/PyNaCl vulnérables                                                                                                  | Trivy + `pip-audit` + Bandit (cf. doc 15), pinning de versions                                                                                                                                                                       | Conçu                                             |
| A07 Identification & Auth Failures | Usurpation du poste procureur                                                                                                            | MFA TOTP procureur + AppRole + Shamir 3-of-5 pour la clé privée                                                                                                                                                                      | Conçu                                             |
| A08 Software & Data Integrity      | Altération d'un score/signalement par agent corrompu                                                                                     | Audit Merkle ADR-014 sur `integrity_scores` ; `whistleblower_reports` append-only                                                                                                                                                    | Conçu                                             |
| A09 Logging & Monitoring           | Fuite du plaintext ou du numéro dans les logs                                                                                            | `LOG_REDACT_PII=true` ; **le plaintext n'atteint jamais le serveur** → rien à logger                                                                                                                                                 | Conçu                                             |
| A10 SSRF                           | USSD/borne pousse une URL arbitraire au service                                                                                          | Pas de fetch server-side d'URL utilisateur ; allow-list Africa's Talking                                                                                                                                                             | Conçu                                             |

> 🟠 **Honnêteté** : à la date de ce document, **aucun** de ces contrôles n'est encore
> **implémenté** dans `anticorruption-service` (scaffold seul). Le présent document décrit la
> **conception cible**. Ne pas présenter SIGAC comme « sécurisé » tant que les tests E2E
> confidentialité (cf. §5 étape 5) et le pen-test du module whistleblower (cf. §10) ne sont pas
> verts.

### 6 bis.2 — Model Cards (biais / fairness par langue nationale)

> Chaque modèle livre une **Model Card** (`docs/sigac/MODEL-CARDS.md`). On résume ici l'essentiel,
> avec l'axe d'équité **non négociable** pour le Mali/AES : la **langue nationale** du signalement
> ne doit pas dégrader la prise en charge. Sous-représenter le bambara/peul/songhaï/tamasheq
> reviendrait à **moins bien protéger** les locuteurs de ces langues — un biais inacceptable pour un
> service anti-corruption d'État.

#### Model Card — BERT / AfroXLMR (classification des signalements)

- **Tâche** : classer un signalement en 6 classes (CORRUPTION_FINANCIAL … OTHER).
- **Données d'entraînement** : ~5 000 signalements **synthétiques** (templates métier), répartis par
  langue. **Cible de parité** : chaque langue nationale doit représenter une part suffisante du
  corpus (objectif ≥ 15 % chacune pour bambara/peul, ≥ 10 % songhaï/tamasheq, le reste en français).
- **Métriques d'équité (à mesurer et publier)** :

  | Langue                 | F1 macro cible | Écart toléré vs français |
  | ---------------------- | -------------- | ------------------------ |
  | Français               | référence      | —                        |
  | Bambara (translittéré) | ≥ 0.80         | ≤ 0.08 absolu            |
  | Peul / Fulfulde        | ≥ 0.78         | ≤ 0.10 absolu            |
  | Songhaï                | ≥ 0.75         | ≤ 0.12 absolu            |
  | Tamasheq               | ≥ 0.72         | ≤ 0.15 absolu            |

  > **Règle de gouvernance** : si l'écart de F1 d'une langue dépasse le seuil toléré, le modèle est
  > **refusé en production** jusqu'à rééquilibrage du corpus (cf. §6 « BERT mauvaise classif »).

- **Biais connus / limites** :
  - Le bambara écrit varie fortement (orthographe non standardisée, translittération) → risque de
    sous-classification. Mitigation : augmentation de données + normalisation orthographique.
  - Un signalement très court (USSD ≤ 160 chars) porte peu de signal → tendance à sur-classer en
    `OTHER`. La classe `OTHER` **n'enterre jamais** un signalement : tout signalement est mis en
    file procureur quelle que soit la classe.
  - **Usage interdit** : la sortie BERT ne déclenche **aucune** sanction automatique ; elle ne sert
    qu'au **tri** de la file procureur (la classe fine reste chiffrée).

#### Model Card — Isolation Forest (anomalie agents)

- **Tâche** : flagger des agents au comportement atypique (PAS « détecter la corruption »).
- **Équité** : les features ne doivent contenir **aucun proxy ethnique/régional discriminant**. Le
  facteur `cross_region_actions` doit être **normalisé par le rôle légitime** de l'agent (un agent
  mobile multi-régions ne doit pas être pénalisé). Documenter le taux de faux positifs **par
  région** pour détecter un biais géographique.
- **Limite** : `contamination=0.02` est un a priori, pas une vérité terrain. Un score élevé = motif
  d'**enquête humaine OCLEI**, jamais une preuve.

#### Model Card — LSTM (séries temporelles)

- **Tâche** : probabilité qu'une journée soit anormale.
- **Limite** : label « jour ayant donné lieu à un signalement fondé » est **rare et bruité** →
  risque de sur-apprentissage. AUC à interpréter avec prudence ; pas de décision automatique.

### 6 bis.3 — Droit de contestation RGPD (décision automatisée — art. 22)

> **POURQUOI** : un score d'intégrité ou un flag d'anomalie est une **décision fondée sur un
> traitement automatisé** au sens RGPD-like. L'agent concerné a droit à : une **information**, une
> **explication**, une **intervention humaine** et la possibilité de **contester**. Sans cela, SIGAC
> deviendrait un outil de répression opaque — l'inverse de son but.

- **Information** : chaque agent est informé (à l'embauche + rappel annuel) qu'un scoring
  d'intégrité automatisé existe, de ses facteurs et de ses finalités.
- **Explication** : un agent flaggé reçoit la **décomposition par facteur** (anomalie, audit,
  signalements, feedback, formation) — pas une simple note opaque.
- **Intervention humaine** : aucun flag ne déclenche de sanction **sans** revue par un inspecteur
  OCLEI **humain** ; le ML ne fait que **cibler** l'enquête.
- **Contestation** : canal formel `POST /sigac/integrity-scores/{id}/dispute` (réservé à l'agent
  concerné, authentifié), traçé en audit Merkle ; gel du flag pendant l'examen du recours.

```python
# services/anticorruption-service/app/api/dispute.py
# Endpoint de CONTESTATION d'un score (droit RGPD art. 22). Auth OBLIGATOIRE : l'agent ne peut
# contester QUE son propre score (vérif d'identité), jamais celui d'un autre.
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter()


@router.post("/integrity-scores/{score_id}/dispute", status_code=201)
async def dispute_integrity_score(
    score_id: int,
    reason: str,
    current_agent=Depends(require_authenticated_agent),  # JWT signé RS256 ou EdDSA (Ed25519 en SIGNATURE, pas chiffrement), rôle AGENT
):
    """
    Ouvre une contestation d'un score d'intégrité automatisé (RGPD art. 22).

    POURQUOI auth stricte : empêcher qu'un agent conteste/altère le dossier d'un collègue.
    POURQUOI on n'efface pas le score : la contestation suspend l'EFFET (gel du flag) mais
        conserve la trace (audit Merkle) ; un humain OCLEI tranche.

    Args:
        score_id:       identifiant du score contesté.
        reason:         motivation écrite de l'agent (max 2000 chars).
        current_agent:  agent authentifié (injecté par le guard) — doit être le titulaire du score.

    Raises:
        HTTPException 403: si l'agent tente de contester un score qui n'est pas le sien.
    """
    score = await get_score_or_404(score_id)
    if score.user_id != current_agent.id:
        # Sécurité par défaut : refus d'accès transverse.
        raise HTTPException(status_code=403, detail="Vous ne pouvez contester que votre propre score.")

    await open_dispute(score_id=score_id, agent_id=current_agent.id, reason=reason)
    await freeze_flag_pending_review(score_id)          # gèle l'effet du flag
    await audit_merkle_append("integrity_score.disputed", score_id, current_agent.id)  # ADR-014
    return {"status": "DISPUTE_OPENED", "score_id": score_id}
```

---

## 7. Documentation à produire

- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md`
- `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` — **à référencer** (sealed box X25519 /
  RSA-OAEP, AppRole sans token long-lived, mTLS, mapping OWASP) — base sécurité commune.
- `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` — engagement éthique + procédure procureur + **cérémonie
  Shamir 3-of-5** (gardiens, coffres, reconstitution sous contrôle judiciaire).
- `docs/sigac/MODEL-CARDS.md` — fiches modèles : data, **biais/fairness par langue nationale**
  (seuils F1 par langue), limitations, usages interdits.
- `docs/sigac/SCORING-RUNBOOK.md` — comment interpréter un score + **procédure de contestation
  RGPD**.
- Mise à jour `docs/CHANGELOG.md` §21.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc D SIGAC — JJ/MM/2026

- Isolation Forest : ✅ trained, F1=0.78 sur dataset test
- LSTM : ✅ AUC=0.85
- BERT/AfroXLMR : ✅ accuracy 89 % global — détail par langue : fr 0.91 / bambara 0.81 / peul 0.79
- Équité langues : ✅ tous les écarts F1 sous le seuil toléré (sinon : 🚫 bloquer la mise en prod)
- Whistleblower chiffrement : ✅ sealed box X25519 (PAS Ed25519) — E2E test vert, plaintext jamais
  côté serveur
- Recovery Shamir 3-of-5 : ✅ reconstitution testée avec 3 gardiens
- Aucun `VAULT_TOKEN` long-lived : ✅ AppRole/lease court seulement
- Anti-corrélation : ✅ buckets + jour sans heure, ni IP ni corr-id
- USSD *123*ALERTE# : ✅ Africa's Talking sandbox OK
- Dashboard SIGAC : ✅ 3 widgets fonctionnels (buckets seulement, jamais de contenu déchiffré)
```

---

## 9. Checklist de fin d'étape

- [ ] Migration Prisma `sigac` (2 tables + 7 enums : classification/severité fines + buckets +
      scheme + status)
- [ ] Isolation Forest entraîné + enregistré MLflow
- [ ] LSTM PyTorch entraîné sur 12 mois audit_logs
- [ ] BERT/AfroXLMR fine-tuné sur dataset synthétique 5k signalements
- [ ] **Équité par langue mesurée** : écart F1 par langue nationale sous le seuil toléré (sinon
      bloquer)
- [ ] Endpoint USSD `*123*ALERTE#` opérationnel + numéro téléphone non logué
- [ ] **Chiffrement asymétrique RÉEL** : sealed box X25519 (ou RSA-OAEP `rsa-4096`) — **PAS
      Ed25519**
- [ ] **Scellement côté borne** : plaintext jamais reçu/stocké/loggé par le serveur (test E2E vert)
- [ ] **Anti-corrélation** : buckets classif/severité + jour sans heure + ni IP ni numéro ni corr-id
- [ ] **Aucun `VAULT_TOKEN` long-lived** : AppRole/K8s SA + lease court (vérifié en
      `.env`/image/manifests)
- [ ] **Recovery Shamir 3-of-5** de la clé privée procureur (cérémonie documentée + reconstitution
      testée)
- [ ] Cron Celery hebdo scoring agents
- [ ] Dashboard SIGAC dans `apps/governance` (réservé INSPECTOR/PROSECUTOR ; buckets seulement)
- [ ] **Endpoint de contestation RGPD** `POST /sigac/integrity-scores/{id}/dispute` (auth agent, gel
      du flag)
- [ ] `WHISTLEBLOWER-PROTOCOL.md` rédigé (engagement éthique + cérémonie Shamir)
- [ ] `MODEL-CARDS.md` rédigés pour les 3 modèles (avec biais/fairness par langue + usages
      interdits)
- [ ] Mapping **OWASP Top 10 2021** revu (cf. §6 bis.1) + ADR-034 référencé
- [ ] Audit Merkle sur `integrity_scores` (immutabilité)
- [ ] `ADR-023` rédigé ; `ADR-034` (sécurité) référencé
- [ ] `docs/CHANGELOG.md` §21 mis à jour
- [ ] Tag Git `sigac-mvp` posé
- [ ] Commit :
      `feat(sigac): Isolation Forest + LSTM + BERT + whistleblower (sealed box X25519) + ADR-023`

---

## 10. Pour aller plus loin

- **Graph Neural Networks** : modéliser le réseau « qui valide qui » via PyTorch Geometric —
  détecter les clans de collusion.
- **Differential privacy** sur les scores d'intégrité agrégés exposés publiquement (transparence
  sans rendre l'individu identifiable).
- **Procédure de recours agent** : un agent flaggé doit avoir un canal formel pour contester son
  score (cf. RGPD article 22 droit à l'explication des décisions automatisées).
- **Pen-test du module whistleblower** : audit indépendant pour valider (1) que le ciphertext est
  bien indéchiffrable sans la clé privée procureur, (2) que **l'identité du signaleur est impossible
  à retrouver par corrélation de métadonnées** (buckets, jour, absence d'IP/numéro/corr-id), (3)
  qu'aucun chemin ne fait transiter le plaintext par le serveur. Inclure un test de **non-régression
  cryptographique** : échec attendu si quelqu'un re-câble une clé `ed25519` sur `transit/encrypt`.

---

_Document 23 — Version 1.1 — Juin 2026 (correctif cryptographique P0 : sealed box X25519/RSA-OAEP au
lieu d'Ed25519 ; scellement client-side ; suppression VAULT_TOKEN long-lived ; anti-corrélation ;
Shamir 3-of-5 ; Model Cards équité langues ; contestation RGPD ; mapping OWASP)._ _NINA-AES Platform
— UQAR — CONFIDENTIEL_
