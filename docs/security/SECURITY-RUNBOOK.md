# SECURITY-RUNBOOK.md — Runbook opérationnel d'incident & de rotation

> **Document actionnable** (à copier-coller sous pression). Compagnon de
> `docs/15-SECURITY-HARDENING.md` (§7 le référence comme livrable), de
> `docs/security/vault-usage.md` (gestion courante des secrets) et de
> `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` (décision d'architecture sécurité).
>
> **Audience** : l'étudiant (rôle d'astreinte de fait), futur CISO CTDEC, équipe SOC, auditeur
> ANSSI/OCLEI.
>
> **Pourquoi ce document existe** : un incident de sécurité sur une plateforme d'identité d'État ne
> laisse **pas le temps de réfléchir à la procédure**. On la rédige _à froid_, on l'exécute _à
> chaud_. Chaque section ci-dessous est une suite d'étapes numérotées, sans ambiguïté, exécutables
> par une personne stressée à 3 h du matin.
>
> **Classification** : `CONFIDENTIEL — DIFFUSION RESTREINTE`. Ne pas committer de valeur réelle de
> secret, de token, ni de coordonnée nominative dans ce fichier (placeholders uniquement).

---

## 0. Conventions & pré-requis communs

**Pourquoi lire cette section d'abord** : toutes les procédures supposent un même point de départ
(être authentifié sur Vault avec les bons droits, connaître les chemins de montage). On les
factorise ici pour ne pas les répéter.

### 0.1 Rappel des montages Vault (cf. `vault-usage.md` §1)

| Engine     | Mount path        | Usage dans NINA-AES                                       |
| ---------- | ----------------- | --------------------------------------------------------- |
| `kv-v2`    | `kv/`             | Config, API keys, clés publiques (jamais de clé privée)   |
| `transit`  | `transit/`        | Signature/chiffrement — la clé **ne quitte jamais Vault** |
| `pki`      | `pki/`            | CA interne mTLS — émission/révocation de certs clients    |
| `database` | `database/creds/` | Credentials Postgres dynamiques (TTL 24 h)                |
| `totp`     | `totp/`           | MFA agents CTDEC                                          |

### 0.2 S'authentifier AVANT toute action (jamais le root token en prod)

```bash
# --- PRODUCTION : login humain via OIDC Keycloak + MFA obligatoire ---
# Pourquoi OIDC : traçabilité nominative dans le Vault audit log (qui a rotaté quoi, quand).
export VAULT_ADDR="https://vault.nina-aes.ctdec.ml:8200"
vault login -method=oidc role=security-admin   # ouvre le navigateur → Keycloak + TOTP

# Vérifier qu'on a bien les droits d'astreinte AVANT de toucher quoi que ce soit
vault token lookup -format=json | jq '.data.policies'
# Attendu : doit contenir "break-glass" ou "security-admin"
```

```powershell
# --- DEV / LOCAL (jamais en prod) : root token de dev depuis docker-compose.dev.yml ---
$env:VAULT_ADDR  = "http://localhost:8200"
$env:VAULT_TOKEN = "nina-dev"
# Vérifier l'état du coffre (doit afficher Sealed=false)
docker exec nina-vault vault status
```

> ⚠️ **Break-glass** : si Keycloak est lui-même indisponible (l'incident touche l'IdP), utiliser la
> procédure de secours « bris de glace » : 3 des 5 unseal keys Shamir détenues par 3 porteurs
> distincts (cf. §4 contacts) reconstituent un accès root **temporaire et audité**. Tout usage du
> bris de glace déclenche obligatoirement un post-mortem (§3.6).

### 0.3 Registre des correspondances « secret → chemin Vault »

Voir le **§8 — Registre des secrets** pour la table complète. Garder cet onglet ouvert pendant un
incident.

---

## 1. Rotation d'urgence d'une clé compromise

**Principe directeur** : on suppose la clé **déjà aux mains de l'adversaire**. L'objectif n'est pas
« changer la clé proprement » mais « rendre l'ancienne clé inutile le plus vite possible, sans
casser le service plus que nécessaire ». On rotate d'abord, on enquête ensuite.

> 🧭 **Différence Transit vs kv-v2** : pour une clé Transit (JWT, PII, whistleblower), la clé privée
> n'a **jamais** quitté Vault → « compromission » signifie soit fuite de la capacité de signer/
> déchiffrer (token applicatif volé), soit doute cryptographique. La rotation crée une **nouvelle
> version** de la clé ; les anciennes versions restent déchiffrantes tant qu'on n'élève pas
> `min_decryption_version`.

### 1.1 Clé de signature JWT (RS256 via Transit) — `transit/keys/jwt-signing-rs256`

**Impact** : tous les access tokens signés avec l'ancienne version deviennent invalides → les
utilisateurs sont déconnectés. C'est **voulu** si la clé a fuité (on coupe les sessions volées).

```bash
# 1) Inspecter l'état actuel (versions, type de clé)
vault read transit/keys/jwt-signing-rs256

# 2) Rotater : crée la version N+1, qui devient la version de SIGNATURE active
vault write -f transit/keys/jwt-signing-rs256/rotate

# 3) Publier la nouvelle clé PUBLIQUE pour la validation des tokens (JWKS)
#    auth-service expose /.well-known/jwks.json à partir de Transit → forcer le refresh
kubectl -n nina-aes rollout restart deployment/auth-service

# 4) Si la clé a FUITÉ (et pas seulement « rotation préventive ») :
#    invalider toutes les anciennes versions → aucun token historique ne valide plus.
vault read transit/keys/jwt-signing-rs256   # noter le numéro de version courant (ex: 4)
vault write transit/keys/jwt-signing-rs256/config \
  min_decryption_version=4 \
  min_encryption_version=4

# 5) Révoquer les refresh tokens applicatifs (sinon ré-émission de tokens valides)
#    Les refresh tokens vivent côté auth-service (Postgres) — purge ciblée :
# ⚠️ À IMPLÉMENTER — placeholder, NON encore livré.
#    Chemin cible : services/auth-service/src/scripts/revoke-all-refresh-tokens.ts
#    (compilé en dist/scripts/revoke-all-refresh-tokens.js). Tant que ce script n'existe pas,
#    purge manuelle de secours via SQL sur la table des refresh tokens (révoquer = marquer
#    revoked_at, NE PAS DELETE pour garder la trace forensique) :
#      UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'key-rotation-incident'
#      WHERE revoked_at IS NULL;
kubectl -n nina-aes exec deploy/auth-service -- \
  node dist/scripts/revoke-all-refresh-tokens.js --reason="key-rotation-incident"   # ⚠️ script à créer

# 6) Vérifier qu'un ANCIEN token est désormais rejeté (401)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <ANCIEN_TOKEN>" \
  https://api.nina-aes.ctdec.ml/api/v1/identity/me
# Attendu : 401
```

> 💡 **Migration d'algorithme (et pas simple rotation)** : la signature des jetons publics reste sur
> **RS256 via Transit** (clé QR/JWT — la seule signature qui passe par Vault Transit, cf. ADR-026).
>
> ⚠️ **Ne PAS créer de clé `transit/keys/jwt-signing-ed25519`** : **Vault Transit ne supporte pas le
> type `ed25519`** pour la signature des JWT applicatifs dans cette plateforme (décision tranchée
> ADR-026 + ADR-034 L188-192). L'Ed25519 utilisé dans NINA-AES est **exclusivement** la signature
> _in-process_ du scellement de la chaîne d'audit, via la librairie `@noble/ed25519` (doc 09),
> **hors Transit**. Re-suggérer un « Transit-Ed25519 » serait une erreur déjà documentée comme
> inexistante.
>
> Conséquence pratique : si l'audit interne exige une migration d'algorithme pour les **JWT**, elle
> se fait en restant **dans la famille RSA Transit** (ex. émettre une nouvelle clé
> `transit/keys/ jwt-signing-rs256-v2` et faire signer auth-service en double — deux clés publiques
> dans le JWKS pendant la fenêtre de transition — puis retirer l'ancienne). Ne jamais « downgrader »
> sous RSA-3072 (constante repo). La rotation Ed25519 de la **chaîne d'audit** est, elle, traitée
> côté code `@noble/ed25519` (doc 09) — **pas** par une commande `vault write transit/keys/...`.

### 1.2 Clé Transit de chiffrement des PII — `transit/keys/nina-aes-pii`

**Impact** : la donnée PII chiffrée au repos reste lisible (les anciennes versions déchiffrent
toujours), mais toute **nouvelle** écriture utilise la version N+1. C'est une rotation à _impact nul
sur la disponibilité_ — donc à privilégier en préventif.

```bash
# 1) Rotater la clé PII
vault write -f transit/keys/nina-aes-pii/rotate

# 2) Re-chiffrer (rewrap) les données existantes vers la nouvelle version SANS les déchiffrer
#    côté application (le ciphertext est ré-emballé par Vault — clair jamais exposé).
#    Exécuté par un job de maintenance qui itère sur les colonnes chiffrées :
# ⚠️ À IMPLÉMENTER — placeholder, NON encore livré.
#    Le CronJob `transit-rewrap` n'existe pas encore. Chemin cible :
#    deploy/k8s/jobs/transit-rewrap.cronjob.yaml (image utilitaire appelant
#    `transit/rewrap/nina-aes-pii` par lot sur chaque ciphertext). Tant qu'il n'existe pas,
#    le rewrap se fait à la main, colonne par colonne, via l'endpoint Vault :
#      vault write transit/rewrap/nina-aes-pii ciphertext="vault:v<N>:<...>"
#    (renvoie le ciphertext ré-emballé en version courante — à ré-écrire en base).
kubectl -n nina-aes create job pii-rewrap-$(date +%s) \
  --from=cronjob/transit-rewrap   # ⚠️ CronJob à créer (deploy/k8s/jobs/transit-rewrap.cronjob.yaml)

# 3) NE PAS élever min_decryption_version tant que le rewrap n'est pas à 100 %,
#    sinon les données encore en version N deviennent illisibles (perte de données).
#    Vérifier l'avancement avant de verrouiller :
kubectl -n nina-aes logs job/pii-rewrap-<id> | tail -n 1
# Quand rewrap = 100 % seulement :
vault write transit/keys/nina-aes-pii/config min_decryption_version=<N+1>
```

> 🛑 **Garde-fou « perte de données »** : élever `min_decryption_version` AVANT la fin du rewrap
> rend des PII définitivement indéchiffrables. C'est l'erreur la plus coûteuse de tout ce runbook.
> Toujours : rewrap → vérifier 100 % → puis verrouiller.

### 1.3 Clé procureur / lanceur d'alerte — `transit/keys/sigac-whistleblower`

**Contexte** : cette clé chiffre les signalements anti-corruption (module SIGAC). Sa compromission
met en **danger physique** des lanceurs d'alerte → procédure spéciale, jamais en autonomie complète.

> ⚠️ **Correctif cryptographique majeur — type de clé** : le **chiffrement** des signalements vers
> le procureur exige une clé que Vault sait **déchiffrer** via `transit/decrypt`. Vault Transit
> n'expose `encrypt`/`decrypt`/`rewrap` **que** pour les types `aes256-gcm96`, `chacha20-poly1305`
> et `rsa-2048|3072|4096`. **Ed25519 NE CHIFFRE PAS** — c'est un schéma de **signature** (EdDSA) :
> il n'a ni opération `decrypt` ni `rewrap`, donc `min_decryption_version` n'aurait aucun sens sur
> lui. La clé `sigac-whistleblower` **doit** donc être de type **`rsa-4096`** (chiffrement
> asymétrique vers le procureur, RSA-OAEP) — et **non** `ed25519`. Si une version historique de
> cette clé a été créée en `ed25519`, c'est un **bug bloquant** : aucun signalement ne peut être
> déchiffré ; voir « Remédiation clé mal typée » plus bas. _(Corollaire doc : ADR-023 L69-72 décrit
> à tort une « clé publique Ed25519 du procureur » utilisée via `transit/decrypt` — à corriger en
> `rsa-4096`, cf. MAINTENANCE.md.)_

```bash
# ⚠️ NE JAMAIS exécuter cette rotation seul. Exige co-validation (4-eyes) :
#    1 porteur "procureur" + 1 porteur "CISO CTDEC" (cf. ADR-023 §Conséquences).

# 0) Vérifier le TYPE de la clé AVANT toute opération. Il DOIT être "rsa-4096".
#    Si "ed25519" → STOP : clé non déchiffrable, suivre "Remédiation clé mal typée" ci-dessous.
vault read -field=type transit/keys/sigac-whistleblower
# Attendu : rsa-4096   (rsa-3072/aes256-gcm96/chacha20-poly1305 acceptables ; ed25519 = INVALIDE ici)

# 1) Rotater la clé (nouvelle version de chiffrement RSA)
vault write -f transit/keys/sigac-whistleblower/rotate

# 2) Re-chiffrer les signalements EN ATTENTE vers la nouvelle version (rewrap),
#    APRÈS avoir confirmé qu'aucun signalement n'est en cours de lecture par le procureur.
#    Le rewrap ré-emballe le ciphertext RSA-OAEP côté Vault — le clair n'est JAMAIS exposé.
kubectl -n nina-aes create job sigac-rewrap-$(date +%s) \
  --from=cronjob/sigac-rewrap   # ⚠️ CronJob à créer (deploy/k8s/jobs/sigac-rewrap.cronjob.yaml)

# 3) Seulement une fois le rewrap à 100 % ET la réémission des signalements en attente confirmée :
vault write transit/keys/sigac-whistleblower/config min_decryption_version=<N+1>
```

> ⚠️ **À IMPLÉMENTER — `cronjob/sigac-rewrap` placeholder, NON encore livré.** Chemin cible :
> `deploy/k8s/jobs/sigac-rewrap.cronjob.yaml`. À défaut, rewrap manuel signalement par signalement :
> `vault write transit/rewrap/sigac-whistleblower ciphertext="vault:v<N>:<...>"`. **Anti-corrélation
> oblige** (cf. note ci-dessous) : ne PAS journaliser l'identité ni l'ordre des signalements
> rewrappés.

**Remédiation « clé mal typée » (si `sigac-whistleblower` a été créée en `ed25519`)** :

```bash
# Une clé Transit ne change PAS de type : on doit en créer une NEUVE, déchiffrable.
# Schéma A (recommandé, intra-Vault) : RSA-4096, chiffrement asymétrique vers le procureur via Transit.
vault write transit/keys/sigac-whistleblower-rsa type=rsa-4096 \
  exportable=false allow_plaintext_backup=false
#   → faire publier sa clé PUBLIQUE et basculer SIGAC pour chiffrer via :
#     vault write transit/encrypt/sigac-whistleblower-rsa plaintext=$(base64 <<<"$signalement")
#   → le procureur déchiffre via : vault write transit/decrypt/sigac-whistleblower-rsa ciphertext=...
#   → mettre à jour le §8 et ADR-023 pour pointer la nouvelle clé, retirer l'ancienne ed25519.

# Schéma B (alternative hors-Transit, si chiffrement asymétrique "scellé" vers le procureur souhaité) :
#   utiliser une "sealed box" libsodium / age / ECIES X25519 CÔTÉ APPLICATION (la clé privée du
#   procureur reste sur un HSM/poste scellé, jamais dans Transit). Dans ce cas, sigac-whistleblower
#   N'est PLUS une clé Transit et ne figure plus dans ce runbook (rotation = nouvelle paire age/X25519).
#   ⚠️ Ne JAMAIS mélanger les deux : soit RSA-Transit (déchiffrable par Vault), soit X25519 hors-Transit.
```

> 🔒 **Anti-corrélation (protection des lanceurs d'alerte)** : pendant cette opération, NE PAS
> activer de logs de debug supplémentaires, NE PAS exporter de dumps, NE PAS corréler timestamps/IP.
> Un attaquant interne pourrait utiliser les traces d'incident pour ré-identifier un lanceur
> d'alerte. Le Vault audit log standard suffit. Référence : ADR-023 + ADR-034 §anti-corrélation.

### 1.4 Sel biométrique (template protection) — `kv/data/biometric/salt` + `transit/keys/biometric-template`

**Contexte** : les gabarits biométriques (empreintes/visage) ne sont jamais stockés en clair ; ils
sont _salés_ puis chiffrés. Le **sel** vit en `kv-v2` (valeur secrète) ; la **clé de chiffrement du
gabarit** vit en Transit. Compromettre le sel facilite des attaques par dictionnaire/rainbow sur les
gabarits.

> ⚠️ **Particularité irréversible** : changer le sel **invalide les gabarits existants** (ils ne
> correspondront plus). Une rotation de sel implique donc une **ré-inscription biométrique** des
> citoyens concernés (ou un ré-enrôlement progressif). Ce n'est PAS une opération de routine.

```bash
# CAS A — la CLÉ Transit de chiffrement du gabarit a fuité (le sel, lui, est intact) :
#   rotation Transit classique, AUCUNE ré-inscription nécessaire (rewrap suffit).
vault write -f transit/keys/biometric-template/rotate
# ⚠️ À IMPLÉMENTER — `cronjob/biometric-rewrap` placeholder, NON encore livré.
#    Chemin cible : deploy/k8s/jobs/biometric-rewrap.cronjob.yaml (rewrap des gabarits chiffrés).
#    À défaut, rewrap manuel : vault write transit/rewrap/biometric-template ciphertext="vault:v<N>:..."
kubectl -n nina-aes create job biometric-rewrap-$(date +%s) \
  --from=cronjob/biometric-rewrap   # ⚠️ CronJob à créer (deploy/k8s/jobs/biometric-rewrap.cronjob.yaml)

# CAS B — le SEL lui-même a fuité (kv/data/biometric/salt) : opération lourde.
#   1) Générer un nouveau sel cryptographiquement fort (256 bits)
NEW_SALT=$(openssl rand -base64 32)
#   2) Écrire le nouveau sel SANS écraser l'ancien (kv-v2 versionne → rollback possible)
#   ⚠️ CHEMIN kv-v2 — piège fréquent en incident : la commande `vault kv` utilise le chemin
#      LOGIQUE (SANS le segment "/data/"), tandis que l'API REST/HTTP et les policies utilisent le
#      chemin PHYSIQUE (AVEC "/data/"). Ici :
#        • `vault kv put`            → kv/biometric/salt        (logique, ce qui suit)
#        • API REST / curl           → kv/data/biometric/salt   (physique)
#        • lecture                   → `vault kv get kv/biometric/salt`
#      Le §8 (registre) et le titre §1.4 listent le chemin API `kv/data/biometric/salt` ; c'est le
#      MÊME secret. Ne pas taper "/data/" dans une commande `vault kv ...` (donnerait un sous-chemin).
vault kv put kv/biometric/salt value="$NEW_SALT" rotated_at="$(date -u +%FT%TZ)" \
  reason="salt-compromise-incident"
#   3) Marquer la campagne de ré-inscription (le sel actif et l'ancien coexistent
#      le temps de la transition pour ne pas bloquer l'authentification des citoyens).
#   4) Planifier la ré-inscription via le module enrollment-service (hors-bande, guichets CTDEC).
#   ⛔ NE PAS supprimer l'ancien sel tant que 100 % des gabarits n'ont pas été ré-enrôlés.
```

> 💡 **Pourquoi le sel n'est PAS en Transit** : un sel doit être _lisible_ par le service au moment
> du calcul du gabarit (ce n'est pas une signature). On le protège donc dans `kv-v2` avec policy
> `deny` par défaut, lecture réservée à `enrollment-service` et `biometric-service` uniquement.

---

## 2. Révocation d'un certificat client mTLS (PKI Vault)

**Pourquoi** : si un pod / un service est compromis, son **certificat client X.509** émis par la PKI
Vault doit être révoqué pour qu'il ne puisse plus se présenter comme un service légitime dans le
mesh mTLS. La rotation Linkerd (24 h) finit par expirer le cert, mais 24 h est **trop long** face à
une compromission active : on révoque manuellement.

```bash
# 1) Identifier le numéro de série du certificat à révoquer.
#    Soit depuis le cert lui-même (si on l'a), soit en listant les certs émis par la PKI.
vault list pki/certs
# Pour décoder un cert connu et lire son serial :
openssl x509 -in compromised-client.crt -noout -serial
# → serial=3A:7F:...:9C   (Vault attend le format avec ':' ou sans, voir étape 2)

# 2) Révoquer par numéro de série (Vault l'ajoute à la CRL)
vault write pki/revoke serial_number="3a:7f:...:9c"

# 3) Forcer la régénération de la CRL pour propagation immédiate
vault read pki/crl/rotate

# 4) Émettre un NOUVEAU certificat pour le service légitime (s'il doit continuer à tourner)
vault write pki/issue/identity-service \
  common_name="identity-service.nina-aes.svc" \
  ttl="24h"

# 5) Recharger le service avec le nouveau cert (et tuer l'ancien pod compromis)
kubectl -n nina-aes delete pod -l app=identity-service --grace-period=0 --force
kubectl -n nina-aes rollout status deployment/identity-service

# 6) Vérifier que la CRL est bien servie et contient le serial révoqué
#   ⚠️ `vault read pki/cert/crl` SEUL renvoie une TABLE (clé/valeur), PAS du PEM brut → openssl
#      échouerait. Extraire le champ `certificate` (le PEM de la CRL) avec `-field=certificate` :
vault read -field=certificate pki/cert/crl \
  | openssl crl -inform PEM -noout -text | grep -A2 "Revoked"
#   Variante JSON équivalente (si -field indisponible) :
#     vault read -format=json pki/cert/crl | jq -r .data.certificate \
#       | openssl crl -inform PEM -noout -text | grep -A2 "Revoked"
```

> 🧭 **Linkerd vs PKI Vault** : Linkerd gère sa propre CA pour le mTLS de mesh (rotation auto 24 h).
> La PKI Vault sert les certs _clients applicatifs_ (interop BCID-AES, accès machine-to-machine
> externes). Si la compromission touche le **trust anchor Linkerd**, c'est un incident majeur :
> `linkerd upgrade --identity-trust-anchors-file=<new-ca>` + redéploiement complet (cf. ADR-034).

```bash
# Vérifier l'état du trust anchor Linkerd et sa date d'expiration
linkerd check --proxy
```

---

## 3. Réponse à incident (cycle complet)

**Modèle suivi** : NIST SP 800-61 (Detection → Containment → Eradication → Recovery →
Post-incident). On adapte au contexte mono-opérateur (étudiant) + petite équipe SOC CTDEC.

### 3.0 Arbre de décision (triage initial)

```text
                 ┌─────────────────────────────────────────┐
                 │  Alerte / suspicion d'incident sécurité  │
                 └───────────────────┬─────────────────────┘
                                     │
                  ┌──────────────────▼───────────────────┐
                  │  Q1. Données d'identité / PII / clés   │
                  │      crypto potentiellement exposées ? │
                  └───────┬───────────────────────┬────────┘
                     OUI  │                        │  NON
            ┌─────────────▼───────────┐   ┌────────▼─────────────────┐
            │ INCIDENT MAJEUR (P1)    │   │ Q2. Indispo / DoS / perf │
            │ → §3.2 confinement now  │   │     anormale ?           │
            │ → notifier CISO (§4)    │   └───┬───────────────┬──────┘
            │ → break-glass si besoin │   OUI │               │ NON
            └─────────────────────────┘  ┌────▼──────┐  ┌─────▼───────────┐
                                         │ P2 dispo  │  │ Q3. Tentative   │
                                         │ → scaler  │  │ d'intrusion     │
                                         │ → §6 roll │  │ bloquée (WAF/   │
                                         │   back si │  │ throttler) ?    │
                                         │   déploi  │  └───┬─────────┬───┘
                                         │   récent  │  OUI │         │ NON
                                         └───────────┘ ┌────▼───┐ ┌───▼────────┐
                                                       │ P3     │ │ P4 / faux  │
                                                       │ logguer│ │ positif →  │
                                                       │ + suivi│ │ documenter │
                                                       │ §5 SOC │ │ + tuner    │
                                                       └────────┘ └────────────┘
```

> **Règle d'or P1** : en cas de doute entre P1 et P2, **traiter comme P1**. Sur une plateforme
> d'identité d'État, le coût d'un sur-classement (déranger le CISO la nuit) est négligeable face au
> coût d'un sous-classement (fuite non contenue).

### 3.1 Détection

1. Sources d'alerte : Alertmanager (Prometheus), Vault audit log (anomalie d'accès), Loki (pattern
   suspect), Falco (si déployé — comportement runtime), ZAP/Trivy (CI), signalement humain.
2. Ouvrir un **ticket d'incident** horodaté (UTC) — id `INC-AAAAMMJJ-NN`.
3. Noter l'heure de **première détection** (`T_detect`) → sert au calcul MTTD (§5).
4. Geler l'état : `kubectl -n nina-aes get events --sort-by=.lastTimestamp > inc-events.txt`.

### 3.2 Confinement (containment)

```bash
# 1) Isoler le composant suspect SANS le détruire (preuves forensiques).
#    Couper son trafic réseau via NetworkPolicy "quarantine" (deny-all sauf collecte).
kubectl -n nina-aes label pod <pod-suspect> quarantine=true --overwrite

# 2) Révoquer ses accès Vault (leases + cert mTLS) — cf. §1 et §2.
vault lease revoke -prefix database/creds/<service>
#    + révoquer le cert client (§2).

# 3) Si compte humain compromis : désactiver dans Keycloak + tuer ses sessions.
#    (Console Keycloak → Users → <user> → "Logout all" + "Disabled".)

# 4) Snapshot mémoire/disque du pod AVANT suppression (forensique).
kubectl -n nina-aes cp <pod-suspect>:/proc/1/root/tmp ./forensics/<inc-id>/ 2>/dev/null || true
```

### 3.3 Éradication

1. Identifier la **cause racine** (CVE, secret fuité, mauvaise config, phishing). Ne pas se
   contenter du symptôme.
2. Rotater **tous** les secrets potentiellement exposés (§1) — en cas de doute, rotater large.
3. Patcher : rebuild image avec dépendance corrigée, re-scan Trivy (`severity HIGH,CRITICAL` →
   exit-code 1 doit passer au vert).
4. Supprimer définitivement le composant compromis une fois les preuves collectées.

### 3.4 Récupération (recovery)

```bash
# 1) Redéployer la version saine (image re-scannée, secrets rotés).
kubectl -n nina-aes set image deployment/<service> <service>=<registry-ctdec>/<service>:<tag-sain>
kubectl -n nina-aes rollout status deployment/<service>

# 2) Vérifier la santé end-to-end (sonde /health + mTLS actif).
curl -fsS https://api.nina-aes.ctdec.ml/health
linkerd viz -n nina-aes tap deploy/<service> | grep -m1 'tls=true'

# 3) Surveiller en renforcé 24-72 h (le retour de l'attaquant est fréquent).
#    Baisser temporairement les seuils d'alerte Alertmanager.
```

4. Lever la quarantaine seulement après confirmation de non-récidive. Noter `T_resolved` → MTTR
   (§5).

### 3.5 Communication de crise (pendant l'incident)

1. Canal interne **souverain** : salle Matrix dédiée `#nina-incident` (auto-hébergée) — **pas**
   Slack/Teams US.
2. Mises à jour toutes les 30 min sur un incident P1, même « rien de neuf ».
3. Notifier les parties prenantes via la chaîne du §4 (CISO → ANSSI Mali si fuite avérée de données
   d'État).

### 3.6 Post-mortem (blameless)

Rédiger sous 72 h un post-mortem **sans blâme** (`docs/security/postmortems/INC-AAAAMMJJ-NN.md`, non
versionné dans ce runbook) couvrant :

- Chronologie horodatée (T_detect → T_contained → T_resolved).
- Cause racine (5 _Why_).
- Ce qui a bien/mal fonctionné.
- Actions correctives **datées et assignées** (avec ticket).
- Mise à jour de CE runbook si une étape a manqué.

> 💡 **Blameless** : on cherche la défaillance _systémique_, pas le coupable. Une procédure qui
> dépend de l'héroïsme d'une personne est une procédure défaillante.

---

## 4. Contacts de crise (placeholders — à renseigner hors-Git)

> ⚠️ **Ne jamais committer de coordonnées nominatives réelles ici.** La table ci-dessous est un
> _gabarit_. Les valeurs réelles vivent dans un coffre `kv/incident/contacts` (Vault) + une fiche
> papier scellée en astreinte (redondance hors-ligne si Vault est down).

| Rôle                              | Identifiant / contact           | Canal primaire          | Canal secours (hors-ligne) | Astreinte |
| --------------------------------- | ------------------------------- | ----------------------- | -------------------------- | --------- |
| CISO / RSSI — CTDEC               | `<CISO_CTDEC_PLACEHOLDER>`      | Matrix `#nina-incident` | Téléphone scellé           | 24/7      |
| CERT / CSIRT — ANSSI Mali         | `<ANSSI_MALI_CERT_PLACEHOLDER>` | Email PGP chiffré       | Ligne dédiée               | H.O.      |
| Responsable Vault / PKI           | `<VAULT_OWNER_PLACEHOLDER>`     | Matrix                  | Téléphone                  | 24/7      |
| Porteurs unseal keys (3 sur 5)    | `<SHAMIR_HOLDER_1..3>`          | Présentiel / téléphone  | Coffre physique            | sur appel |
| DPO (protection données / RGPD)   | `<DPO_PLACEHOLDER>`             | Email                   | —                          | H.O.      |
| Magistrat référent SIGAC          | `<PROCUREUR_SIGAC_PLACEHOLDER>` | Canal scellé dédié      | Présentiel                 | sur appel |
| Tuteur UQAR (escalade académique) | `<TUTEUR_UQAR_PLACEHOLDER>`     | Email                   | —                          | H.O.      |

> 🔒 **Souveraineté des alertes** : aucune intégration PagerDuty/Opsgenie US sur le chemin critique.
> L'astreinte est notifiée via Alertmanager → passerelle email/Matrix auto-hébergée (cf. doc 17).

**Critères de notification ANSSI Mali** (obligatoire si l'un est vrai) :

- Fuite avérée ou fortement suspectée de données d'identité de citoyens (NINA, biométrie, PII).
- Compromission d'une clé racine (CA PKI, trust anchor Linkerd, clé de signature JWT en prod).
- Indisponibilité majeure d'un service d'identité régalien > 1 h.

---

## 5. Métriques SOC

**Pourquoi mesurer** : sans chiffres, « on s'améliore » est une croyance. Ces 3 métriques pilotent
l'investissement sécurité et figurent dans le rapport trimestriel au CTDEC.

| Métrique                                | Définition                                     | Source de calcul                               | Cible MVP  |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------- |
| **MTTD** (Mean Time To Detect)          | `T_detect − T_compromise` moyen sur la période | Tickets `INC-*` + corrélation Loki/audit log   | < 1 h (P1) |
| **MTTR** (Mean Time To Respond/Recover) | `T_resolved − T_detect` moyen                  | Tickets `INC-*`                                | < 4 h (P1) |
| **Taux de faux positifs**               | `alertes_faux_positifs / alertes_totales`      | Tri des alertes Alertmanager (label `outcome`) | < 30 %     |

```bash
# Exemple de calcul MTTR sur le dernier trimestre depuis les tickets (un JSON par incident).
# Chaque ticket contient t_detect / t_resolved en epoch UTC.
jq -s '
  [ .[] | select(.severity=="P1") | (.t_resolved - .t_detect) ]
  | (add / length) as $mttr
  | { incidents: length, mttr_seconds: $mttr, mttr_hours: ($mttr/3600) }
' docs/security/postmortems/*.json
```

> 💡 **Faux positifs** : un taux _trop bas_ n'est pas forcément bon — il peut signaler des seuils
> d'alerte trop laxistes (on rate de vrais incidents). L'objectif est un équilibre, pas zéro. Chaque
> faux positif récurrent doit donner lieu à un _tuning_ documenté de la règle Alertmanager.

---

## 6. Rollback sécurisé

**Pourquoi une procédure dédiée** : un rollback naïf (« redéployer l'image d'avant ») peut
**réintroduire** une vulnérabilité corrigée ou des secrets déjà révoqués. Le rollback de sécurité a
des garde-fous spécifiques.

```bash
# 1) IDENTIFIER la dernière version SAINE connue (taguée, re-scannée Trivy au vert).
#    Ne JAMAIS rollback vers une image non scannée ou taguée "latest".
kubectl -n nina-aes rollout history deployment/<service>

# 2) VÉRIFIER que la version cible n'a pas la CVE qui a motivé l'incident.
trivy image <registry-ctdec>/<service>:<tag-cible> --severity HIGH,CRITICAL --exit-code 1

# 3) S'assurer que les secrets de la version cible sont TOUJOURS valides
#    (un rollback peut référencer un secret_id AppRole révoqué → boucle de crash).
vault read auth/approle/role/<service>/role-id   # role_id stable ; vérifier le secret_id côté K8s

# 4) Rollback CONTRÔLÉ (pas de --to-revision aveugle ; on pointe une révision validée).
kubectl -n nina-aes rollout undo deployment/<service> --to-revision=<N>
kubectl -n nina-aes rollout status deployment/<service> --timeout=120s

# 5) Re-valider mTLS + santé + audit après rollback.
curl -fsS https://api.nina-aes.ctdec.ml/health
linkerd viz -n nina-aes stat deploy/<service>   # MeshedTLS doit être 100 %

# 6) Si le rollback échoue (crashloop) → NE PAS insister : repasser en §3 (incident) et
#    déployer un correctif "forward" plutôt qu'un retour arrière dégradé.
```

> 🛑 **Données vs code** : un rollback de **code** est réversible ; un rollback de **schéma de base
> / migration Prisma** ne l'est souvent pas. Avant tout rollback touchant la DB, vérifier
> l'existence d'une migration `down` testée. Sinon, restaurer depuis backup (cf. ADR-019
> backup-recovery).

---

## 7. Divulgation responsable (responsible disclosure)

**Pourquoi** : un chercheur en sécurité qui trouve une faille doit avoir un **canal sûr et légal**
pour la signaler — sinon il la publie (full disclosure) ou la vend. NINA-AES publie une politique
claire pour transformer les chercheurs en alliés.

### 7.1 Politique publique (`/.well-known/security.txt`)

```text
# Fichier servi à https://nina-aes.ctdec.ml/.well-known/security.txt
# Pourquoi ce fichier : standard RFC 9116 — point d'entrée unique pour signaler une faille.
Contact: mailto:security@ctdec.ml
Encryption: https://nina-aes.ctdec.ml/.well-known/pgp-key.txt
Policy: https://nina-aes.ctdec.ml/.well-known/disclosure-policy
Preferred-Languages: fr, en
Canonical: https://nina-aes.ctdec.ml/.well-known/security.txt
Expires: 2027-06-18T00:00:00Z
```

### 7.2 Processus de traitement d'un signalement

1. **Accusé de réception sous 72 h** (même hors heures ouvrées si critique).
2. **Triage & sévérité** (CVSS) sous 5 jours ouvrés → ticket `VULN-AAAAMMJJ-NN`.
3. **Fenêtre de correction** : 90 jours par défaut, **30 jours** si activement exploitée.
4. **Coordination** : on tient le chercheur informé ; on convient ensemble d'une **date de
   divulgation coordonnée**.
5. **Safe harbour** : engagement écrit de **ne pas poursuivre** un chercheur de bonne foi qui
   respecte la politique (pas d'exfiltration de données réelles, pas de DoS, divulgation privée
   d'abord). Indispensable pour la confiance.
6. **Reconnaissance** : page « Hall of Fame » (avec accord du chercheur) ; bug bounty privé possible
   en phase ultérieure (cf. doc 15 §10).

> 🔒 **Pas d'exfiltration de PII** : la politique interdit explicitement au chercheur de télécharger
> des données réelles de citoyens. Un environnement de test avec données synthétiques est fourni sur
> demande. Ceci protège les citoyens _et_ le chercheur (qui resterait dans le cadre légal).

---

## 8. Registre des secrets & emplacements Vault

**Pourquoi ce registre** : pendant un incident, savoir _instantanément_ « où vit ce secret et que
casse sa rotation » fait gagner les minutes décisives. Table de vérité de référence.

| Secret / clé                                        | Engine         | Chemin Vault                            | Rotation            | Impact d'une rotation                                                                                           | Procédure         |
| --------------------------------------------------- | -------------- | --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| Clé signature JWT (RS256)                           | `transit`      | `transit/keys/jwt-signing-rs256`        | 90 j (CronJob)      | Déconnecte les sessions (voulu si fuite)                                                                        | §1.1              |
| Signature audit (Ed25519, in-process)               | _hors Transit_ | `@noble/ed25519` (clé scellée, doc 09)  | sur migration code  | Scellement chaîne d'audit (⚠️ **PAS** Transit, cf. ADR-026/034)                                                 | doc 09 / §1.1     |
| Clé chiffrement PII                                 | `transit`      | `transit/keys/nina-aes-pii`             | 90 j                | Aucun (rewrap) si on ne verrouille pas trop tôt                                                                 | §1.2              |
| Clé interop BCID-AES                                | `transit`      | `transit/keys/aes-interop-mli`          | 90 j                | Casse l'interop Bloc B si désync                                                                                | §1.2              |
| Clé whistleblower SIGAC (**rsa-4096**, chiffrement) | `transit`      | `transit/keys/sigac-whistleblower`      | manuelle (4-eyes)   | Danger lanceurs d'alerte — procédure spéciale (⚠️ type `rsa-4096`, **JAMAIS** ed25519 : Ed25519 ne chiffre pas) | §1.3              |
| Clé chiffrement gabarit biométrie                   | `transit`      | `transit/keys/biometric-template`       | 90 j                | Aucun (rewrap) — pas de ré-inscription                                                                          | §1.4 (A)          |
| Sel biométrique                                     | `kv-v2`        | `kv/data/biometric/salt`                | rare / sur incident | **Invalide les gabarits → ré-inscription**                                                                      | §1.4 (B)          |
| Clé publique JWKS (exposée)                         | `kv-v2`        | `kv/data/auth/jwks-public`              | suit la clé Transit | Aucun (clé publique)                                                                                            | §1.1              |
| Credentials Postgres dynamiques                     | `database`     | `database/creds/<service>`              | 24 h (TTL auto)     | Aucun (pool re-auth)                                                                                            | §3.2              |
| Certs clients mTLS (PKI)                            | `pki`          | `pki/issue/<service>` + `pki/revoke`    | 24 h / révocation   | Coupe le service le temps du re-issue                                                                           | §2                |
| Secret_id AppRole (par service)                     | `approle`      | `auth/approle/role/<service>/secret-id` | 30 j                | Crashloop si stale → rotation coordonnée K8s                                                                    | §6                |
| Codes MFA agents (TOTP)                             | `totp`         | `totp/keys/agent-<id>`                  | à l'enrôlement      | Re-enrôle l'agent (nouveau QR)                                                                                  | Keycloak          |
| API keys tierces (ex. SMS USSD)                     | `kv-v2`        | `kv/data/<service>/<provider>`          | selon fournisseur   | Coupe le canal externe concerné                                                                                 | vault-usage.md §7 |
| Contacts de crise                                   | `kv-v2`        | `kv/data/incident/contacts`             | sur changement RH   | Aucun (données de référence)                                                                                    | §4                |

> 📋 **Vérification d'exhaustivité** : tout nouveau secret introduit dans la plateforme **doit**
> être ajouté à cette table dans le même changement (cf. `MAINTENANCE.md`). Un secret absent du
> registre est un angle mort en incident.

---

## 9. Checklist « incident P1 » (à cocher en live)

- [ ] Ticket `INC-*` ouvert, `T_detect` noté (UTC).
- [ ] Composant suspect mis en quarantaine (NetworkPolicy + label).
- [ ] Accès Vault du composant révoqués (leases + cert mTLS).
- [ ] Secrets potentiellement exposés rotés (§1) — large en cas de doute.
- [ ] CISO CTDEC notifié (§4) ; ANSSI Mali si critères du §4 atteints.
- [ ] Snapshot forensique pris avant suppression.
- [ ] Cause racine identifiée (pas seulement le symptôme).
- [ ] Version saine re-scannée Trivy puis redéployée ; santé + mTLS vérifiés.
- [ ] Surveillance renforcée 24-72 h active.
- [ ] Post-mortem blameless planifié sous 72 h ; ce runbook mis à jour si une étape a manqué.

---

_Document — Juin 2026 · NINA-AES Platform · UQAR · CONFIDENTIEL — DIFFUSION RESTREINTE_
