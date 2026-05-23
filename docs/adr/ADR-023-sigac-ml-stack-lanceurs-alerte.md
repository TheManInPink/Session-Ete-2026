# ADR-023 — Stack SIGAC : Isolation Forest + LSTM + BERT (AfroXLMR) + chiffrement asymétrique pour lanceurs d'alerte

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [23 — Bloc D SIGAC](../23-BLOC-D-SIGAC-ANTICORRUPTION.md) **Complète** :
[ADR-004 — FastAPI](./ADR-004-fastapi.md),
[ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md),
[ADR-015 — Stack ML détection NINA errors](./ADR-015-ml-stack-detection-erreurs-nina.md)

---

## Contexte

Le Système Intégré de Gouvernance Anti-Corruption (SIGAC) couvre deux fonctions distinctes :

1. **Détection proactive d'anomalies comportementales** sur les agents CTDEC/DNEC (ex. agent qui
   valide 5× plus vite que la moyenne, agent actif majoritairement la nuit, agent qui exporte des
   listes citoyens hors de son périmètre).

2. **Réception sécurisée de signalements** (lanceurs d'alerte) avec garantie d'anonymat absolu et
   classification automatique pour priorisation par le procureur.

Trois exigences fondamentales :

- **Anonymat lanceur d'alerte non négociable** : un signaleur qui dénonce son supérieur ne doit
  JAMAIS être identifiable par admin système, DBA, ni même par le procureur sans déchiffrement
  explicite.
- **Le ML ne décide pas** : un score d'intégrité bas ne déclenche PAS une sanction. Il déclenche une
  **enquête** par l'OCLEI. Conformité RGPD article 22 (droit à l'explication, contrôle humain).
- **Souveraineté** : modèles fine-tunables localement, dataset synthétique (pas de fuite NINA
  réels), pas de cloud GPU US.

Distinction explicite avec ADR-015 (qui couvre la détection d'**erreurs** NINA — fautes de frappe,
doublons) : ADR-023 couvre la détection de **comportements** humains suspects + classification NLP
de signalements textuels. Deux pipelines distincts, deux jeux de modèles, deux sets de données.

---

## Décision

**Stack ML SIGAC en 3 modèles complémentaires** :

1. **Isolation Forest (scikit-learn 1.7)** — détection d'anomalies point-cloud sur les agents.
   - Features : 8 par agent / semaine glissante 30j (validations_count, night_activity_ratio,
     rare_endpoint_ratio, cross_region_actions, etc.)
   - Output : score 0-100 (100 = très anormal), flag si > 75.
   - **Pourquoi Isolation Forest** : algo de choix pour outlier detection unsupervised, ne demande
     pas de label. Rapide, peu d'hyperparamètres (essentiellement `contamination`).

2. **LSTM PyTorch 2.5** — analyse temporelle séquentielle.
   - Input : séquence 30 jours × 8 features par agent.
   - Output : probabilité 0-1 que la prochaine journée soit anormale.
   - **Pourquoi LSTM** : capture les patterns temporels (ex. pic d'activité chaque vendredi avant un
     week-end). Complète Isolation Forest qui est point-cloud.

3. **BERT multilingue (`Davlan/afro-xlmr-base`) fine-tuné** — classification NLP des signalements
   textuels.
   - Input : texte court (10-160 chars, contrainte USSD).
   - Output : classe (CORRUPTION_FINANCIAL, ABUSE_OF_POWER, IDENTITY_FRAUD, DATA_LEAK, HARASSMENT,
     OTHER) + severity (LOW..CRITICAL).
   - **Pourquoi AfroXLMR** : modèle pré-entraîné par David Adelani spécifiquement sur les langues
     africaines (bambara, peul, haoussa, djerma, mooré). Bien meilleur que
     `bert-base-multilingual-cased` sur ces langues.

**Workflow lanceur d'alerte chiffré** :

- Canal `*123*ALERTE#` USSD (Africa's Talking, cf. doc 14)
- Le **numéro de téléphone n'est JAMAIS enregistré** dans nos logs internes — seul Africa's Talking
  le conserve côté opérateur (pour facturation, hors de notre périmètre)
- Le message est immédiatement chiffré côté serveur avec la **clé publique Ed25519 du procureur
  désigné**, stockée dans Vault Transit
- Seul le procureur peut déchiffrer (sa clé privée n'est jamais exportée hors Vault — utilisation
  via `transit/decrypt/sigac-whistleblower`)
- Classification BERT effectuée AVANT chiffrement, sur le texte clair, puis stockée en clair (utile
  pour le tri par le procureur). Le texte reste chiffré.

**Scoring d'intégrité 5 facteurs** (calculé chaque lundi 02:00) :

```
overall_score = (
  factor_anomaly         * 0.30      // Isolation Forest
  + factor_audit         * 0.20      // exhaustivité logs audit
  + factor_reports       * 0.20      // signalements contre lui (BERT classif)
  + factor_feedback      * 0.15      // notes citoyens
  + factor_training      * 0.15      // conformité formation continue
)
```

Score < 60 → flag `flaggedForInvestigation = true` → notification inspecteur OCLEI (PAS de sanction
automatique).

**Tracking expériences via MLflow self-hosted** (Apache 2.0, pas MLflow Cloud SaaS).

---

## Conséquences positives

- **Détection multidimensionnelle** : 3 modèles complémentaires couvrent 3 angles différents (point
  cloud, série temporelle, NLP) → faible taux faux négatifs.
- **Anonymat lanceurs d'alerte mathématiquement garanti** : chiffrement asymétrique côté serveur,
  clé privée jamais exportée de Vault. Compromis serveur entier ≠ déchiffrement possible.
- **Pas de décision automatique** : le score est un signal, l'enquête est humaine. Conforme RGPD
  art. 22 + bonnes pratiques ANSSI.
- **Souveraineté ML** : AfroXLMR Hugging Face (open-source), modèles fine-tunés localement, MLflow
  self-hosted. Aucun cloud GPU US.
- **Auditable** : chaque score est versionné (`modelVersion` field), reproductible. Un score
  contesté peut être recalculé avec le modèle d'origine.
- **Performance pédagogique** : 3 algos très complémentaires (unsupervised + supervised temporal +
  transformer NLP) — excellente démo de la stack ML moderne.

---

## Conséquences négatives

- **Complexité opérationnelle** : 3 modèles à entraîner, monitorer, re-déployer. Mitigation : MLflow
  registry centralisé + Celery worker unique pour les 3.
- **Dataset signalements synthétique** : qualité limitée vs vrais signalements. Mitigation :
  ré-entraînement périodique sur les vrais signalements après 6 mois de prod (avec procureur dans la
  loop pour annoter).
- **Risque de biais** : Isolation Forest peut sur-flag les agents travaillant dans les zones rurales
  (volumes faibles = patterns perçus comme anormaux). Mitigation : segmenter par région + appliquer
  le modèle par cluster homogène.
- **Latence BERT** : ~500 ms par classif sur CPU. Acceptable pour USSD (déjà 1-2s round-trip) mais
  pas idéal. Mitigation : batch inference + quantization int8.
- **Coût rotation clé procureur** : si le procureur change ou si la clé est rotée, on doit
  ré-encrypter tous les signalements en attente d'acknowledgment. Mitigation : versioning explicite
  via `cipherKid`.
- **Vulnérabilité à empoisonnement** : un attaquant qui injecte des fausses features peut dégrader
  les modèles. Mitigation : audit Merkle sur le pipeline de training + alerting Prometheus sur les
  outliers.

---

## Note sur la souveraineté numérique

Trois mitigations :

1. **AfroXLMR Hugging Face** : modèle MIT, téléchargeable et fine-tunable hors-ligne. Hugging Face
   Hub utilisé en mirror local (`huggingface-hub-mirror` self-hosted).
2. **Datasets synthétiques** : générés algorithmiquement à partir de templates métier, jamais à
   partir de vrais signalements ou vraies données NINA. Pas de fuite de PII si modèle exposé.
3. **GPU training local** : un poste CTDEC avec une RTX 4080 (~1500 €) suffit pour fine-tuner
   AfroXLMR + entraîner LSTM. Pas besoin de cloud GPU.

Interdiction explicite : Datadog APM ML, AWS SageMaker, Google Vertex AI, Azure ML Studio. MLflow
self-hosted uniquement.

---

## Alternatives rejetées

- **Autoencoder pour anomalie agents** (vs Isolation Forest) : nécessite plus de données + tuning ;
  Isolation Forest excellent baseline.

- **GNN (Graph Neural Network) pour collusion** : pertinent mais pré-maturé V1. Documenté en §10 doc
  23 pour Phase 2.

- **GPT-4 / Claude pour classification signalements** : performances supérieures mais (a) SaaS US,
  (b) coût per-call élevé, (c) signalements = données sensibles ne devant pas quitter le DC CTDEC.
  Exclu par souveraineté.

- **Llama 3 / Mistral self-hosted** : LLM modernes excellents. Pertinents V3 pour analyse de texte
  longs (rapports d'enquête). V1 = BERT/AfroXLMR plus simple, plus rapide.

- **Pas de ML, juste règles** : option « simple » mais (a) règles rigides ne capturent pas la
  subtilité comportementale, (b) facilement contournables par un agent qui connaît les règles, (c)
  impossible à généraliser sur 11M citoyens.

- **Pas de canal lanceur d'alerte** (laisser appeler OCLEI directement) : rejeté car (a) barrière à
  l'entrée trop élevée pour le citoyen moyen, (b) pas d'anonymat si appel téléphonique, (c) USSD est
  accessible à tous les feature phones.

- **Tor / .onion service** pour anonymat extrême : pertinent mais inutile dans le contexte AES
  (faible adoption Tor). USSD + chiffrement asymétrique suffit + culturellement aligné.

- **PGP pour chiffrement signalements** (vs Vault Transit) : standard mature mais (a) UX terrible
  (clés locales à gérer), (b) intégration Vault déjà acquise via doc 15, (c) Ed25519 plus moderne.

---

## Suivi

| Métrique                                          | Cible         | Outil                            |
| ------------------------------------------------- | ------------- | -------------------------------- |
| Précision Isolation Forest (sur enquêtes fondées) | > 70 %        | Manuel — feedback OCLEI / 3 mois |
| Faux positifs / semaine                           | < 5           | Dashboard SIGAC                  |
| AUC LSTM                                          | > 0.80        | MLflow test set                  |
| Accuracy BERT (classification)                    | > 85 %        | MLflow test set                  |
| Signalements reçus / mois                         | tracking only | Counter Prometheus               |
| Délai déchiffrement procureur (médian)            | < 24 h        | Query SQL `ack - received`       |
| Taux de signalements fondés                       | tracking only | Manuel — feedback procureur      |
| Re-training modèles                               | trimestriel   | Cron MLflow + Celery             |
| Failure mode : numéro téléphone leaké             | **0 toléré**  | Audit logs Loki regex            |
| Plaintes RGPD / mois                              | 0             | Manuel — DPO CTDEC               |

Si **un seul leak de numéro téléphone** est détecté dans les logs, ou si les **plaintes RGPD
dépassent 0**, intervention immédiate + revue ADR.
