# 25 — Bloc F : Biométrie (capture, protection de template ISO 24745, vérification 1:1 et 1:N) — Plan progressif

> **Bloc concerné** : F (Priorité P3 — **EN DERNIER**, après A → E) **Prérequis** : tous les blocs
> précédents stabilisés et auditables ; doc 15 (sécurité, Vault PKI) ; doc 17 (observabilité avec
> alertes spécifiques biométrie) ; doc 18 (tests rigoureux — la biométrie ne tolère AUCUNE
> régression) ; cadre juridique malien actualisé sur la protection des données biométriques (DPA
> national). **Durée estimée** : 30 à 45 heures pour un étudiant seul (mais probablement HORS scope
> V1 universitaire — vision seulement). **Livrables de cette étape (V1 = vision et plan, PAS
> implémentation)** :
>
> - **Plan d'intégration progressive en 3 phases** (P3a → P3c), avec critères go/no-go entre phases.
> - **Schéma biométrique** : capture, normalisation, **protection de template conforme ISO/IEC
>   24745** (template protégé révocable préservant la distance — _cancelable biometrics_ /
>   _biometric cryptosystem_, voir §0), stockage du seul template protégé, vérification 1:1 + 1:N.
> - **Critères éthiques et juridiques** : aucune image brute conservée, consentement obligatoire,
>   droit à l'effacement, audit Merkle de chaque opération biométrique (trace _détective_, pas
>   _inaltérable_ — voir la limite ci-dessous §0.6 : hash-chain SHA-256 ADR-007 sans ancrage tiers
>   implémenté).
> - **Stack technique recommandée** : OpenCV 5 + ONNX Runtime (modèles ouverts), Vault Transit pour
>   le _secret de transformation_ (clé de projection / paramètre cancelable), MinIO chiffré pour le
>   stockage des templates protégés + preuves de consentement.
> - **Document d'analyse d'impact RGPD-équivalent** (DPIA Mali) modèle.
> - `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md`
>
> > ⚠️ **Correction conceptuelle majeure (v1.1)** — Les versions antérieures de ce document
> > décrivaient un _« hash irréversible HMAC-SHA-256 du template + égalité stricte des hash »_. **Ce
> > schéma est faux pour la biométrie** et n'aurait jamais fonctionné en production. La §0
> > ci-dessous explique pourquoi et présente la conception corrigée (protection de template ISO/IEC
> > 24745). Le terme « hash irréversible » est conservé dans le nom de fichier de l'ADR pour la
> > stabilité des liens, mais sa **décision** a été corrigée en conséquence.

---

## 0. POURQUOI un simple « hash » ne marche PAS en biométrie (le piège fondamental)

> **À lire AVANT tout le reste.** C'est l'erreur que faisait la v1.0 de ce document. La comprendre
> est plus important que tout le code qui suit.

### 0.1 Le problème : la biométrie est _floue_, pas exacte

Un mot de passe est **exact** : vous tapez `Soleil2026!`, le serveur compare le hash de ce que vous
tapez au hash stocké. Si **un seul bit** diffère, le hash change complètement (effet d'avalanche
voulu de SHA-256) et l'accès est refusé. C'est exactement ce qu'on veut pour un mot de passe.

Une empreinte digitale est **floue** (_fuzzy_). Posez deux fois le même doigt sur le même capteur :

- la pression diffère, l'angle diffère, le doigt est plus ou moins sec, le capteur a du bruit ;
- le template extrait (liste de minuties, ou vecteur d'embedding) sera **proche mais jamais
  identique** d'une capture à l'autre.

C'est une propriété **physique inévitable**, pas un bug logiciel.

### 0.2 Pourquoi « HMAC-SHA-256 du template + égalité stricte » est cassé

La v1.0 proposait : `hash = HMAC-SHA-256(template, sel)` puis, à la vérification, recalculer le hash
de la nouvelle capture et tester `hash_nouveau == hash_stocké`.

Or HMAC-SHA-256 a — par conception cryptographique — un **effet d'avalanche** : changez 1 bit
d'entrée, ~50 % des bits de sortie changent. Donc deux captures du même doigt (qui diffèrent
forcément de quelques bits) produisent **deux hash totalement différents**. Conséquence brutale :

> **Aucune vérification n'aurait jamais réussi.** Le système aurait rejeté le citoyen légitime à 100
> % (FRR = 100 %). Le code `if stored.hash == hash_attempt` de la v1.0 ne pouvait mathématiquement
> jamais être vrai pour deux captures réelles distinctes.

Un hash cryptographique **détruit volontairement** la notion de « proximité ». C'est l'opposé exact
de ce dont la biométrie a besoin.

### 0.3 Pourquoi « FAISS sur embeddings hachés » est une contradiction

La v1.0 proposait aussi, pour la recherche 1:N, un **index FAISS sur des « embeddings hachés »**.
FAISS (Approximate Nearest Neighbor) ne sait faire qu'**une seule chose** : trouver les vecteurs les
plus **proches** au sens d'une distance (cosinus, L2, produit scalaire). Pour cela il a besoin que
la **géométrie** (la métrique de distance) soit **préservée**.

Or un hash cryptographique **détruit** précisément cette géométrie (c'est son but). Indexer des hash
dans FAISS revient à indexer du **bruit aléatoire** : les « plus proches voisins » retournés
n'auraient **aucun rapport** avec la similarité biométrique réelle. **Hash + ANN = contradiction
logique.**

### 0.4 La bonne réponse : protection de template ISO/IEC 24745

La norme internationale **ISO/IEC 24745 (Biometric Information Protection)** définit exactement le
problème et ses solutions. Un schéma de protection de template doit satisfaire trois propriétés :

| Propriété                              | Signification                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Irréversibilité**                    | À partir du template protégé stocké, on ne peut **pas reconstruire** la biométrie.                                                         |
| **Non-chaînabilité** (_unlinkability_) | Deux templates protégés du même doigt, avec deux secrets différents, ne peuvent **pas être reliés** entre eux.                             |
| **Révocabilité**                       | Si un template protégé fuit, on le **révoque** et on en régénère un nouveau (secret différent), **sans rien changer au doigt du citoyen**. |

Deux grandes familles répondent à cela **tout en tolérant le flou** :

1. **Cancelable biometrics (biométrie révocable)** — on applique au template une **transformation
   paramétrée, non inversible, mais qui _préserve approximativement la distance_** (random
   projection façon BioHashing, _Bloom filter cancelable_, IoM hashing…). Deux captures proches
   restent proches **après** transformation. On stocke le template **transformé** ; on compare par
   **distance + seuil**, pas par égalité. Le paramètre de transformation (la « clé cancelable ») est
   le secret révocable (dans Vault). S'il fuit, on le change → nouveau template, l'ancien devient
   inutilisable.

2. **Biometric cryptosystems (crypto-biométrie)** — _fuzzy commitment_ / _fuzzy extractor_ / _secure
   sketch_. On lie le template à une clé via un **code correcteur d'erreurs** : on stocke un
   _sketch_ (données d'aide) qui permet, à partir d'une capture **suffisamment proche**, de
   **reconstruire la même clé** (le code corrige le « bruit » du flou), mais ne révèle pas la
   biométrie. La comparaison devient « la clé reconstruite est-elle correcte ? » sans jamais stocker
   le template en clair.

> **Choix retenu pour NINA-AES** (voir ADR-025, décision corrigée) : **cancelable biometrics par
> projection aléatoire préservant la distance** pour le chemin nominal (1:1 et 1:N), car elle (a)
> reste compatible avec un index ANN (la distance est préservée), (b) est révocable via rotation du
> paramètre dans Vault, (c) est auditable (algo ouvert). Le _fuzzy commitment_ est documenté comme
> **alternative P3+** quand on veut dériver une clé exacte (ex. déverrouiller un secret).

### 0.5 Métrique, seuil et compromis FAR/FRR (ce qu'il faut documenter)

Puisqu'on compare par **distance**, il faut fixer **explicitement** :

- **la métrique** : pour les minuties on travaille sur un score de correspondance (matcher type
  Bozorth/MINEX) ; pour les embeddings faciaux, **distance cosinus** sur vecteurs L2-normalisés ;
- **le seuil τ** : on déclare « match » si `distance(protégé_capturé, protégé_stocké) ≤ τ` (ou score
  ≥ τ). Ce seuil **n'est pas magique** : il arbitre le compromis :
  - τ trop **strict** → on rejette des citoyens légitimes → **FRR** (faux rejet) monte → mauvaise UX
    ;
  - τ trop **laxiste** → on accepte des imposteurs → **FAR** (fausse acceptation) monte → faille.
- On choisit τ au point d'opération voulu sur la courbe **DET** (Detection Error Tradeoff). Cibles
  réalistes (FAP30, P3a) : **FAR ≤ 0,01 % à FRR ≈ 1–3 %** ; viser FAR « 10⁻⁸ » en 1:1 sur capteur de
  guichet est **irréaliste** et serait obtenu au prix d'un FRR inacceptable (cf. NIST FpVTE/FRVT).

### 0.6 La limite de confidentialité du 1:N à assumer honnêtement

Un index ANN **doit** exploiter la distance pour être rapide. Donc le template protégé indexé
**conserve, par construction, de la structure géométrique** : il est révocable et non inversible
vers l'image, **mais** il n'offre **pas** la confidentialité d'un chiffrement fort. Un attaquant qui
obtient l'index ET le paramètre cancelable peut faire de la comparaison/_linkage_. C'est une
**limite intrinsèque** de « ANN sur template protégé », à écrire noir sur blanc dans la DPIA.
Mitigations : secret de transformation dans Vault (jamais avec l'index), 1:N en enclave d'accès
restreint (`INSPECTOR` + 4-yeux), audit Merkle par requête, et rotation du paramètre en cas de
fuite.

> **Limite — l'audit Merkle est _détectif_, pas _inaltérable_.** L'audit Merkle invoqué ici et au §4
> est la hash-chain SHA-256 d'ADR-007 (`hash(N) = SHA256(hash(N-1) + entrée)`), **SANS ancrage tiers
> implémenté**. Un administrateur de la base PostgreSQL qui maîtrise la genèse peut **reconstruire
> toute la chaîne de façon cohérente**. Tant que la **publication périodique de la racine vers un
> registre externe** (ex. Vérificateur Général, horodatage RFC 3161) n'est pas implémentée, il faut
> parler de **trace cryptographique _détective_** — une falsification devient _détectable a
> posteriori_ **si** une racine externe existe pour comparaison — et **non** de trace _inaltérable_.
> La publication externe de la racine reste une **aspiration** (cf. ADR-007, ADR-014), pas un
> contrôle implémenté.

### 0.7 Ce qui est _conçu_ vs _implémenté_ (honnêteté)

| Élément                                                                                             | État                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Conception protection de template ISO 24745                                                         | **Conçu**                                                |
| Cancelable biometrics (random projection)                                                           | **Conçu**, non implémenté                                |
| Seuil τ / courbe DET / cibles FAR-FRR                                                               | **Conçu** (à mesurer en P3a)                             |
| Anti-timing = pas de court-circuit de la boucle verify (PAS un compare scalaire « temps constant ») | **Conçu**, non implémenté                                |
| Index ANN (FAISS) sur template protégé                                                              | **Conçu** P3c, non implémenté                            |
| Rotation double-écriture du paramètre                                                               | **Conçu** (§4.5), non implémenté                         |
| DPIA + base légale RGPD-like                                                                        | **À produire** (`docs/biometrics/DPIA-NINA-AES-2026.md`) |

---

## 1. Objectif pédagogique

La biométrie est la **fonction la plus à risque** d'un système d'identité. Trois leçons
fondamentales :

1. **Une donnée biométrique est éternelle**. On peut changer un mot de passe ou un numéro de
   téléphone ; on ne peut pas changer ses empreintes. Une fuite = compromission **à vie** du
   citoyen.

2. **L'image brute ne doit JAMAIS être conservée**. Seul le **template mathématique** (minuties ou
   vecteur d'embedding) sort du capteur, et il doit être **protégé de façon irréversible et
   révocable** avant stockage (protection de template ISO/IEC 24745 — _cancelable biometrics_, voir
   §0). Notre base ne contient PAS d'empreintes ni de templates en clair — elle contient des
   **templates protégés** (transformés via un secret révocable Vault), comparables par **distance et
   seuil**, jamais par égalité stricte.

3. **Le consentement explicite + droit à l'effacement sont non-négociables**. Un citoyen doit
   pouvoir refuser la biométrie sans perdre son NINA. Un citoyen doit pouvoir demander la
   suppression de ses templates à tout moment (sans suppression de son NINA, juste de ses
   templates).

> ⚠️ **Pourquoi P3 et pas avant ?** Parce qu'il est facile de livrer une biométrie qui « marche »
> techniquement mais qui est juridiquement intenable. On préfère reporter Bloc F tant que :
>
> - Le cadre juridique malien sur les données biométriques n'est pas stabilisé (en cours, lois
>   2024-2025)
> - La gouvernance OCLEI/CISO CTDEC n'a pas validé un DPIA formel
> - Aucun pilote ANSSI n'a audité le module pen-testing
>
> Hors de ces conditions, **la biométrie est un risque, pas un bénéfice**.

---

## 2. Phasage en 3 étapes (avec critères go/no-go)

### Phase P3a — Empreintes digitales seules (12-16 h dev + audit)

**Périmètre** :

- Capture empreintes via capteur USB FAP30 (FBI compliant — pas de vendor lock-in)
- Template ISO/IEC 19794-2 (minutiae format standard, pas de format propriétaire)
- **Protection de template ISO/IEC 24745** : transformation cancelable préservant la distance
  (random projection paramétrée par un secret Vault) → stockage du **template protégé** uniquement
- Vérification 1:1 uniquement (citoyen présente NINA + empreinte → on transforme la nouvelle capture
  avec le **même** paramètre, puis on compare par **distance ≤ seuil τ**, avec une boucle de scoring
  **sans court-circuit** (anti-timing, cf. §4.3 — le test du seuil sur un scalaire public n'est PAS
  un comparateur « temps constant ») — **pas** d'égalité de hash)

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
- ✅ Tests anti-spoofing (photo imprimée, écran téléphone) — > 95 % détection
- ✅ Biais raciaux audités : performances égales sur peau claire / foncée (≥ 99 % parité)

### Phase P3c — Vérification 1:N (10-15 h dev)

**Périmètre** :

- Recherche d'un citoyen dans la base sur empreinte ou face (cas d'investigation OCLEI sur fraude)
- Index ANN (FAISS) **sur les templates protégés** (cancelable, distance préservée) — **jamais sur
  des hash** (un hash détruirait la métrique, cf. §0.3). Le paramètre de transformation reste dans
  Vault, **séparé** de l'index.
- **Accès restreint** : rôle `INSPECTOR` + double validation (procureur)
- Audit Merkle obligatoire de CHAQUE requête 1:N
- **Limite de confidentialité documentée** (cf. §0.6) : l'index conserve de la structure géométrique
  → révocable et non inversible vers l'image, mais pas équivalent à un chiffrement fort. À assumer
  dans la DPIA.

**Critères de production** :

- ✅ Latence p95 < 2 s sur 11M citoyens
- ✅ Logs 1:N en hash-chain Merkle (chaque requête tracée) — falsification _détectable_ (détective),
  _inaltérable_ seulement une fois la racine ancrée sur un registre externe (§0.6, ADR-007 — non
  implémenté)
- ✅ Politique d'usage stricte : 1:N uniquement avec mandat judiciaire

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_Biometrics
title Biométrie — capture + protection de template ISO/IEC 24745 (cancelable)

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud     { BackgroundColor #FEE2E2; BorderColor #DC2626 }

actor "Citoyen consentant" as Citizen
rectangle "Capteur FAP30\n(empreinte)" as Sensor
rectangle "biometric-service\n(Python FastAPI 3012)" as Bio
rectangle "OpenCV 5 + ONNX\n(extraction template)" as Extract
rectangle "Vault Transit\nsecret de transformation\n(paramètre cancelable, kid)" as Vault
database "PostgreSQL\nbiometric_templates\n(template PROTÉGÉ, jamais d'image)" as PG
rectangle "Audit Merkle\n(chaque opération)" as Audit

Citizen --> Sensor : empreinte
Sensor --> Bio : raw image (RAM, mlock, tmpfs)
Bio --> Extract : template ISO 19794-2 (minuties)
Bio --> Vault : lire paramètre cancelable (kid actif)
Vault --> Bio : paramètre P_kid (en RAM mlock, durée min.)
Bio -> Bio : T_protégé = projection_cancelable(template, P_kid)

Bio --> PG : INSERT biometric_templates\n(citizenId, kind, protected_template, kid, captured_at)
Bio --> Audit : log BIOMETRIC_REGISTERED

note bottom of Bio
  Garanties (conçues) :
  - Image brute uniquement en RAM (tmpfs, mlock,
    swap désactivé) — best effort, PAS de
    "zero-fill" garanti (cf. §4.4 mitigations)
  - Aucune écriture disque de l'image/template clair
  - Template ISO standard (no vendor lock-in)
  - On stocke le template PROTÉGÉ révocable
    (cancelable), comparé par DISTANCE <= seuil,
    jamais par égalité de hash
  - Irréversibilité + non-chaînabilité + révocabilité
    (ISO/IEC 24745)
  - Si le paramètre fuit : rotation kid (double-écriture)
    -> ancien template protégé révoqué
end note
@enduml
```

---

## 4. Étapes d'implémentation (V1 = squelette, P3a complet)

### Étape 4.1 — Modèle Prisma

> **Pourquoi ce modèle a changé (v1.1).** L'ancien modèle `BiometricHash` avait un champ
> `hash String @unique` (HMAC hex) indexé pour « vérification 1:1 ». C'était l'erreur du §0 : (a) un
> hash ne se compare pas par égalité en biométrie, (b) `@unique` sur un template protégé est faux —
> deux ré-enrôlements légitimes du même doigt **doivent** pouvoir coexister, et la comparaison se
> fait par **distance**, pas par recherche d'égalité indexée. On stocke donc un **template protégé**
> (`protectedTemplate`), comparé par distance + seuil, et on **ancre la clé publique** du citoyen
> pour vérifier la chaîne de confiance du consentement JWS (cf. §4.6).

```prisma
/// Un template biométrique PROTÉGÉ (ISO/IEC 24745, cancelable) — jamais d'image, jamais de template
/// en clair. La comparaison se fait par distance + seuil (voir §0.5), JAMAIS par égalité.
model BiometricTemplate {
  id                BigInt        @id @default(autoincrement())
  citizenId         String                              // FK Citizen
  kind              BiometricKind                       // FINGERPRINT | FACE
  /// Template PROTÉGÉ (transformation cancelable du template ISO). Octets opaques (bytea), pas un
  /// hash : il préserve approximativement la distance pour permettre le matching flou.
  protectedTemplate Bytes                               // bytea — template cancelable, NON unique
  /// Identifiant du paramètre de transformation cancelable dans Vault (rotation = nouveau kid).
  transformKid      String                              // ex: "bio-transform-v3"
  /// Schéma de protection employé, pour la traçabilité et la migration.
  protectionScheme  String                              // ex: "cancelable-randproj/v1 (ISO 24745)"
  templateFormat    String                              // ex: "ISO/IEC 19794-2 v2"
  /// Seuil τ et métrique figés au moment de l'enrôlement (auditabilité du point d'opération FAR/FRR).
  matchMetric       String                              // ex: "cosine" | "bozorth3"
  matchThreshold    Float                               // τ — point d'opération choisi sur la courbe DET
  capturedAt        DateTime      @default(now())
  capturedBy        String                              // agent id
  /// Empreinte de la clé publique citoyen ayant signé le consentement (ancre de confiance, §4.6).
  consentSignerKid  String                              // kid/thumbprint de la clé Ed25519 du citoyen
  consentDocUrl     String                              // MinIO chiffré, preuve consentement
  consentSignature  String                              // JWS Ed25519 du citoyen (détaché)
  revokedAt         DateTime?
  revokedReason     String?

  citizen           Citizen       @relation(fields: [citizenId], references: [id])

  // Index 1:1 = on retrouve les templates ACTIFS d'un citoyen, puis on compare par distance en mémoire.
  // PAS d'index sur protectedTemplate : la recherche 1:N rapide passe par l'index ANN externe (§4.4),
  // pas par un index SQL d'égalité (qui n'aurait aucun sens pour de la distance).
  @@index([citizenId, kind, revokedAt])
  @@map("biometric_templates")
}

enum BiometricKind { FINGERPRINT FACE }
```

---

### Étape 4.2 — Service Python (FastAPI port 3012)

> **Note de conception.** Le code ci-dessous est un **squelette pédagogique conçu, non implémenté**.
> Il illustre le bon flux : (1) consentement JWS vérifié contre la **clé publique ancrée** du
> citoyen, (2) extraction du template ISO, (3) **transformation cancelable** (pas de hash), (4)
> stockage du **template protégé**, (5) à la vérification, comparaison par **distance + seuil**, la
> boucle de scoring étant **sans court-circuit** (anti-timing — voir §4.3 : le test du seuil sur un
> scalaire public n'est PAS un comparateur « temps constant »). Les fonctions cryptographiques
> (`cancelable_transform`, `protected_distance`) doivent être implémentées et **validées par mesure
> FAR/FRR réelle** avant tout déploiement.

```python
# services/biometric-service/app/main.py
from fastapi import FastAPI, UploadFile, Depends, HTTPException
from .extractor import extract_template_iso19794          # OpenCV/ONNX -> minuties ISO 19794-2
from .protect import cancelable_transform, protected_distance, score_le_threshold  # protection ISO 24745
from .auth import authenticate_agent  # mTLS + JWT agent ; RBAC rôle BIOMETRIC_OPERATOR (INSPECTOR pour 1:N)
from .vault import fetch_transform_param, active_transform_kid           # paramètre cancelable
from .memory import secure_buffer                          # tmpfs + mlock, best-effort wipe
from .audit import log_biometric_event
from .consent import verify_consent_signature              # vérifie JWS vs clé publique ANCRÉE

app = FastAPI(title="biometric-service")


@app.post('/v1/register-fingerprint')
async def register_fingerprint(
    citizen_id: str,
    image: UploadFile,
    consent_jws: str,                          # consentement signé JWS Ed25519 par le citoyen
    user = Depends(authenticate_agent),        # auth agent obligatoire (mTLS + JWT)
):
    """Enrôle une empreinte : stocke UNIQUEMENT un template protégé (cancelable), jamais d'image."""
    # 1) Vérifier le consentement contre la CLÉ PUBLIQUE ANCRÉE du citoyen (chaîne de confiance).
    #    verify_consent_signature résout le kid signataire via le registre de clés citoyen (Bloc A)
    #    et rejette toute clé non ancrée/expirée/révoquée. Lève si invalide.
    consent = await verify_consent_signature(consent_jws, citizen_id)  # -> {signer_kid, claims}

    # 1bis) AUTORISATION / ANTI-IDOR. `authenticate_agent` a déjà exigé mTLS + JWT + rôle
    #    BIOMETRIC_OPERATOR (RBAC). Mais un agent autorisé ne doit pas pouvoir enrôler un citizen_id
    #    ARBITRAIRE : le citizen_id est LIÉ au consentement signé (le JWS est ancré sur la clé publique
    #    de CE citoyen, ses claims portent sujet == citizen_id, §4.6). Donc un agent ne peut pas
    #    enrôler un citizen_id sans un consentement valide POUR CE citizen_id — c'est l'ancrage du
    #    consentement qui ferme la surface IDOR sur /register (la vérification verify_consent_signature
    #    lève si le sujet du JWS != citizen_id). On exige en plus un motif tracé (audit, étape 6).

    # 2) Lire l'image dans un buffer sécurisé (tmpfs + mlock, JAMAIS sur disque persistant).
    #    secure_buffer() : page verrouillée en RAM (mlock) pour éviter le swap, effacée en sortie.
    with secure_buffer(await image.read()) as raw:
        # 3) Extraire le template ISO/IEC 19794-2 (minuties). Reste en RAM verrouillée.
        with secure_buffer(extract_template_iso19794(raw)) as template:
            # 4) Récupérer le paramètre cancelable ACTIF (kid) depuis Vault, et transformer.
            #    PAS de hash : la transformation préserve approximativement la distance (matching flou).
            transform_kid = await active_transform_kid('FINGERPRINT')
            param = await fetch_transform_param(transform_kid)          # secret révocable Vault
            protected = cancelable_transform(template, param)           # ISO 24745, irréversible+révocable

            # 5) Stocker le TEMPLATE PROTÉGÉ + métadonnées de comparaison (métrique, seuil, signataire).
            record = await db.biometric_template.create(
                citizen_id=citizen_id,
                kind='FINGERPRINT',
                protected_template=protected,                          # bytea opaque (cancelable)
                transform_kid=transform_kid,
                protection_scheme="cancelable-randproj/v1 (ISO 24745)",
                template_format="ISO/IEC 19794-2 v2",
                match_metric="bozorth3",
                match_threshold=THRESHOLD_FINGERPRINT,                 # τ figé (point d'opération DET)
                captured_by=user.id,
                consent_signer_kid=consent['signer_kid'],              # ancre de confiance
                consent_signature=consent_jws,
                consent_doc_url=await upload_consent_to_minio(consent_jws),
            )
            # 6) Audit Merkle (chaque opération biométrique est tracée).
            await log_biometric_event(
                action='BIOMETRIC_REGISTERED',
                entity_id=record.id,
                payload={'kind': 'FINGERPRINT', 'transform_kid': transform_kid},
            )
            return {'id': record.id, 'transform_kid': transform_kid}
    # 7) En sortie des `with`, secure_buffer écrase ses pages (best-effort, cf. §4.4 : pas de
    #    garantie absolue en Python/CPython ; les vraies garanties viennent de mlock + no-swap + tmpfs).
```

**Vérification 1:1** (distance + seuil, anti-timing par **boucle sans court-circuit** — **pas** une
comparaison scalaire « temps constant », cf. §4.3 ; et **pas** d'égalité de hash) :

```python
@app.post('/v1/verify-fingerprint')
async def verify(
    citizen_id: str,
    image: UploadFile,
    user = Depends(authenticate_agent),
):
    """Vérifie 1:1 : transforme la capture avec le MÊME paramètre puis compare par distance <= τ."""
    # AUTORISATION / ANTI-IDOR. À la différence de /register, /verify ne porte PAS de consentement
    # signé (on ne re-signe pas à chaque vérification). L'autorisation NE peut donc PAS s'appuyer sur
    # l'ancrage du consentement : `authenticate_agent` doit exiger mTLS + JWT + rôle BIOMETRIC_OPERATOR,
    # ET on impose un MOTIF tracé (raison de la vérification) + un contrôle que l'agent est habilité
    # pour CE citizen_id (sinon n'importe quel agent authentifié vérifie n'importe quel citoyen = IDOR).
    #
    # ANTI-BRUTEFORCE. Une cible FAR ~1e-4 est BRUTE-FORÇABLE par un attaquant disposant de creds agent
    # qui soumet beaucoup de probes (≈ 1 acceptation pour 10 000 essais). On DOIT donc : rate-limit par
    # (agent, citizen_id) + compteur d'échecs + back-off exponentiel ; verrouillage temporaire après N
    # échecs ; alerte SIEM/SIGAC sur rafale d'échecs. Sans cela, le seuil τ est contournable par volume.
    with secure_buffer(await image.read()) as raw:
        with secure_buffer(extract_template_iso19794(raw)) as template:
            # 1) Récupérer les templates protégés ACTIFS du citoyen (peut y avoir plusieurs kids
            #    pendant une rotation en double-écriture, cf. §4.5).
            stored_list = await db.list_active_protected_templates(citizen_id, 'FINGERPRINT')

            best_match = False
            # 2) Comparer contre CHAQUE template actif. On ne court-circuite PAS la boucle au premier
            #    succès afin de ne pas fuir d'information par timing (anti-corrélation).
            for stored in stored_list:
                param = await fetch_transform_param(stored.transform_kid)
                probe = cancelable_transform(template, param)          # même transfo que l'enrôlement
                # 3) Distance dans l'espace protégé puis test du seuil τ. Le seuil porte sur un
                #    scalaire NON secret : ce n'est PAS un comparateur à temps constant (cf. §4.3).
                #    La vraie propriété anti-timing est l'ABSENCE de court-circuit de CETTE boucle.
                is_match = score_le_threshold(protected_distance(probe, stored.protected_template),
                                              stored.match_threshold)
                best_match = best_match or is_match

            if best_match:
                await log_biometric_event(action='BIOMETRIC_VERIFY_SUCCESS', entity_id=citizen_id)
                return {'match': True}
            # COHÉRENCE de l'anonymisation : on choisit ici une trace ATTRIBUABLE (entity_id=citizen_id)
            # car la détection d'attaque par bruteforce (cf. anti-bruteforce ci-dessus) EXIGE de compter
            # les échecs PAR citizen_id — un échec « anonyme » serait incomptable. On ne duplique donc
            # PAS le citizen_id dans le payload (l'ancien `payload={'citizen_id': ...}` avec
            # entity_id=None était incohérent : il prétendait anonymiser tout en fuitant l'identifiant).
            # NOTE : ce chemin est la vérification d'IDENTITÉ d'un citoyen, PAS le canal lanceur d'alerte
            # (anti-corrélation timing/IP) qui, lui, est traité côté SIGAC.
            await log_biometric_event(action='BIOMETRIC_VERIFY_FAIL', entity_id=citizen_id,
                                      payload={'reason': 'no_template_below_threshold'})
            return {'match': False}
```

---

### Étape 4.3 — Schéma de protection cancelable (le cœur ISO/IEC 24745)

> Cette étape remplace l'ancien `hasher.py` (HMAC). Le module `protect.py` est le **cœur de
> sécurité** : il doit être implémenté avec soin, revu, et **mesuré** (FAR/FRR) avant tout usage.

```python
# services/biometric-service/app/protect.py
# Protection de template ISO/IEC 24745 par "cancelable biometrics" (projection aléatoire).
# OBJECTIF : transformer un template de façon (a) IRRÉVERSIBLE (on ne reconstruit pas la biométrie),
# (b) RÉVOCABLE (changer le paramètre invalide l'ancien template), (c) DISTANCE-PRÉSERVANTE
# (deux captures proches restent proches APRÈS transformation -> matching flou possible).
import hmac, struct
import numpy as np

def cancelable_transform(template: bytes, param: bytes) -> bytes:
    """Applique une projection aléatoire paramétrée (cancelable) au template.

    Le `param` (secret Vault, révocable) sème un générateur pseudo-aléatoire qui définit une matrice
    de projection R. On projette le vecteur de caractéristiques v du template : p = sign(R · v).
    - Irréversible : R n'est pas carrée/inversible (réduction de dimension) -> on ne remonte pas à v.
    - Révocable : changer `param` change R -> nouveau template protégé, l'ancien devient inutilisable.
    - Distance-préservante : par le lemme de Johnson-Lindenstrauss, une projection aléatoire conserve
      approximativement les distances -> le matching flou reste possible (c'est TOUT le point vs un hash).
    NOTE : implémentation pédagogique. Une mise en production exige une étude FAR/FRR + résistance aux
    attaques par inversion (ART) documentée.
    """
    seed = struct.unpack('<Q', hmac.new(param, b'randproj-seed', 'sha256').digest()[:8])[0]
    rng = np.random.default_rng(seed)            # PRNG semé par le secret révocable
    v = _features_from_iso_template(template)    # vecteur de caractéristiques (float32)
    R = rng.standard_normal((PROJ_DIM, v.shape[0])).astype('float32')  # matrice de projection
    p = np.sign(R @ v)                            # binarisation -> code cancelable robuste au bruit
    return p.astype('int8').tobytes()

def protected_distance(a: bytes, b: bytes) -> float:
    """Distance entre deux templates protégés (distance de Hamming normalisée sur les codes signe)."""
    va = np.frombuffer(a, dtype='int8'); vb = np.frombuffer(b, dtype='int8')
    return float(np.count_nonzero(va != vb)) / va.size

def score_le_threshold(distance: float, threshold: float) -> bool:
    """Renvoie True si distance <= seuil. ATTENTION au nom : ce N'EST PAS un comparateur à temps constant.

    Cette fonction n'est PAS un comparateur cryptographique à temps constant — la `distance` est un
    scalaire NON secret (déjà AGRÉGÉ à partir de la routine de scoring), il n'y a donc rien à protéger
    ici : `distance > threshold` est une simple comparaison IEEE-754 dont le timing n'est PAS garanti
    constant, et ce serait illusoire de prétendre le contraire sur un scalaire public.

    La VRAIE propriété anti-timing du système est ailleurs : c'est l'ABSENCE de court-circuit dans la
    boucle `verify` (§4.2) — on parcourt TOUS les templates actifs, sans sortir au premier match, donc
    le temps de réponse ne révèle pas *quel* template (ni *s'il*) a matché tôt.

    Ne pas confondre avec `hmac.compare_digest`, qui protège l'égalité d'OCTETS SECRETS à temps
    constant : ici il n'y a ni octets secrets, ni égalité — juste un seuil sur un scalaire public.
    """
    return not bool(int(distance > threshold))  # True si distance <= threshold (comparaison de scalaire public)
```

> **Pourquoi pas de `compare_digest` ici ?** `hmac.compare_digest` compare des **octets pour
> égalité** à temps constant — pertinent pour un MAC, **inutile** pour une **distance** (il n'y a
> pas d'égalité à protéger). Le bon réflexe « temps constant » en biométrie porte sur la **routine
> de scoring** (pas de court-circuit, pas de branche dépendant du secret), illustré ci-dessus et
> dans la boucle `verify` (on ne sort pas au premier match).

---

### Étape 4.4 — Mitigations mémoire réalistes (remplace la promesse « zero-fill RAM »)

> **Honnêteté technique.** La v1.0 promettait un « zero-fill RAM » de l'image et du template. En
> Python/CPython c'est **une promesse intenable** : les `bytes` sont **immuables** (impossible
> d'écraser sur place), le **garbage collector** peut copier/déplacer les objets, et le **swap**
> peut écrire la page sur disque avant tout effacement. Réécrire `raw = bytearray(len(raw))` crée un
> **nouveau** buffer et laisse l'ancien intact en mémoire. On remplace donc la promesse par des
> **mitigations réelles, en défense en profondeur** :

| Mitigation                                       | Pourquoi / Comment                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Désactiver le swap** sur l'hôte biométrie      | `swapoff -a` + `vm.swappiness=0` : la RAM sensible ne part jamais sur disque.                                                              |
| **`mlock`** des buffers sensibles                | Verrouille les pages en RAM (pas de swap, pas de core-dump paginé). Via `ctypes mlock()` ou lib dédiée.                                    |
| **`tmpfs`** pour tout fichier temporaire         | Si un temp file est inévitable, il vit en RAM (`/dev/shm`), jamais sur disque persistant.                                                  |
| **Désactiver les core dumps**                    | `ulimit -c 0` / `RLIMIT_CORE=0` : un crash ne doit pas dumper la biométrie.                                                                |
| **`bytearray` mutable + effacement best-effort** | Travailler sur `bytearray` (mutable) et le remplir de zéros en `finally` — **best-effort**, pas une garantie absolue (le GC reste maître). |
| **Processus court-vécu / isolation**             | Idéalement, le traitement bas niveau (extraction) dans un sous-processus tué après usage, mémoire restituée à l'OS.                        |

```bash
# Durcissement hôte biométrie (à exécuter au provisioning du nœud dédié) :
# 1) Couper le swap (la RAM sensible ne doit jamais atterrir sur un disque).
sudo swapoff -a
# 2) Rendre le réglage persistant.
echo 'vm.swappiness=0' | sudo tee /etc/sysctl.d/99-bio-noswap.conf
# 3) Interdire les core dumps du service (un crash ne doit pas dumper la biométrie).
echo '* hard core 0' | sudo tee -a /etc/security/limits.conf
```

> Le `secure_buffer` du code §4.2 encapsule `mlock` + remplissage zéro en sortie de contexte ; on
> **documente explicitement** qu'il s'agit d'un best-effort, conformément à la consigne d'honnêteté.

---

### Étape 4.5 — Rotation du paramètre cancelable en double-écriture

> **Pourquoi.** Quand on soupçonne une fuite du paramètre de transformation, ou par hygiène
> périodique, on **rotate** : nouveau `transform_kid`, nouveaux templates protégés. Un « big bang »
> (tout réenrôler d'un coup) casserait le service. On procède en **double-écriture** pour garder le
> système opérationnel pendant la migration.

1. **Générer** le nouveau paramètre dans Vault → `transform_kid = bio-transform-vN+1`.
2. **Phase de double-écriture** : pendant la fenêtre de migration, chaque **nouvel** enrôlement et
   chaque **ré-enrôlement opportuniste** (le citoyen se présente pour un autre acte) écrit le
   template protégé avec le **nouveau** kid, **sans supprimer** l'ancien. La table contient alors
   pour un même citoyen des templates `vN` **et** `vN+1` (d'où l'index
   `[citizenId, kind, revokedAt]` et la boucle multi-kids du `verify`).
3. **Bascule des nouveaux matchs** sur le nouveau kid en priorité.
4. **Révocation différée** : une fois un citoyen ré-enrôlé en `vN+1`, marquer son template `vN`
   `revokedAt = now()` (révocation logique, puis purge). Le matching ignore les templates révoqués.
5. **Clôture** : quand 100 % des citoyens actifs ont un `vN+1`, désactiver `vN` dans Vault.

> Contrairement à un sel HMAC (où rotation = ré-enrôlement **forcé immédiat** de tous), la
> double-écriture **étale** la migration et **n'interrompt pas** le service. C'est un gain direct du
> passage au modèle cancelable.

---

### Étape 4.6 — Ancrage de la clé publique du citoyen (chaîne de confiance du consentement)

> **Pourquoi.** Le consentement est une **preuve juridique**. Une signature JWS ne vaut que si l'on
> sait **quelle clé publique** est légitimement celle du citoyen. Sinon n'importe qui signe « à la
> place » du citoyen. Il faut **ancrer** la clé.

```python
# services/biometric-service/app/consent.py
from jwt import api_jws            # vérification JWS (Ed25519)
from .keyring import resolve_citizen_public_key   # registre de clés citoyen (Bloc A)

async def verify_consent_signature(consent_jws: str, citizen_id: str) -> dict:
    """Vérifie la signature JWS du consentement contre la clé publique ANCRÉE du citoyen.

    Chaîne de confiance :
    1) Lire l'entête JWS pour obtenir le `kid` (identifiant de la clé signataire).
    2) Résoudre ce kid via le registre de clés citoyen (Bloc A appli mobile) : la clé doit être
       ENRÔLÉE pour CE citizen_id, NON expirée et NON révoquée. Sinon -> rejet.
    3) Vérifier la signature Ed25519 avec cette clé ancrée (et seulement elle).
    4) Vérifier les claims : sujet == citizen_id, intention == "BIOMETRIC_CONSENT", non rejouable
       (nonce + horodatage dans une fenêtre courte).
    Lève HTTPException(403) si une étape échoue. Retourne {signer_kid, claims} sinon.
    """
    header = api_jws.get_unverified_header(consent_jws)        # 1) kid annoncé
    pub = await resolve_citizen_public_key(citizen_id, header['kid'])  # 2) ancrage (sinon -> rejet)
    claims = api_jws.decode_complete(consent_jws, key=pub, algorithms=['EdDSA'])  # 3) signature
    _assert_consent_claims(claims, citizen_id)                 # 4) sujet/intention/anti-rejeu
    return {'signer_kid': header['kid'], 'claims': claims}
```

> La clé publique citoyen est **ancrée** lors de l'enrôlement initial (Bloc A) et stockée dans le
> registre de clés souverain (pas de dépendance étrangère). C'est cette ancre — et non la confiance
> aveugle dans le JWS reçu — qui rend le consentement opposable.

---

### Étape 4.7 — DPIA modèle (Data Protection Impact Assessment)

**Fichier à créer** : `docs/biometrics/DPIA-NINA-AES-2026.md`

Structure type :

1. **Description du traitement** : capture empreintes, **protection de template ISO/IEC 24745**
   (cancelable), vérification 1:1 et 1:N.
2. **Finalités** : authentification renforcée des citoyens lors de transactions sensibles, lutte
   contre fraude d'identité.
3. **Base légale** : on **ne dépend PAS** d'une « loi 2024-XX » non adoptée (risque qu'elle n'arrive
   jamais). La base est posée sur le **socle RGPD-équivalent** appliqué par NINA-AES (minimisation,
   finalité, durée, droits) **+ consentement explicite signé** du citoyen **+ DPIA** formelle
   (`docs/biometrics/DPIA-NINA-AES-2026.md`) validée par le CISO/DPO CTDEC. Si/quand un texte
   national est adopté, on le **référence en complément** sans en faire un prérequis bloquant.
4. **Consentement** : signature électronique du citoyen via JWS Ed25519, **vérifiée contre la clé
   publique ancrée** (§4.6), stockée chiffrée.
5. **Données collectées** : exclusivement le **template protégé** (cancelable, ISO 24745) + ses
   métadonnées de comparaison (métrique, seuil, kid). JAMAIS l'image brute, JAMAIS le template en
   clair, JAMAIS un embedding facial brut.
6. **Durée de conservation** : tant que NINA actif (durée de vie citoyen). Suppression sur demande
   citoyen ou décès.
7. **Mesures de sécurité** : Vault Transit (paramètre cancelable révocable), mTLS + JWT + RBAC
   (`BIOMETRIC_OPERATOR`/`INSPECTOR`) + anti-IDOR + rate-limit/anti-bruteforce sur `/verify` (§4.2),
   audit Merkle (trace détective, §0.6), accès restreint par rôle, scoring anti-timing (boucle sans
   court-circuit, §4.3), hôte durci (no-swap/mlock/tmpfs), formation agents annuelle.
8. **Analyse des risques** :
   - Fuite du **template protégé seul** : risque BAS — irréversible vers l'image, et révocable
     (rotation du paramètre, §4.5).
   - Fuite **template protégé + paramètre cancelable** : risque MOYEN — _linkage_/comparaison
     possible (limite intrinsèque du 1:N, §0.6). Mitigation : paramètre dans Vault **séparé** de
     l'index, rotation immédiate sur incident.
   - Re-identification : risque BAS sous _unlinkability_ (deux templates protégés du même doigt,
     kids différents, ne se relient pas).
   - Vendor lock-in : risque NUL (formats ISO 19794-\* / 24745 standards).
9. **Droits citoyens** : accès, rectification, effacement, opposition, portabilité.
10. **Procédure d'incident** : si fuite détectée → rotation immédiate du paramètre cancelable Vault
    (nouveau kid) + double-écriture (§4.5) → révocation des templates compromis, **sans interruption
    de service**.

---

### Étape 4.8 — Critères go/no-go détaillés

Avant Phase P3b, l'équipe doit valider :

| Critère                                                                           | Cible              | Mesure                                               |
| --------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| Taux faux positifs (FAR)                                                          | < 0.01 % (1/10k)   | Test sur 10 000 paires distinctes (DET)              |
| Taux faux négatifs (FRR)                                                          | < 1–3 % (réaliste) | Test sur 1 000 ré-enrôlements (DET)                  |
| Latence verify p95                                                                | < 800 ms           | k6 sur 100 req/min                                   |
| Image brute persistée sur disque                                                  | **0**              | Audit forensique disque                              |
| Audit Merkle de toute opération                                                   | 100 %              | Diff audit_logs vs biometric_templates               |
| Consentement vérifié + clé ancrée                                                 | 100 %              | Tests contrôleurs (§4.6)                             |
| Endpoints protégés mTLS+JWT + RBAC (`BIOMETRIC_OPERATOR`/`INSPECTOR`) + anti-IDOR | OK                 | Tests d'autorisation (citizen_id ≠ agent arbitraire) |
| Rate-limit / anti-bruteforce sur `/v1/verify-fingerprint`                         | OK                 | Test de charge d'échecs + back-off + alerte SIEM     |
| Rotation paramètre cancelable (double-écriture)                                   | OK                 | Drill mensuel (§4.5)                                 |
| Pen-test : 0 finding CRITICAL/HIGH                                                | OK                 | Rapport pen-test                                     |
| DPIA validé CISO CTDEC                                                            | OK                 | Signature DPO                                        |
| Procédure d'effacement testée                                                     | OK                 | Drill semestriel                                     |

Tant qu'**un seul critère** n'est pas validé, on ne passe pas à la phase suivante. C'est la règle
d'or de la biométrie.

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

# 3) Test verify (une AUTRE capture du même doigt → match par distance <= seuil τ)
#    Important : surtout PAS le même fichier d'image à l'identique — ce serait un test bidon.
#    Le vrai test biométrique utilise une SECONDE capture (bruit réel) pour valider le matching flou.
curl -X POST https://localhost:3012/v1/verify-fingerprint \
  -H "Authorization: Bearer <agent-jwt>" \
  -F "citizen_id=cln5..." \
  -F "image=@./test/sample-fingerprint-capture2.png"
# → {"match": true}

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

| Symptôme                                     | Cause probable                                                   | Solution                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Image brute trouvée sur disque               | Upload FastAPI en temp file pas nettoyé                          | Lire en mémoire (`SpooledTemporaryFile` en RAM) ; tmpfs ; jamais de disque persistant     |
| FRR ≈ 100 % (aucun citoyen ne matche jamais) | On compare par **égalité** au lieu de **distance** (le piège §0) | Vérifier qu'on utilise `protected_distance ≤ τ`, **pas** une égalité de hash              |
| Match échoue alors que c'est le bon doigt    | Paramètre cancelable (kid) différent entre enrôlement et verify  | Transformer avec le **même** `transform_kid` ; vérifier la double-écriture (§4.5)         |
| FAR > 0.1 % en test                          | Seuil τ trop laxiste / extraction trop tolérante                 | Resserrer τ sur la courbe DET (cf. MINEX) — au prix d'un FRR plus haut                    |
| FRR > 5 %                                    | Seuil τ trop strict, capteur sale ou doigt sec                   | Relâcher τ (compromis FAR), calibration capteur + UX (« nettoyez le capteur »)            |
| Consentement JWS invalide                    | Clé publique citoyen non ancrée/mauvaise                         | Vérifier la résolution du `kid` dans le registre de clés citoyen (§4.6)                   |
| Vault retourne erreur sur le paramètre       | Quota / version de clé dépassée                                  | Augmenter `transit/keys/.../config max_versions`                                          |
| 1:N trop lent (> 10 s sur 100k citoyens)     | Pas d'index ANN sur templates protégés                           | Construire l'index ANN (FAISS) **sur les templates protégés**, jamais sur des hash (§0.3) |
| Effacement biométrique pas effectif          | Hard delete pas implémenté                                       | Vérifier `DELETE FROM biometric_templates WHERE citizen_id = ...` + purge index ANN       |

---

## 7. Documentation à produire

- `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md`
- `docs/biometrics/DPIA-NINA-AES-2026.md` (modèle Data Protection Impact Assessment)
- `docs/biometrics/CONSENT-PROTOCOL.md` (procédure de signature JWS consentement par le citoyen)
- `docs/biometrics/INCIDENT-PROTOCOL.md` (procédure en cas de fuite : rotation du paramètre
  cancelable + double-écriture, cf. §4.5)
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
- [ ] Migration Prisma `biometric_templates` appliquée (template **protégé**, pas de hash)
- [ ] `biometric-service` Python scaffold (port 3012)
- [ ] Module `protect.py` (cancelable ISO 24745) implémenté + **FAR/FRR mesurés** sur la courbe DET
- [ ] Endpoint `/v1/register-fingerprint` + tests
- [ ] Endpoint `/v1/verify-fingerprint` (distance + seuil) + tests
- [ ] Endpoints biométriques protégés par guard mTLS+JWT + RBAC (rôle `BIOMETRIC_OPERATOR` ;
      `INSPECTOR` pour 1:N) + contrôle anti-IDOR (citizen_id lié au consentement ancré sur
      `/register` ; motif tracé + habilitation par citizen_id sur `/verify`)
- [ ] Rate-limit / anti-bruteforce sur `/v1/verify-fingerprint` (back-off + verrouillage après N
      échecs + alerte SIEM)
- [ ] Vault Transit : paramètre cancelable + rotation **double-écriture** testée (§4.5)
- [ ] Consentement JWS vérifié contre clé publique **ancrée** (§4.6)
- [ ] Hôte durci : swap off + mlock + tmpfs + core dumps off (§4.4)
- [ ] Audit forensique 0 image disque
- [ ] Audit Merkle 100 % opérations
- [ ] FAR < 0.01 % / FRR < 1 % testés sur 1 000+ samples
- [ ] Pen-test externe sans HIGH/CRITICAL
- [ ] Tag Git `biometrics-p3a-mvp` posé
- [ ] Commit conventionnel : `feat(biometrics): P3a fingerprint + DPIA + ADR-025`

---

## 10. Pour aller plus loin

- **Iris scanning** (alternative à empreintes / face) : précision supérieure (FAR ~10^-8), mais
  matériel cher et adoption faible. Hors V2.
- **Behavioral biometrics** : frappe clavier, gestures écran tactile. Possibles V3 pour
  authentification continue (ex. session active).
- **Federated biometric matching** : un opérateur peut vérifier une empreinte sans recevoir le
  template. Concept zero-knowledge (cf. travaux IRMA, IDpass). Très innovant, P4+.
- **Multi-modal biométrie** : combinaison empreintes + face + voice pour résilience (si empreintes
  non lisibles, fallback face).
- **Liveness detection avancée** : ML pour détecter spoofing (PrintAttack, ReplayAttack,
  MaskAttack). Modèles open-source disponibles (Anti-Spoofing CASIA).
- **Audit social annuel** : rapport public anonymisé sur l'usage de la biométrie (combien
  d'enrôlements, combien de refus citoyens, combien d'effacements demandés). Transparence
  démocratique.
- **Lectures recommandées** :
  - **ISO/IEC 24745** — _Biometric information protection_ (la norme clé : irréversibilité,
    non-chaînabilité, révocabilité — cf. §0)
  - **ISO/IEC 30136** — évaluation des schémas de protection de template biométrique
  - Fuzzy extractors / secure sketch (Dodis, Reyzin, Smith) ; fuzzy commitment (Juels & Wattenberg)
    ; BioHashing / cancelable biometrics (Ratha et al., Jin et al.)
  - NIST FpVTE / FRVT (tests de performance empreintes & visages — points d'opération FAR/FRR réels)
  - ISO/IEC 19794-\* standards templates biométriques
  - CNIL France — _Référentiel biométrie sur le lieu de travail_
  - Bruce Schneier — _Liars and Outliers_ (chapter biometrics)
  - INTERPOL biometric framework

---

_Document 25 — Version 1.1 — Juin 2026 (correction conceptuelle : protection de template ISO 24745
remplace le « hash HMAC + égalité stricte »)_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
