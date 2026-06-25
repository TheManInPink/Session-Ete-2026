# ADR-025 — Biométrie phasée P3a/P3b/P3c, protection de template ISO/IEC 24745 (cancelable, irréversible + révocable), formats ISO standards

**Statut** : ✅ Accepté (vision V1) — **Implémentation conditionnée** — **Révisé v1.1 : décision
corrigée** **Date** : 2026-05-16 (révision conceptuelle 2026-06-18) **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [25 — Bloc F Biométrie](../25-BLOC-F-BIOMETRIE.md) **Complète** :
[ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md) **Cf. aussi** :
[doc 15 — Security Hardening](../15-SECURITY-HARDENING.md) (Vault PKI, mTLS — pas d'ADR dédié, cf.
`DOCUMENTATION-MAP.md` §4.3),
[ADR-034 — Security Hardening Vault/mTLS/OWASP](./ADR-034-security-hardening-vault-mtls-owasp.md)
(secrets, comparaison à temps constant)

> **⚠️ Correction de décision (v1.1).** La v1.0 de cet ADR décidait un _« hash irréversible
> HMAC-SHA-256 du template + égalité stricte »_. **Cette décision était erronée** : un hash
> cryptographique détruit la notion de proximité, donc deux captures du même doigt ne matchent
> jamais (FRR = 100 %), et un index ANN/FAISS sur des hash n'a aucun sens. La décision est corrigée
> ci-dessous en **protection de template ISO/IEC 24745** (cancelable biometrics, comparaison par
> **distance + seuil**). Le **nom de fichier** de l'ADR (`...-hash-irreversible.md`) est conservé
> pour ne pas casser les liens existants, mais son contenu ne recommande **plus** le schéma par
> hash.

---

## Contexte

La biométrie est la fonction la plus à risque d'un système d'identité. Trois caractéristiques
exceptionnelles :

1. **Irrévocabilité** : on change un mot de passe, on ne change pas une empreinte ou un visage.
   Fuite = compromission **à vie**.
2. **Universalité de l'attaque** : un attaquant qui dump notre base peut cibler 11M de citoyens
   simultanément. Pas de mitigation « changement de password ».
3. **Asymétrie réputationnelle** : un système d'identité fonctionne parce que les citoyens y font
   confiance. Une fuite biométrique = perte de confiance institutionnelle pour des années.

L'écosystème mondial offre 5+ solutions techniques (capteurs, formats, algos), mais les
recommandations divergent énormément entre :

- ANSSI/CNIL France (très restrictif sur stockage centralisé)
- NIST USA (techniques mais peu de garde-fous éthiques)
- Aadhaar India (très centralisé, beaucoup de critiques)
- Estonie eIDAS (décentralisé sur carte à puce, modèle alternatif)

Pour NINA-AES, on doit définir une position claire **avant** d'écrire du code. Six principes
non-négociables :

1. **Aucune image brute persistée** sur disque, jamais.
2. **Protection de template ISO/IEC 24745** avant stockage : **irréversible** (pas de reconstruction
   de la biométrie), **révocable** (on peut invalider un template fuité sans changer le doigt du
   citoyen) et **non-chaînable**. On ne stocke **ni l'image, ni le template en clair** — uniquement
   un **template protégé** (cancelable) comparé par **distance + seuil**, jamais par égalité de
   hash.
3. **Format ISO standard** (pas de vendor lock-in propriétaire).
4. **Consentement explicite signé** par le citoyen, **vérifié contre sa clé publique ancrée**.
5. **Phasage progressif** P3a/P3b/P3c avec critères go/no-go entre phases.
6. **Base légale robuste** : socle RGPD-équivalent + consentement + DPIA, **sans dépendre** d'une
   loi nationale non encore adoptée.

> **Pourquoi pas un simple hash ?** Parce que la biométrie est **floue** : deux captures du même
> doigt diffèrent de quelques bits, et un hash cryptographique (effet d'avalanche) produit alors
> deux sorties totalement différentes → aucun match possible. Il faut une transformation qui
> **préserve la distance** tout en restant irréversible et révocable. C'est exactement l'objet
> d'ISO/IEC 24745. Détails et démonstration : doc 25 §0.

---

## Décision

### Phasage en 3 phases obligatoires

- **P3a — Empreintes digitales seules + vérification 1:1** (le plus mûr, le moins risqué)
- **P3b — Reconnaissance faciale 1:1** (ajout après P3a stable
  - audit biais raciaux)
- **P3c — Recherche 1:N restreinte** (uniquement après mandat judiciaire, audit Merkle obligatoire
  par requête)

Chaque transition est conditionnée à des **critères chiffrés** (FAR, FRR, audit forensique,
pen-test). Tant qu'un critère n'est pas validé, on ne passe pas à la phase suivante.

### Pipeline technique

1. **Capture** : capteur FAP30 USB FBI-compliant (vendor neutral). Image brute reste en RAM (tmpfs +
   mlock, swap désactivé), jamais sur disque persistant.
2. **Extraction** : OpenCV 5 + algo minutiae → template ISO/IEC 19794-2 (format standard).
3. **Protection (cancelable, ISO/IEC 24745)** :
   `template_protégé = projection_cancelable(template, param_secret_vault)`. La transformation est
   **irréversible**, **révocable** (changer le paramètre invalide l'ancien template) et **préserve
   approximativement la distance** (matching flou possible — c'est tout le contraste avec un hash).
   Le paramètre vit dans Vault Transit, en RAM applicative le moins longtemps possible.
4. **Stockage** : table `biometric_templates` (template **protégé** + `transform_kid` + métrique +
   seuil τ + citizenId + ancre de consentement). Pas d'image, pas de template en clair, pas
   d'embedding facial brut.
5. **Comparaison par distance + seuil, à temps constant** : à la vérification, on transforme la
   nouvelle capture avec le **même** paramètre, puis on déclare « match » si `distance ≤ τ`. Le
   seuil τ est choisi sur la courbe **DET** (compromis FAR/FRR explicite). La routine de scoring est
   à **temps constant** (pas de court-circuit, pas de branche dépendant du secret) —
   anti-corrélation timing.
6. **Mitigations mémoire réalistes** (remplace l'irréaliste « zero-fill RAM ») : swap désactivé,
   `mlock` des buffers sensibles, tmpfs pour tout temporaire, core dumps interdits, effacement
   best-effort sur `bytearray` mutable. On **n'affirme pas** une garantie d'effacement absolue
   (CPython ne le permet pas) — cf. doc 25 §4.4.
7. **Audit Merkle** : log obligatoire de chaque opération (`BIOMETRIC_REGISTERED`,
   `BIOMETRIC_VERIFY_*`).

### Format ISO standard

- **Empreintes** : ISO/IEC 19794-2 (minutiae) ou ISO/IEC 19794-4 (image finger). On stocke un
  **template protégé** de minuties (cancelable), jamais les minuties en clair.
- **Face** : ISO/IEC 19794-5 (face image) → embedding 512 floats via FaceNet/ArcFace ONNX →
  **transformation cancelable préservant la distance cosinus** (random projection paramétrée Vault).
  On stocke le **template facial protégé**, comparé par distance cosinus ≤ τ. **Pas** de hash HMAC
  de l'embedding (qui détruirait la métrique et empêcherait tout match).
- **Protection** : ISO/IEC 24745 (cancelable biometrics ; _fuzzy commitment_ documenté comme
  alternative P3+ pour dériver une clé exacte).

Aucun format propriétaire (pas de Morpho, pas de NEC, pas d'Idemia).

### Consentement obligatoire signé

- Avant capture, l'agent affiche le formulaire de consentement (FR + 7 langues nationales).
- Le citoyen signe via clé Ed25519 dans son téléphone (Bloc A appli mobile) OU à défaut empreinte
  digitale sur tablette agent.
- **Chaîne de confiance** : la signature JWS est vérifiée **contre la clé publique ancrée** du
  citoyen (résolue via le registre de clés souverain du Bloc A, clé enrôlée/non expirée/non
  révoquée). Sans cet ancrage, n'importe qui pourrait signer « à la place » du citoyen. On stocke le
  `kid` du signataire (`consent_signer_kid`) pour l'opposabilité.
- La signature JWS Ed25519 est stockée chiffrée dans MinIO (preuve juridique 10 ans).
- Refus du consentement = pas de biométrie, le NINA reste valide.

### Rotation du paramètre cancelable (double-écriture)

- Le **paramètre de transformation cancelable** (dans Vault Transit) est rotated tous les 5 ans, ou
  **immédiatement** en cas de soupçon de compromission.
- **Procédure en double-écriture** (et non « big bang ») : nouveau `transform_kid`, les nouveaux
  enrôlements/ré-enrôlements écrivent en `vN+1` **sans supprimer** `vN` ; le matching tolère
  plusieurs kids actifs ; révocation différée des `vN` une fois le citoyen migré. **Le service n'est
  pas interrompu.** C'est un gain direct vs un sel HMAC (qui imposait un ré-enrôlement forcé
  immédiat).
- Versioning explicite via `transform_kid`. Détail opérationnel : doc 25 §4.5.

### 1:N restreint au strict minimum

- **Accès** : rôle `INSPECTOR` + double validation procureur (workflow 4-yeux).
- **Audit** : chaque requête 1:N génère un log Merkle obligatoire.
- **Politique** : mandat judiciaire ou enquête OCLEI uniquement.
- **Performance** : index ANN (FAISS) **sur les templates protégés** (cancelable, distance
  préservée), **jamais sur des hash** (un hash détruirait la métrique → résultats absurdes).
  Recherche < 2 s sur 11M citoyens. Le paramètre de transformation reste dans Vault, **séparé** de
  l'index.
- **Limite de confidentialité assumée** : un index ANN exploite la distance, donc le template
  protégé indexé conserve de la structure géométrique. Il est révocable et non inversible vers
  l'image, **mais** n'équivaut pas à un chiffrement fort : un attaquant détenant l'index **et** le
  paramètre peut faire du _linkage_. À documenter dans la DPIA (doc 25 §0.6).

---

## Conséquences positives

- **Aucune fuite d'image possible** : pas d'image stockée, période.
- **Template irréversible ET fonctionnel** : un dump de la DB ne permet pas de reconstruire les
  empreintes (irréversibilité ISO 24745), **tout en** permettant le matching flou (la distance est
  préservée) — ce que le schéma par hash ne pouvait pas offrir.
- **Révocabilité = défense ultime** : si le paramètre cancelable est compromis, on le rotate
  (double-écriture, sans coupure) → les templates protégés compromis deviennent inutilisables. On
  protège les empreintes du long terme **sans** imposer un ré-enrôlement forcé immédiat de 11M
  citoyens.
- **Non-chaînabilité** : deux templates protégés du même doigt (paramètres différents) ne se relient
  pas → un opérateur ne peut pas corréler les citoyens entre bases.
- **Pas de vendor lock-in** : ISO 19794-\* / 24745 standards → capteur FAP30 ou autre, peu importe.
- **Consentement traçable et opposable** : JWS Ed25519 **ancré sur la clé publique du citoyen** +
  audit Merkle = preuve juridique **opposable et falsification détectable** (sous réserve de la
  **publication externe de la racine Merkle**, cf. ADR-007 — **non encore implémentée** : sans cet
  ancrage tiers, un admin DB maîtrisant la genèse peut reconstruire la hash-chain).
- **Phasage protège l'institution** : on ne déploie pas la face recognition avant validation P3a
  complète. Réduit le risque de bug systémique.
- **1:N audité** : chaque requête laisse une trace cryptographique **détective, pas préventive** —
  elle rend la surveillance de masse _détectable a posteriori_, mais ne l'empêche pas techniquement.
  Pour être **opposable à un administrateur DB malveillant** (qui pourrait réécrire la hash-chain),
  elle **nécessite l'ancrage externe de la racine Merkle** (publication périodique vers un registre
  tiers, cf. ADR-007 — non encore implémenté).

---

## Conséquences négatives

- **Complexité du schéma cancelable** : la projection cancelable doit être **implémentée avec soin
  et validée par mesure FAR/FRR** (courbe DET). Un schéma mal paramétré dégrade la précision ou la
  sécurité. C'est plus exigeant qu'un simple HMAC — mais le HMAC ne fonctionnait pas (cf. §0).
- **Latence Vault pour le paramètre** : ~50-100 ms par lecture de paramètre. Acceptable en 1:1 ;
  pour 1:N, on cache localement les paramètres des `kid` actifs + batch processing.
- **Confidentialité 1:N partielle** : l'index ANN conserve de la structure (limite ISO assumée,
  §0.6). Mitigée par séparation paramètre/index, accès 4-yeux, audit Merkle, rotation sur incident.
- **Limite intrinsèque de la révocabilité** : un attaquant qui a capté un template protégé **et** le
  paramètre **avant** rotation a pu agir ; la rotation protège le futur, pas le passé déjà exfiltré.
- **Pas de federation biométrique cross-pays** : un citoyen malien qui a enrôlé son empreinte ne
  peut pas la réutiliser au Burkina sans ré-enrôlement. Trade-off conscient pour souveraineté.
- **Coûts hardware** : capteur FAP30 ~50 €/unité × 200 mairies × 3 capteurs/mairie = 30 000 €. +
  caméras HD pour Phase P3b.
- **Risque réputationnel** : malgré toutes les précautions, un incident biométrique sera médiatisé.
  Mitigation : transparence totale (audit social annuel public, anonymisé).
- **Pas implémenté en V1** : la vision est cadrée mais le code attend des conditions juridiques +
  institutionnelles (cadre légal malien stabilisé, validation OCLEI). Risque que ces conditions
  n'arrivent jamais → biométrie reste théorique.

---

## Note sur la souveraineté numérique

Cinq mitigations spécifiques :

1. **Modèles ONNX open-source** : ArcFace + FaceNet sont MIT/Apache. Pas de Microsoft Face API, AWS
   Rekognition, Google Vision (tous SaaS US).
2. **Capteurs FBI compliant mais neutres** : FAP30 est un standard ouvert, supporté par plusieurs
   constructeurs (HID, Thales, Suprema). Pas de monopole.
3. **Vault self-hosted** : le **paramètre de transformation cancelable** ne quitte JAMAIS le DC
   CTDEC (pas d'AWS KMS, pas de HSM cloud étranger).
4. **Format ISO standards** : si demain le Mali bascule de NEC vers Suprema, les templates restent
   compatibles.
5. **DPIA audité localement** : pas de soumission à eIDAS ou ANSSI France. Audit par CISO CTDEC +
   autorité malienne de protection des données (DPC).

---

## Alternatives rejetées

- **Aucune biométrie** : option « ultra-prudente ». Rejeté car (a) perte de la capacité à lutter
  contre la fraude d'identité massive, (b) demande institutionnelle CTDEC forte, (c) avantage
  compétitif vs systèmes voisins.

- **« Hash HMAC-SHA-256 du template + égalité stricte des hash »** (la décision de la v1.0 de cet
  ADR) : **rejeté car techniquement non fonctionnel**. Un hash a un effet d'avalanche → deux
  captures du même doigt produisent deux hash totalement différents → FRR = 100 %, aucun match. De
  plus un index ANN/FAISS sur des hash est absurde (la métrique de distance est détruite). C'est
  l'erreur que corrige la présente révision (cf. doc 25 §0).

- **Fuzzy commitment / fuzzy extractor seul** (biometric cryptosystem) : excellent pour dériver une
  **clé exacte** à partir d'une biométrie, mais (a) moins souple pour l'indexation ANN 1:N, (b)
  paramétrage du code correcteur d'erreurs délicat. Retenu comme **alternative P3+** (déverrouillage
  de secret), pas comme chemin nominal. Le chemin nominal est la cancelable biometrics (distance
  préservée, compatible ANN).

- **Stockage de templates en clair** (juste chiffrés AES) : option des systèmes USA / Inde. Rejeté
  car (a) compromission DB = reconstruction empreintes via décryptage, (b) ne tient pas un audit
  ANSSI moderne.

- **Stockage d'images brutes encrypted** : encore plus dangereux. Rejeté.

- **Match-on-card** (template sur la CNI à puce, jamais central) : modèle Estonie eIDAS. Très
  solide, mais nécessite (a) nouvelles CNI avec puce sécurisée, (b) infra de lecture compatible dans
  toutes les mairies. Coût ~5× supérieur. Considéré V3.

- **Biométrie centralisée avec template clear** (modèle Aadhaar) : rejeté pour raisons éthiques +
  sécuritaires.

- **Algos propriétaires (NEC, Idemia, Suprema)** : performances excellentes mais (a) vendor lock-in
  fatal, (b) algorithmes opaques → impossible d'auditer le biais, (c) dépendance commerciale long
  terme. Rejeté en faveur de FaceNet/ArcFace ONNX open-source.

- **Federation biométrique BCID-AES** (partager templates Mali-BFA-NER) : pas en V1. Risque trop
  élevé sans cadre juridique inter-pays.

- **Fingerprint sur smartphone uniquement** (TouchID/FaceID) : rejeté car (a) exclut les citoyens
  sans smartphone (40 %), (b) pas d'audit possible sur Apple/Google enclave, (c) souveraineté
  compromise.

- **Pas de phasage** (tout en une fois P3a+b+c) : rejeté car augmente le risque. Le phasage permet
  de détecter les problèmes P3a avant d'étendre à face/1:N.

---

## Suivi

| Métrique                                        | Cible              | Outil                                   |
| ----------------------------------------------- | ------------------ | --------------------------------------- |
| Phase actuelle                                  | P3a → P3b → P3c    | Manuel                                  |
| Faux positifs (FAR) au point d'opération        | < 0.01 %           | Test annuel sur 10 000 paires (DET)     |
| Faux négatifs (FRR) au point d'opération        | < 1–3 % (réaliste) | Test annuel sur 1 000 enrôlements (DET) |
| Seuil τ et métrique documentés/figés            | OK                 | Revue config + audit                    |
| Images brutes persistées disque                 | **0**              | Audit forensique trimestriel            |
| Templates en clair persistés                    | **0**              | Audit forensique trimestriel            |
| Audit Merkle 100 % opérations                   | 100 %              | Diff audit_logs / biometric_templates   |
| Demandes d'effacement satisfaites < 30 jours    | 100 %              | Manuel — DPO CTDEC                      |
| Incidents biométriques notifiés                 | **0**              | Manuel                                  |
| Pen-test annuel : finding CRITICAL/HIGH         | **0**              | Rapport pen-test                        |
| Rotation paramètre cancelable (double-écriture) | tous les 5 ans     | Vault audit log                         |
| Taux de refus citoyens (consentement)           | tracking only      | Counter Prometheus                      |
| 1:N queries / mois                              | tracking only      | Counter audité OCLEI                    |
| Biais racial (P3b) — parité performances        | ≥ 99 % parité      | Test équité annuel                      |

Si **un seul incident biométrique** notifié, ou si **un audit forensique trouve une image brute (ou
un template en clair) persisté**, déclenchement immédiat du protocole d'incident
(`INCIDENT-PROTOCOL.md`) + **rotation du paramètre cancelable** (double-écriture) + revue ADR
complète.
