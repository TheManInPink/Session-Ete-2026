# SCORING-RUNBOOK — Runbook opérationnel du scoring d'intégrité SIGAC

> **Périmètre** : ce runbook décrit **comment interpréter, traiter, investiguer, contester,
> recalibrer et journaliser** un score d'intégrité agent produit par SIGAC (Système Intégré de
> Gouvernance Anti-Corruption, Bloc D). Il est le compagnon opérationnel du document de conception
> [`docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`](../23-BLOC-D-SIGAC-ANTICORRUPTION.md) et de
> [`docs/sigac/MODEL-CARDS.md`](./MODEL-CARDS.md).
>
> **Public visé** : inspecteurs OCLEI (Office Central de Lutte contre l'Enrichissement Illicite),
> data scientists SIGAC, DPO/juriste (volet RGPD-like art. 22), et l'agent CTDEC concerné (volet
> contestation).
>
> 🟠 **MARQUEUR D'HONNÊTETÉ GLOBAL** — À la date de ce document, le `anticorruption-service`
> (port 3009) est à l'état **scaffold** : **aucun** des modèles, endpoints ou tâches décrits ici
> n'est encore implémenté en production. Tout ce runbook décrit la **conception cible**. Chaque
> élément non implémenté est marqué ⏳ **« conçu, Phase 2 »**. Ne PAS présenter SIGAC comme «
> opérationnel » tant que les tests E2E (§9) ne sont pas verts.

---

## 0. Pourquoi un runbook, et pas seulement un modèle ?

**POURQUOI (avant le COMMENT)** : un score d'intégrité n'a de valeur démocratique que s'il est
**encadré par une procédure humaine traçable**. Un nombre 0-100 sorti d'un Isolation Forest n'est ni
une preuve, ni une décision administrative, ni une sanction. C'est un **signal de priorisation
d'enquête**. Sans runbook :

- un inspecteur pourrait sanctionner sur la foi d'un nombre (dérive répressive opaque) ;
- un agent honnête flaggé par un faux positif n'aurait aucun recours (injustice) ;
- une dérive du modèle (drift) passerait inaperçue (corrosion silencieuse de la confiance) ;
- aucune trace ne permettrait de prouver, a posteriori, que la procédure a été suivie.

Ce runbook existe donc pour transformer un **signal statistique** en **processus de gouvernance
redevable**, conforme au droit à l'explication et à la contestation (RGPD-like art. 22).

> ⚖️ **Principe directeur n°1** — _« Le ML ne remplace pas l'enquête, il la cible. »_ Un score élevé
> ne dit pas « cet agent est corrompu ». Il dit « le comportement de cet agent s'écarte de la norme
> ; un humain doit regarder ». La décision reste **toujours** humaine.

---

## 1. Le score d'intégrité : composition et seuils

### 1.1 — Composition (5 facteurs, 0-100)

Le score global hebdomadaire d'un agent (`integrity_scores.overallScore`) agrège **5 facteurs**,
chacun normalisé 0-100. Le détail Prisma est défini doc 23 §4.1 (`model IntegrityScore`).

| Facteur (colonne Prisma) | Source                                       | Sens (100 = bon)                         | Modèle / calcul         |
| ------------------------ | -------------------------------------------- | ---------------------------------------- | ----------------------- |
| `factorAnomaly`          | Isolation Forest sur `audit_logs` (30j)      | Comportement conforme à la norme         | scikit-learn 1.7 ⏳     |
| `factorAudit`            | Exhaustivité de la chaîne d'audit de l'agent | Toutes ses actions sont tracées/scellées | requête hash-chain      |
| `factorReports`          | Signalements **fondés** reçus contre l'agent | Aucun signalement fondé                  | agrégat `whistleblower` |
| `factorFeedback`         | Notes/retours citoyens sur ses guichets      | Bons retours citoyens                    | agrégat feedback        |
| `factorTraining`         | Conformité aux formations anti-corruption    | Formations à jour                        | référentiel RH          |

> ⚠️ **Convention de sens** — Dans `IntegrityScore`, **un score ÉLEVÉ = BON** (agent intègre).
> Attention : le **sous-modèle** Isolation Forest produit en interne un `anomaly_score` où **100 =
> très anormal** (doc 23 §4.2). La conversion est **`factorAnomaly = 100 − anomaly_score`**. Ne
> JAMAIS confondre les deux échelles : c'est le piège n°1 de lecture (cf. §7).

> 🔢 **Pondération** ⏳ _conçu, Phase 2_ — La formule d'agrégation pondérée
> (`overallScore = Σ wᵢ · factorᵢ`) et le choix des poids `wᵢ` sont fixés par l'**ADR-023** et
> publiés dans la Model Card de scoring. Tant qu'elle n'est pas figée, considérer la moyenne simple
> comme **provisoire** et NON décisionnelle.

### 1.2 — Les trois bandes de seuil

> **POURQUOI des bandes et pas un seuil unique ?** Un seuil binaire (« flaggé / pas flaggé ») écrase
> l'incertitude. Trois bandes séparent **trois niveaux d'action** : ne rien faire, surveiller
> passivement, déclencher une enquête. Cela évite à la fois la sur-réaction (enquêter sur du bruit)
> et la sous-réaction (ignorer un signal moyen persistant).

| Bande                | Plage `overallScore` | Libellé         | Action déclenchée                                                                                    |
| -------------------- | -------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| 🟢 **Intègre**       | **≥ 85**             | `INTEGRE`       | Aucune. Score archivé, visible sur le dashboard agrégé.                                              |
| 🟡 **À surveiller**  | **70 – 84**          | `A_SURVEILLER`  | Surveillance passive. Pas d'enquête. Alerte si **3 semaines consécutives** dans la bande (tendance). |
| 🔴 **À investiguer** | **< 70**             | `A_INVESTIGUER` | **Human-in-the-loop OCLEI obligatoire** (§3). `flaggedForInvestigation = true`.                      |

Cas particulier — **données insuffisantes** :

| Cas                                 | Valeur              | Action                                                        |
| ----------------------------------- | ------------------- | ------------------------------------------------------------- |
| Agent inactif / < seuil de features | `INSUFFICIENT_DATA` | **PAS** un score de 0. Aucun flag. Documenté, non pénalisant. |

> 🚫 **Garde-fou n°1** — `INSUFFICIENT_DATA` ne doit **jamais** être traité comme un score bas. Un
> agent en congé, en formation, ou nouvellement affecté n'est pas suspect parce qu'il a peu
> d'actions. Cf. doc 23 §6 (« Score intégrité = 0 pour un agent inactif »).

> 📌 Les seuils 85 / 70 sont des **valeurs de gouvernance**, pas des constantes magiques du modèle.
> Ils sont **versionnés** (ADR-023) et **recalibrables** (§6). Tout changement de seuil suit la
> procédure de recalibration et est journalisé en hash-chain.

---

## 2. Cycle de vie d'un score (vue d'ensemble)

```text
        [Tâche Celery hebdo]                 ⏳ conçu, Phase 2
                │
                ▼
   ┌─────────────────────────┐
   │ Calcul des 5 facteurs   │  ← Isolation Forest + agrégats audit/reports/feedback/training
   │ → overallScore (0-100)  │
   └───────────┬─────────────┘
               │ upsert integrity_scores  (+ append hash-chain ADR-007)
               ▼
        ┌──────────────┐
        │  Banding     │
        └──┬────┬────┬─┘
   ≥85 ────┘    │    └──── <70
  🟢 INTEGRE    │      🔴 A_INVESTIGUER ──► §3 Human-in-the-loop ──► §4 Investigation
            70-84 🟡                                  │
         A_SURVEILLER ──► veille tendance             ├─► fondé   ──► dossier OCLEI / suite judiciaire
                                                       └─► non fondé ──► clôture + faux positif → §6 recalibration

   À tout moment, l'agent concerné peut ouvrir une CONTESTATION (§5) → gel de l'effet du flag.
```

---

## 3. Procédure human-in-the-loop (bande 🔴 < 70)

> **POURQUOI** : c'est le cœur anti-abus du dispositif. Aucun flag ne produit d'effet sur la
> carrière d'un agent sans qu'un **inspecteur OCLEI humain** ait revu le dossier. Le ML **cible**,
> l'humain **décide**.

### 3.1 — Déclenchement

Quand `overallScore < 70`, la tâche hebdo :

1. positionne `flaggedForInvestigation = true` ;
2. notifie l'inspecteur OCLEI de la région concernée (`notify_inspector`, doc 23 §4.2) ;
3. **append** l'événement `integrity_score.flagged` dans la chaîne d'audit (§8).

⚠️ Aucune notification ne contient de **jugement** (« agent corrompu »). Elle contient un **fait
statistique** : « score 62, facteur anomalie dominant, à revoir ».

### 3.2 — Revue obligatoire par l'inspecteur (SLA cible : 5 jours ouvrés ⏳)

L'inspecteur OCLEI **doit** :

| Étape | Action                                                                                                          | Trace audit                       |
| ----- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1     | Consulter la **décomposition par facteur** (jamais la note seule).                                              | `integrity_score.reviewed.opened` |
| 2     | Distinguer **explication légitime** (agent mobile multi-régions, pic d'enrôlement justifié) vs anomalie réelle. | —                                 |
| 3     | Décider : **classer sans suite** (faux positif) **ou** **ouvrir une investigation** (§4).                       | `integrity_score.review.decided`  |
| 4     | **Motiver** la décision par écrit (obligatoire, conservé).                                                      | inclus dans le payload d'audit    |

> 🚫 **Garde-fou n°2** — Un inspecteur **ne peut PAS** transformer un flag en sanction directe. Sa
> seule sortie possible est : _classer sans suite_ **ou** _ouvrir une investigation_. La sanction,
> elle, relève d'une **procédure disciplinaire/judiciaire distincte**, hors SIGAC.

> 🟢 **Faux positif assumé** — Classer sans suite n'est PAS un échec du système : c'est le
> fonctionnement normal d'un outil de ciblage à `contamination=0.02`. Chaque faux positif documenté
> **alimente la recalibration** (§6) et le suivi d'équité par région (Model Cards).

---

## 4. Procédure d'investigation

> **POURQUOI** : l'investigation transforme un signal en éléments factuels vérifiables. Elle
> s'appuie sur la **chaîne d'audit immuable** (ADR-007) : sans elle, un agent corrompu pourrait
> effacer ses traces. SIGAC consomme `audit_logs` en **lecture seule**.

### 4.1 — Matériel d'enquête disponible

| Source                          | Usage                                                                 | Précaution                                                                 |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Décomposition 5 facteurs        | Identifier le facteur dominant (anomalie ? signalements ? feedback ?) | —                                                                          |
| `audit_logs` (hash-chain)       | Reconstituer la séquence d'actions de l'agent (drill-down dashboard)  | Lecture seule ; vérifier l'intégrité de la chaîne avant exploitation (§8). |
| Séries LSTM (jours anormaux) ⏳ | Cibler les **journées** atypiques à examiner en priorité              | Probabilité, pas preuve ; label bruité (Model Card LSTM).                  |
| Signalements **fondés** liés    | Corroborer avec des dénonciations citoyennes déjà qualifiées          | **Jamais** ouvrir un signalement whistleblower brut ici (voir ci-dessous). |

### 4.2 — Frontière stricte avec le canal lanceur d'alerte

> 🔒 **CANON SÉCURITÉ — séparation absolue.** L'investigation d'un score d'intégrité **n'a pas accès
> au contenu** des signalements `whistleblower_reports`. Ce contenu est **chiffré côté borne** avec
> la **clé publique du procureur** (sealed box X25519 + XSalsa20-Poly1305, ou RSA-OAEP `rsa-4096`) ;
> **seul le procureur** peut le déchiffrer, **localement, hors-ligne**, sa clé privée étant
> reconstituable via SSS **externe** 3-of-5 (PAS le Shamir interne de Vault). Voir
> [`WHISTLEBLOWER-PROTOCOL.md`](./WHISTLEBLOWER-PROTOCOL.md).
>
> L'inspecteur ne voit que des **buckets grossiers** (`classificationBucket`, `severityBucket`) et
> le **jour** (pas l'heure) — jamais le texte, jamais le numéro, jamais d'IP, jamais de
> correlation-id. C'est l'**anti-corrélation** : croiser score d'intégrité et métadonnées fines d'un
> signalement permettrait de **désanonymiser** le signaleur. Interdit.

### 4.3 — Issues possibles d'une investigation

| Issue                  | Conséquence                                                                                 | Statut / trace                   |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| **Non fondée**         | Clôture. Faux positif documenté → recalibration (§6). Flag levé.                            | `investigation.closed_unfounded` |
| **Fondée**             | Transmission à la procédure disciplinaire/judiciaire **hors SIGAC** (OCLEI / parquet).      | `investigation.closed_founded`   |
| **Données manquantes** | Demande d'éléments complémentaires ; flag **gelé** (ni levé ni actif) le temps de l'examen. | `investigation.pending_info`     |

> 🚫 **Garde-fou n°3 — un score n'est jamais versé comme preuve.** Dans toute suite
> disciplinaire/judiciaire, le score d'intégrité est un **élément de ciblage d'enquête**, jamais un
> **moyen de preuve** autonome. Les preuves sont les **faits audités** (entrées hash-chain
> vérifiées), pas le nombre produit par le modèle. Présenter un score comme preuve est une faute
> méthodologique (et un risque de nullité de la procédure).

---

## 5. Contestation par l'agent (droit RGPD-like art. 22)

> **POURQUOI** : un score d'intégrité est une **décision fondée sur un traitement automatisé**.
> L'agent concerné a droit à l'**information**, à l'**explication**, à une **intervention humaine**
> et à la **contestation**. Sans ce droit, SIGAC deviendrait un outil de répression opaque —
> l'inverse de son but. Base légale : cadre **RGPD-like** local (PAS de « loi 2024-XX » non
> adoptée).

### 5.1 — Les quatre droits garantis

| Droit                    | Mise en œuvre                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Information**          | À l'embauche + rappel annuel : existence du scoring, ses 5 facteurs, ses finalités.      |
| **Explication**          | Un agent flaggé reçoit la **décomposition par facteur**, jamais une note opaque.         |
| **Intervention humaine** | Aucun flag → sanction sans revue d'un inspecteur OCLEI **humain** (§3).                  |
| **Contestation**         | Canal formel `POST /sigac/integrity-scores/{id}/dispute` (auth agent), tracé hash-chain. |

### 5.2 — Procédure de contestation

1. L'agent, **authentifié** (JWT signé RS256 ou EdDSA — _Ed25519 ici en **signature**, jamais en
   chiffrement_), appelle l'endpoint sur **son propre** score (vérif d'identité — refus 403 sinon).
2. L'effet du flag est **gelé** (`freeze_flag_pending_review`) — l'enquête éventuelle est suspendue,
   la **trace** est conservée (on ne supprime jamais le score).
3. L'événement `integrity_score.disputed` est **append** en hash-chain (§8).
4. Un inspecteur OCLEI **humain** examine le recours et tranche (maintien motivé / levée du flag).

```python
# services/anticorruption-service/app/api/dispute.py   ⏳ conçu, Phase 2 (doc 23 §6 bis.3)
# Endpoint de CONTESTATION d'un score (droit RGPD-like art. 22).
# Auth OBLIGATOIRE : un agent ne peut contester QUE son propre score (jamais celui d'un collègue).
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter()


@router.post("/integrity-scores/{score_id}/dispute", status_code=201)
async def dispute_integrity_score(
    score_id: int,
    reason: str,
    # JWT signé RS256 ou EdDSA (Ed25519 = SIGNATURE, PAS chiffrement), rôle AGENT requis.
    current_agent=Depends(require_authenticated_agent),
):
    """
    Ouvre une contestation d'un score d'intégrité automatisé (RGPD-like art. 22).

    POURQUOI auth stricte : empêcher qu'un agent conteste/altère le dossier d'un collègue.
    POURQUOI on n'efface pas le score : la contestation SUSPEND l'effet (gel du flag) mais
        CONSERVE la trace (hash-chain ADR-007) ; un humain OCLEI tranche.

    Args:
        score_id:      identifiant du score contesté.
        reason:        motivation écrite de l'agent (max 2000 chars).
        current_agent: agent authentifié (injecté par le guard) — doit être le titulaire du score.

    Raises:
        HTTPException 403: si l'agent tente de contester un score qui n'est pas le sien.
    """
    score = await get_score_or_404(score_id)
    if score.user_id != current_agent.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez contester que votre propre score.")

    await open_dispute(score_id=score_id, agent_id=current_agent.id, reason=reason)
    await freeze_flag_pending_review(score_id)                 # gèle l'EFFET du flag (pas la trace)
    await audit_chain_append("integrity_score.disputed", score_id, current_agent.id)  # ADR-007
    return {"status": "DISPUTE_OPENED", "score_id": score_id}
```

> 🚫 **Garde-fou n°4** — Le gel suspend **l'effet** du flag, **pas** la traçabilité. On ne détruit
> jamais un score contesté : la transparence du recours exige de conserver l'historique complet,
> scellé en hash-chain. Un score « effacé » serait lui-même une anomalie suspecte.

---

## 6. Recalibration / ré-entraînement

> **POURQUOI** : un modèle d'anomalie vieillit. Les comportements légitimes évoluent (nouvelles
> procédures, nouveaux endpoints), et un `contamination=0.02` figé finit par produire trop (ou trop
> peu) de flags. La recalibration garde le dispositif **juste** dans le temps. C'est aussi le levier
> d'**équité** : on y vérifie qu'aucune région/langue n'est sur-pénalisée.

### 6.1 — Déclencheurs de recalibration

| Déclencheur                                                      | Action                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Taux de flags > **10 %** des agents sur une semaine              | Baisser `contamination` (ex. 0.01) et re-fitter (doc 23 §6).  |
| Taux de **faux positifs confirmés** anormalement élevé           | Re-fitter + revoir les features (proxys illégitimes ?).       |
| **Drift géographique** : faux positifs concentrés sur une région | 🚩 Biais potentiel → audit équité avant tout re-déploiement.  |
| Écart F1 d'une **langue nationale** > seuil toléré (BERT)        | 🚫 **Modèle refusé en prod** jusqu'à rééquilibrage du corpus. |
| Changement de **seuils de gouvernance** (85/70)                  | ADR-023 amendé + journalisation (§8).                         |
| Cadence planifiée (revue trimestrielle)                          | Re-fit + republication des Model Cards.                       |

### 6.2 — Cycle de ré-entraînement (gouverné, traçable)

```text
Collecte features (audit_logs 12 mois)         ⏳ conçu, Phase 2
        │
        ▼
Re-fit modèle (MLflow run versionné)  ──►  metrics : taux flag, FP/région, F1/langue
        │
        ▼
Revue d'ÉQUITÉ (Model Cards) ── écart langue/région sous seuil ? ──┐ NON ─► 🚫 BLOQUER la mise en prod
        │ OUI                                                       │
        ▼                                                           │
Validation humaine (OCLEI + data scientist) ◄──────────────────────┘
        │
        ▼
Promotion MLflow Registry (nouvelle modelVersion)  +  append hash-chain "model.promoted"
        │
        ▼
modelVersion inscrit dans integrity_scores des semaines suivantes (traçabilité du modèle utilisé)
```

> 🔑 **Traçabilité du modèle par score** — Chaque ligne `integrity_scores` porte sa `modelVersion`
> (ex. `isolation-forest-v3`). On peut donc, pour tout score historique, savoir **exactement quel
> modèle** l'a produit — indispensable pour rejuger un recours après une recalibration.

> 🚫 **Garde-fou n°5 — pas de promotion silencieuse.** Un nouveau modèle ne passe en production
> **qu'après** revue d'équité (par langue **et** par région) et validation humaine. La promotion est
> elle-même un **événement journalisé** en hash-chain. Aucun re-fit automatique ne se déploie seul.

---

## 7. Pièges de lecture courants

| Symptôme / erreur                             | Cause                                                                 | Correction                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| « Score bas = agent inactif sanctionné »      | `INSUFFICIENT_DATA` traité comme 0                                    | Marquer `INSUFFICIENT_DATA`, ne jamais flagger (§1.2).                             |
| Inversion d'échelle                           | Confusion `overallScore` (haut=bon) vs `anomaly_score` (haut=anormal) | `factorAnomaly = 100 − anomaly_score` (§1.1).                                      |
| « Le score prouve la corruption »             | Score pris pour une preuve                                            | Garde-fou n°3 : un score cible, ne prouve pas (§4.3).                              |
| Agent mobile multi-régions sur-flaggé         | `cross_region_actions` non normalisé par le rôle                      | Normaliser par le rôle légitime (Model Card Isolation Forest).                     |
| Inspecteur sanctionne directement             | Court-circuit du human-in-the-loop                                    | Garde-fou n°2 : seules sorties = classer sans suite / ouvrir investigation (§3.2). |
| Croiser score et métadonnées d'un signalement | Tentative de désanonymisation du signaleur                            | Interdit. Frontière stricte whistleblower (§4.2).                                  |
| Modèle promu sans revue d'équité              | Re-fit déployé automatiquement                                        | Garde-fou n°5 : revue langue+région + validation humaine (§6.2).                   |

---

## 8. Journalisation (audit hash-chain ADR-007)

> **POURQUOI** : la redevabilité d'un dispositif anti-corruption repose sur sa propre
> **inviolabilité**. Chaque événement du cycle de vie d'un score est scellé dans la **chaîne d'audit
> SHA-256 linéaire** (ADR-007) — **pas un arbre de Merkle**. La chaîne n'est _intègre vis-à-vis d'un
> tiers_ que si sa **racine est ancrée** périodiquement chez un tiers indépendant (OCLEI /
> Vérificateur Général). Le scellement horaire est une **signature Ed25519 in-process**
> (`@noble/ed25519`, doc 09) — Ed25519 ici en **signature**, jamais en chiffrement.

### 8.1 — Événements obligatoirement journalisés

| Événement                         | Quand                                          | Données scellées (jamais de PII signaleur)          |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `integrity_score.computed`        | À chaque calcul hebdo                          | `scoreId`, `userId`, `overallScore`, `modelVersion` |
| `integrity_score.flagged`         | Passage en bande 🔴 (< 70)                     | `scoreId`, `userId`, facteur dominant               |
| `integrity_score.reviewed.opened` | Ouverture revue inspecteur                     | `scoreId`, `inspectorId`                            |
| `integrity_score.review.decided`  | Décision (classer sans suite / investiguer)    | `scoreId`, `inspectorId`, issue, motivation         |
| `integrity_score.disputed`        | Contestation par l'agent (§5)                  | `scoreId`, `agentId` (le titulaire), horodatage     |
| `investigation.closed_unfounded`  | Clôture non fondée                             | `scoreId`, `inspectorId`                            |
| `investigation.closed_founded`    | Clôture fondée → suite hors SIGAC              | `scoreId`, `inspectorId`                            |
| `model.promoted`                  | Promotion d'un modèle après recalibration (§6) | `modelVersion`, `mlflowRunId`, validateurs          |
| `scoring.thresholds.changed`      | Modification des seuils 85/70                  | anciennes/nouvelles valeurs, référence ADR-023      |

```python
# Esquisse d'append en hash-chain (ADR-007) — ⏳ conçu, Phase 2
async def audit_chain_append(event_type: str, score_id: int, actor_id: str) -> None:
    """
    Ajoute un événement de scoring à la chaîne d'audit SHA-256 LINÉAIRE (ADR-007).

    POURQUOI une hash-chain et pas un simple log : chaque entrée chaîne le hash de la
        précédente (prev_hash). Toute altération/suppression d'une entrée casse la chaîne et
        devient détectable. NB : la chaîne n'est opposable à un tiers que si sa RACINE est
        ANCRÉE périodiquement chez l'OCLEI / le Vérificateur Général (sinon l'opérateur
        pourrait réécrire toute la chaîne). Le scellement horaire est une SIGNATURE Ed25519
        in-process (@noble/ed25519, doc 09) — Ed25519 = signature, JAMAIS chiffrement.

    ⚠️ Anti-désanonymisation : on ne journalise JAMAIS d'élément permettant de relier un
        signalement whistleblower à son auteur (ni numéro, ni IP, ni correlation-id, ni heure
        fine). Le scoring agent et le canal lanceur d'alerte restent cloisonnés (§4.2).
    """
    ...
```

> 🚫 **Garde-fou n°6** — La journalisation du scoring **ne doit jamais** contenir d'information
> susceptible de désanonymiser un signaleur (cf. §4.2). Le cloisonnement scoring ↔ whistleblower
> s'applique aussi aux **logs**.

---

## 9. Validation locale (avant de déclarer le scoring « opérationnel »)

> 🟠 Tant que ces vérifications ne sont pas vertes, le scoring reste ⏳ **conçu, Phase 2**.

```powershell
# ⏳ conçu, Phase 2 — commandes cibles (anticorruption-service port 3009)

# 1) Entraîner Isolation Forest sur données synthétiques
docker exec nina-anticorruption-service python -m app.cli train-anomaly

# 2) Calculer les scores d'une semaine
docker exec nina-anticorruption-service python -m app.cli score-week --week=2026-W18

# 3) Vérifier le banding : un score 62 doit produire A_INVESTIGUER + flaggedForInvestigation=true ;
#    un score 90 → INTEGRE ; un agent sans features → INSUFFICIENT_DATA (jamais 0).

# 4) Tester la contestation : un agent ne peut contester QUE son propre score (403 sinon),
#    et le flag est gelé (pas supprimé) après dispute.

# 5) Vérifier la hash-chain : chaque event (computed/flagged/disputed/...) est chaîné ;
#    altérer une entrée DOIT casser la vérification de chaîne (test de non-régression).

# 6) Vérifier le CLOISONNEMENT : aucun chemin de scoring n'expose le contenu, le numéro,
#    l'IP ou l'heure fine d'un signalement whistleblower.
```

### 9.1 — Checklist de conformité du runbook

- [ ] Seuils 85 / 70 appliqués et versionnés (ADR-023) ⏳
- [ ] `INSUFFICIENT_DATA` distinct de 0, non pénalisant ⏳
- [ ] Inversion d'échelle anomalie corrigée (`100 − anomaly_score`) ⏳
- [ ] Human-in-the-loop OCLEI obligatoire sur bande 🔴 ⏳
- [ ] Frontière stricte scoring ↔ whistleblower (anti-désanonymisation) ⏳
- [ ] Endpoint contestation `POST /sigac/integrity-scores/{id}/dispute` (auth, gel, trace) ⏳
- [ ] Recalibration gouvernée + revue d'équité langue/région avant promotion ⏳
- [ ] Tous les événements scoring journalisés en hash-chain ADR-007 ⏳
- [ ] Aucun score versé comme preuve (garde-fou n°3) ⏳

---

## 10. Garde-fous anti-abus — synthèse (un score n'est PAS une preuve)

> Récapitulatif des **principes non négociables** de ce runbook. À afficher dans la salle OCLEI.

1. 🚫 **Un score n'est pas une preuve.** Il cible l'enquête ; les preuves sont les faits audités.
2. 🚫 **Aucune sanction automatique.** Tout effet sur un agent passe par un humain OCLEI.
3. 🚫 **`INSUFFICIENT_DATA` ≠ score bas.** L'inactivité n'est pas une suspicion.
4. 🚫 **Cloisonnement absolu** avec le canal lanceur d'alerte (jamais croiser pour désanonymiser).
5. 🚫 **Droit de contestation garanti** (RGPD-like art. 22) — gel de l'effet, conservation de la
   trace.
6. 🚫 **Pas de promotion de modèle silencieuse** — revue d'équité langue + région obligatoire.
7. 🚫 **Tout est journalisé** en hash-chain ancrée chez un tiers — y compris les décisions humaines.

> ⚖️ **Principe directeur final** — SIGAC est un outil de **redevabilité**, pas de **répression**.
> Le jour où un score sert à condamner sans enquête humaine, le dispositif a échoué à sa mission.

---

## 11. Références

- [`docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`](../23-BLOC-D-SIGAC-ANTICORRUPTION.md) — conception
  SIGAC (modèles, schéma Prisma, whistleblower).
- [`docs/sigac/MODEL-CARDS.md`](./MODEL-CARDS.md) — fiches modèles, biais/équité par langue
  nationale, usages interdits.
- [`docs/sigac/WHISTLEBLOWER-PROTOCOL.md`](./WHISTLEBLOWER-PROTOCOL.md) — protocole lanceur
  d'alerte + cérémonie SSS 3-of-5.
- `docs/adr/ADR-007` — audit hash-chain SHA-256 linéaire + ancrage tiers.
- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md` — stack ML, seuils, pondération.
- `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` — sealed box X25519 / RSA-OAEP, AppRole
  sans token long-lived, mapping OWASP.
- `docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-RUNBOOK.md` — modèle de menace & runbook
  sécurité transverses.

---

_Document SIGAC — `SCORING-RUNBOOK.md` — Version 1.0 — Juin 2026._ _Compagnon opérationnel du
document 23 (Bloc D). État : conception cible — implémentation ⏳ Phase 2._ _NINA-AES Platform —
UQAR — CONFIDENTIEL._
