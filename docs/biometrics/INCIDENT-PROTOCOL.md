# INCIDENT-PROTOCOL.md — Protocole d'incident « fuite de templates biométriques »

> **Statut documentaire.** Document **normatif de réponse à incident** pour le Bloc F (biométrie).
> Il décline opérationnellement la procédure d'incident esquissée dans
> [`docs/25-BLOC-F-BIOMETRIE.md`](../25-BLOC-F-BIOMETRIE.md) **§4.5** (rotation double-écriture),
> **§4.7 (point 10)** et **§6** (pièges & dépannage), et s'aligne sur
> [`docs/security/SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md) (rotation Vault) et
> [`docs/security/THREAT-MODEL.md`](../security/THREAT-MODEL.md). La décision de sécurité de
> référence est **ADR-034** ; l'audit est régi par **ADR-007** (hash-chain SHA-256). Les éléments
> **non encore implémentés** portent le marqueur **⏳ (conçu, Phase 2)**.

---

## 0. POURQUOI ce protocole existe (la gravité particulière de la biométrie)

> **Lis ceci avant de paniquer un jour d'incident.** La biométrie n'est pas un secret comme un
> autre.

Un mot de passe fuité se **change**. Un certificat fuité se **révoque et réémet**. Une donnée
biométrique brute fuitée est **irrévocable** : un citoyen ne peut pas se faire pousser un nouveau
doigt. C'est pourquoi NINA-AES **ne stocke jamais** :

- d'**image brute** (empreinte, visage) — voir doc 25 §0.4, §4.4 ;
- de **template en clair** — voir doc 25 §0.1 ;
- de **hash strict** d'un template (ce serait à la fois cassé fonctionnellement, doc 25 §0.2, et
  inutile en défense).

Ce que la base contient réellement, ce sont des **templates protégés** au sens **ISO/IEC 24745**
(_cancelable biometrics_ / fuzzy extractor) : une transformation **(a) irréversible**, **(b)
révocable** et **(c) distance-préservante** du template, paramétrée par un secret — le **paramètre
cancelable** (« sel » de transformation, `transform_kid`) — **stocké dans Vault Transit**,
**séparément** de la base de templates. (doc 25 §0.4, §4.3, §4.5.)

### 0.1 Échelle de gravité (ce protocole couvre le pire cas)

| Scénario de fuite                                                 | Gravité         | Réversibilité                                            | Réponse principale                                           |
| ----------------------------------------------------------------- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **Template protégé seul** (base lue, paramètre intact dans Vault) | BAS             | Révocable (rotation paramètre, §3)                       | Rotation préventive + surveillance                           |
| **Template protégé + paramètre cancelable** (les deux ensemble)   | **MOYEN→ÉLEVÉ** | _Linkage_/comparaison possible (limite 1:N, doc 25 §0.6) | **CE protocole** — rotation IMMÉDIATE + notif                |
| **Image brute ou template en clair** (jamais censés exister)      | CRITIQUE        | **IRRÉVOCABLE**                                          | Incident majeur + revue d'architecture (anomalie systémique) |

> **Hypothèse de travail de ce document.** On traite par défaut le scénario **MOYEN→ÉLEVÉ** : on
> **suppose** que le paramètre cancelable a pu être exposé en même temps que les templates protégés
> (worst-case réaliste). C'est l'hypothèse qui déclenche la **rotation immédiate** du §3. Si
> l'enquête prouve que seul le template protégé a fuité (paramètre Vault jamais sorti), on
> **conserve** la rotation mais on **déclasse** la criticité de la notification (§4).

### 0.2 Limite d'honnêteté à assumer dès maintenant

Le _linkage_ entre deux bases compromises (template protégé + paramètre) reste **possible** par
comparaison de distances : c'est une **limite intrinsèque du 1:N** documentée en doc 25 §0.6. La
rotation du paramètre **n'efface pas** une corrélation déjà réalisée par l'attaquant sur les données
exfiltrées ; elle **invalide pour l'avenir** les templates et **coupe** la capacité de l'attaquant à
matcher de **nouvelles** captures. C'est une défense **de prévention forward**, pas un effacement
rétroactif. Ce point doit figurer **tel quel** dans la notification aux personnes (§4).

---

## 1. Rôles, déclencheurs et pré-requis

### 1.1 Rôles d'astreinte

| Rôle                        | Responsabilité dans cet incident                                   |
| --------------------------- | ------------------------------------------------------------------ |
| **IC** (Incident Commander) | Coordonne, tient la timeline, décide de la communication externe   |
| **Security on-call**        | Exécute le confinement (§2) et la rotation Vault (§3)              |
| **DPO / CISO CTDEC**        | Décide de la notification RGPD-like (§4), valide délais & contenu  |
| **Biometric service owner** | Pilote la double-écriture, le ré-enrôlement, la purge (§3, §6)     |
| **Scribe**                  | Journalise chaque action (horodatée) → alimente la hash-chain (§5) |

### 1.2 Déclencheurs (DETECTION) — voir §2 pour le détail

L'incident s'ouvre dès l'un de ces signaux :

- Alerte SIEM : **exfiltration** ou lecture anormale de la table `biometric_templates`.
- Alerte SIEM : **accès Vault** anormal au chemin du paramètre cancelable
  (`transit/keys/bio-transform`).
- **Anomalie d'audit** : trou ou rupture dans la hash-chain des `audit_logs` biométriques (ADR-007).
- Signalement externe (lanceur d'alerte, chercheur, partenaire) d'une base de templates en
  circulation.
- Découverte d'**image brute** ou **template en clair** persisté (anomalie qui ne **doit** jamais
  arriver — doc 25 §6).

### 1.3 Pré-requis communs (à lire AVANT de toucher quoi que ce soit)

> **Ne jamais utiliser le root token en prod.** S'authentifier nominativement d'abord (traçabilité
> dans le Vault audit log : _qui_ a rotaté _quoi_, _quand_). Aligné sur SECURITY-RUNBOOK §0.2.

```bash
# --- PRODUCTION : login humain via OIDC Keycloak + MFA obligatoire ---
# Pourquoi : chaque action de rotation doit être imputable nominativement.
vault login -method=oidc role=security-admin

# Vérifier qu'on a bien les droits d'astreinte break-glass AVANT d'agir
vault token capabilities transit/keys/bio-transform
# Attendu : "create", "update", "read" (politique break-glass / security-admin)

# --- DEV / LOCAL uniquement (jamais en prod) ---
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root-dev-token de docker-compose.dev.yml>'   # DEV SEULEMENT
vault status   # doit afficher Sealed=false ; sinon : pnpm vault:bootstrap (cf. MEMORY)
```

**Registre des correspondances « secret → chemin Vault »** (cf. SECURITY-RUNBOOK §0.3) :

| Élément                                     | Chemin Vault                              | Type                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paramètre cancelable biométrie (le « sel ») | `transit/keys/bio-transform`              | Secret de **projection aléatoire** préservant la distance (BioHashing/IoM, ISO/IEC 24745), stocké **révocable/exportable** : kv-v2 versionné **ou** clé Transit `derived` **exportable** (`export=true`) dont le service dérive la clé de projection — **pas** une opération HMAC in-Vault |
| Versions actives (kids)                     | `transit/keys/bio-transform` champ `keys` | versions N, N+1                                                                                                                                                                                                                                                                            |

> **CANON crypto à NE PAS violer ici.** Le paramètre cancelable est un **secret de projection
> aléatoire préservant la distance** (random projection / IoM hashing, ISO/IEC 24745), **pas** un
> HMAC (HMAC-SHA-256 est la primitive **explicitement rejetée** en doc 25 §0.2 : son effet
> d'avalanche **détruit** la distance), **pas** une clé de signature Ed25519 (Vault Transit ne
> supporte PAS Ed25519 — ADR-026/034) et **pas** une clé de chiffrement asymétrique. La rotation
> ci-dessous est une rotation de **paramètre de transformation**, distincte des clés JWT/PII du
> SECURITY-RUNBOOK.

---

## 2. ÉTAPE A — Détection & qualification

> **Objectif : transformer un signal en incident qualifié, sans détruire les preuves.**

1. **Ouvrir l'incident** : créer le ticket d'incident, nommer **IC** + **Scribe**, démarrer la
   timeline (UTC). Toute action ultérieure est horodatée.
2. **Préserver les preuves AVANT toute remédiation** : snapshot des `audit_logs` (table + dernière
   tête de hash-chain), export du Vault audit log sur la fenêtre suspecte, copie des journaux SIEM.
   **Ne pas** purger, ne pas rotater encore — on fige d'abord l'état.
3. **Vérifier l'intégrité de la chaîne d'audit** (ADR-007, hash-chain SHA-256 linéaire) :

   ```bash
   # Recalcul de la hash-chain des événements biométriques : chaque maillon
   # doit valoir SHA-256(prev_hash || payload_canonical). Une rupture = manipulation.
   pnpm run audit:verify-chain -- --filter "BIOMETRIC%"
   # ⏳ (conçu, Phase 2) : si le script n'existe pas encore, vérification SQL de secours —
   #    on relit la colonne prev_hash/curr_hash et on contrôle la continuité maillon par maillon.
   ```

   > **Rappel honnêteté (doc 25 §0.6, ADR-007).** La hash-chain est **détective**, pas
   > **inaltérable** : elle ne devient une preuve forte **que si sa racine est ancrée chez un
   > tiers** (OCLEI / Vérificateur Général). Sans ancrage, un attaquant ayant le contrôle total de
   > la base peut réécrire la chaîne. On **note** donc si l'ancre tierce existait au moment des
   > faits.

4. **Qualifier le périmètre** : quelles colonnes (`protectedTemplate`, métadonnées kid), combien de
   citoyens, quels `transform_kid`. Déterminer si le **paramètre cancelable Vault** a pu sortir
   (accès au chemin `transit/keys/bio-transform` dans le Vault audit log).
5. **Classer la gravité** selon le tableau §0.1 et **déclarer** : MOYEN→ÉLEVÉ ⇒ on enchaîne
   §2(confinement)→§3(rotation). Worst-case par défaut (§0.1).

---

## 3 bis. ÉTAPE B — Confinement

> **Objectif : arrêter l'hémorragie sans détruire le service ni les preuves.**

1. **Couper la voie d'exfiltration**, pas le service : révoquer les credentials/leases compromis
   (AppRole, SA K8s) de tout composant suspect via Vault — **jamais** de `VAULT_TOKEN` long-lived à
   re-souffler (CANON secrets).

   ```bash
   # Révoquer immédiatement tous les leases d'un rôle applicatif suspect (lecture base templates).
   vault lease revoke -prefix auth/approle/role/biometric-service
   ```

2. **Réduire la surface** : passer le service biométrie en **mode dégradé** — désactiver le **1:N**
   (recherche identifiante, la plus sensible, doc 25 §0.6) tout en gardant le **1:1** si nécessaire
   au régalien. Activer un **rate-limit agressif** sur `/v1/verify-fingerprint` (anti-bruteforce,
   doc 25 §4.2).
3. **Isoler l'hôte biométrie** si compromission nœud suspectée : l'hôte est durci (no-swap / `mlock`
   / tmpfs, doc 25 §4.4) ; un snapshot mémoire forensique est **interdit** (il exposerait des
   templates en RAM) — préférer l'isolement réseau et l'arrêt propre.
4. **Geler les credentials d'agents** suspectés d'IDOR/abus (RBAC `BIOMETRIC_OPERATOR`/`INSPECTOR`).
5. **Confirmer le confinement** avant de rotater : plus aucune nouvelle lecture de la base depuis la
   voie compromise dans le SIEM.

---

## 3. ÉTAPE C — ROTATION IMMÉDIATE du paramètre cancelable (double-écriture, sans interruption)

> **C'est le cœur du protocole.** On invalide **pour l'avenir** tous les templates protégés
> compromis en changeant le paramètre cancelable Vault, **sans réenrôler tout le monde d'un coup**
> (un « big bang » casserait le service). On procède en **double-écriture** : la base contient
> transitoirement des templates `vN` **et** `vN+1` pour un même citoyen, et la boucle `verify`
> parcourt **tous les kids actifs** (doc 25 §4.2, §4.5).

> **POURQUOI la double-écriture plutôt qu'un sel HMAC classique.** Avec un sel HMAC + égalité
> stricte, rotation = **ré-enrôlement forcé immédiat de tous** (service interrompu). Le modèle
> **cancelable** distance-préservant permet d'**étaler** la migration : c'est un gain direct
> documenté en doc 25 §4.5.

### 3.1 Générer le nouveau paramètre (kid N+1)

```bash
# 1) Inspecter l'état actuel : versions (kids) existantes du paramètre cancelable.
vault read transit/keys/bio-transform

# 2) Rotater : crée la version N+1, qui devient la version de DÉRIVATION active.
#    Les versions antérieures restent lisibles le temps de la double-écriture.
vault write -f transit/keys/bio-transform/rotate
# => transform_kid = bio-transform-vN+1  (nouveau paramètre)
```

> **Où s'exécute la projection.** Le service biométrie **lit/exporte** le paramètre du `kid` actif
> hors de Vault (kv-v2 versionné ou clé Transit `derived` exportable), puis calcule **côté service**
> la projection aléatoire `T_protégé = projection_cancelable(template, P_kid)` — cohérent avec doc
> 25 ligne 285 et avec le scénario de fuite « paramètre **sorti** de Vault » (§0.1, §2.4). La
> projection n'est **pas** une opération HMAC effectuée à l'intérieur de Vault.

> **Ne PAS encore invalider vN.** Si on coupe `min_decryption_version` tout de suite, plus aucun
> template `vN` ne matche → tous les citoyens non encore migrés sont **verrouillés**. La révocation
> de `vN` est **différée** (§3.4–3.5).

### 3.2 Activer la phase de double-écriture

> ⏳ (conçu, Phase 2 — doc 25 §0.7 : « Rotation double-écriture : conçu, non implémenté »). La
> bascule ci-dessous décrit le comportement cible du service.

1. Passer le service en **flag** `BIO_DOUBLE_WRITE=on` avec
   `transform_kid_active=bio-transform-vN+1`.
2. **Chaque nouvel enrôlement** et **chaque ré-enrôlement opportuniste** (le citoyen se présente
   pour un autre acte régalien) écrit le template protégé avec le **nouveau kid `vN+1`**, **sans
   supprimer** l'ancien `vN`. L'index `[citizenId, kind, revokedAt]` et la boucle multi-kids du
   `verify` garantissent que le matching reste correct pendant la transition (doc 25 §4.2).
3. Les **nouveaux matchs** privilégient le kid `vN+1`.

### 3.3 (Optionnel, incident chaud) Ré-enrôlement proactif prioritaire

Pour les citoyens **à plus haut risque** (ex. agents publics, personnes exposées), on ne se contente
pas du ré-enrôlement opportuniste : on **convoque** au ré-enrôlement (nouvelle capture → nouveau
template `vN+1`). C'est un arbitrage **IC + DPO** (charge opérationnelle vs vitesse d'éradication).

### 3.4 Révocation différée des templates compromis (`vN`)

```sql
-- Révocation LOGIQUE (pas DELETE) : on garde la trace forensique, on coupe le matching.
-- Le verify ignore tout template dont revokedAt IS NOT NULL.
UPDATE biometric_templates
   SET revoked_at = now(), revoked_reason = 'incident-leak-rotation'
 WHERE transform_kid = 'bio-transform-vN'
   AND citizen_id IN (SELECT citizen_id FROM biometric_templates WHERE transform_kid = 'bio-transform-vN+1');
-- => on ne révoque vN que pour les citoyens DÉJÀ ré-enrôlés en vN+1 (sinon on les verrouille).
```

### 3.5 Clôture de la rotation

```bash
# Quand 100 % des citoyens actifs possèdent un template vN+1 :
# désactiver définitivement vN côté Vault (plus aucune dérivation possible avec l'ancien paramètre).
vault write transit/keys/bio-transform/config min_decryption_version=<N+1>
```

| Étape | Action                                 | Service interrompu ? |
| ----- | -------------------------------------- | -------------------- |
| 3.1   | Rotation Vault (création kid N+1)      | Non                  |
| 3.2   | Double-écriture activée                | Non                  |
| 3.4   | Révocation logique progressive de `vN` | Non                  |
| 3.5   | Désactivation `vN` (100 % migrés)      | Non                  |

> **Garantie clé : zéro interruption.** À aucune étape on ne perd le matching d'un citoyen actif :
> tant qu'il n'a pas son `vN+1`, son `vN` reste utilisable et non révoqué.

---

## 4. ÉTAPE D — Notification RGPD-like (autorité + personnes concernées)

> **Base légale.** NINA-AES s'appuie sur le **socle RGPD-équivalent** appliqué en interne — **PAS**
> sur une hypothétique « loi 2024-XX » non adoptée (CANON souveraineté ; doc 25 §4.7 point 3). La
> décision de notifier et son contenu sont validés par le **DPO/CISO CTDEC**.

### 4.1 Notification à l'autorité de contrôle

1. **Délai** : **sans retard injustifié**, cible **≤ 72 h** après prise de conscience (standard
   RGPD-like). Si délai dépassé, **motiver** le retard dans le dossier.
2. **Contenu minimal** :
   - nature de la violation (fuite de **templates protégés** ISO 24745, ± paramètre cancelable) ;
   - **catégories et nombre approximatif** de personnes et d'enregistrements concernés ;
   - conséquences probables (rappeler la limite §0.2 : _linkage_ possible, **pas** de reconstruction
     de l'image brute — irréversibilité maintenue) ;
   - mesures prises (rotation immédiate du paramètre, double-écriture, révocation — §3) ;
   - point de contact DPO.
3. **Honnêteté technique** : indiquer explicitement que la base **ne contenait pas** d'images brutes
   ni de templates en clair (doc 25 §0.4/§5), et que la rotation invalide les templates **pour
   l'avenir** sans effacer une corrélation déjà exfiltrée (§0.2).

### 4.2 Notification aux personnes concernées

Obligatoire si **risque élevé** pour les droits et libertés (cas typique : paramètre cancelable
exposé, §0.1). Communiquer en **langage clair**, sans jargon :

- ce qui a fuité (et surtout ce qui **n'a pas** fuité : pas d'image d'empreinte/visage) ;
- ce que NINA a fait (rotation/réenrôlement → leurs anciens templates ne sont plus valides) ;
- ce que la personne doit faire (se présenter au ré-enrôlement si convoquée) ;
- la **limite honnête** : la donnée biométrique sous-jacente reste la leur ; on ne peut pas «
  annuler » une corrélation déjà faite sur des données déjà sorties — d'où l'importance de la
  rotation pour bloquer les usages **futurs**.

### 4.3 Souveraineté de la chaîne de notification

> Pas d'outil US sur le cœur régalien (CANON) : **pas** de Slack/PagerDuty US pour porter une alerte
> contenant des données d'incident biométrique. Canaux internes souverains uniquement.

---

## 5. ÉTAPE E — Journalisation de l'incident (hash-chain ADR-007)

> **Objectif : que la réponse à incident soit elle-même auditable et inaltérable-si-ancrée.**

1. **Chaque action** (détection, confinement, rotation kid, révocation, notifications) émet un
   événement d'audit `INCIDENT_BIOMETRIC_*` **chaîné** dans la hash-chain SHA-256 linéaire des
   `audit_logs` (ADR-007) : `curr_hash = SHA-256(prev_hash || payload_canonical)`.
2. **Scellement horaire** : le scellement Ed25519 **in-process** (`@noble/ed25519`, doc 09) signe
   périodiquement la **tête de chaîne**. C'est une **signature** d'intégrité temporelle — Ed25519
   **ne chiffre rien** (CANON crypto) et **n'est pas** dans Vault Transit (ADR-026/034).
3. **Ancrage tiers** : pousser la racine/tête de la fenêtre d'incident vers le tiers (OCLEI /
   Vérificateur Général) pour rendre la trace **opposable** (sinon elle reste détective — doc 25
   §0.6). ⏳ (conçu, Phase 2) si l'ancrage automatisé n'est pas encore livré : ancrage manuel
   documenté.
4. **Ne jamais journaliser** de payload sensible : pas de template (même protégé) ni de paramètre
   cancelable dans les logs d'incident — uniquement des **références** (kid, citizen_id, compteurs).

---

## 6. ÉTAPE F — Éradication

> **Objectif : supprimer la cause racine et les artefacts compromis, définitivement.**

1. **Fermer la voie d'entrée** : corriger la vuln exploitée (IDOR, fuite de credential, mauvaise
   politique Vault, accès base trop large). Re-tester (cf. critères pen-test doc 25 §4.8).
2. **Désactiver le paramètre compromis** : `vN` désactivé dans Vault une fois la migration à 100 %
   (§3.5). Le paramètre fuité ne dérive plus aucun template valide.
3. **Purge des templates révoqués** : après la période de rétention forensique décidée par le DPO,
   **hard delete** des templates `vN` révoqués **et purge de l'index ANN** correspondant (doc 25 §6
   — « effacement biométrique pas effectif » si on oublie l'index) :

   ```sql
   DELETE FROM biometric_templates
    WHERE transform_kid = 'bio-transform-vN' AND revoked_at IS NOT NULL;
   -- puis reconstruire/purger l'index ANN (FAISS) sur les templates protégés restants.
   ```

4. **Rotation des credentials applicatifs** liés (AppRole/SA biométrie) — lease courts, jamais de
   token long-lived (CANON secrets).
5. **Vérifier l'absence d'artefact brut** (doit toujours être vide — doc 25 §5 étape 4) :

   ```bash
   # Aucune image brute ne doit jamais persister (RAM-only + tmpfs, doc 25 §4.4).
   sudo find / -size +50k -mmin -120 \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.raw' -o -iname '*.bmp' \)
   # => sortie vide attendue ; toute ligne = anomalie CRITIQUE (§0.1) à traiter à part.
   ```

---

## 7. ÉTAPE G — Récupération (retour à la normale)

1. **Vérifier l'intégrité fonctionnelle** : FAR/FRR dans les cibles (doc 25 §4.8), latence verify
   p95 < 800 ms, matching correct sur le **nouveau** kid `vN+1`.
2. **Réactiver le 1:N** (désactivé au confinement §2 bis-2) une fois la confiance rétablie et le
   monitoring renforcé en place.
3. **Lever le mode dégradé / rate-limit agressif** progressivement, sous surveillance SIEM accrue.
4. **Confirmer la couverture de migration** : 100 % des citoyens actifs en `vN+1` avant de clôturer
   la rotation (§3.5).
5. **Surveillance renforcée** sur la fenêtre post-incident (accès base templates + chemin Vault
   `transit/keys/bio-transform`).

---

## 8. ÉTAPE H — Post-mortem (sans blâme)

> **Objectif : apprendre, pas punir.** Délai cible : **≤ 5 jours ouvrés** après clôture.

Trame :

1. **Timeline** factuelle (depuis les `audit_logs` chaînés, §5 — auto-cohérente).
2. **Cause racine** (les 5 pourquoi) : comment la base/le paramètre ont-ils été atteints ?
3. **Ce qui a bien marché** : la double-écriture a-t-elle évité l'interruption ? La détection
   a-t-elle été assez rapide ?
4. **Ce qui a manqué** : ancrage tiers de la hash-chain présent ? Délai 72 h tenu ? Index ANN purgé
   ?
5. **Actions correctives** datées et assignées (ex. implémenter l'ancrage automatique ⏳,
   automatiser le job de double-écriture ⏳, resserrer la politique Vault sur `bio-transform`).
6. **Mise à jour documentaire** : si une étape de ce protocole s'est révélée fausse/incomplète, la
   corriger **ici** et répercuter sur doc 25 §4.5/§6 et le SECURITY-RUNBOOK (cf. `MAINTENANCE.md`).

---

## 9. Métriques d'incident (à mesurer et suivre)

| Métrique                                   | Définition                                                    | Cible / Note                          |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------- |
| **MTTD** (Mean Time To Detect)             | Δ entre l'exfiltration et l'ouverture de l'incident           | Minimiser (alerting SIEM)             |
| **MTTC** (Mean Time To Contain)            | Δ détection → confinement effectif (§2 bis)                   | < 1 h cible                           |
| **TTR-param** (Time To Rotate)             | Δ détection → nouveau kid `vN+1` actif (§3.1)                 | < 1 h (geste Vault unique)            |
| **Couverture de migration**                | % citoyens actifs disposant d'un template `vN+1`              | 100 % avant clôture (§3.5)            |
| **Interruption de service**                | Indisponibilité du matching pendant la rotation               | **0** (garantie double-écriture, §3)  |
| **Délai de notification autorité**         | Δ prise de conscience → notification (§4.1)                   | ≤ 72 h                                |
| **Intégrité hash-chain**                   | % maillons `audit_logs` biométriques vérifiés sans rupture    | 100 % (ADR-007)                       |
| **Ancrage tiers de la fenêtre d'incident** | Racine d'audit poussée chez OCLEI/VG                          | Oui/Non (sinon trace détective seule) |
| **Artefacts bruts trouvés**                | Images/templates en clair persistés (§6.5)                    | **0** (toute occurrence = CRITIQUE)   |
| **Templates compromis purgés**             | % templates `vN` révoqués puis hard-deleted + index ANN purgé | 100 % après rétention forensique      |

---

## 10. Récapitulatif — déroulé minute par minute

| #   | Étape          | Geste pivot                                                          | Réf.   |
| --- | -------------- | -------------------------------------------------------------------- | ------ |
| A   | Détection      | Ouvrir incident, **figer les preuves**, vérifier hash-chain          | §2     |
| B   | Confinement    | Révoquer leases compromis, désactiver 1:N, mode dégradé              | §2 bis |
| C   | **Rotation**   | `vault write -f transit/keys/bio-transform/rotate` + double-écriture | §3     |
| D   | Notification   | Autorité ≤ 72 h + personnes (langage clair, limites honnêtes)        | §4     |
| E   | Journalisation | Chaîner `INCIDENT_BIOMETRIC_*`, sceller Ed25519, ancrer tiers        | §5     |
| F   | Éradication    | Fermer la vuln, désactiver `vN`, purger templates + index ANN        | §6     |
| G   | Récupération   | Vérifier FAR/FRR, réactiver 1:N, 100 % migrés                        | §7     |
| H   | Post-mortem    | Cause racine, actions correctives datées, mise à jour docs           | §8     |

---

## 11. Références

- [`docs/25-BLOC-F-BIOMETRIE.md`](../25-BLOC-F-BIOMETRIE.md) — §0.4/§0.6 (protection ISO 24745,
  limite 1:N), §4.2 (verify multi-kids), **§4.3** (cancelable), **§4.5** (rotation double-écriture),
  §4.7 (DPIA, procédure d'incident), §6 (pièges & dépannage).
- [`docs/security/SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md) — login OIDC, rotation
  Vault.
- [`docs/security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — modèle de menace.
- [`docs/biometrics/DPIA-NINA-AES-2026.md`](./DPIA-NINA-AES-2026.md) — DPIA (procédure d'incident,
  §10).
- [`docs/biometrics/CONSENT-PROTOCOL.md`](./CONSENT-PROTOCOL.md) — consentement JWS (chaîne de
  confiance).
- **ADR-007** (hash-chain SHA-256), **ADR-026/034** (Vault Transit / Ed25519 hors Transit, décision
  sécurité).
- ISO/IEC 24745 (protection de l'information biométrique), ISO/IEC 19794-\* (formats).

> **Marqueurs d'honnêteté présents dans ce document** : ⏳ (conçu, Phase 2) sur la double-écriture
> automatisée, le script `audit:verify-chain`, et l'ancrage tiers automatisé de la hash-chain —
> alignés sur doc 25 §0.7. Le reste décrit des gestes **exécutables** (Vault, SQL) ou des décisions
> organisationnelles **applicables immédiatement**.
