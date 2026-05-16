# ADR-025 — Biométrie phasée P3a/P3b/P3c, hash irréversible HMAC-SHA-256, formats ISO standards

**Statut** : ✅ Accepté (vision V1) — **Implémentation conditionnée**
**Date** : 2026-05-16 **Décideurs** : Étudiant UQAR (solo)
**Contexte document** : [25 — Bloc F Biométrie](../25-BLOC-F-BIOMETRIE.md)
**Complète** : [ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md),
[ADR-015 — Sécurité hardening](./ADR-015-ml-stack-detection-erreurs-nina.md) (Vault PKI)

---

## Contexte

La biométrie est la fonction la plus à risque d'un système d'identité.
Trois caractéristiques exceptionnelles :

1. **Irrévocabilité** : on change un mot de passe, on ne change pas
   une empreinte ou un visage. Fuite = compromission **à vie**.
2. **Universalité de l'attaque** : un attaquant qui dump notre base
   peut cibler 11M de citoyens simultanément. Pas de mitigation
   « changement de password ».
3. **Asymétrie réputationnelle** : un système d'identité fonctionne
   parce que les citoyens y font confiance. Une fuite biométrique =
   perte de confiance institutionnelle pour des années.

L'écosystème mondial offre 5+ solutions techniques (capteurs, formats,
algos), mais les recommandations divergent énormément entre :

- ANSSI/CNIL France (très restrictif sur stockage centralisé)
- NIST USA (techniques mais peu de garde-fous éthiques)
- Aadhaar India (très centralisé, beaucoup de critiques)
- Estonie eIDAS (décentralisé sur carte à puce, modèle alternatif)

Pour NINA-AES, on doit définir une position claire **avant** d'écrire
du code. Cinq principes non-négociables :

1. **Aucune image brute persistée** sur disque, jamais.
2. **Hash irréversible obligatoire** avant stockage.
3. **Format ISO standard** (pas de vendor lock-in propriétaire).
4. **Consentement explicite signé** par le citoyen.
5. **Phasage progressif** P3a/P3b/P3c avec critères go/no-go entre
   phases.

---

## Décision

### Phasage en 3 phases obligatoires

- **P3a — Empreintes digitales seules + vérification 1:1** (le plus
  mûr, le moins risqué)
- **P3b — Reconnaissance faciale 1:1** (ajout après P3a stable
  + audit biais raciaux)
- **P3c — Recherche 1:N restreinte** (uniquement après mandat
  judiciaire, audit Merkle obligatoire par requête)

Chaque transition est conditionnée à des **critères chiffrés** (FAR,
FRR, audit forensique, pen-test). Tant qu'un critère n'est pas validé,
on ne passe pas à la phase suivante.

### Pipeline technique

1. **Capture** : capteur FAP30 USB FBI-compliant (vendor neutral).
   Image brute reste en RAM < 200 ms, jamais sur disque.
2. **Extraction** : OpenCV 5 + algo minutiae → template ISO/IEC 19794-2
   (format standard).
3. **Hash** : HMAC-SHA-256(template, salt_secret_vault) → 32 octets
   hex. Le salt est dans Vault Transit, jamais en mémoire applicative
   plus de 50 ms.
4. **Stockage** : table `biometric_hashes` (hash + kid + citizenId).
   Pas de template, pas d'image, pas d'embedding face.
5. **Zero-fill RAM** : après stockage, écraser explicitement la zone
   mémoire qui contenait l'image et le template.
6. **Audit Merkle** : log obligatoire de chaque opération
   (`BIOMETRIC_REGISTERED`, `BIOMETRIC_VERIFY_*`).

### Format ISO standard

- **Empreintes** : ISO/IEC 19794-2 (minutiae) ou ISO/IEC 19794-4 (image
  finger). On stocke des hashes de minutiae uniquement.
- **Face** : ISO/IEC 19794-5 (face image) → embedding 512 floats via
  FaceNet/ArcFace ONNX → hash HMAC du embedding.

Aucun format propriétaire (pas de Morpho, pas de NEC, pas d'Idemia).

### Consentement obligatoire signé

- Avant capture, l'agent affiche le formulaire de consentement
  (FR + 7 langues nationales).
- Le citoyen signe via clé Ed25519 dans son téléphone (Bloc A
  appli mobile) OU à défaut empreinte digitale sur tablette agent.
- La signature JWS Ed25519 est stockée chiffrée dans MinIO
  (preuve juridique 10 ans).
- Refus du consentement = pas de biométrie, le NINA reste valide.

### Salt rotation

- Le salt HMAC-SHA-256 est rotated tous les 5 ans (ou immédiatement
  en cas de soupçon de compromission Vault).
- Rotation = re-enrollment de tous les citoyens (procédure 6-12 mois).
- Versioning explicite via `kid` field.

### 1:N restreint au strict minimum

- **Accès** : rôle `INSPECTOR` + double validation procureur
  (workflow 4-yeux).
- **Audit** : chaque requête 1:N génère un log Merkle obligatoire.
- **Politique** : mandat judiciaire ou enquête OCLEI uniquement.
- **Performance** : index FAISS sur les hashes (recherche < 2s sur
  11M citoyens).

---

## Conséquences positives

- **Aucune fuite d'image possible** : pas d'image stockée, période.
- **Hash irréversible** : même un dump complet de la DB ne permet pas
  de reconstruire les empreintes. Bruteforce théorique impossible
  sans le salt Vault.
- **Salt rotation = défense ultime** : si Vault est compromis, on
  rotate le salt et tous les hashes deviennent inutilisables → forced
  re-enrollment. Coûteux mais sauve les empreintes du long terme.
- **Pas de vendor lock-in** : ISO 19794-* standards → capteur FAP30
  ou autre, peu importe.
- **Consentement traçable** : JWS Ed25519 + audit Merkle =
  preuve juridique inaltérable.
- **Phasage protège l'institution** : on ne déploie pas la face
  recognition avant validation P3a complète. Réduit le risque de
  bug systémique.
- **1:N audité** : impossible d'utiliser la base biométrique pour de
  la surveillance de masse — chaque requête laisse une trace
  cryptographique.

---

## Conséquences négatives

- **Verify lent à cause du Vault round-trip** : ~50-100 ms par HMAC.
  Acceptable pour vérification 1:1 ; pour 1:N, on doit cache localement
  les `kid` valides + batch processing.
- **Rotation salt = re-enrôlement massif** : 11M citoyens × 5 min par
  ré-enrôlement = 900 000 heures-agent. Mitigation : rotation très
  rare (uniquement si Vault compromis) + procédure étalée 6-12 mois.
- **Pas de federation biométrique cross-pays** : un citoyen malien qui
  a enrôlé son empreinte ne peut pas la réutiliser au Burkina sans
  ré-enrôlement. Trade-off conscient pour souveraineté.
- **Coûts hardware** : capteur FAP30 ~50 €/unité × 200 mairies ×
  3 capteurs/mairie = 30 000 €. + caméras HD pour Phase P3b.
- **Risque réputationnel** : malgré toutes les précautions, un
  incident biométrique sera médiatisé. Mitigation : transparence
  totale (audit social annuel public, anonymisé).
- **Pas implémenté en V1** : la vision est cadrée mais le code
  attend des conditions juridiques + institutionnelles (cadre légal
  malien stabilisé, validation OCLEI). Risque que ces conditions
  n'arrivent jamais → biométrie reste théorique.

---

## Note sur la souveraineté numérique

Cinq mitigations spécifiques :

1. **Modèles ONNX open-source** : ArcFace + FaceNet sont MIT/Apache.
   Pas de Microsoft Face API, AWS Rekognition, Google Vision (tous
   SaaS US).
2. **Capteurs FBI compliant mais neutres** : FAP30 est un standard
   ouvert, supporté par plusieurs constructeurs (HID, Thales,
   Suprema). Pas de monopole.
3. **Vault PKI self-hosted** : le salt HMAC ne quitte JAMAIS le DC
   CTDEC.
4. **Format ISO standards** : si demain le Mali bascule de NEC vers
   Suprema, les templates restent compatibles.
5. **DPIA audité localement** : pas de soumission à eIDAS ou ANSSI
   France. Audit par CISO CTDEC + autorité malienne de protection
   des données (DPC).

---

## Alternatives rejetées

- **Aucune biométrie** : option « ultra-prudente ». Rejeté car (a)
  perte de la capacité à lutter contre la fraude d'identité massive,
  (b) demande institutionnelle CTDEC forte, (c) avantage compétitif
  vs systèmes voisins.

- **Stockage de templates en clair** (juste chiffrés AES) : option
  des systèmes USA / Inde. Rejeté car (a) compromission DB =
  reconstruction empreintes via décryptage, (b) ne tient pas un audit
  ANSSI moderne.

- **Stockage d'images brutes encrypted** : encore plus dangereux.
  Rejeté.

- **Match-on-card** (template sur la CNI à puce, jamais central) :
  modèle Estonie eIDAS. Très solide, mais nécessite (a) nouvelles
  CNI avec puce sécurisée, (b) infra de lecture compatible dans toutes
  les mairies. Coût ~5× supérieur. Considéré V3.

- **Biométrie centralisée avec template clear** (modèle Aadhaar) :
  rejeté pour raisons éthiques + sécuritaires.

- **Algos propriétaires (NEC, Idemia, Suprema)** : performances
  excellentes mais (a) vendor lock-in fatal, (b) algorithmes opaques
  → impossible d'auditer le biais, (c) dépendance commerciale long
  terme. Rejeté en faveur de FaceNet/ArcFace ONNX open-source.

- **Federation biométrique BCID-AES** (partager templates Mali-BFA-NER) :
  pas en V1. Risque trop élevé sans cadre juridique inter-pays.

- **Fingerprint sur smartphone uniquement** (TouchID/FaceID) :
  rejeté car (a) exclut les citoyens sans smartphone (40 %), (b) pas
  d'audit possible sur Apple/Google enclave, (c) souveraineté
  compromise.

- **Pas de phasage** (tout en une fois P3a+b+c) : rejeté car
  augmente le risque. Le phasage permet de détecter les problèmes
  P3a avant d'étendre à face/1:N.

---

## Suivi

| Métrique                                          | Cible            | Outil                              |
| ------------------------------------------------- | ---------------- | ---------------------------------- |
| Phase actuelle                                    | P3a → P3b → P3c  | Manuel                             |
| Faux positifs (FAR)                                | < 0.01 %         | Test annuel sur 10 000 paires      |
| Faux négatifs (FRR)                                | < 1 %            | Test annuel sur 1 000 enrôlements  |
| Images brutes persistées disque                    | **0**            | Audit forensique trimestriel       |
| Audit Merkle 100 % opérations                     | 100 %            | Diff audit_logs / biometric_hashes |
| Demandes d'effacement satisfaites < 30 jours      | 100 %            | Manuel — DPO CTDEC                  |
| Incidents biométriques notifiés                   | **0**            | Manuel                              |
| Pen-test annuel : finding CRITICAL/HIGH           | **0**            | Rapport pen-test                    |
| Rotation salt effectuée                           | tous les 5 ans   | Vault audit log                     |
| Taux de refus citoyens (consentement)             | tracking only    | Counter Prometheus                  |
| 1:N queries / mois                                 | tracking only    | Counter audité OCLEI                |
| Biais racial (P3b) — parité performances          | ≥ 99 % parité    | Test équité annuel                  |

Si **un seul incident biométrique** notifié, ou si **un audit
forensique trouve une image brute persistée**, déclenchement immédiat
du protocole d'incident (`INCIDENT-PROTOCOL.md`) + rotation salt +
revue ADR complète.
