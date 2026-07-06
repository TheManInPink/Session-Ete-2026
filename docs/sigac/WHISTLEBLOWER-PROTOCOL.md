# WHISTLEBLOWER-PROTOCOL — Protocole lanceurs d'alerte SIGAC

> **Périmètre** : Bloc D — SIGAC (Système Intégré de Gouvernance Anti-Corruption). **Document
> parent** : `docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md` — ce protocole est **référencé par le doc 23
> §6** (« Cérémonie documentée dans `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` ») et en développe les
> §4.5 (chiffrement asymétrique réel + recovery M-of-N) et §6 bis (anti-corrélation, risque résiduel
> opérateur). **ADR de référence** : `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md` (stack
> SIGAC) et `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` (sealed box X25519 / RSA-OAEP,
> AppRole sans token long-lived, mTLS, mapping OWASP). **Crypto d'audit transverse** : ADR-007 /
> ADR-014 — chaîne d'audit **hash-chain SHA-256 linéaire** scellée Ed25519 in-process
> (`@noble/ed25519`), ancrée chez un tiers (OCLEI / Vérificateur Général). Voir doc 09. [^merkle]
>
> [^merkle]:
>     ⚠️ **Note de vocabulaire (abus de langage historique).** Le **TITRE et le texte d'ADR-007**
>     parlent encore d'une « chaîne de type **Merkle** » (ADR-007 l.1 / 23-24), et le doc parent
>     **23** écrit « audit **Merkle** ADR-014 » (doc 23 l.667 / 842 / 957). **Le mécanisme réel est
>     une hash-chain SHA-256 _linéaire_, PAS un arbre de Merkle** (CANON audit). Le présent
>     protocole applique le CANON ; la mention « Merkle » d'ADR-007 et du doc 23 est un **abus de
>     langage à corriger à la source** (retitrer/annoter ADR-007 « hash-chain SHA-256 linéaire, PAS
>     arbre de Merkle » ; remplacer « audit Merkle » par « audit hash-chain SHA-256 » dans le doc
>     23).
>
> 🟠 **MARQUEUR D'HONNÊTETÉ GLOBAL** : à la date de ce document, `anticorruption-service` est un
> **scaffold**. **Aucun** des contrôles décrits ici n'est **implémenté** ; tout ce qui n'est pas
> explicitement marqué « ✅ implémenté » est **⏳ conçu, Phase 2**. Ce document décrit la
> **conception cible**. Ne JAMAIS présenter le canal lanceurs d'alerte comme « sécurisé » ou «
> anonyme de bout en bout » tant que les tests E2E confidentialité et le pen-test du module
> whistleblower (doc 23 §10) ne sont pas verts.

---

## Table des matières

1. [POURQUOI ce protocole existe (avant le COMMENT)](#1-pourquoi-ce-protocole-existe-avant-le-comment)
2. [Engagement éthique de l'institution](#2-engagement-éthique-de-linstitution)
3. [Modèle de menace résumé (qui doit-on neutraliser ?)](#3-modèle-de-menace-résumé-qui-doit-on-neutraliser)
4. [Primitive cryptographique CORRIGÉE (CANON)](#4-primitive-cryptographique-corrigée-canon)
5. [Cérémonie de génération et de partage de la clé procureur](#5-cérémonie-de-génération-et-de-partage-de-la-clé-procureur)
6. [Chaîne de transmission au procureur](#6-chaîne-de-transmission-au-procureur)
7. [Garanties anti-représailles (cadre malien / AES)](#7-garanties-anti-représailles-cadre-malien--aes)
8. [Cycle de vie du token de suivi (NON dérivé du numéro)](#8-cycle-de-vie-du-token-de-suivi-non-dérivé-du-numéro)
9. [Risque RÉSIDUEL de désanonymisation (opérateur USSD tiers)](#9-risque-résiduel-de-désanonymisation-opérateur-ussd-tiers)
10. [Checklist de conformité du protocole](#10-checklist-de-conformité-du-protocole)

---

## 1. POURQUOI ce protocole existe (avant le COMMENT)

La corruption est le risque institutionnel **#1** d'un système d'identité gouvernemental. Le seul
contre-pouvoir réellement efficace est la **parole de ceux qui voient** : un collègue, un citoyen au
guichet, un agent CTDEC honnête. Mais cette parole ne se libère **que si elle est sûre**. Un lanceur
d'alerte qui craint des représailles se tait — et la fraude prospère.

Trois exigences fondent donc ce protocole, dans cet ordre de priorité :

1. **Confidentialité du contenu** — personne, **pas même un administrateur de la base de données
   NINA**, ne doit pouvoir lire CE QUI a été signalé. Seul le **procureur** désigné le peut.
2. **Anonymat de l'auteur** — le système ne doit pas permettre de répondre à « QUI a signalé ? », ni
   directement (pas de numéro stocké) ni par **corrélation de métadonnées** (heure exacte + IP +
   correlation-id).
3. **Non-perte de la preuve** — si le procureur disparaît (mutation, décès, empêchement), les
   signalements chiffrés ne doivent pas devenir **illisibles à jamais**. D'où un **recovery
   M-of-N**.

> 💡 **Le piège à éviter** : confondre « chiffrement » et « confiance dans l'admin ». Si le serveur
> reçoit le texte en clair (même une milliseconde), un dump réseau, un log mal configuré, ou un
> admin sous contrainte suffit à trahir le signaleur. La conception SIGAC place donc le **scellement
> côté borne/client** : le serveur ne voit **jamais** le plaintext, seulement le ciphertext.

---

## 2. Engagement éthique de l'institution

Ce protocole n'est crédible que s'il est **adossé à un engagement public** de l'institution (CTDEC /
OCLEI / Vérificateur Général). L'engagement n'est pas un ornement : c'est la **contrepartie morale**
des garanties techniques.

| Principe                         | Engagement de l'institution                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Présomption de bonne foi**     | Tout signalement est traité comme fait de bonne foi sauf preuve manifeste de calomnie. Le doute profite au signaleur.                            |
| **Pas de chasse à l'auteur**     | L'institution s'**interdit** toute tentative de désanonymisation d'un signaleur de bonne foi, y compris par recoupement administratif.           |
| **Pas de classement silencieux** | Aucun signalement n'est enterré : même la classe `OTHER` (BERT) entre en file procureur (cf. doc 23 §6 bis.2). Le ML **trie**, il ne filtre pas. |
| **Traçabilité des accès**        | Chaque déchiffrement, chaque reconstitution de clé, chaque changement de statut est journalisé dans l'audit **hash-chain SHA-256** (ADR-014).    |
| **Protection légale**            | L'institution active les protections anti-représailles du cadre malien/AES (cf. §7) dès l'ouverture d'un dossier fondé.                          |
| **Reddition de comptes**         | Un rapport annuel agrégé (nombre de signalements, taux de traitement, suites données) est publié — **sans** donnée ré-identifiante.              |

> 🟠 ⏳ **Conçu, Phase 2** : la publication du rapport annuel agrégé suppose une **agrégation à
> confidentialité différentielle** (doc 23 §10) pour ne pas réintroduire d'identifiabilité par les
> chiffres. Non implémenté.

---

## 3. Modèle de menace résumé (qui doit-on neutraliser ?)

> Référence complète : `docs/security/THREAT-MODEL.md`. Résumé appliqué au canal whistleblower.

| Adversaire                                  | Capacité supposée                                | Ce que le protocole **VISE** à lui refuser (⏳ voir dérive audit cleartext)                                                                                            |
| ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin DB / DBA NINA**                     | Lecture totale de `whistleblower_reports`        | Ne voit que du **ciphertext** + buckets grossiers + le **jour**. Aucun plaintext, aucun numéro.                                                                        |
| **Admin système / SRE**                     | Accès logs, dumps réseau, mémoire serveur        | Le plaintext **n'atteint jamais** le serveur (scellement côté borne) → rien à logger/dumper.                                                                           |
| **Agent corrompu visé par le signalement**  | Veut savoir qui l'a dénoncé                      | Pas de numéro, pas d'IP, pas de correlation-id ; UUID v4 aléatoire ; classif/severité bucketisées. **⏳ Réserve : voir note ci-dessous (journal d'audit transverse).** |
| **Procureur lui-même (abus)**               | Détient la clé privée                            | **Ne peut PAS** reconstituer seul la clé après recovery : seuil **3-of-5** requis (cf. §5).                                                                            |
| **Gardien de part Shamir isolé**            | Détient 1 part                                   | 1 (ni 2) part ne révèle **rien** de la clé (propriété information-theoretic du SSS).                                                                                   |
| **Opérateur USSD tiers (Africa's Talking)** | Voit le **MSISDN** + horodatage de session (CDR) | ⚠️ **Hors de notre contrôle** → **risque résiduel** explicitement documenté (cf. §9).                                                                                  |
| **Initié à accès audit (insider audit)**    | Lecture du journal d'audit/event **transverse**  | ⏳ **PAS refusé aujourd'hui** : le journal partagé persiste `ipAddress` + `correlationId` **en clair** → désanonymisation possible (cf. note ci-dessous, §9bis, §10).  |

> 🟠 ⏳ **DÉRIVE INTER-DOCS — anti-corrélation NON acquise de bout en bout côté interne.**
> L'anti-corrélation côté **stockage whistleblower** (`whistleblower_reports`) est **conçue** ; mais
> le **journal d'audit / event TRANSVERSE** — le **même** hash-chain SHA-256 que ce document cite à
> répétition (§2, §6.4, §10) — **persiste aujourd'hui `ipAddress` + `correlationId` EN CLAIR**
> (`docs/security/THREAT-MODEL.md` **§4.5-I**, risque **#12 = 15 / ÉLEVÉ / 🔴**). Tant que ces
> champs ne sont pas **supprimés/hashés**, **OU** que le journal des events whistleblower n'est pas
> **cloisonné** dans un store à accès restreint, un **INITIÉ** peut **désanonymiser** un signaleur
> par recoupement **IP + correlationId + horodatage**. **Le canal n'est donc PAS anti-corrélé de
> bout en bout côté interne.** Cette dérive n'est **pas** « pas encore codé » : l'infra d'audit
> **déjà décrite** persiste **activement** ces champs désanonymisants. Bloquant avant tout claim
> d'anti-corrélation interne (cf. §9bis et checklist §10).

---

## 4. Primitive cryptographique CORRIGÉE (CANON)

> ⚠️ **CORRECTIF P0 (rappel)** — Une version antérieure annonçait un « chiffrement Ed25519 » du
> canal lanceurs d'alerte. **C'est une erreur de conception** : **Ed25519 est une primitive de
> _signature_, PAS de chiffrement**. Vault Transit (et libsodium) **refusent** une clé `ed25519`
> pour `encrypt`/`decrypt` (`unsupported operation`). En l'état, ce schéma offrait **AUCUNE
> confidentialité**. Le CANON SIGAC l'a remplacé.

### 4.1 Ce qu'on chiffre, comment, et POURQUOI

On veut que **n'importe qui** puisse _écrire_ un signalement (chiffrer avec une clé **publiquement
diffusée**) mais qu'une **seule** personne — le procureur — puisse le _lire_ (déchiffrer avec sa clé
privée hors-ligne). C'est exactement la définition du **chiffrement asymétrique**. Avec du
chiffrement symétrique, la clé de déchiffrement vivrait sur le serveur → tout admin DB lirait tout.

**Deux schémas autorisés** (et **seulement** ceux-là) :

| Schéma                             | Construction                                                            | Quand le choisir                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **SEALED_BOX_X25519** (recommandé) | libsodium `crypto_box_seal` = **X25519** (ECDH) + **XSalsa20-Poly1305** | Clé privée procureur stockée **hors-ligne / sur papier** (air-gap). Pas de dépendance HSM. |
| **RSA_OAEP_4096** (variante)       | Vault Transit clé **`rsa-4096`**, padding **OAEP SHA-256**              | La clé privée doit vivre dans un **HSM / Vault** plutôt que sur papier.                    |

> 🔑 **POURQUOI X25519 et PAS Ed25519 ?** Les deux courbes sont liées (Curve25519) **mais ont des
> rôles disjoints** : **Ed25519 = signature** (prouver l'origine/l'intégrité), **X25519 = échange de
> clés** (Diffie-Hellman, donc chiffrement). On ne chiffre **jamais** avec une courbe de signature.
> Une clé Ed25519 et une clé X25519 font toutes deux 32 octets — d'où la confusion ; la vraie
> défense est la **séparation stricte des clés** côté Vault (clé `rsa-4096` pour `encrypt`, clé
> `ed25519` réservée à la **signature** de l'accusé de réception procureur, voir §6.3).

> 🔑 **POURQUOI RSA-OAEP et pas RSA brut (PKCS#1 v1.5) ?** OAEP ajoute un padding aléatoire prouvé
> sûr contre les attaques à chiffré choisi ; PKCS#1 v1.5 est vulnérable (Bleichenbacher). RSA-4096
> donne ~128 bits de sécurité, conforme aux conventions repo (RSA-3072 minimum).

### 4.2 Où le chiffrement a lieu (et où il n'a JAMAIS lieu)

```
   Citoyen ──*123*ALERTE#──▶ Borne / passerelle USSD          Serveur de stockage SIGAC
                            ┌──────────────────────────┐      ┌──────────────────────────┐
                            │ 1. saisie message (≤160) │      │                          │
                            │ 2. classif BERT LOCALE   │      │   reçoit UNIQUEMENT :     │
                            │ 3. seal(payload, PUBKEY  │ ───▶ │   - ciphertext            │
                            │    procureur)            │      │   - cipherKid + scheme    │
                            │ 4. jette clé éphémère    │      │   - buckets grossiers     │
                            │ ⛔ plaintext NE SORT PAS │      │   - JOUR (pas l'heure)    │
                            └──────────────────────────┘      └──────────────────────────┘
                                                                  ⛔ ne peut PAS déchiffrer
                                                                  (n'a que la clé PUBLIQUE)
```

Le **plaintext n'existe jamais côté serveur**. C'est la différence entre « confidentialité » et «
confiance dans l'admin ».

### 4.3 Extrait de scellement (côté borne — rappel du module canonique)

> Source canonique complète : doc 23 §4.5 (`seal_client.py`). Extrait commenté ci-dessous pour
> auto-suffisance de ce protocole. **Ce code tourne côté borne/passerelle, JAMAIS sur le serveur de
> stockage.**

```python
# services/anticorruption-service/app/whistleblower/seal_client.py  (extrait)
# Dépendance : PyNaCl (binding libsodium) — pip install pynacl==1.5.*
import base64, json
from nacl.public import PublicKey, SealedBox  # libsodium crypto_box_seal

def seal_report(plaintext_message: str, fine_classification: str, fine_severity: str,
                prosecutor_pubkey_b64: str, cipher_kid: str) -> dict:
    """
    Scelle un signalement AVEC LA CLÉ PUBLIQUE du procureur (X25519 sealed box).

    POURQUOI côté borne : le plaintext ne doit JAMAIS transiter/résider sur le serveur.
        crypto_box_seal génère une paire X25519 ÉPHÉMÈRE, fait l'ECDH avec la clé publique
        procureur, chiffre via XSalsa20-Poly1305, puis JETTE la clé privée éphémère :
        même la borne ne peut pas redéchiffrer après coup ("anonymous public-key encryption").

    POURQUOI classif/severité FINES dans le payload chiffré : elles sont identifiantes par
        recoupement. Le serveur ne stocke en clair que des BUCKETS grossiers.
    """
    pubkey_raw = base64.b64decode(prosecutor_pubkey_b64)
    if len(pubkey_raw) != 32:
        # Garde-fou : une clé Ed25519 fait AUSSI 32 octets mais n'est PAS une clé d'échange.
        raise ValueError("Clé publique X25519 invalide (32 octets attendus).")
    payload = json.dumps(
        {"message": plaintext_message,
         "classification": fine_classification,  # ex. "CORRUPTION_FINANCIAL"
         "severity": fine_severity},             # ex. "CRITICAL"
        ensure_ascii=False).encode("utf-8")
    sealed = SealedBox(PublicKey(pubkey_raw)).encrypt(payload)  # X25519 + XSalsa20-Poly1305
    return {"ciphertext_b64": base64.b64encode(sealed).decode("ascii"),
            "cipher_kid": cipher_kid, "scheme": "SEALED_BOX_X25519"}
```

> 🟠 ⏳ **Conçu, Phase 2** — non implémenté dans `anticorruption-service` (scaffold). Le binding
> natif libsodium **côté borne** (et non Python) reste à intégrer dans `ussd-service` (doc 14).

---

## 5. Cérémonie de génération et de partage de la clé procureur

> **Objectif** : produire la paire de clés du procureur de façon **air-gapped**, diffuser la clé
> **publique** (non secrète), et scinder la clé **privée** en parts Shamir **3-of-5** confiées à des
> gardiens distincts — **sans jamais** que la clé privée complète ne touche un serveur exposé ni un
> disque en clair persistant.

### 5.1 POURQUOI un recovery 3-of-5 (et pas 1, ni 5-of-5) ?

- **1 seul détenteur** → si le procureur disparaît, **tous les signalements deviennent illisibles à
  jamais** = perte de preuve. Inacceptable.
- **5-of-5** → la perte/absence d'un **seul** gardien bloque toute reconstitution = fragilité.
- **3-of-5** → équilibre **anti-abus / résilience** : aucun gardien seul (ni même 2) ne peut lire
  les signalements ; mais la perte de 2 gardiens n'empêche pas la reconstitution.

> ⚠️ **PIÈGE CANON — PAS le Shamir interne de Vault.** `vault operator generate-root` /
> `operator rekey` ne servent **qu'à** reconstituer le root token / la clé d'unseal de **Vault
> lui-même**. Le Shamir intégré de Vault **ne sait pas** scinder une clé applicative externe (X25519
> / RSA du procureur). On utilise un **outil SSS dédié** : le binaire `ssss` (Shamir's Secret
> Sharing Scheme) **ou** la lib `sss` (Daan Sprenkels) pour une dépendance pur-libsodium auditable.
> Le choix est documenté dans l'ADR-034.

### 5.2 Déroulé de la cérémonie (poste air-gapped)

| Phase | Acteurs présents                         | Action                                                                                                                | Contrôle                                         |
| ----- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| C0    | Officier de cérémonie + huissier/notaire | Démarrage d'un poste **air-gapped** (jamais connecté au réseau), témoins identifiés, procès-verbal ouvert.            | PV signé, horodaté.                              |
| C1    | Officier de cérémonie                    | Génération de la paire procureur (X25519 **ou** RSA-4096). La privée reste **en mémoire**, jamais persistée en clair. | Empreinte (hash) de la clé publique notée au PV. |
| C2    | Officier de cérémonie                    | Export de la clé **publique** (+ `cipher_kid`, ex. `proc-x25519-v2`). Non secrète → diffusable largement.             | Publication CTDEC + site OCLEI + bornes.         |
| C3    | Officier de cérémonie                    | **Split SSS 3-of-5** de la clé privée (pipe direct, jamais écrite en clair sur disque).                               | 5 parts générées, numérotées.                    |
| C4    | Les **5 gardiens** (individuellement)    | Remise d'**1 part chacun**, sur canaux séparés, dans des **coffres physiques distincts**.                             | Accusé de réception par gardien, consigné au PV. |
| C5    | Officier de cérémonie                    | **Destruction** (`shred`) de la copie complète en clair de la clé privée et de tout fichier temporaire.               | Attestation de destruction au PV.                |
| C6    | Officier + huissier                      | Clôture : ancrage du hash du PV dans l'audit **hash-chain SHA-256** (ADR-014), racine ancrée chez tiers (OCLEI).      | Entrée d'audit scellée Ed25519 in-process.       |

### 5.3 Les 5 gardiens (séparation des pouvoirs)

Les gardiens doivent appartenir à des **chaînes d'autorité distinctes** pour éviter toute collusion
de 3 personnes du même corps :

1. **Président de l'OCLEI** (autorité anti-corruption).
2. **Magistrat tutélaire** (autorité judiciaire indépendante).
3. **Notaire / huissier** (officier ministériel — preuve formelle).
4. **Vérificateur Général** (contrôle des finances publiques — détient aussi l'ancrage audit).
5. **Responsable conformité CTDEC** (côté exécutant, mais **minoritaire** : 1 seule voix).

> 🛡️ **Anti-abus** : aucun corps ne détient **3 voix**. Reconstituer la clé exige la **coopération
> de chaînes d'autorité différentes**, sous contrôle judiciaire.

### 5.4 Commande de split (rappel canonique, outil SSS dédié)

```bash
# Poste AIR-GAPPED. La clé privée (base64) est pipée DIRECTEMENT au split : jamais écrite en clair.
# -t 3 = seuil de reconstitution (3 parts suffisent) ; -n 5 = nombre de parts générées.
base64 -w0 proc_key_private.raw | ssss-split -t 3 -n 5 -w proc_key > proc_key.shares
# -> 5 lignes "proc_key-1-..." ... "proc_key-5-...". Réparties en 5 fichiers, 1 par gardien.
# Reconstitution (≥ 3 parts) : cat share1 share3 share5 | ssss-combine -t 3 | base64 -d
# Variante souveraine auditable : lib `sss` (Daan Sprenkels), pur-libsodium — choix tracé ADR-034.
shred -u proc_key_private.raw proc_key.shares   # destruction de la copie complète après split
```

### 5.5 Rotation et révocation de la clé procureur

- **Rotation planifiée** : nouvelle paire → nouveau `cipher_kid` (ex. `proc-x25519-v3`). Les bornes
  reçoivent la **nouvelle** clé publique ; les anciens signalements restent déchiffrables avec
  l'ancienne clé privée (conservée). On **n'efface jamais** une clé privée tant qu'il reste des
  signalements scellés avec elle.
- **Révocation d'urgence** (compromission suspectée) : cesser de diffuser l'ancienne clé publique,
  publier la nouvelle, et **re-sceller** les signalements non encore traités sous la nouvelle clé
  **uniquement après déchiffrement contrôlé** (3-of-5) — sous PV judiciaire.

> 🟠 ⏳ **Conçu, Phase 2** : la mécanique de rotation multi-`cipher_kid` côté borne et le
> re-scellement contrôlé ne sont pas implémentés.

---

## 6. Chaîne de transmission au procureur

### 6.1 Du citoyen au stockage (côté borne)

> Rappel doc 23 §4.5 (`alerte.menu.ts`). Le serveur ne reçoit **que** du ciphertext + buckets + le
> **jour**.

```
1. Citoyen tape *123*ALERTE#
2. Saisit son message (10–160 chars USSD)
3. Borne : classification BERT LOCALE  →  buckets grossiers (classif + severité)
4. Borne : seal(message + classif/severité FINES, PUBKEY procureur)  →  ciphertext
5. Borne : POST { id=uuidv4, ciphertext, scheme, cipherKid, classBucket, sevBucket, receivedDay }
   ⛔ PAS de numéro, PAS d'IP, PAS de correlation-id, PAS de timestamp précis
6. Serveur : INSERT whistleblower_reports (ciphertext only)  →  status = RECEIVED
```

> 🟠 ⏳ **RÉSERVE D'HONNÊTETÉ (anti-corrélation cleartext audit).** Le « PAS d'IP, PAS de
> correlation-id, PAS de timestamp précis » ci-dessus décrit **uniquement** ce que stocke la table
> `whistleblower_reports`. **Il ne s'applique PAS** au **journal d'audit / event TRANSVERSE** qui,
> lui, **persiste aujourd'hui `ipAddress` + `correlationId` EN CLAIR** pour **tous** les services,
> requêtes whistleblower comprises (`docs/security/THREAT-MODEL.md` **§4.5-I**, risque **#12 = 15 /
> ÉLEVÉ / 🔴**). Conséquence : tant que ces champs ne sont pas **supprimés/hashés** **OU** que les
> events whistleblower ne sont pas **cloisonnés** dans un store à accès restreint, un **INITIÉ**
> peut désanonymiser par **IP + correlationId + horodatage**. **L'anti-corrélation n'est donc PAS
> acquise de bout en bout côté interne** — voir §3 (note dérive), §9bis et checklist §10.

### 6.2 Du stockage au procureur (lecture)

Le procureur consulte la **file** via le dashboard `apps/governance` (réservé `INSPECTOR`,
`PROSECUTOR`). Le dashboard n'affiche **que** les buckets + le jour : le navigateur **n'a pas** la
clé privée. Le **déchiffrement réel** se fait **localement sur le poste procureur** (hors-ligne),
jamais dans le serveur web.

```
┌── Dashboard SIGAC (serveur web) ──┐        ┌── Poste procureur (HORS-LIGNE) ──┐
│ liste : id, classBucket,          │        │ clé privée (papier OU reconst.   │
│ sevBucket, receivedDay, status    │ ─────▶ │ 3-of-5 via SSS sous PV)          │
│ ⛔ JAMAIS le contenu déchiffré    │ copie  │ decrypt(ciphertext) en LOCAL      │
└───────────────────────────────────┘ cipher │ → lecture du message + classif    │
                                       text   │   FINE (procureur seul)           │
                                              └───────────────────────────────────┘
```

**Déchiffrement — schéma SEALED_BOX_X25519** (poste hors-ligne) :

```python
# Poste procureur, hors-ligne. Clé privée X25519 (papier ou reconstituée 3-of-5).
import base64, sys
from nacl.public import PrivateKey, SealedBox
sk = PrivateKey(base64.b64decode(open('proc_x25519.key', 'rb').read()))
print(SealedBox(sk).decrypt(base64.b64decode(sys.argv[1])).decode())  # <ciphertext-b64-from-db>
```

**Déchiffrement — variante RSA_OAEP_4096** (poste hors-ligne) :

```python
# Le ciphertext en DB est du base64 BRUT RSA-OAEP (PAS l'enveloppe "vault:vN:" de Transit).
# ⚠️ On NE PEUT PAS le passer à transit/decrypt (qui n'accepte que sa propre enveloppe "vault:vN:").
# Déchiffrement LOCAL avec la clé privée rsa-4096, symétrique de l'encrypt local :
import base64, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
sk = serialization.load_pem_private_key(open('proc_rsa4096.key', 'rb').read(), password=None)
print(sk.decrypt(base64.b64decode(sys.argv[1]),
      padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                   algorithm=hashes.SHA256(), label=None)).decode())  # <ciphertext-b64-from-db>
```

> 🔑 **Auth Vault SANS `VAULT_TOKEN` long-lived** (variante RSA si la clé vit dans Vault/HSM) : le
> poste procureur s'authentifie par **AppRole** (ou ServiceAccount K8s en prod K3s) — `role_id`
> non-secret, `secret_id` à usage unique / TTL court — pour obtenir un token de **lease court**,
> **révoqué** en fin de session (`vault token revoke -self`). On ne met **JAMAIS** `VAULT_TOKEN`
> dans `.env`, l'image Docker ou les manifests (cf. ADR-034).

> ⚠️ **Cohérence encrypt/decrypt** : l'`encrypt` et le `decrypt` DOIVENT rester **du même côté** —
> les deux **locaux** (`cryptography`), **OU** les deux **via Vault** (`transit/encrypt` produit
> `vault:v1:…`, alors `transit/decrypt` redevient valide). Mélanger les deux donne
> `invalid ciphertext`.

### 6.3 Accusé de réception procureur (SIGNATURE, pas chiffrement)

Quand le procureur a déchiffré, il **signe** un accusé de réception pour horodater son traitement
**sans** révéler le moment du signalement. Cette signature utilise **Ed25519** — ici **à sa place
légitime : la SIGNATURE**, jamais le chiffrement.

```
status: RECEIVED → ACKNOWLEDGED
acknowledgedBy = <procureur>          # rempli APRÈS lecture
acknowledgedAt = <horodatage accusé>  # ≠ receivedDay du signalement (anti-corrélation préservée)
signature = Ed25519_sign(procureur, {reportId, acknowledgedAt})   # SIGNATURE only
→ entrée audit hash-chain SHA-256 (ADR-014), scellée Ed25519 in-process
```

> 🔑 **Séparation des rôles cryptographiques (CANON)** : `rsa-4096` / X25519 = **chiffrement** du
> signalement ; `ed25519` = **signature** de l'accusé. Deux clés, deux fonctions, jamais
> interverties. Vault `transit/encrypt` sur `ed25519` échoue (`unsupported operation`) — c'est
> volontaire et testé en non-régression (doc 23 §10).

### 6.4 Statuts du cycle de vie d'un signalement

```
RECEIVED ──(procureur déchiffre)──▶ ACKNOWLEDGED ──▶ UNDER_INVESTIGATION
                                                          │
                          ┌───────────────┬───────────────┼───────────────┐
                          ▼               ▼               ▼               ▼
                   CLOSED_FOUNDED  CLOSED_UNFOUNDED  CLOSED_DUPLICATE   (gel si recours)
```

Chaque transition est journalisée en audit **hash-chain SHA-256** (ADR-014). Aucune transition
n'efface le ciphertext (append-only).

---

## 7. Garanties anti-représailles (cadre malien / AES)

> ⚖️ **Base légale** : protections du lanceur d'alerte applicables au Mali / dans l'espace AES et
> cadre **RGPD-like** (protection des données). **PAS** de référence à une « loi 2024-XX » non
> adoptée (CANON souveraineté). Les dispositions ci-dessous décrivent l'**engagement opérationnel**
> de l'institution adossé au droit existant ; une qualification juridique précise relève du conseil
> juridique de l'OCLEI.

### 7.1 Garanties techniques (ce que le système impose)

| Garantie                               | Mécanisme technique                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Impossibilité de désigner l'auteur** | Pas de numéro / IP / correlation-id stocké ; UUID v4 aléatoire ; classif+severité bucketisées ; jour sans heure. |
| **Contenu inaccessible en interne**    | Chiffré pour la **seule** clé privée procureur ; serveur n'a que la clé publique.                                |
| **Traçabilité des accès au dossier**   | Tout déchiffrement / reconstitution de clé est journalisé (audit hash-chain SHA-256, ADR-014).                   |
| **Séparation des pouvoirs**            | Reconstitution de clé = **3-of-5** gardiens de chaînes d'autorité distinctes, sous contrôle judiciaire.          |

### 7.2 Garanties procédurales (ce que l'institution s'engage à faire)

- **Interdiction de mesures de rétorsion** : sanction, mutation punitive, rétrogradation,
  non-renouvellement visant un signaleur identifié _a posteriori_ sont prohibés et **réversibles**
  par l'OCLEI.
- **Charge de la preuve inversée** : en cas de mesure défavorable concomitante à un signalement
  fondé, il revient à l'employeur de prouver que la mesure est **étrangère** au signalement.
- **Confidentialité de l'enquête** : l'identité éventuellement connue (cas où l'auteur se révèle de
  lui-même au procureur) est protégée par le secret de l'instruction.
- **Anti-représailles pour signalement de bonne foi non fondé** : un signalement **de bonne foi**
  qui s'avère non fondé **n'expose à aucune sanction** (seule la calomnie manifeste est exclue).

### 7.3 Symétrie : protection de l'agent visé (RGPD art. 22)

Les anti-représailles ne doivent pas devenir un outil de répression **inverse** contre l'agent
signalé. Un flag SIGAC ou un signalement **ne déclenche aucune sanction automatique** : il **cible**
une enquête humaine OCLEI. L'agent visé conserve ses droits RGPD (information, explication,
intervention humaine, **contestation** via `POST /sigac/integrity-scores/{id}/dispute` — doc 23 §6
bis.3).

> 🟠 ⏳ **Conçu, Phase 2** : l'endpoint de contestation et le gel automatique du flag pendant le
> recours sont **conçus** (doc 23 §6 bis.3), non implémentés.

---

## 8. Cycle de vie du token de suivi (NON dérivé du numéro)

### 8.1 POURQUOI un token de suivi, et POURQUOI il ne doit PAS être dérivé du numéro

Un signaleur veut souvent **vérifier que son alerte a été prise en compte** — sans pour autant se
ré-identifier. On lui remet donc un **token de suivi**. Ce token **NE DOIT PAS** être dérivé de son
MSISDN ni d'aucune donnée identifiante :

- ❌ Si `token = hash(numéro)`, alors quiconque connaît un numéro peut **recalculer** le token et
  **corréler** un signalement à une personne → désanonymisation triviale.
- ✅ Le token doit être un **secret aléatoire** (UUID v4 / 128 bits CSPRNG) **indépendant** de toute
  identité, connu du **seul** signaleur (remis à l'écran USSD, jamais re-stocké en clair côté
  serveur sous forme réversible).

### 8.2 Génération et stockage

| Élément                  | Valeur                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **`report.id`**          | UUID v4 aléatoire (clé primaire du signalement, non corrélable).                                                   |
| **Token de suivi remis** | Secret aléatoire 128 bits (CSPRNG), affiché **une seule fois** à l'écran USSD. **Non** dérivé du numéro.           |
| **Stockage serveur**     | On stocke **uniquement** un **hash** (SHA-256) du token pour permettre la vérification — jamais le token en clair. |
| **`shortId` affiché**    | Préfixe **non-réversible** (hash tronqué) pour mémorisation humaine — purement cosmétique, non secret.             |

> 💡 **POURQUOI stocker un hash du token et pas le token ?** Pour vérifier un statut, le signaleur
> re-saisit son token ; le serveur compare `SHA-256(saisie)` au hash stocké. Le serveur ne peut donc
> **pas** révéler le token (irréversibilité), et une fuite de la base ne livre **pas** les tokens.
> Le hash du token **n'est lié à aucune identité** : il ne casse pas l'anonymat.

### 8.3 Flux de suivi (consultation de statut, anonyme)

```
1. Signaleur tape *123*SUIVI# puis saisit son token de suivi (128 bits)
2. Borne/serveur : statut = lookup( hash = SHA-256(token) )  → report.status
3. Réponse : "Votre signalement est : REÇU | EN COURS | CLÔTURÉ"  (statut grossier seulement)
   ⛔ JAMAIS : le contenu, la classe fine, l'identité du procureur, aucune métadonnée fine
```

### 8.4 Cycle de vie et expiration

| Phase                 | Règle                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Émission**          | À la création du signalement (status `RECEIVED`).                                                                       |
| **Validité**          | Tant que le signalement n'est pas clôturé + délai de grâce (ex. 90 jours après clôture) pour consultation finale.       |
| **Révélation statut** | Le token donne accès **uniquement** au statut grossier (RECEIVED / UNDER*INVESTIGATION / CLOSED*\*), jamais au contenu. |
| **Expiration**        | Après le délai de grâce, le hash du token est **purgé** ; le `report.id` (et son ciphertext) restent en archive.        |
| **Perte du token**    | **Irrécupérable par design** (non dérivé du numéro, hash irréversible). Le signaleur peut re-signaler.                  |

> 🛡️ **Anti-corrélation maintenue** : ni le token, ni son hash, ni le `shortId` ne contiennent
> d'horodatage précis, d'IP ou de numéro. Le suivi ne **réintroduit aucune** entropie identifiante.

> 🟠 ⏳ **Conçu, Phase 2** : le menu `*123*SUIVI#` et la table de hash de tokens ne sont pas
> implémentés (scaffold).

---

## 9. Risque RÉSIDUEL de désanonymisation (opérateur USSD tiers)

> ⚠️ **À NE PAS SOUS-ESTIMER — point de désanonymisation HORS de notre contrôle.**

Le canal `*123*ALERTE#` transite par **Africa's Talking**, un agrégateur USSD **étranger** (hors
AES). Même si NINA ne stocke **jamais** le numéro, **l'opérateur, lui, voit et conserve le MSISDN**
du signaleur (CDR de facturation/routage), associé à l'**horodatage précis** de la session.

Conséquence honnête : tant que cet opérateur tiers reste sur le chemin critique, **le canal ne peut
PAS être présenté comme « anonyme de bout en bout »**. Une réquisition judiciaire, une fuite, ou une
coopération de l'opérateur peut relier un signalement à un numéro.

| Aspect                               | État                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ce que NINA garantit**             | Contenu illisible côté serveur ; aucun numéro/IP/corr-id stocké ; buckets + jour seulement.                                                                                          |
| **Ce que NINA NE garantit PAS**      | Que l'**opérateur tiers** n'associe pas MSISDN ↔ horodatage session dans ses propres CDR.                                                                                            |
| **Mitigation de souveraineté visée** | Router `*123*ALERTE#` via un **agrégateur USSD national** ou un **SMSC/USSD-GW on-premise** (CTDEC / opérateur AES), de sorte que le MSISDN ne quitte jamais le périmètre souverain. |
| **Statut de la mitigation**          | 🟠 ⏳ **Conçu, NON implémentée** (cf. doc 23 §4.5 + ADR-034). À défaut, le risque est **accepté et documenté** comme résiduel (OWASP **A04 Insecure Design**).                       |

> 🟠 **Honnêteté éditoriale** : toute communication publique sur ce canal doit mentionner ce risque
> résiduel. Promettre un anonymat « total » serait **mensonger** et exposerait des signaleurs à un
> faux sentiment de sécurité.

---

## 9bis. Risque de désanonymisation INTERNE (journal d'audit en clair) — DANS notre contrôle

> 🔴 **À NE PAS CONFONDRE avec le §9.** Le §9 décrit un risque **EXTÉRIEUR** au périmètre souverain
> (opérateur USSD tiers, hors de notre contrôle). **Ce §9bis décrit un risque INTERNE qui, lui, EST
> dans notre contrôle** — et qui est coté **ÉLEVÉ** par le modèle de menace. Ne pas le mentionner
> laisserait croire à tort que le **seul** risque résiduel de désanonymisation est extérieur.

Le journal d'**audit / event TRANSVERSE** — le **même** hash-chain SHA-256 que ce protocole cite en
§2, §6.4 et §10 — n'est **pas** propre au canal whistleblower : il agrège les events de **tous** les
services. Or, à date, ce journal **persiste `ipAddress` + `correlationId` EN CLAIR**
(`docs/security/THREAT-MODEL.md` **§4.5-I**), y compris pour les requêtes liées à un signalement. Le
modèle de menace classe **« Désanonymisation lanceur d'alerte via IP + correlationId + timing »** en
**risque #12 = 15 (ÉLEVÉ / 🔴)**.

| Aspect                                 | État                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vecteur**                            | Recoupement `ipAddress` + `correlationId` + horodatage du journal d'audit/event **transverse** ↔ session whistleblower.                                                                                                         |
| **Adversaire**                         | **Initié** disposant d'un accès au journal d'audit (insider audit), **PAS** un attaquant externe.                                                                                                                               |
| **Pourquoi ce n'est pas « pas codé »** | L'infra d'audit **déjà décrite/déployée** persiste **activement** ces champs : c'est une dérive **présente**, pas une feature manquante.                                                                                        |
| **Dans notre contrôle ?**              | **OUI** (contrairement au §9). C'est **notre** journal, **notre** schéma, **notre** rétention.                                                                                                                                  |
| **Cote modèle de menace**              | `docs/security/THREAT-MODEL.md` §4.5-I — risque **#12 = 15 / ÉLEVÉ / 🔴**.                                                                                                                                                      |
| **Correctif requis (⏳)**              | **Supprimer/hasher** `ipAddress` + `correlationId` dans le journal d'audit transverse **OU** **cloisonner** les events whistleblower dans un store à accès restreint. **Bloquant** avant tout claim d'anti-corrélation interne. |
| **Statut**                             | 🟠 ⏳ **Conçu / NON corrigé.** Tant que ce correctif n'est pas appliqué, le canal **n'est PAS** anti-corrélé de bout en bout **côté interne**.                                                                                  |

> 🟠 **Honnêteté éditoriale (suite §9)** : le risque résiduel de désanonymisation est **DOUBLE** —
> (1) **externe** : opérateur USSD tiers / MSISDN dans les CDR (§9), hors de notre contrôle ; (2)
> **interne** : `ipAddress` + `correlationId` en clair dans le journal d'audit transverse (ce
> §9bis), **dans** notre contrôle et coté **ÉLEVÉ**. Ne communiquer que sur le §9 serait
> **trompeur** : le vecteur le plus directement corrigeable est l'**interne**.

---

## 10. Checklist de conformité du protocole

> Aligne ce protocole sur la checklist de fin d'étape du doc 23 §9. État : ✅ implémenté / 🟠 ⏳
> conçu Phase 2.

- [ ] 🟠 **Chiffrement asymétrique RÉEL** : sealed box **X25519** (ou RSA-OAEP **`rsa-4096`**) —
      **JAMAIS Ed25519** (signature seule).
- [ ] 🟠 **Scellement côté borne** : plaintext jamais reçu/stocké/loggé par le serveur (test E2E).
- [ ] 🟠 **Anti-corrélation** : buckets classif/severité + **jour sans heure** + ni IP ni numéro ni
      correlation-id.
- [ ] 🔴 ⏳ **Anti-corrélation INTERNE (audit transverse)** : **supprimer/hasher** `ipAddress` +
      `correlationId` dans le journal d'audit/event transverse **OU** **cloisonner** les events
      whistleblower dans un store à accès restreint (`docs/security/THREAT-MODEL.md` §4.5-I, risque
      **#12 = 15 / ÉLEVÉ**) — **bloquant avant tout claim d'anti-corrélation interne** (cf. §9bis).
- [ ] 🟠 **Aucun `VAULT_TOKEN` long-lived** : AppRole / K8s SA + lease court (vérifié en `.env` /
      image / manifests).
- [ ] 🟠 **Recovery Shamir 3-of-5** via **SSS externe** (`ssss` / lib `sss`) — **PAS** le Shamir
      interne de Vault ; cérémonie air-gapped documentée + reconstitution testée.
- [ ] 🟠 **Accusé procureur Ed25519** = **signature seule** (séparation des clés stricte).
- [ ] 🟠 **Token de suivi** = secret aléatoire 128 bits, **non dérivé du numéro** ; seul un **hash**
      est stocké côté serveur ; suivi révèle un **statut grossier** seulement.
- [ ] 🟠 **Engagement éthique** publié + **anti-représailles** activables (cadre malien/AES,
      RGPD-like, **sans** loi 2024-XX fictive).
- [ ] 🟠 **Risque résiduel opérateur USSD** (MSISDN dans les CDR Africa's Talking) **documenté** ;
      canal **non** présenté comme « anonyme de bout en bout ».
- [ ] 🟠 **Audit hash-chain SHA-256** (ADR-014) sur déchiffrements / reconstitutions / transitions
      de statut, racine ancrée chez tiers (OCLEI / Vérificateur Général).
- [ ] 🟠 **Pen-test whistleblower** (doc 23 §10) : ciphertext indéchiffrable sans clé privée ;
      auteur non retrouvable par corrélation ; non-régression « `ed25519` sur `encrypt` → échec ».

---

_Document SIGAC — `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` — Version 1.0 — Juin 2026._ _Aligné sur doc
23 (Bloc D SIGAC, v1.1, correctif crypto P0) §4.5/§6, ADR-023, ADR-034, ADR-014/007._ _CANON crypto
: sealed box X25519 (XSalsa20-Poly1305) / RSA-OAEP rsa-4096 pour le chiffrement ;_ _Ed25519 =
signature uniquement ; SSS externe pour le recovery M-of-N (PAS le Shamir interne Vault)._ _NINA-AES
Platform — UQAR — CONFIDENTIEL._
