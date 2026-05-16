# 25 — Bloc F : Biométrie (capture, hash irréversible, vérification 1:1 et 1:N) — Plan progressif

> **Bloc concerné** : F (Priorité P3 — **EN DERNIER**, après A → E)
> **Prérequis** : tous les blocs précédents stabilisés et auditables ;
> doc 15 (sécurité, Vault PKI) ; doc 17 (observabilité avec alertes
> spécifiques biométrie) ; doc 18 (tests rigoureux — la biométrie ne
> tolère AUCUNE régression) ; cadre juridique malien actualisé sur la
> protection des données biométriques (DPA national).
> **Durée estimée** : 30 à 45 heures pour un étudiant seul (mais
> probablement HORS scope V1 universitaire — vision seulement).
> **Livrables de cette étape (V1 = vision et plan, PAS implémentation)** :
>
> - **Plan d'intégration progressive en 3 phases** (P3a → P3c), avec
>   critères go/no-go entre phases.
> - **Schéma biométrique** : capture, normalisation, **hash irréversible**
>   (HMAC-SHA-256 + salt secret Vault), stockage, vérification 1:1 + 1:N.
> - **Critères éthiques et juridiques** : aucune image brute conservée,
>   consentement obligatoire, droit à l'effacement, audit Merkle de
>   chaque opération biométrique.
> - **Stack technique recommandée** : OpenCV 5 + ONNX Runtime (modèles
>   ouverts), Vault PKI pour les clés HMAC, MinIO chiffré pour les
>   templates uniquement.
> - **Document d'analyse d'impact RGPD-équivalent** (DPIA Mali) modèle.
> - `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md`

---

## 1. Objectif pédagogique

La biométrie est la **fonction la plus à risque** d'un système
d'identité. Trois leçons fondamentales :

1. **Une donnée biométrique est éternelle**. On peut changer un mot de
   passe ou un numéro de téléphone ; on ne peut pas changer ses
   empreintes. Une fuite = compromission **à vie** du citoyen.

2. **L'image brute ne doit JAMAIS être conservée**. Seul le
   **template mathématique** (vecteur d'embedding) sort du capteur, et
   il doit être **hashé irréversiblement** avant stockage. Notre base
   ne contient PAS d'empreintes — elle contient des hash de
   templates.

3. **Le consentement explicite + droit à l'effacement sont
   non-négociables**. Un citoyen doit pouvoir refuser la biométrie sans
   perdre son NINA. Un citoyen doit pouvoir demander la suppression de
   ses templates à tout moment (sans suppression de son NINA, juste de
   ses templates).

> ⚠️ **Pourquoi P3 et pas avant ?** Parce qu'il est facile de livrer
> une biométrie qui « marche » techniquement mais qui est
> juridiquement intenable. On préfère reporter Bloc F tant que :
>
> - Le cadre juridique malien sur les données biométriques n'est pas
>   stabilisé (en cours, lois 2024-2025)
> - La gouvernance OCLEI/CISO CTDEC n'a pas validé un DPIA formel
> - Aucun pilote ANSSI n'a audité le module pen-testing
>
> Hors de ces conditions, **la biométrie est un risque, pas un
> bénéfice**.

---

## 2. Phasage en 3 étapes (avec critères go/no-go)

### Phase P3a — Empreintes digitales seules (12-16 h dev + audit)

**Périmètre** :
- Capture empreintes via capteur USB FAP30 (FBI compliant — pas de
  vendor lock-in)
- Template ISO/IEC 19794-2 (minutiae format standard, pas de
  format propriétaire)
- Hash HMAC-SHA-256 du template + salt Vault
- Vérification 1:1 uniquement (citoyen présente NINA + empreinte → match
  hash)

**Critères go/no-go pour passer à P3b** :
- ✅ Taux faux positif < 0.01 %, taux faux négatif < 1 % sur 1000 citoyens
- ✅ Aucune image brute capturée sur disque (vérifié par audit forensique)
- ✅ Audit Merkle de chaque opération biométrique
- ✅ DPIA validé par CISO CTDEC
- ✅ Pen-test ANSSI ou équivalent sans CRITICAL/HIGH

### Phase P3b — Reconnaissance faciale 1:1 (8-12 h dev)

**Périmètre** :
- Capture photo via webcam HD (1080p min)
- Embedding via modèle open-source (FaceNet, ArcFace) en local ONNX
- Hash + storage similaire P3a
- Vérification 1:1 uniquement (citoyen présente NINA + face → match)

**Critères go/no-go pour P3c** :
- ✅ Égalité performances P3a
- ✅ Tests anti-spoofing (photo imprimée, écran téléphone) — > 95 %
  détection
- ✅ Biais raciaux audités : performances égales sur peau claire / foncée
  (≥ 99 % parité)

### Phase P3c — Vérification 1:N (10-15 h dev)

**Périmètre** :
- Recherche d'un citoyen dans la base sur empreinte ou face (cas
  d'investigation OCLEI sur fraude)
- Index FAISS pour search rapide sur embeddings haché
- **Accès restreint** : rôle `INSPECTOR` + double validation (procureur)
- Audit Merkle obligatoire de CHAQUE requête 1:N

**Critères de production** :
- ✅ Latence p95 < 2 s sur 11M citoyens
- ✅ Logs 1:N inaltérables (chaque requête tracée)
- ✅ Politique d'usage stricte : 1:N uniquement avec mandat judiciaire

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_Biometrics
title Biométrie — flux de capture + hash irréversible

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud     { BackgroundColor #FEE2E2; BorderColor #DC2626 }

actor "Citoyen consentant" as Citizen
rectangle "Capteur FAP30\n(empreinte)" as Sensor
rectangle "biometric-service\n(Python FastAPI 3012)" as Bio
rectangle "OpenCV 5 + ONNX\n(extraction template)" as Extract
rectangle "Vault PKI Transit\nHMAC-SHA-256 + salt" as Vault
database "PostgreSQL\nbiometric_hashes\n(jamais d'image)" as PG
rectangle "Audit Merkle\n(chaque opération)" as Audit

Citizen --> Sensor : empreinte
Sensor --> Bio : raw image (RAM only)
Bio --> Extract : ISO 19794-2 template
Extract --> Vault : hash(template, salt)
Vault --> Bio : hash résultat (32 octets)

Bio --> PG : INSERT biometric_hashes\n(nina_id, hash, kid, captured_at)
Bio --> Audit : log BIOMETRIC_REGISTERED
Bio -> Bio : zero-fill RAM raw image
Bio -> Bio : zero-fill RAM template

note bottom of Bio
  Garanties :
  - L'image brute reste en RAM < 200 ms
  - Pas d'écriture disque (FUSE tmpfs uniquement)
  - Template ISO standard (no vendor lock-in)
  - Hash HMAC irréversible (sel secret Vault)
  - Si Vault compromis, salt rotated → tous
    les hashes deviennent inutilisables
    (citoyens doivent ré-enroller)
end note
@enduml
```

---

## 4. Étapes d'implémentation (V1 = squelette, P3a complet)

### Étape 4.1 — Modèle Prisma

```prisma
model BiometricHash {
  id             BigInt   @id @default(autoincrement())
  citizenId      String                                 // FK Citizen
  kind           BiometricKind                         // FINGERPRINT | FACE
  hash           String   @unique                       // HMAC-SHA-256 hex
  kid            String                                 // identifiant clé salt Vault (rotation)
  templateFormat String                                 // ex: "ISO/IEC 19794-2 v2"
  capturedAt     DateTime @default(now())
  capturedBy     String                                 // agent id
  consentDocUrl  String                                 // MinIO encrypted, preuve consentement
  consentSignature String                              // signature JWS Ed25519 du citoyen
  revokedAt      DateTime?
  revokedReason  String?

  citizen        Citizen  @relation(fields: [citizenId], references: [id])

  @@index([citizenId, kind])
  @@index([hash])     // pour vérification 1:1
  @@map("biometric_hashes")
}

enum BiometricKind { FINGERPRINT FACE }
```

---

### Étape 4.2 — Service Python (FastAPI port 3012)

```python
# services/biometric-service/app/main.py
from fastapi import FastAPI, UploadFile, Depends, HTTPException
from .extractor import extract_template_iso19794
from .hasher import hmac_hash_via_vault
from .audit import log_biometric_event
from .consent import verify_consent_signature

app = FastAPI(title="biometric-service")

@app.post('/v1/register-fingerprint')
async def register_fingerprint(
    citizen_id: str,
    image: UploadFile,
    consent_jws: str,                        # signature JWS Ed25519 par le citoyen
    user = Depends(authenticate_agent),
):
    # 1) Vérifier le consentement signé par le citoyen
    if not verify_consent_signature(consent_jws, citizen_id):
        raise HTTPException(403, "Invalid consent signature")

    # 2) Lire l'image en RAM (jamais sur disque)
    raw = await image.read()
    try:
        # 3) Extraire le template ISO/IEC 19794-2
        template = extract_template_iso19794(raw)
        # 4) Hash HMAC-SHA-256 via Vault Transit
        hash_hex, kid = await hmac_hash_via_vault(template)
        # 5) Stockage du hash uniquement
        record = await db.biometric_hash.create(
            citizen_id=citizen_id,
            kind='FINGERPRINT',
            hash=hash_hex,
            kid=kid,
            template_format="ISO/IEC 19794-2 v2",
            captured_by=user.id,
            consent_signature=consent_jws,
            consent_doc_url=upload_consent_to_minio(consent_jws),
        )
        # 6) Audit Merkle
        await log_biometric_event(
            action='BIOMETRIC_REGISTERED',
            entity_id=record.id,
            payload={'kind': 'FINGERPRINT', 'kid': kid},
        )
        return {'id': record.id, 'kid': kid}
    finally:
        # 7) Zero-fill RAM (sécurité défense en profondeur)
        if 'template' in locals():
            template = bytearray(len(template)) if isinstance(template, (bytes, bytearray)) else None
        raw = bytearray(len(raw))
        del raw
```

**Vérification 1:1** :

```python
@app.post('/v1/verify-fingerprint')
async def verify(
    citizen_id: str,
    image: UploadFile,
    user = Depends(authenticate_agent),
):
    raw = await image.read()
    try:
        template = extract_template_iso19794(raw)
        # Récupérer la liste des kids actifs (rotation)
        active_kids = await db.list_active_biometric_kids(citizen_id, 'FINGERPRINT')
        for kid in active_kids:
            hash_attempt, _ = await hmac_hash_via_vault(template, kid=kid)
            stored = await db.find_biometric_hash(citizen_id, 'FINGERPRINT', kid)
            if stored and stored.hash == hash_attempt:
                await log_biometric_event(action='BIOMETRIC_VERIFY_SUCCESS', entity_id=stored.id)
                return {'match': True, 'confidence': 'high'}
        await log_biometric_event(action='BIOMETRIC_VERIFY_FAIL', entity_id=None,
                                  payload={'citizen_id': citizen_id})
        return {'match': False, 'confidence': 'none'}
    finally:
        raw = bytearray(len(raw))
```

---

### Étape 4.3 — DPIA modèle (Data Protection Impact Assessment)

**Fichier à créer** : `docs/biometrics/DPIA-NINA-AES-2026.md`

Structure type :

1. **Description du traitement** : capture empreintes, hash
   irréversible, vérification 1:1 et 1:N.
2. **Finalités** : authentification renforcée des citoyens lors de
   transactions sensibles, lutte contre fraude d'identité.
3. **Base légale** : Loi 2024-XX du Mali sur la protection des données
   personnelles (à référencer une fois adoptée).
4. **Consentement** : signature électronique du citoyen via JWS
   Ed25519, stockée chiffrée.
5. **Données collectées** : exclusivement le hash HMAC-SHA-256 du
   template ISO 19794-2. JAMAIS l'image brute, JAMAIS le template en
   clair.
6. **Durée de conservation** : tant que NINA actif (durée de vie
   citoyen). Suppression sur demande citoyen ou décès.
7. **Mesures de sécurité** : Vault PKI, mTLS, audit Merkle, accès
   restreint par rôle, formation agents annuelle.
8. **Analyse des risques** :
   - Fuite hash : risque MOYEN (hash irréversible mais bruteforce
     théorique). Mitigation : rotation salt 5 ans.
   - Re-identification : risque BAS (sans le sel, pas d'attaque).
   - Vendor lock-in : risque NUL (format ISO standard).
9. **Droits citoyens** : accès, rectification, effacement, opposition,
   portabilité.
10. **Procédure d'incident** : si fuite de hashes détectée → rotation
    immédiate du salt Vault → ré-enrôlement de tous les citoyens
    concernés (procédure 6-12 mois).

---

### Étape 4.4 — Critères go/no-go détaillés

Avant Phase P3b, l'équipe doit valider :

| Critère                                              | Cible             | Mesure                              |
| ---------------------------------------------------- | ----------------- | ----------------------------------- |
| Taux faux positifs (FAR)                              | < 0.01 % (1/10k)  | Test sur 10 000 paires distinctes   |
| Taux faux négatifs (FRR)                              | < 1 %             | Test sur 1 000 ré-enrôlements       |
| Latence verify p95                                    | < 800 ms          | k6 sur 100 req/min                  |
| Image brute persistée sur disque                      | **0**             | Audit forensique disque             |
| Audit Merkle de toute opération                       | 100 %             | Diff audit_logs vs biometric_hashes |
| Consentement vérifié avant capture                    | 100 %             | Tests Supertest contrôleurs         |
| Rotation salt fonctionnelle                           | OK                | Drill mensuel                       |
| Pen-test : 0 finding CRITICAL/HIGH                    | OK                | Rapport pen-test                    |
| DPIA validé CISO CTDEC                                | OK                | Signature DPO                       |
| Procédure d'effacement testée                         | OK                | Drill semestriel                    |

Tant qu'**un seul critère** n'est pas validé, on ne passe pas à la
phase suivante. C'est la règle d'or de la biométrie.

---

## 5. Validation locale (P3a seulement)

```bash
# 1) Démarrer le service local (simulateur capteur FAP30 inclus en dev)
docker run nina-aes/biometric-service:dev

# 2) Test register (avec image factice + consent JWS signé)
curl -X POST https://localhost:3012/v1/register-fingerprint \
  -H "Authorization: Bearer <agent-jwt>" \
  -F "citizen_id=cln5..." \
  -F "image=@./test/sample-fingerprint.png" \
  -F "consent_jws=eyJ..."

# 3) Test verify (même empreinte → match)
curl -X POST https://localhost:3012/v1/verify-fingerprint \
  -H "Authorization: Bearer <agent-jwt>" \
  -F "citizen_id=cln5..." \
  -F "image=@./test/sample-fingerprint.png"
# → {"match": true, "confidence": "high"}

# 4) Audit forensique : vérifier qu'aucun fichier image n'est persisté
sudo find / -size +50k -newer /tmp/.test-marker -mmin -10 \
  | grep -i "(jpg|png|raw|bmp)" 
# → vide attendu

# 5) Vérifier l'audit Merkle
docker exec nina-postgres psql -U nina_admin -d nina_aes_db \
  -c "SELECT action, entity_id FROM audit_logs WHERE action LIKE 'BIOMETRIC%' LIMIT 10;"
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                 | Cause probable                              | Solution                                                 |
| -------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Image brute trouvée sur disque                            | Multer / FastAPI temp file pas nettoyé      | Configurer Multer en `memory` only ; jamais `disk`      |
| Hash différent à chaque verify (même empreinte)          | Salt diffère entre capture et verify        | Vérifier que `kid` est cohérent ; tester rotation        |
| FAR > 0.1 % en test                                       | Algo extraction template trop tolérant      | Augmenter le score minimum (cf. paramètres MINEX)        |
| FRR > 5 %                                                 | Capteur sale ou doigt sec                   | Calibration capteur + UX (« nettoyez le capteur »)      |
| Consentement JWS invalid                                  | Clé publique citoyen mauvaise               | Vérifier `kid` correspondance citoyen ; rotation        |
| Vault HMAC retourne erreur                                | Quota Vault dépassé                        | Augmenter `transit/keys/.../config max_versions`        |
| 1:N trop lent (> 10 s sur 100k citoyens)                  | Pas d'index FAISS                          | Build index `IndexFlatIP` + scaling                      |
| Effacement biométrique pas effectif                       | Hard delete pas implémenté                | Vérifier `DELETE FROM biometric_hashes WHERE ...`        |

---

## 7. Documentation à produire

- `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md`
- `docs/biometrics/DPIA-NINA-AES-2026.md` (modèle Data Protection
  Impact Assessment)
- `docs/biometrics/CONSENT-PROTOCOL.md` (procédure de signature JWS
  consentement par le citoyen)
- `docs/biometrics/INCIDENT-PROTOCOL.md` (procédure en cas de fuite
  hashes)
- Mise à jour `docs/CHANGELOG.md` §23.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Bloc F Biométrie — JJ/MM/2026
- Status : ❌ NON COMMENCÉ (P3, après validation cadre juridique)
- DPIA rédigé : ⏳
- Pilote ANSSI : ⏳
- Décision go P3a : ⏳

(Si P3a démarré)
- Capteur FAP30 testé : OK
- FAR / FRR : 0.005 % / 0.8 %
- Audit Merkle 100 % : ✅
- Aucune image disque : ✅ (forensique passé)
- Pen-test : 0 HIGH / 0 CRITICAL
```

---

## 9. Checklist de fin d'étape

**V1 (scope universitaire — plan + vision uniquement)** :

- [ ] `ADR-025` rédigé avec phasage P3a/b/c et critères go/no-go
- [ ] `DPIA-NINA-AES-2026.md` rédigé (modèle complet)
- [ ] `CONSENT-PROTOCOL.md` rédigé
- [ ] `INCIDENT-PROTOCOL.md` rédigé
- [ ] Schéma PlantUML biométrie inclus dans `docs/diagrams/`
- [ ] `docs/CHANGELOG.md` §23 mis à jour avec mention "scope V1 = vision"

**P3a (si autorisation institutionnelle obtenue)** :

- [ ] Capteur FAP30 connecté + driver libfprint
- [ ] Migration Prisma `biometric_hashes` appliquée
- [ ] `biometric-service` Python scaffold (port 3012)
- [ ] Endpoint `/v1/register-fingerprint` + tests Supertest
- [ ] Endpoint `/v1/verify-fingerprint` + tests
- [ ] Vault Transit HMAC-SHA-256 + salt + rotation testée
- [ ] Audit forensique 0 image disque
- [ ] Audit Merkle 100 % opérations
- [ ] FAR < 0.01 % / FRR < 1 % testés sur 1 000+ samples
- [ ] Pen-test externe sans HIGH/CRITICAL
- [ ] Tag Git `biometrics-p3a-mvp` posé
- [ ] Commit conventionnel : `feat(biometrics): P3a fingerprint + DPIA + ADR-025`

---

## 10. Pour aller plus loin

- **Iris scanning** (alternative à empreintes / face) : précision
  supérieure (FAR ~10^-8), mais matériel cher et adoption faible.
  Hors V2.
- **Behavioral biometrics** : frappe clavier, gestures écran tactile.
  Possibles V3 pour authentification continue (ex. session active).
- **Federated biometric matching** : un opérateur peut vérifier une
  empreinte sans recevoir le template. Concept zero-knowledge (cf.
  travaux IRMA, IDpass). Très innovant, P4+.
- **Multi-modal biométrie** : combinaison empreintes + face + voice
  pour résilience (si empreintes non lisibles, fallback face).
- **Liveness detection avancée** : ML pour détecter spoofing
  (PrintAttack, ReplayAttack, MaskAttack). Modèles open-source disponibles
  (Anti-Spoofing CASIA).
- **Audit social annuel** : rapport public anonymisé sur l'usage de la
  biométrie (combien d'enrôlements, combien de refus citoyens, combien
  d'effacements demandés). Transparence démocratique.
- **Lectures recommandées** :
  - NIST FRVT (Face Recognition Vendor Test) reports
  - ISO/IEC 19794-* standards templates biométriques
  - CNIL France — _Référentiel biométrie sur le lieu de travail_
  - Bruce Schneier — _Liars and Outliers_ (chapter biometrics)
  - INTERPOL biometric framework

---

_Document 25 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
