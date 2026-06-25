# DPIA — Analyse d'impact relative à la protection des données — Module Biométrie NINA-AES (2026)

> **Type de document** : DPIA (Data Protection Impact Assessment / Analyse d'Impact relative à la
> Protection des Données — AIPD), socle **RGPD-équivalent** appliqué par NINA-AES. **Périmètre** :
> module BIOMÉTRIE (Bloc F) — empreintes digitales (P3a), reconnaissance faciale (P3b), recherche
> 1:N restreinte (P3c). **Référence amont** : [doc 25 — Bloc F Biométrie](../25-BLOC-F-BIOMETRIE.md)
> §4.3 (DPIA modèle) + [ADR-025](../adr/ADR-025-biometrie-phasage-et-hash-irreversible.md)
> (phasage + protection de template ISO/IEC 24745) +
> [ADR-034](../adr/ADR-034-security-hardening-vault-mtls-owasp.md) (Vault/mTLS/OWASP) +
> [ADR-007/ADR-014](../adr/ADR-014-audit-event-driven-append-only.md) (audit hash-chain). **Statut**
> : ⏳ **MODÈLE / VISION V1** — conçu, **non implémenté**. Aucun traitement biométrique réel n'est
> en production. Ce DPIA doit être **complété par mesures réelles (FAR/FRR, pen-test)** puis **signé
> par le CISO/DPO CTDEC** AVANT tout déploiement (cf. §10 — gate de gouvernance bloquant).

---

## 0. Pourquoi une DPIA, et pourquoi AVANT toute ligne de code biométrique

> **À lire en premier — l'esprit du document.** La DPIA n'est pas une formalité administrative
> rétroactive. C'est l'instrument qui force, **avant** le déploiement, à répondre à la seule
> question qui compte : _« le bénéfice de ce traitement justifie-t-il le risque qu'il fait peser sur
> les citoyens, et ce risque est-il ramené à un niveau acceptable ? »_

Le socle RGPD-équivalent appliqué par NINA-AES rend l'AIPD **obligatoire** dès qu'un traitement est
susceptible d'engendrer un **risque élevé** pour les droits et libertés des personnes. La biométrie
coche **toutes** les cases du risque élevé :

| Critère de risque élevé             | Présent ? | Pourquoi                                                                                                  |
| ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Données sensibles (art. 9-like)     | ✅ OUI    | La donnée biométrique aux fins d'identifier une personne est une **catégorie particulière**.              |
| Traitement à grande échelle         | ✅ OUI    | Cible : population nationale (ordre de grandeur ~11M citoyens).                                           |
| Évaluation / identification         | ✅ OUI    | Vérification 1:1 et recherche 1:N.                                                                        |
| Données vulnérables / irréversibles | ✅ OUI    | Une empreinte est **éternelle** : fuite = compromission **à vie**, pas de « changement de mot de passe ». |

**Trois caractéristiques exceptionnelles** justifient un niveau d'exigence supérieur (cf. ADR-025,
Contexte) :

1. **Irrévocabilité de la donnée source** — on change un mot de passe, jamais une empreinte.
2. **Universalité de l'attaque** — un dump de base ciblerait _tous_ les citoyens simultanément.
3. **Asymétrie réputationnelle** — la confiance institutionnelle se perd en une fuite et se
   reconstruit en années.

> ⏳ **Honnêteté de cadrage.** À la date de rédaction, le module biométrique est en **scope V1 =
> vision et plan**, pas en production. Cette DPIA décrit donc le traitement **tel qu'il est conçu**.
> Les éléments marqués ⏳ « conçu, Phase 2 » ne sont **pas** implémentés. La signature CISO/DPO ne
> peut intervenir qu'**après** que les mesures conçues soient implémentées et **mesurées** (FAR/FRR,
> audit forensique, pen-test) — cf. §10.

---

## 1. Finalités et nécessité du traitement

### 1.1 Finalités déterminées, explicites et légitimes

| #   | Finalité                                                                 | Phase | Légitimité                                                                  |
| --- | ------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------- |
| F1  | **Authentification renforcée** du citoyen lors de transactions sensibles | P3a/b | Sécuriser un acte à fort enjeu (déblocage, changement d'attribut critique). |
| F2  | **Lutte contre la fraude d'identité** (doublons, usurpation)             | P3a/b | Intégrité du registre national d'identité.                                  |
| F3  | **Investigation judiciaire** (recherche 1:N d'un individu)               | P3c   | Strictement sur **mandat judiciaire** ou enquête OCLEI, accès `INSPECTOR`.  |

Aucune finalité **secondaire** n'est autorisée (pas de profilage commercial, pas de revente, pas de
réutilisation marketing, pas de partage avec un tiers non autorisé). Le principe de **limitation des
finalités** est strict : toute nouvelle finalité exigerait une **révision de cette DPIA**.

### 1.2 Test de nécessité et de proportionnalité

> **POURQUOI ce test.** Le RGPD-like impose que la biométrie ne soit utilisée que si **aucun moyen
> moins intrusif** n'atteint la même finalité. La biométrie est un **dernier recours**, pas un
> défaut.

| Finalité | Alternative moins intrusive examinée                       | Suffisante seule ?                                     | Conclusion                                                                      |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| F1       | Mot de passe + OTP SMS/USSD + signature Ed25519 mobile     | Suffisante pour la majorité des actes                  | Biométrie **réservée** aux actes à très fort enjeu ; jamais imposée par défaut. |
| F2       | Contrôle documentaire + déduplication sur attributs civils | Partielle (n'attrape pas les vrais jumeaux d'identité) | Biométrie **proportionnée** pour la déduplication forte uniquement.             |
| F3       | Enquête classique sans biométrie                           | Insuffisante dans certains cas de fraude organisée     | Biométrie **proportionnée** uniquement sous contrôle judiciaire (4-yeux).       |

**Conclusion de proportionnalité** : la biométrie est **optionnelle** pour le citoyen (cf. §1.3),
**réservée** aux actes à fort enjeu, et **n'est jamais un prérequis pour détenir un NINA**. Un
citoyen qui refuse la biométrie conserve un NINA pleinement valide.

### 1.3 Caractère non-obligatoire (non-exclusion)

Le refus de la biométrie **ne prive d'aucun droit** : le NINA reste valide, les services restent
accessibles via les autres facteurs d'authentification. Ce principe ferme la porte à une biométrie «
de fait obligatoire » par exclusion des services — un anti-pattern explicitement rejeté.

---

## 2. Base légale RGPD-équivalente

> **CANON — PAS de loi 2024-XX non adoptée.** La base légale **ne dépend PAS** d'une hypothétique «
> loi 2024-XX » nationale **non encore adoptée** (risque qu'elle n'arrive jamais, ou arrive
> modifiée). Faire reposer un traitement biométrique de masse sur un texte fantôme serait une faute
> de conception juridique.

### 2.1 Le socle effectif

La licéité du traitement repose sur **trois piliers cumulatifs**, tous internes et maîtrisés :

1. **Socle RGPD-équivalent appliqué par NINA-AES** — principes de minimisation, limitation des
   finalités, limitation de la conservation, exactitude, intégrité/confidentialité, responsabilité
   (_accountability_). Ce socle est la **politique interne opposable** de la plateforme.
2. **Consentement explicite et signé** du citoyen (art. 9-2-a-like : consentement explicite pour une
   catégorie particulière de données). Le consentement est **éclairé, spécifique, libre** (le refus
   n'a aucune conséquence sur le NINA, §1.3) et **révocable** (droit à l'effacement, §7). La
   signature est **JWS Ed25519**, **vérifiée contre la clé publique ANCRÉE** du citoyen (§6.4 et doc
   25 §4.6) — sans cet ancrage, n'importe qui pourrait « signer à la place ».
3. **DPIA formelle signée** par le CISO/DPO CTDEC (le présent document) — la condition procédurale
   du déploiement (§10).

### 2.2 Articulation avec un éventuel texte national

> ✅ **Principe d'additivité, pas de dépendance.** Si/quand un texte national malien sur la
> protection des données biométriques est **effectivement adopté**, il sera **référencé en
> complément** de ce socle, **sans en devenir un prérequis bloquant** rétroactif. Tant qu'aucun
> texte n'est adopté, le socle RGPD-équivalent + consentement + DPIA **suffit** à fonder la licéité.

Autorité de contrôle de référence : **CISO/DPO CTDEC** + autorité malienne de protection des données
(DPC) lorsqu'elle est saisissable. **Pas** de soumission à eIDAS / ANSSI France comme prérequis
(souveraineté — cf. ADR-025, « Note sur la souveraineté »).

---

## 3. Description du traitement et catégories de données

### 3.1 Vue d'ensemble du flux (rappel doc 25 §3)

```
Citoyen consentant
   │  empreinte (capteur FAP30)
   ▼
biometric-service (Python FastAPI 3012)
   │  image brute → RAM uniquement (tmpfs + mlock, swap off) — JAMAIS sur disque
   ▼
Extraction OpenCV/ONNX → template ISO/IEC 19794-2 (minuties) [RAM]
   │
   ├─ Vault Transit : lire paramètre cancelable (transform_kid actif) [RAM, durée min.]
   ▼
T_protégé = projection_cancelable(template, param)   ← ISO/IEC 24745, distance préservée
   │
   ▼
PostgreSQL biometric_templates : on stocke UNIQUEMENT T_protégé + métadonnées
   │
   └─ Audit hash-chain : BIOMETRIC_REGISTERED
```

### 3.2 Catégories de données — ce qui est stocké, ce qui ne l'est JAMAIS

> **CANON — templates CANCELABLE ISO 24745 uniquement, JAMAIS d'image brute, JAMAIS de template en
> clair.** C'est le cœur de la minimisation biométrique.

| Donnée                                             | Stockée ? | Forme / Justification                                                                                                                                                   |
| -------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image brute** (empreinte / visage)               | ❌ JAMAIS | Vit en RAM verrouillée (mlock/tmpfs, swap off) le temps de l'extraction, puis effacement best-effort. Aucune écriture disque persistante.                               |
| **Template en clair** (minuties / embedding)       | ❌ JAMAIS | Reste en RAM verrouillée ; transformé immédiatement. Jamais persisté.                                                                                                   |
| **Embedding facial brut**                          | ❌ JAMAIS | Idem ; seul l'embedding **transformé (cancelable)** est conservé.                                                                                                       |
| **Template PROTÉGÉ (cancelable)**                  | ✅ OUI    | `protectedTemplate` (`bytea` opaque). Transformation **irréversible + révocable + distance-préservante** (ISO 24745). Comparé par **distance ≤ τ**, jamais par égalité. |
| Identifiant du paramètre (`transformKid`)          | ✅ OUI    | Référence Vault du paramètre cancelable (rotation = nouveau kid). Le **paramètre lui-même** reste dans Vault, jamais en base.                                           |
| Schéma de protection / format                      | ✅ OUI    | `protectionScheme`, `templateFormat` — traçabilité et migration.                                                                                                        |
| Métrique + seuil (`matchMetric`, `matchThreshold`) | ✅ OUI    | Point d'opération FAR/FRR figé à l'enrôlement (auditabilité).                                                                                                           |
| Métadonnées de capture                             | ✅ OUI    | `capturedAt`, `capturedBy` (agent), `kind` (FINGERPRINT/FACE).                                                                                                          |
| Preuve de consentement                             | ✅ OUI    | `consentSignature` (JWS Ed25519), `consentSignerKid` (clé ancrée), `consentDocUrl` (MinIO chiffré).                                                                     |
| État de révocation                                 | ✅ OUI    | `revokedAt`, `revokedReason`.                                                                                                                                           |

### 3.3 Pourquoi un « template protégé » ≠ un « hash »

> **Rappel du piège fondamental (doc 25 §0).** Un hash cryptographique (effet d'avalanche) **détruit
> la notion de proximité** : deux captures du même doigt diffèrent de quelques bits → deux hash
> totalement différents → **aucun match** (FRR = 100 %). Le **template protégé cancelable** fait
> l'inverse : il **préserve approximativement la distance** (lemme de Johnson-Lindenstrauss), tout
> en étant **irréversible** (on ne reconstruit pas la biométrie) et **révocable** (changer le
> paramètre invalide l'ancien template). La comparaison se fait par **distance + seuil τ**,
> **jamais** par égalité.

### 3.4 Personnes concernées et destinataires

- **Personnes concernées** : citoyens majeurs consentants. (Mineurs / personnes vulnérables : ⏳
  régime spécifique à définir avant tout enrôlement — hors V1.)
- **Destinataires** : agents `BIOMETRIC_OPERATOR` (enrôlement/vérification 1:1) ; rôle `INSPECTOR`
  - double validation procureur (1:N, P3c uniquement). **Aucun** destinataire externe / commercial /
    étranger.
- **Transferts hors frontière** : ❌ aucun. Paramètre cancelable et templates restent dans le DC
  CTDEC souverain (Vault self-hosted, pas d'AWS KMS / HSM cloud étranger — cf. CANON souveraineté).

---

## 4. Minimisation des données

Application concrète du principe de minimisation (« adéquates, pertinentes et limitées ») :

| Levier de minimisation                | Mise en œuvre                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Non-collecte de l'image**           | L'image ne quitte jamais la RAM ; jamais d'écriture disque (tmpfs/mlock/swap off, §6.2).     |
| **Non-stockage du template en clair** | Transformation cancelable **avant** tout stockage ; le clair est éphémère.                   |
| **Stockage du strict minimum**        | Seul `protectedTemplate` + métadonnées de comparaison/consentement. Pas de donnée superflue. |
| **Format standard non-propriétaire**  | ISO/IEC 19794-\* / 24745 — pas de vendor lock-in, pas d'enrichissement opaque.               |
| **Finalité limitée**                  | 1:N réservé au mandat judiciaire ; pas de réutilisation secondaire.                          |
| **Durée limitée**                     | Conservation liée à la durée de vie du NINA ; effacement sur demande / décès (§5).           |
| **Granularité d'accès**               | RBAC : `BIOMETRIC_OPERATOR` (1:1) vs `INSPECTOR` + 4-yeux (1:N).                             |

---

## 5. Durée de conservation et effacement

| Donnée                       | Durée                                                                    | Déclencheur d'effacement                                  |
| ---------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Template protégé             | Tant que NINA actif (durée de vie citoyen).                              | Demande citoyen (droit à l'effacement, §7) **ou** décès.  |
| Preuve de consentement (JWS) | Conservation longue (preuve juridique — ordre de 10 ans, MinIO chiffré). | Au terme légal, ou effacement coordonné avec le template. |
| Logs d'audit (hash-chain)    | Append-only (immuabilité fonctionnelle — voir limite §6.5).              | Non effaçables individuellement (intégrité de la chaîne). |

**Effacement effectif** : `DELETE FROM biometric_templates WHERE citizen_id = …` **+ purge de
l'index ANN** (P3c) — un effacement qui oublierait l'index ANN serait incomplet (cf. doc 25 §6,
piège « Effacement biométrique pas effectif »). L'effacement du **template** ne supprime **pas** le
NINA du citoyen : il reste valide.

---

## 6. Mesures techniques et organisationnelles

### 6.1 Protection de template — fuzzy / cancelable (cœur ISO/IEC 24745)

> **POURQUOI c'est la mesure de sécurité maîtresse.** C'est elle qui rend une fuite **survivable** :
> un template protégé seul est irréversible (pas de reconstruction de l'empreinte) **et** révocable
> (rotation du paramètre → le template fuité devient inutilisable).

- **Cancelable biometrics par projection aléatoire** (chemin nominal) : `T_protégé = sign(R · v)`,
  où `R` est une matrice de projection semée par le **paramètre secret Vault** (révocable). Trois
  propriétés ISO/IEC 24745 garanties :
  - **Irréversibilité** — `R` réduit la dimension (non inversible) → on ne remonte pas au template.
  - **Non-chaînabilité** — deux paramètres différents → deux templates non reliables
    (anti-corrélation inter-bases).
  - **Révocabilité** — changer le paramètre invalide l'ancien template (§6.6 rotation).
- **Distance + seuil** — comparaison par `protected_distance ≤ τ`, jamais par égalité. Le seuil τ
  est choisi sur la courbe **DET** (compromis FAR/FRR explicite). ⏳ **τ à mesurer en P3a** (cibles
  réalistes : FAR ≤ 0,01 % à FRR ≈ 1–3 % ; « FAR 10⁻⁸ » est irréaliste sur capteur de guichet).
- **Anti-timing** — la propriété anti-corrélation est l'**absence de court-circuit** dans la boucle
  de scoring `verify` (on parcourt tous les templates actifs), **PAS** un comparateur scalaire «
  temps constant » (le seuil porte sur un scalaire **non secret**, cf. doc 25 §4.3). ⏳ conçu, non
  implémenté.
- ⏳ **Fuzzy commitment / fuzzy extractor** documenté comme **alternative P3+** (dérivation d'une
  clé exacte), pas le chemin nominal.

### 6.2 Mesures mémoire réalistes (PAS de promesse « zero-fill »)

> **Honnêteté technique (doc 25 §4.4).** En CPython, un `bytes` est immuable, le GC peut déplacer
> les objets, et le swap peut écrire une page sur disque. La promesse d'un « zero-fill RAM » garanti
> est **intenable**. On la remplace par une **défense en profondeur** :

| Mitigation                                | Effet                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `swapoff -a` + `vm.swappiness=0`          | La RAM sensible ne part jamais sur disque.                                |
| `mlock` des buffers sensibles             | Pages verrouillées en RAM (pas de swap, pas de dump paginé).              |
| `tmpfs` (`/dev/shm`) pour tout temporaire | Si un temp file est inévitable, il vit en RAM, pas sur disque persistant. |
| Core dumps interdits (`RLIMIT_CORE=0`)    | Un crash ne dumpe pas la biométrie.                                       |
| `bytearray` mutable + zéro en `finally`   | Effacement **best-effort** (le GC reste maître) — documenté comme tel.    |
| Processus court-vécu / isolation          | Mémoire restituée à l'OS rapidement.                                      |

⏳ Conçu — durcissement hôte à appliquer au provisioning du nœud biométrique dédié.

### 6.3 Chiffrement au repos et en transit

- **Au repos** — paramètre cancelable dans **Vault Transit** (jamais en base, jamais sur disque
  applicatif). Preuves de consentement dans **MinIO chiffré**.
  > **CANON — note crypto.** Vault Transit **ne supporte PAS Ed25519** (ADR-026/034). Le **paramètre
  > cancelable** est un **secret de transformation** géré par Transit (clé symétrique / dérivation),
  > **pas** une opération de chiffrement asymétrique. Là où un chiffrement asymétrique réel est
  > requis ailleurs dans la plateforme, on utilise age/libsodium sealed box
  > (X25519+XSalsa20-Poly1305) ou RSA-OAEP (Transit rsa-4096) — **jamais** Ed25519 pour chiffrer.
  > **Ed25519 = signature seulement** (utilisé ici uniquement pour la **signature JWS du
  > consentement**, §6.4).
- **En transit** — **mTLS** + JWT agent sur tous les endpoints biométriques (ADR-034). Souveraineté
  des secrets : **AppRole / K8s SA + lease**, jamais de `VAULT_TOKEN` long-lived.

### 6.4 Consentement — chaîne de confiance ancrée

- Signature **JWS Ed25519** par le citoyen (clé du téléphone, Bloc A) ou empreinte sur tablette
  agent.
- **Vérifiée contre la clé publique ANCRÉE** : le `kid` du JWS est résolu via le registre de clés
  souverain (clé enrôlée pour CE citizen_id, non expirée, non révoquée). Claims vérifiés : sujet ==
  citizen_id, intention == `BIOMETRIC_CONSENT`, anti-rejeu (nonce + fenêtre temporelle). Cf. doc 25
  §4.6. **C'est cet ancrage** — et non la confiance aveugle dans le JWS reçu — qui rend le
  consentement **opposable** et ferme la surface IDOR sur `/register`.

### 6.5 Contrôle d'accès, anti-IDOR, anti-bruteforce

- **RBAC** — `BIOMETRIC_OPERATOR` (enrôlement / vérification 1:1) ; `INSPECTOR` + double validation
  procureur (1:N, P3c). Workflow **4-yeux** pour le 1:N.
- **Anti-IDOR** — sur `/register`, le citizen_id est **lié au consentement ancré** (le JWS porte
  sujet == citizen_id) ; sur `/verify`, contrôle d'**habilitation par citizen_id** + **motif tracé**
  (un agent authentifié ne vérifie pas un citoyen arbitraire).
- ⏳ **Anti-bruteforce** — une cible FAR ~1e-4 est brute-forçable par volume de probes. Mesures :
  rate-limit par `(agent, citizen_id)`, compteur d'échecs + back-off exponentiel, verrouillage
  temporaire après N échecs, **alerte SIEM/SIGAC** sur rafale. Sans cela, le seuil τ est
  contournable.

### 6.6 Rotation du paramètre cancelable (double-écriture)

> **POURQUOI.** La rotation est la **défense ultime** : sur soupçon de fuite (ou par hygiène, tous
> les 5 ans), on génère un nouveau `transform_kid`. La **double-écriture** (et non « big bang »)
> garde le service **opérationnel** pendant la migration : nouveaux enrôlements en `vN+1` sans
> supprimer `vN`, matching multi-kids, révocation différée des `vN`, clôture quand 100 % migrés.
> Gain direct vs un sel HMAC (qui imposait un ré-enrôlement forcé immédiat de tous). Détail doc 25
> §4.5. ⏳ conçu, non implémenté.

### 6.7 Audit hash-chain (trace DÉTECTIVE, pas inaltérable)

> **CANON — audit ADR-007.** L'audit est une **hash-chain SHA-256 linéaire**
> (`hash(N) = SHA256(hash(N-1) + entrée)`), **PAS un arbre de Merkle**, avec scellement horaire
> Ed25519 in-process (@noble/ed25519, doc 09). Chaque opération est tracée (`BIOMETRIC_REGISTERED`,
> `BIOMETRIC_VERIFY_SUCCESS/FAIL`, requêtes 1:N).
>
> _Note de nommage._ Le fichier `ADR-007` conserve « Merkle » dans son titre/nom pour ne pas casser
> les liens existants ; son **contenu** décrit bien une **hash-chain linéaire** (cf. doc 09 §5). La
> dette de renommage appartient à ADR-007, pas à ce DPIA.
>
> **Limite honnête.** Tant que la **racine n'est pas ancrée chez un tiers** (OCLEI / Vérificateur
> Général / horodatage RFC 3161 — ⏳ **non implémenté**), un administrateur DB maîtrisant la genèse
> peut reconstruire une chaîne cohérente. On parle donc de trace **cryptographique DÉTECTIVE** (une
> falsification devient _détectable a posteriori_ **si** une racine externe existe), **non** d'une
> trace _inaltérable_. L'ancrage tiers est une **aspiration** (ADR-007/014), pas un contrôle
> implémenté.

### 6.8 Mesures organisationnelles

- Formation annuelle des agents (manipulation, consentement, secret).
- Audit forensique trimestriel (0 image brute, 0 template clair persisté).
- Pen-test externe (0 finding CRITICAL/HIGH avant déploiement, §10).
- Drill mensuel de rotation (§6.6) ; drill semestriel d'effacement (§5).
- Audit social annuel **public anonymisé** (nombre d'enrôlements, de refus, d'effacements) —
  transparence démocratique.

---

## 7. Droits des personnes concernées

| Droit                              | Mise en œuvre                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Information / transparence**     | Formulaire de consentement (FR + langues nationales) avant capture ; finalités, durée, droits explicités.                                        |
| **Accès**                          | Le citoyen peut savoir quels templates protégés existent (kind, dates, kid) — pas la donnée brute (inexistante).                                 |
| **Rectification**                  | Ré-enrôlement (nouvelle capture) si template dégradé ; l'ancien est révoqué.                                                                     |
| **Effacement**                     | `DELETE` du template + purge index ANN (§5). Le NINA **reste valide**. Cible : satisfait < 30 jours.                                             |
| **Opposition**                     | Refus de la biométrie **sans aucune conséquence** sur le NINA (§1.3) ; retrait du consentement à tout moment.                                    |
| **Portabilité**                    | Formats ISO standards → portabilité technique du template protégé (limitée par la non-réversibilité, voulue).                                    |
| **Non-décision automatisée seule** | La biométrie **assiste** une décision (authentification), elle ne décide pas seule d'un droit civil de manière irréversible sans recours humain. |

**Point de contact** : DPO CTDEC. Délai de réponse cible : 30 jours.

---

## 8. Analyse des risques (probabilité × gravité)

> **Méthode.** Pour chaque scénario : **gravité** (impact sur la personne) × **probabilité**
> (vraisemblance résiduelle après mesures). L'irréversibilité d'une fuite biométrique tire la
> gravité vers le haut — c'est précisément ce que la **cancelable + rotation** vient **mitiger**
> (une fuite redevient survivable).

| #   | Scénario de risque                                               | Gravité brute       | Probabilité résiduelle | **Risque résiduel** | Mesures de mitigation                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------- | ------------------- | ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Fuite du template protégé SEUL**                               | Élevée (donnée bio) | Faible                 | **BAS**             | Irréversible vers l'image (ISO 24745) **+ révocable** : rotation du paramètre → template fuité inutilisable (§6.6). La « gravité éternelle » d'une fuite bio est **neutralisée par la révocabilité**.                                       |
| R2  | **Fuite template protégé + paramètre cancelable**                | Élevée              | Faible                 | **MOYEN**           | _Linkage_/comparaison possible (limite intrinsèque ANN, doc 25 §0.6). Mitigation : paramètre dans **Vault séparé** de l'index ; rotation **immédiate** sur incident ; 1:N en enclave 4-yeux. **Toujours pas** de reconstruction de l'image. |
| R3  | **Re-identification / chaînage inter-bases**                     | Élevée              | Très faible            | **BAS**             | **Non-chaînabilité** ISO 24745 : deux templates du même doigt (kids différents) ne se relient pas.                                                                                                                                          |
| R4  | **Persistance accidentelle d'une image brute ou template clair** | Critique            | Faible                 | **MOYEN → BAS**     | tmpfs/mlock/swap off/core dumps off (§6.2) ; **audit forensique trimestriel** ; un seul cas trouvé = protocole d'incident + rotation + revue ADR.                                                                                           |
| R5  | **Brute-force du seuil τ par volume de probes**                  | Élevée              | Moyenne (sans mesure)  | **MOYEN → BAS**     | ⏳ Rate-limit + back-off + verrouillage + alerte SIEM (§6.5). Sans ces mesures, risque **élevé**.                                                                                                                                           |
| R6  | **Usurpation de consentement (signer « à la place »)**           | Élevée              | Faible                 | **BAS**             | Consentement **ancré** sur clé publique citoyen (§6.4) ; ferme l'IDOR sur `/register`.                                                                                                                                                      |
| R7  | **Accès illégitime au 1:N (surveillance de masse)**              | Critique            | Faible                 | **BAS**             | `INSPECTOR` + 4-yeux + mandat judiciaire + audit par requête ; politique d'usage stricte.                                                                                                                                                   |
| R8  | **Falsification a posteriori des logs par admin DB**             | Élevée              | Faible→Moyenne         | **MOYEN** (assumé)  | Hash-chain SHA-256 (détective) ; **résiduel tant que la racine n'est pas ancrée chez un tiers** (⏳ ADR-007). Honnêtement documenté (§6.7).                                                                                                 |
| R9  | **Biais démographique (P3b face)**                               | Élevée              | À mesurer              | **À ÉVALUER (P3b)** | ⏳ Audit d'équité (parité ≥ 99 % peau claire/foncée) ; go/no-go bloquant avant P3b.                                                                                                                                                         |
| R10 | **Spoofing (photo, faux doigt)**                                 | Élevée              | À mesurer              | **À ÉVALUER (P3b)** | ⏳ Liveness detection (> 95 % détection) ; go/no-go bloquant.                                                                                                                                                                               |

### 8.1 Le risque pivot : l'irréversibilité d'une fuite

> Une donnée biométrique est **éternelle** — une fuite serait, en l'absence de protection, une
> compromission **à vie**. C'est **la** raison d'être de la protection de template cancelable : elle
> transforme un risque « catastrophique et définitif » (R1 brut) en risque « **BAS et réparable** »
> (R1 résiduel), parce que (a) on ne reconstruit pas l'empreinte (irréversibilité) et (b) on peut
> **invalider** un template fuité **sans toucher au doigt du citoyen** (révocabilité via rotation du
> paramètre, §6.6). C'est l'argument central de proportionnalité de toute la DPIA.

### 8.2 Risques résiduels assumés (à acter par le CISO/DPO)

- **R2 (MOYEN)** — confidentialité partielle du 1:N (l'index ANN conserve de la structure
  géométrique). Limite **intrinsèque** ISO/IEC 24745, mitigée mais non éliminée. **À assumer noir
  sur blanc** (doc 25 §0.6).
- **R8 (MOYEN)** — audit détective, pas inaltérable, tant que l'ancrage tiers n'est pas implémenté.
- **Limite de la révocabilité** — la rotation protège le **futur** ; un attaquant ayant capté
  template + paramètre **avant** rotation a pu agir sur le passé exfiltré.

---

## 9. Conformité par phase et critères go/no-go

| Phase | Périmètre      | Critères bloquants (extrait — doc 25 §4.8)                                                                                                                                |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3a   | Empreintes 1:1 | FAR < 0,01 % / FRR < 1–3 % ; 0 image disque (forensique) ; audit 100 % ; **DPIA signée CISO** ; pen-test 0 HIGH/CRITICAL ; anti-IDOR + anti-bruteforce ; rotation testée. |
| P3b   | Face 1:1       | Égalité perf P3a ; anti-spoofing > 95 % ; **parité raciale ≥ 99 %**.                                                                                                      |
| P3c   | 1:N restreint  | Latence p95 < 2 s sur 11M ; logs 1:N hash-chain ; usage **mandat judiciaire uniquement** + 4-yeux.                                                                        |

**Règle d'or** : tant qu'**un seul** critère n'est pas validé, on ne passe pas à la phase suivante.

---

## 10. Gate de gouvernance — BLOQUANT

> ## ⛔ SANS DPIA SIGNÉE PAR LE CISO/DPO CTDEC, AUCUN DÉPLOIEMENT DE LA BIOMÉTRIE.
>
> Ce n'est pas une recommandation : c'est une **condition d'arrêt** (gate). Le module biométrique
> **ne peut pas** passer en production — même en pilote P3a — tant que **toutes** les conditions
> ci-dessous ne sont pas réunies et **signées**.

### 10.1 Conditions cumulatives du gate

1. ✅ **Cadre juridique** — socle RGPD-équivalent + consentement + cette DPIA (la base légale **ne
   dépend pas** d'une loi 2024-XX non adoptée, §2).
2. ⏳ **Validation institutionnelle** — gouvernance OCLEI / CISO CTDEC ayant validé la DPIA
   formelle.
3. ⏳ **Mesures réelles produites** — FAR/FRR mesurés sur courbe DET, audit forensique (0 image),
   pen-test externe (0 CRITICAL/HIGH).
4. ⏳ **Mesures techniques implémentées** — cancelable `protect.py` (mesuré), anti-IDOR,
   anti-bruteforce, rotation double-écriture, durcissement hôte, consentement ancré, audit
   hash-chain.
5. ⏳ **Signature CISO/DPO CTDEC** apposée ci-dessous.

> Hors de ces conditions, **la biométrie est un risque, pas un bénéfice** (doc 25 §1). En cas de
> doute → on ne déploie pas.

### 10.2 Bloc de signature (à compléter — ⏳ non signé)

| Rôle                                     | Nom | Date | Décision (GO / NO-GO) | Signature |
| ---------------------------------------- | --- | ---- | --------------------- | --------- |
| Responsable de traitement (CTDEC)        | ⏳  | ⏳   | ⏳                    | ⏳        |
| **DPO / CISO CTDEC** (signature requise) | ⏳  | ⏳   | ⏳                    | ⏳        |
| Autorité de protection (DPC, si saisie)  | ⏳  | ⏳   | ⏳ (avis)             | ⏳        |
| OCLEI (gouvernance)                      | ⏳  | ⏳   | ⏳                    | ⏳        |

### 10.3 Procédure d'incident (rappel)

Sur **toute** fuite détectée, **ou** sur découverte forensique d'une image brute / template clair
persisté → déclenchement immédiat : **rotation du paramètre cancelable** (nouveau kid,
double-écriture §6.6) → révocation des templates compromis **sans interruption de service** →
notification → revue ADR complète. Détail : [INCIDENT-PROTOCOL.md](./INCIDENT-PROTOCOL.md).

---

## 11. Synthèse de l'état (conçu vs implémenté)

| Élément                                                       | État                                     |
| ------------------------------------------------------------- | ---------------------------------------- |
| Finalité, nécessité, base légale RGPD-like (sans loi 2024-XX) | **Conçu / posé**                         |
| Catégories de données (cancelable ISO 24745, 0 image brute)   | **Conçu**                                |
| Cancelable biometrics (random projection)                     | ⏳ Conçu, non implémenté                 |
| Seuil τ / FAR-FRR mesurés                                     | ⏳ À mesurer (P3a)                       |
| Anti-IDOR / anti-bruteforce / rotation double-écriture        | ⏳ Conçu, non implémenté                 |
| Chiffrement Vault Transit (paramètre) + mTLS                  | ⏳ Conçu (cadre ADR-034)                 |
| Audit hash-chain SHA-256 (ADR-007) — ancrage tiers            | Conçu ; **ancrage tiers non implémenté** |
| Droits des personnes (effacement, opposition…)                | **Conçu**                                |
| **DPIA signée CISO/DPO CTDEC**                                | ⏳ **NON SIGNÉE (gate ouvert)**          |

---

## 12. Références

- [doc 25 — Bloc F Biométrie](../25-BLOC-F-BIOMETRIE.md) (§0 piège du hash, §3 schéma, §4.3 DPIA
  modèle, §4.5 rotation, §4.6 consentement ancré, §0.6 limite 1:N)
- [ADR-025 — Biométrie phasée + protection ISO/IEC 24745](../adr/ADR-025-biometrie-phasage-et-hash-irreversible.md)
- [ADR-007 / ADR-014 — Audit hash-chain append-only](../adr/ADR-014-audit-event-driven-append-only.md)
- [ADR-034 — Security Hardening (Vault / mTLS / OWASP)](../adr/ADR-034-security-hardening-vault-mtls-owasp.md)
- [doc 15 — Security Hardening](../15-SECURITY-HARDENING.md)
- `docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-RUNBOOK.md`
- [CONSENT-PROTOCOL.md](./CONSENT-PROTOCOL.md), [INCIDENT-PROTOCOL.md](./INCIDENT-PROTOCOL.md)
- **Normes** : ISO/IEC 24745 (Biometric information protection) ; ISO/IEC 30136 (évaluation des
  schémas de protection) ; ISO/IEC 19794-* (formats templates) ; NIST FpVTE / FRVT (points
  d'opération FAR/FRR). CNIL — *Référentiel biométrie\*.

---

_DPIA NINA-AES Biométrie — Version 1.0 (modèle V1) — Juin 2026 — Aligné doc 25 v1.1 / ADR-025 v1.1 /
ADR-034._ _NINA-AES Platform — UQAR — CONFIDENTIEL — ⏳ NON SIGNÉE (gate de gouvernance ouvert)._
