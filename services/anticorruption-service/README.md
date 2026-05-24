# `@nina-aes/anticorruption-service`

> **Port** : 3009 **Stack** : Python 3.14 · FastAPI · scikit-learn (Isolation Forest) · PyTorch
> (LSTM) · transformers (BERT multilingue) **Statut** : Scaffold vide (uniquement `pyproject.toml` +
> `requirements.txt`) **Référence** : `docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`

---

## 1. Rôle

Détection d'**anomalies comportementales** dans les opérations SIGAC pour identifier les patterns
évocateurs de corruption : agent qui valide systématiquement plus vite que la moyenne, séquences de
corrections suspectes sur des NINAs voisins, accès anormaux à des dossiers sans rapport avec sa
zone, plages horaires anormales.

Modèles déployés :

- **Isolation Forest** (scikit-learn) — détection d'anomalies multidimensionnelles sur métriques
  agent.
- **LSTM** (PyTorch) — analyse temporelle des séquences d'actions agent.
- **BERT multilingue** (transformers) — analyse sémantique des commentaires de correction
  (français + langues nationales).

Consommateur RabbitMQ de l'exchange `nina.audit` — chaque évènement audité est scoré en temps réel ;
les scores anormaux sont remontés à l'agent SIGAC superviseur.

---

## 2. Endpoints

| Méthode | Chemin                            | Description                              | Auth        |
| ------- | --------------------------------- | ---------------------------------------- | ----------- |
| `GET`   | `/anticorruption/alerts`          | Alertes en cours                         | AGENT_SIGAC |
| `GET`   | `/anticorruption/score/agent/:id` | Score d'anomalie d'un agent              | AGENT_SIGAC |
| `POST`  | `/anticorruption/retrain`         | Déclenche un ré-entraînement des modèles | ADMIN       |
| `GET`   | `/health`                         | Liveness                                 | —           |

(Spec à figer au démarrage du Bloc D.)

---

## 3. Variables d'environnement

| Variable                      | Défaut       | Rôle                                     |
| ----------------------------- | ------------ | ---------------------------------------- |
| `ANTICORRUPTION_SERVICE_PORT` | `3009`       | Port d'écoute HTTP                       |
| `DATABASE_URL`                | (cf. `.env`) | Lecture des évènements audit (read-only) |
| `RABBITMQ_URL`                | (cf. `.env`) | Consumer de l'exchange `nina.audit`      |
| `MODELS_DIR`                  | `./models`   | Chemin local des modèles entraînés       |

---

## 4. Démarrer en local

```powershell
cd services/anticorruption-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Implémentation à venir : python -m uvicorn app.main:app --port 3009
```

---

## 5. Liens

- Doc canonique :
  [`docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`](../../docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md)
- Source des évènements : exchange RabbitMQ `nina.audit` (cf. [`audit-service`](../audit-service))
