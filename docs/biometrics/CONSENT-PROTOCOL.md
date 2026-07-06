# CONSENT-PROTOCOL.md — Protocole de consentement biométrique (jeton JWS ancré sur la clé publique du citoyen)

> **Document de conception** (à relire avant toute évolution du recueil de consentement
> biométrique). Compagnon de :
>
> - `docs/25-BLOC-F-BIOMETRIE.md` — **§4.6** (ancrage de la clé publique du citoyen, chaîne de
>   confiance du consentement) et **§4.7** (DPIA) ; ce fichier en est le livrable cité (§7,
>   checklist §9 : « `CONSENT-PROTOCOL.md` rédigé »).
> - `docs/biometrics/DPIA-NINA-AES-2026.md` — le consentement est la **base légale** opérationnelle
>   du traitement (point 4 du DPIA), faute de loi nationale adoptée.
> - `docs/biometrics/INCIDENT-PROTOCOL.md` — révocation de masse et rotation du paramètre
>   cancelable.
> - `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md` — phasage P3a/b/c et critères
>   go/no-go.
> - `docs/09-BACKEND-AUDIT-SERVICE.md` — **hash-chain SHA-256 linéaire** (ADR-007) qui horodate et
>   scelle les preuves de consentement.
> - `docs/14-USSD-SERVICE-AFRICAS-TALKING.md` — canal USSD (téléphone non connecté).
> - `docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md` — bornes kiosque Electron.
>
> **Audience** : l'étudiant UQAR (concepteur solo), futur CISO/DPO CTDEC, auditeur ANSSI Mali /
> OCLEI, agents d'enrôlement, jury UQAR.
>
> **Classification** : `INTERNE — REVUE DE CONCEPTION`. Aucun secret réel ici (uniquement des
> identifiants logiques, des claims d'exemple et des contre-mesures).
>
> **Honnêteté d'implémentation** : ce protocole est **conçu, non implémenté** (Bloc F = scope V1 «
> vision + plan », P3a sous réserve d'autorisation institutionnelle). Les extraits de code sont des
> **squelettes pédagogiques**. Les éléments marqués ⏳ sont « conçus, Phase 2 ».

---

## 0. Pourquoi un protocole de consentement (et pas une simple case à cocher)

**Le POURQUOI avant le COMMENT.** En biométrie d'État, le consentement n'est pas un confort
juridique : c'est **la** base légale du traitement. NINA-AES ne s'appuie **pas** sur une « loi
2024-XX » non adoptée (risque qu'elle n'arrive jamais, cf. doc 25 §4.7 point 3). La licéité repose
donc sur trois piliers cumulés :

1. un **socle RGPD-équivalent** appliqué par NINA-AES (minimisation, finalité, durée, droits) ;
2. une **DPIA formelle** validée par le CISO/DPO CTDEC ;
3. un **consentement explicite, éclairé, signé et révocable** du citoyen — l'objet de ce document.

Une « case à cocher » dans un formulaire ne prouve rien : n'importe qui peut la cocher à la place du
citoyen. Un consentement **opposable** doit répondre à quatre questions, et c'est exactement ce que
résout le jeton JWS ancré :

| Question juridique                           | Réponse technique (ce protocole)                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Qui** a consenti ?                         | Signature Ed25519 vérifiée contre la **clé publique ANCRÉE** du citoyen (§4.6)     |
| **À quoi** a-t-il consenti ?                 | Claims explicites (finalité, type biométrique, durée) dans la charge utile JWS     |
| **Quand** a-t-il consenti ?                  | Horodatage `iat`/`exp` + scellement par la hash-chain d'audit (Ed25519 in-process) |
| Le consentement est-il **toujours valide** ? | Vérification du registre de révocation (le citoyen peut retirer son consentement)  |

> **Principe directeur.** Le consentement est une **preuve cryptographique portable**, pas un état
> de base de données qu'un agent pourrait flipper. C'est le citoyen — et lui seul, via sa clé privée
> détenue sur son appareil (Bloc A) — qui produit cette preuve.

### 0.1 Ce que le consentement N'EST PAS (anti-patterns)

- ❌ **Pas** un booléen `consent = true` posé par l'agent côté serveur (rien ne le relie au
  citoyen).
- ❌ **Pas** un chiffrement : Ed25519 **signe**, il **ne chiffre pas** (cf. CANON crypto,
  ADR-026/034). Le consentement est un objet **signé** ; sa confidentialité de stockage est traitée
  séparément (§4).
- ❌ **Pas** un arbre de Merkle : l'audit NINA-AES est une **hash-chain SHA-256 linéaire**
  (ADR-007).
- ❌ **Pas** un secret Vault Transit : Vault Transit **ne supporte pas Ed25519** (ADR-026/034). La
  clé de signature du citoyen vit sur **son appareil** ; seule sa **clé publique** est ancrée côté
  État.

---

## 1. Vue d'ensemble du flux

```
   ┌─────────────┐        recueil éclairé (8 langues)        ┌──────────────────────┐
   │   Citoyen   │  ◀──────────────────────────────────────  │  Canal (web/borne/    │
   │ (clé privée │                                            │  USSD/agent/hors-ligne│
   │  Ed25519,   │  ─── signe le JWS de consentement ───▶     │  kit mobile)          │
   │  Bloc A)    │     (sujet=citizen_id, finalité,           └──────────┬───────────┘
   └─────────────┘      type bio, nonce, iat/exp)                        │ consent_jws
                                                                          ▼
                                                       ┌──────────────────────────────────┐
                                                       │  biometric-service (FastAPI 3012) │
                                                       │  verify_consent_signature(§4.6) : │
                                                       │   1. kid header → registre clés   │
                                                       │   2. clé ANCRÉE (non exp/révoquée)│
                                                       │   3. vérif signature Ed25519      │
                                                       │   4. claims (sujet/finalité/nonce)│
                                                       │   5. registre de révocation       │
                                                       └──────────────┬───────────────────┘
                                                                      │ OK
                                                                      ▼
                                          enrôlement template protégé (ISO 24745) +
                                          preuve consentement chiffrée (MinIO) +
                                          événement audit hash-chain SHA-256 (ADR-007)
```

> Le JWS est produit **là où vit la clé privée** : l'appareil du citoyen (app mobile Bloc A) pour le
> web/borne, ou le **kit mobile hors-ligne** de l'agent qui relaie une signature produite sur place
> (§5). Le serveur ne **fabrique jamais** le consentement ; il le **vérifie**.

---

## 2. Recueil éclairé multilingue (8 langues)

### 2.1 Pourquoi 8 langues

Un consentement n'est **éclairé** que si le citoyen **comprend** ce à quoi il consent. Au Mali et
dans l'espace AES, le français administratif n'est pas universellement lu. Le recueil doit donc
présenter l'information dans la langue du citoyen **avant** toute capture biométrique. NINA-AES
retient **8 langues** couvrant les principales langues nationales véhiculaires :

| Code  | Langue               | Script         | Notes canal                                                 |
| ----- | -------------------- | -------------- | ----------------------------------------------------------- |
| `fr`  | Français             | latin          | Langue administrative ; défaut bornes/web                   |
| `bm`  | Bambara (Bamanankan) | latin/N'Ko     | Langue véhiculaire majoritaire ; **audio obligatoire** USSD |
| `ff`  | Peul (Fulfulde)      | latin          | Audio recommandé                                            |
| `son` | Songhaï              | latin          | Nord Mali                                                   |
| `tmh` | Tamasheq             | latin/tifinagh | Communautés touarègues                                      |
| `ar`  | Arabe                | arabe (RTL)    | Rendu **droite-à-gauche** requis (web/borne)                |
| `mos` | Mooré                | latin          | Espace AES (Burkina)                                        |
| `en`  | Anglais              | latin          | Interopérabilité AES / agents internationaux                |

> **Honnêteté ⏳** : les traductions validées (revue linguistique + juridique) sont un livrable
> Phase 2. Le squelette ci-dessous fixe la **structure des messages** et leurs identifiants stables
> ; les chaînes traduites les rempliront.

### 2.2 Contenu minimal du recueil éclairé (les 7 mentions obligatoires)

Quel que soit le canal, le citoyen doit recevoir — **dans sa langue** — les sept mentions suivantes
**avant** de signer. Ce sont les clés d'un catalogue i18n stable (jamais de texte en dur côté
logique) :

| Clé i18n               | Mention (en clair)                                                         |
| ---------------------- | -------------------------------------------------------------------------- |
| `consent.purpose`      | **Finalité** : authentification renforcée lors de transactions sensibles   |
| `consent.data`         | **Données** : un **template protégé** (ISO 24745), JAMAIS l'image brute    |
| `consent.retention`    | **Durée** : tant que NINA actif ; suppression sur demande ou décès         |
| `consent.rights`       | **Droits** : accès, rectification, **effacement**, opposition, portabilité |
| `consent.revocation`   | **Révocabilité** : vous pouvez retirer ce consentement à tout moment (§3)  |
| `consent.no_raw_image` | **Garantie** : aucune image d'empreinte/visage n'est conservée             |
| `consent.controller`   | **Responsable de traitement** : CTDEC ; contact DPO                        |

```jsonc
// services/biometric-service/app/i18n/consent.bm.json  (exemple — Bambara, ⏳ traduction à valider)
{
  "consent.purpose": "<bm> Finalité du recueil … </bm>",
  "consent.data": "<bm> Donnée conservée : gabarit protégé, jamais l'image … </bm>",
  "consent.retention": "<bm> Durée de conservation … </bm>",
  "consent.rights": "<bm> Vos droits … </bm>",
  "consent.revocation": "<bm> Vous pouvez retirer votre accord … </bm>",
  "consent.no_raw_image": "<bm> Aucune image n'est gardée … </bm>",
  "consent.controller": "<bm> Responsable : CTDEC, contact DPO … </bm>",
  "_meta": { "lang": "bm", "audio": "consent_bm.ogg", "reviewedBy": null, "reviewedAt": null },
}
```

### 2.3 Adaptation par canal

Le **fond** (les 7 mentions) est invariant ; la **forme** s'adapte au canal. La langue effectivement
présentée est journalisée dans le claim `lang` du JWS (§3) — **preuve que le citoyen a vu sa
langue**.

| Canal                                | Présentation des mentions                                  | Saisie de la signature Ed25519                                                               |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Web** (app citoyen)                | Écran défilant + arabe RTL ; lecture audio optionnelle     | Clé privée locale (app Bloc A) signe le JWS                                                  |
| **Borne kiosque** (Electron, doc 24) | Plein écran + audio + gros caractères                      | App Bloc A appairée (QR/BLE) signe ; la borne ne détient jamais la clé                       |
| **USSD** (doc 14)                    | Menus texte courts + **rappel audio** (Bambara/Peul)       | ⏳ Signature **déléguée** : l'app Bloc A signe hors-bande puis confirme par code USSD (§5.3) |
| **Agent** (guichet)                  | L'agent lit la mention à voix haute dans la langue choisie | App Bloc A du citoyen signe ; l'agent **ne signe jamais** à sa place                         |
| **Hors-ligne** (kit mobile)          | Mêmes écrans, embarqués sur la tablette agent              | App Bloc A signe localement ; JWS mis en file pour synchro (§5)                              |

> **Garde-fou anti-IDOR (doc 25 §4.6).** Quel que soit le canal, **l'agent ne produit jamais la
> signature**. Seul l'appareil du citoyen, porteur de la clé privée ancrée pour CE `citizen_id`,
> peut signer. C'est l'ancrage du consentement qui ferme la surface IDOR sur
> `/register-fingerprint`.

---

## 3. Structure du jeton JWS de consentement

### 3.1 Pourquoi un JWS (et pourquoi Ed25519)

On choisit un **JWS compact standard** (RFC 7515, charge utile **base64url-encodée** dans le jeton)
parce qu'il est : (a) **portable** (un seul `string` qui voyage web/borne/USSD/hors-ligne) ; (b)
**standard** (vérifiable par n'importe quel auditeur) ; (c) **signé, pas chiffré** — ce qui est
exactement ce qu'on veut pour une **preuve d'engagement** (l'intégrité et l'origine comptent, pas le
secret du texte). L'algorithme est **EdDSA / Ed25519** :

> **Note (forme du jeton).** On utilise la forme **compacte** classique où la charge utile est
> **incluse et base64url-encodée** dans le jeton (la routine de §4.2 peut donc la décoder et la
> parser). On n'emploie **pas** un _JWS détaché_ (payload absent du jeton, RFC 7515 Annexe F) ni le
> _payload non encodé_ RFC 7797 (`b64:false` + `crit:["b64"]`) : ce sont **trois mécanismes
> distincts** qu'il ne faut pas confondre. Un JWS détaché ou un payload RFC 7797 exigeraient de
> passer explicitement la charge utile à la vérification (`detached_payload=…`) — ce que ce
> protocole ne fait pas, par choix de simplicité et d'auditabilité.

- ✅ Ed25519 = **signature** rapide, déterministe, clés courtes (32 octets) → idéal sur appareil
  mobile.
- ⚠️ Ed25519 **ne chiffre pas** (CANON). La confidentialité de la **preuve stockée** est assurée à
  part (chiffrement au repos MinIO + sealed box X25519 si export, §4.4), jamais par Ed25519.
- ⚠️ Vault Transit **ne signe pas** en Ed25519 (ADR-026/034). La clé **privée** vit sur l'appareil
  du citoyen ; l'État n'ancre que la **clé publique**.

### 3.2 En-tête JWS (header protégé)

```jsonc
{
  "alg": "EdDSA", // Ed25519 — JAMAIS "none", JAMAIS HS*/RS* ici
  "typ": "nina-bio-consent+jws", // type applicatif explicite (anti-confusion de jeton)
  "kid": "cit:cln5xz…:ed25519:3", // identifiant de la clé PUBLIQUE ancrée du citoyen (§3.4)
  // JWS compact STANDARD : la charge utile est base64url-encodée DANS le jeton (RFC 7515).
  // PAS de "b64":false / "crit":["b64"] (RFC 7797) — la routine de §4.2 décode et parse la charge.
}
```

> Le `kid` est l'**ancre de confiance**. Il référence une clé publique **enrôlée pour ce citoyen**
> au Bloc A, et résolue côté serveur par `resolve_citizen_public_key` (§4.6 du doc 25). Le serveur
> **n'accepte jamais** une clé fournie en ligne dans le JWS : il **résout** le `kid` dans son
> registre.

### 3.3 Charge utile (claims) — le contrat de consentement

```jsonc
{
  // — Identité du sujet (anti-IDOR : doit == citizen_id reçu par l'endpoint) —
  "sub": "cln5xz…", // citizen_id — LIÉ à la signature, pas un paramètre libre
  "iss": "cit:cln5xz…", // émetteur = le citoyen lui-même

  // — Intention explicite (anti-confusion de jeton) —
  "intent": "BIOMETRIC_CONSENT", // un jeton de login ne doit JAMAIS passer pour un consentement
  "scope": ["enroll:FINGERPRINT"], // périmètre exact : enrôlement empreinte (ou "enroll:FACE")
  "purpose": "auth-strong-tx", // finalité conforme au DPIA (point 2)

  // — Information éclairée effectivement présentée —
  "lang": "bm", // langue affichée (preuve d'information dans la langue, §2)
  "noticeVer": "consent-notice/2026.1", // version du texte de mention montré (traçabilité)
  "channel": "kiosk", // web | kiosk | ussd | agent | offline-kit

  // — Horodatage & anti-rejeu —
  "iat": 1781827200, // émis le (epoch s) — scellé ensuite par la hash-chain audit
  "nbf": 1781827200,
  "exp": 1781827800, // courte fenêtre (≈10 min) : un consentement n'est pas un blanc-seing
  "jti": "b9f2…", // nonce unique — anti-rejeu (vu une seule fois, §4.3)

  // — Liaison contextuelle (anti-relais) —
  "aud": "nina-biometric-service", // destinataire prévu (le service d'enrôlement)
  "operatorId": "agt:7781", // agent présent (traçabilité, PAS une autorité de signature)
  "siteId": "kiosk:bko-001", // point de collecte (borne/guichet/kit)

  // — Révocation —
  "revocable": true,
  "revUri": "https://nina.gov.ml/consent/revoke", // point de retrait (§3)
}
```

> **Pourquoi `exp` court (~10 min) ?** Un consentement signé est valable pour **cette** session
> d'enrôlement, pas indéfiniment. La **persistance** juridique du consentement est portée par la
> **preuve stockée + scellée par l'audit** (§4.4), pas par un JWS qui resterait rejouable des mois.

### 3.4 Ancrage de la clé publique du citoyen (chaîne de confiance — doc 25 §4.6)

La clé publique du citoyen est **ancrée** lors de l'enrôlement initial (Bloc A, app mobile) dans le
**registre de clés citoyen souverain** (aucune dépendance étrangère). C'est cette ancre — et non la
confiance aveugle dans le JWS reçu — qui rend le consentement **opposable**.

```
kid "cit:<citizen_id>:ed25519:<version>"
        │
        ▼  resolve_citizen_public_key(citizen_id, kid)   ← registre souverain (Bloc A)
   ┌──────────────────────────────────────────────┐
   │ clé publique Ed25519 (32 octets)              │
   │ état : ENRÔLÉE pour CE citizen_id ?  ────────▶ sinon REJET (403)
   │ exp  : non expirée ?                  ────────▶ sinon REJET
   │ rev  : non révoquée ?                 ────────▶ sinon REJET
   └──────────────────────────────────────────────┘
```

> **Rotation de la clé citoyen.** Si le citoyen change d'appareil / régénère sa clé, une **nouvelle
> version** de `kid` est ancrée (`…:ed25519:4`). Les consentements signés avec l'ancienne version
> restent **vérifiables** (la clé publique historique demeure dans le registre, marquée « retirée »
> mais non « frauduleuse »), ce qui préserve la valeur probante des preuves passées.

---

## 4. Vérification côté serveur

### 4.1 Pourquoi vérifier dans CET ordre

La vérification doit échouer **le plus tôt possible** et **sans révéler** quelle étape a échoué (un
`403` uniforme). L'ordre n'est pas cosmétique : on résout d'abord **l'ancre** (sinon on vérifierait
une signature contre une clé non fiable), puis la **signature**, puis les **claims**, puis la
**révocation** (état le plus volatil, lecture la plus coûteuse en dernier).

### 4.2 Squelette de référence (conçu — doc 25 §4.6)

```python
# services/biometric-service/app/consent.py   (squelette pédagogique — CONÇU, non implémenté ⏳)
import json                                              # parse de la charge utile (voir note ci-dessous)
from jwt import api_jws                                  # vérification JWS Ed25519 (EdDSA)
from .keyring import resolve_citizen_public_key          # registre de clés citoyen souverain (Bloc A)
from .revocation import is_consent_revoked, is_nonce_seen # registre de révocation + anti-rejeu
from fastapi import HTTPException


async def verify_consent_signature(consent_jws: str, citizen_id: str) -> dict:
    """Vérifie le JWS de consentement biométrique contre la clé publique ANCRÉE du citoyen.

    Chaîne de confiance (doc 25 §4.6) :
      1) Lire l'en-tête JWS → kid annoncé (clé signataire prétendue).
      2) RÉSOUDRE ce kid via le registre souverain : la clé doit être ENRÔLÉE pour CE citizen_id,
         NON expirée, NON révoquée. On n'utilise JAMAIS une clé fournie dans le JWS lui-même.
      3) Vérifier la signature Ed25519 (EdDSA) avec cette clé ancrée — et elle seule.
      4) Vérifier les claims : sub == citizen_id, iss == "cit:"+citizen_id,
         intent == "BIOMETRIC_CONSENT", aud, nbf/exp, scope dans l'allow-list EXACTE,
         et anti-rejeu (jti non déjà vu dans la fenêtre courte).
      5) Vérifier que le consentement n'a pas été RÉVOQUÉ (registre de révocation, §3).

    Lève HTTPException(403) — message UNIFORME — si une étape échoue.
    Retourne {signer_kid, claims} sinon.
    """
    # 1) kid annoncé (en-tête NON vérifié — sert uniquement à résoudre l'ancre)
    header = api_jws.get_unverified_header(consent_jws)

    # 2) Ancrage : la clé doit être ENRÔLÉE pour CE citizen_id (sinon -> 403)
    pub = await resolve_citizen_public_key(citizen_id, header["kid"])
    if pub is None:
        raise HTTPException(status_code=403, detail="consent invalid")  # message uniforme

    # 3) Signature Ed25519 contre la clé ANCRÉE (décodage complet : header + payload)
    decoded = api_jws.decode_complete(
        consent_jws,
        key=pub,
        algorithms=["EdDSA"],          # liste BLANCHE stricte : jamais "none", jamais HS*/RS*
    )
    # api_jws (couche JWS, pas JWT) renvoie la charge utile en OCTETS BRUTS — jamais un dict déjà
    # parsé. On la décode donc explicitement en JSON. Un payload non-JSON / mal formé lève ici
    # (capté plus bas en 403 uniforme par l'appelant), ce qui est le comportement voulu.
    claims = json.loads(decoded["payload"])

    # 4) Claims : sujet / intention / audience / anti-rejeu (lève si un seul échoue)
    _assert_consent_claims(claims, citizen_id, aud="nina-biometric-service")
    if await is_nonce_seen(claims["jti"]):          # jti déjà consommé -> rejeu
        raise HTTPException(status_code=403, detail="consent invalid")

    # 5) Révocation : le citoyen a-t-il retiré son consentement ? (§3)
    if await is_consent_revoked(citizen_id, claims["jti"]):
        raise HTTPException(status_code=403, detail="consent invalid")

    return {"signer_kid": header["kid"], "claims": claims}


#: Périmètres EXACTS autorisés pour un consentement d'enrôlement. On compare par ÉGALITÉ stricte
#: (jamais un test de sous-chaîne `in str(...)`, qui matcherait accidentellement "enroll:FACE_ID",
#: "DEFACE", etc. — un anti-pattern, cf. §8).
ALLOWED_CONSENT_SCOPES = {"enroll:FINGERPRINT", "enroll:FACE"}


def _assert_consent_claims(claims: dict, citizen_id: str, aud: str) -> None:
    """Garde-fous métier (anti-IDOR + anti-confusion de jeton). Lève 403 (uniforme) sinon."""
    import time
    now = int(time.time())

    # `scope` est une LISTE de chaînes ; au moins un de ses éléments doit appartenir à l'allow-list.
    # On normalise en set pour une intersection exacte (pas de sous-chaîne).
    scope_values = claims.get("scope", [])
    if isinstance(scope_values, str):              # tolérance : un scope mono-valué peut arriver en str
        scope_values = [scope_values]
    scope_ok = bool(ALLOWED_CONSENT_SCOPES & set(scope_values))

    # ⚠️ PRÉCEDENCE D'OPÉRATEURS : `and` lie plus fort que `or`. Chaque alternative DOIT être
    # parenthésée, sinon un `... or <scope>` final court-circuiterait sub/intent/aud/exp
    # (bypass d'authz exploitable). Ici chaque condition est un terme `and` à part entière.
    ok = (
        claims.get("sub") == citizen_id                 # ANTI-IDOR : sujet LIÉ au citizen_id reçu
        and claims.get("iss") == f"cit:{citizen_id}"    # émetteur = le citoyen lui-même (cf. §3.3)
        and claims.get("intent") == "BIOMETRIC_CONSENT" # anti-confusion : pas un jeton de login
        and claims.get("aud") == aud                    # destiné À CE service
        # Fenêtre temporelle. `nbf` absent ⇒ on retient `now` comme borne basse : le jeton passe
        # silencieusement la borne inférieure (acceptable ; un consentement sans nbf vaut « dès iat »).
        # `exp` absent ⇒ 0 ⇒ TOUJOURS expiré (refus) : un consentement DOIT porter une fin de validité.
        and claims.get("nbf", now) <= now < claims.get("exp", 0)  # fenêtre courte respectée
        and scope_ok                                    # périmètre EXACT (allow-list, pas de sous-chaîne)
    )
    if not ok:
        raise HTTPException(status_code=403, detail="consent invalid")
```

> **Le piège de précédence (corrigé ci-dessus).** En Python, `A and B or C` se lit `(A and B) or C`.
> Écrire `… and "FINGERPRINT" in scope or "FACE" in scope` rendrait **tout** jeton contenant `FACE`
> valide **quels que soient** `sub`, `intent`, `aud`, `nbf`, `exp` — un **contournement
> d'autorisation** qui démolirait l'anti-IDOR de §0 / §8. La règle : **chaque alternative de scope
> est un terme `and` parenthésé**, et la comparaison se fait contre une **allow-list exacte**,
> jamais par sous-chaîne.

> **Le piège à éviter.** Ne **jamais** appeler `api_jws.decode` sans liste blanche d'algorithmes :
> l'attaque `alg:"none"` et la confusion HS/RS contournent toute la chaîne de confiance. Ici
> `algorithms=["EdDSA"]` est **fermé**.

### 4.3 Anti-rejeu

Le `jti` (nonce) est consommé **une seule fois** dans sa fenêtre `exp`. Stockage : table légère
`consent_nonces(jti, citizen_id, seen_at)` avec TTL = `exp + marge`, ou cache Redis. Deux
soumissions du même JWS → la seconde est rejetée (403). Cela bloque le **relais** d'un consentement
capté.

### 4.4 Stockage de la preuve (et sa confidentialité)

Une fois vérifié, le JWS de consentement est **conservé comme preuve** (le modèle Prisma
`BiometricTemplate` du doc 25 §4.1 porte `consentSignerKid`, `consentSignature`, `consentDocUrl`) :

| Champ Prisma       | Contenu                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `consentSignerKid` | `kid` de la clé citoyen ayant signé (ancre de confiance)              |
| `consentSignature` | le JWS compact (preuve signée, vérifiable a posteriori)               |
| `consentDocUrl`    | URL MinIO de la preuve **chiffrée au repos** (texte de mention + JWS) |

> **Confidentialité (CANON).** Ed25519 ne chiffre rien. La preuve au repos est protégée par le
> **chiffrement de bucket MinIO**. Pour un **export** vers un tiers (OCLEI/Vérificateur Général), on
> emballe la preuve en **sealed box X25519 (age/libsodium)** ou RSA-OAEP — **jamais** « avec Ed25519
> », qui n'en a pas la capacité.

### 4.5 Scellement temporel par l'audit (hash-chain SHA-256, ADR-007)

Chaque vérification de consentement émet un événement d'audit **chaîné** (SHA-256 linéaire, **pas**
un arbre de Merkle), scellé horairement par **Ed25519 in-process** (`@noble/ed25519`, doc 09). Cela
donne au consentement un **horodatage opposable** : on peut prouver _qu'à telle heure_, tel `jti` a
été accepté pour tel `citizen_id`, sans pouvoir réécrire l'historique.

```jsonc
// événement audit émis par log_biometric_event(...) — résumé, PII minimisée
{
  "action": "BIOMETRIC_CONSENT_VERIFIED",
  "entityId": "cln5xz…", // citizen_id
  "meta": {
    "consentJti": "b9f2…", // nonce du consentement (corrélation preuve)
    "signerKid": "cit:cln5xz…:ed25519:3",
    "channel": "kiosk",
    "lang": "bm",
    "noticeVer": "consent-notice/2026.1",
    "result": "ACCEPTED",
  },
  // → chaîné : prevHash → SHA-256(record) → scellement horaire Ed25519 (doc 09)
}
```

> **Intégrité « réelle ».** Conformément au CANON, la hash-chain n'a de valeur **anti-réécriture par
> l'opérateur** que si sa **racine périodique est ancrée chez un tiers** (OCLEI / Vérificateur
> Général). Sans cet ancrage externe, l'État pourrait théoriquement reforger sa propre chaîne. ⏳
> L'ancrage tiers est un livrable Phase 2.

---

## 5. Cas hors-ligne (kits mobiles d'enrôlement)

### 5.1 Pourquoi un mode hors-ligne

L'enrôlement se fait souvent en **zone sans connectivité** (villages, missions mobiles). Le kit
mobile (tablette durcie de l'agent) doit pouvoir **recueillir un consentement valide hors-ligne**,
puis le **synchroniser** plus tard — sans jamais affaiblir la chaîne de confiance.

### 5.2 Principe : signature locale, vérification différée

```
[hors-ligne, sur le terrain]
  1. Le kit affiche les 7 mentions dans la langue du citoyen (catalogue i18n embarqué).
  2. L'app Bloc A du citoyen (sur SON téléphone, appairée au kit par QR/BLE) signe le JWS
     localement avec sa clé privée. ⏳ Si le citoyen n'a pas de smartphone : §5.3 (USSD délégué)
     ou enrôlement de la clé sur place puis signature immédiate.
  3. Le kit met en file { consent_jws, template_protégé, métadonnées } — CHIFFRÉ au repos.

[de retour en ligne]
  4. Synchronisation : le serveur exécute verify_consent_signature() pour CHAQUE entrée.
  5. La fenêtre exp courte est validée contre l'horodatage SIGNÉ (iat), pas l'heure de synchro :
     ⏳ une tolérance d'horloge hors-ligne est définie en Phase 2 (claim `iat` de confiance car SIGNÉ).
  6. Évènement audit hash-chain émis à la synchro (avec `capturedAt` réel).
```

> **Garanties hors-ligne.** La clé privée **ne quitte jamais** l'appareil du citoyen. Le kit ne
> détient que des **artefacts signés** : même volé, il ne permet pas de **fabriquer** un
> consentement (il faudrait la clé privée du citoyen). Le stockage du kit est chiffré au repos.

### 5.3 USSD (téléphone non connecté) — délégation de signature ⏳

Sur USSD (doc 14), il n'y a **pas** de calcul cryptographique côté combiné. Le consentement éclairé
est délivré (menus courts + **rappel audio** Bambara/Peul), mais la **signature** est **déléguée** :

- ⏳ l'app Bloc A du citoyen (sur un autre canal, ou lors d'un précédent enrôlement) signe un JWS de
  consentement **hors-bande** ; le citoyen **confirme** par un code reçu/saisi en session USSD ;
- le serveur lie la confirmation USSD au JWS pré-signé via le `jti`.
- **Anti-corrélation** : conformément au CANON, le pipeline USSD **n'attache pas** MSISDN/IP/timing
  au consentement biométrique au-delà du strict nécessaire à la session ; le `jti` est l'identifiant
  de corrélation, pas le numéro de téléphone.

> **Honnêteté.** Le « USSD pur sans smartphone » ne peut pas produire de signature Ed25519 sur le
> combiné. La conception assume donc une **délégation** : on ne prétend pas signer là où il n'y a
> pas de clé. C'est un choix explicite, documenté, Phase 2.

---

## 6. Révocation du consentement

### 6.1 Pourquoi la révocation est non-négociable

Le DPIA (doc 25 §4.7) et le socle RGPD-équivalent imposent un **droit de retrait** aussi simple à
exercer que le consentement à donner. Retirer son consentement déclenche, en cascade, le **droit à
l'effacement** des templates associés.

### 6.2 Mécanisme

| Étape | Action                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Le citoyen révoque (web/borne/agent) ; ⏳ idéalement par un **JWS de révocation signé** (`intent: "BIOMETRIC_CONSENT_REVOKE"`, même chaîne de confiance §4.6) |
| 2     | Inscription dans le **registre de révocation** : `is_consent_revoked(citizen_id, jti)` renverra vrai                                                          |
| 3     | Événement audit `BIOMETRIC_CONSENT_REVOKED` (hash-chain SHA-256, scellé Ed25519)                                                                              |
| 4     | Déclenchement du **droit à l'effacement** : `DELETE FROM biometric_templates WHERE citizen_id = …` + purge index ANN (doc 25 §6)                              |
| 5     | La preuve de révocation (signée + horodatée) est conservée comme **trace** de la demande                                                                      |

> **Deux registres distincts.** (a) **Révocation de clé** (la clé Ed25519 du citoyen est compromise
> → on retire le `kid` du registre Bloc A) ; (b) **Révocation de consentement** (le citoyen retire
> son accord → on bloque le `jti`/le sujet). Ne pas confondre : une clé valide peut signer un
> retrait.

### 6.3 Distinction avec la rotation du paramètre cancelable

La **révocation du consentement** (volonté du citoyen) ne doit pas être confondue avec la **rotation
du paramètre cancelable** Vault (réponse à un incident de sécurité, doc 25 §4.5,
`INCIDENT-PROTOCOL.md`). La première **efface** des données ; la seconde **re-protège** des
templates existants sans interruption de service. Ce sont deux procédures, deux déclencheurs.

---

## 7. Traçabilité de bout en bout (résumé)

| Quoi                       | Preuve produite                                             | Scellement                                        |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Information donnée         | `lang` + `noticeVer` dans le JWS                            | signé Ed25519 (citoyen)                           |
| Volonté du citoyen         | JWS de consentement (`intent: BIOMETRIC_CONSENT`)           | signé Ed25519 (citoyen)                           |
| Acceptation par le serveur | événement `BIOMETRIC_CONSENT_VERIFIED`                      | hash-chain SHA-256 (ADR-007) + Ed25519 in-process |
| Stockage de la preuve      | `consentSignature` + `consentDocUrl` (MinIO chiffré)        | chiffrement au repos                              |
| Retrait                    | événement `BIOMETRIC_CONSENT_REVOKED` (+ JWS révocation ⏳) | hash-chain SHA-256                                |
| Effacement                 | hard delete templates + purge ANN                           | événement audit chaîné                            |

---

## 8. Anti-patterns à bannir (récapitulatif sécurité)

- ❌ `api_jws.decode(...)` **sans** `algorithms=["EdDSA"]` → attaque `alg:none` / confusion HS/RS.
- ❌ Faire confiance à une clé publique **fournie dans le JWS** au lieu de **résoudre le `kid`**
  dans le registre souverain (toute la chaîne §4.6 s'effondre sinon).
- ❌ Laisser un agent **signer à la place** du citoyen (IDOR : le `sub` du JWS ne serait plus le
  citoyen). Seul l'appareil du citoyen signe.
- ❌ « Chiffrer » le consentement avec Ed25519 (impossible — Ed25519 **signe**, ne chiffre pas).
- ❌ Utiliser un **arbre de Merkle** pour l'audit (le canon NINA-AES est une **hash-chain
  linéaire**).
- ❌ Stocker MSISDN/IP/timing dans la preuve de consentement au-delà du strict nécessaire
  (anti-corrélation).
- ❌ `exp` long ou absent → consentement rejouable indéfiniment (blanc-seing).
- ❌ Tester le `scope` par **sous-chaîne** (`"FACE" in str(scope)`) au lieu d'une **allow-list
  exacte** (`{"enroll:FINGERPRINT","enroll:FACE"}`) → matchs accidentels (`"DEFACE"`,
  `"enroll:FACE_ID"`).
- ❌ Combiner les vérifs de claims avec un `or` **non parenthésé** (`A and B or C`) →
  `(A and B) or C` : un seul terme « vrai » (ex. le scope) **court-circuite** sub/intent/aud/exp →
  **bypass d'authz**.
- ❌ Traiter `api_jws.decode_complete(...)["payload"]` comme un dict : la couche **JWS** renvoie des
  **octets bruts** → `json.loads(...)` obligatoire avant tout accès aux claims.
- ❌ Confondre **JWS détaché** (RFC 7515 §F), **payload non encodé** (`b64:false`, RFC 7797) et
  **JWS compact standard** : trois mécanismes distincts ; ce protocole utilise le **compact
  standard**.
- ❌ Message d'erreur **détaillé** révélant l'étape de vérification échouée → fuite d'oracle (403
  uniforme).

---

## 9. Checklist de conformité du protocole

- [ ] Recueil éclairé présenté dans **la langue du citoyen** (8 langues), `lang` journalisé.
- [ ] Les **7 mentions obligatoires** présentes et versionnées (`noticeVer`).
- [ ] JWS `EdDSA` avec `typ: "nina-bio-consent+jws"` et `kid` résolvable (clé ancrée Bloc A).
- [ ] `sub == citizen_id` (anti-IDOR) ; `intent == "BIOMETRIC_CONSENT"` ; `aud` correct.
- [ ] Liste blanche d'algorithmes **fermée** (`["EdDSA"]`), `alg:none` impossible.
- [ ] `exp` court + `jti` anti-rejeu consommé une seule fois.
- [ ] Vérification **ancrage → signature → claims → révocation**, échec en **403 uniforme**.
- [ ] Preuve stockée chiffrée au repos (MinIO) ; export tiers en sealed box X25519 / RSA-OAEP.
- [ ] Événement audit `BIOMETRIC_CONSENT_VERIFIED` **chaîné** (SHA-256) + scellé Ed25519 in-process.
- [ ] Révocation → effacement (hard delete + purge ANN) + trace conservée.
- [ ] Mode hors-ligne : signature locale citoyen, vérification différée, kit chiffré au repos.
- [ ] USSD : délégation de signature documentée (⏳), anti-corrélation respectée.

> **Statut global** : ⏳ **conçu, non implémenté** (Bloc F scope V1 = vision + plan ; implémentation
> P3a sous réserve d'autorisation institutionnelle et de DPIA validé CISO/DPO CTDEC).
