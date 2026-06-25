# OPS-RUNBOOK — Exploitation production K3s NINA-AES

> **Bloc concerné** : Transversal — exploitation (run/operate) du cluster K3s on-premise CTDEC une
> fois le déploiement initial réalisé. **Document parent** :
> [`docs/20-DEPLOYMENT-K3S-PRODUCTION.md`](../20-DEPLOYMENT-K3S-PRODUCTION.md) §4.9 (esquisse du
> runbook) — le présent document en est la version complète et autonome. **Décisions de sécurité
> applicables** : ADR-034 (mTLS Linkerd, PKI Vault, rotation clés/JWKS, cosign verify), ADR-020 (K3s
> on-premise, Calico avant le chart, Kyverno vs Gatekeeper, Sealed Secrets vs ESO), ADR-007 (audit
> hash-chain SHA-256 ancré chez tiers), ADR-026 (Vault Transit ne supporte PAS Ed25519).
>
> **Audience** : opérateur de garde (étudiant seul UQAR en V1 ; équipe CTDEC en V2). **Pré-requis
> lecteur** : avoir lu le doc 20 (déploiement initial), le doc 17 (observabilité) et le doc 19
> (backup/restore).

---

## 0. Comment lire ce runbook (POURQUOI avant COMMENT)

Un runbook d'exploitation n'est **pas** un tutoriel de déploiement. Le doc 20 répond à « comment
**installer** la plateforme ». Ce document répond à « le cluster **tourne déjà** — comment le
maintenir vivant, sûr et à jour sans interruption de service citoyen ». La différence est de nature
:

- Le déploiement est un acte **ponctuel, réfléchi, hors urgence**.
- L'exploitation se fait souvent **sous pression** (incident à 3 h du matin, cert expiré, fuite de
  secret suspectée). Sous pression, on n'improvise pas : on **suit une procédure pré-écrite et
  testée**. C'est tout l'objet de ce document.

Chaque procédure suit le même squelette : **POURQUOI** (le risque qu'on adresse) → **QUAND**
(déclencheur) → **COMMENT** (commandes commentées) → **VÉRIFIER** (preuve que ça a marché) →
**ROLLBACK** (que faire si la procédure elle-même échoue).

### Marqueurs d'honnêteté

| Marqueur       | Signification                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| ✅             | Implémenté et validé en V1 (poste local mono-nœud ou staging).                |
| ⏳ **Phase 2** | Conçu et documenté ici, **mais pas encore déployé/automatisé**. Étape future. |
| 🔒             | Point de sécurité — respecte le CANON crypto (ne pas dévier sans ADR).        |
| ⚠️             | Piège connu — lire avant d'exécuter.                                          |

> 🔒 **Rappel CANON crypto (ne JAMAIS dévier sans ADR)** — ces invariants conditionnent plusieurs
> procédures ci-dessous :
>
> - **Audit** = hash-chain SHA-256 **linéaire** (PAS un arbre de Merkle), scellement horaire Ed25519
>   **in-process** (`@noble/ed25519`), intègre **uniquement** si la racine est ancrée chez un tiers
>   (OCLEI / Vérificateur Général). Cf. ADR-007.
> - **Vault Transit NE supporte PAS Ed25519** (ADR-026/034). Chiffrement asymétrique réel = age /
>   libsodium sealed box (X25519+XSalsa20-Poly1305) ou RSA-OAEP (Transit `rsa-4096`). **Ed25519 =
>   signature seulement, NE CHIFFRE PAS.**
> - **Secrets** = AppRole / Kubernetes ServiceAccount + **lease court**, **JAMAIS** de `VAULT_TOKEN`
>   long-lived dans un manifest ou une variable d'env.
> - **Souveraineté** : pas d'AWS KMS / Cloudflare / Slack / PagerDuty US sur le cœur régalien.

---

## 1. Tableau de bord — état général du cluster

> **POURQUOI** : avant toute action (et au début de chaque tour de garde), on prend le pouls du
> cluster. 80 % des incidents se diagnostiquent en lisant l'état des pods, rollouts et certs.

```bash
# Vue d'ensemble : pods, services, ingress sur tous les namespaces
kubectl get pods,svc,ingress -A

# État des rollouts Argo (identity-service est en blue-green, cf. doc 20 §4.6)
kubectl get rollouts -n nina-aes

# Révisions Helm installées (pour préparer un éventuel rollback)
helm list -A
helm history nina-aes -n nina-aes

# Certs gérés par cert-manager : colonne READY doit être True, voir l'expiration
kubectl get certificate -A
kubectl get certificaterequest,order,challenge -A   # si un cert traîne en attente

# Consommation ressources (nécessite metrics-server, cf. doc 20 §6)
kubectl top nodes
kubectl top pods -n nina-aes --sort-by=memory

# Événements récents (souvent la cause racine d'un pod qui ne démarre pas)
kubectl get events -A --sort-by=.lastTimestamp | tail -n 30
```

> 💡 **Lecture rapide** : un pod sain est `Running` + `READY n/n`. Tout `CrashLoopBackOff`,
> `ImagePullBackOff`, `OOMKilled` ou `Pending` prolongé est un signal. Croiser avec Grafana (doc 17)
> et les alertes Alertmanager.

---

## 2. Rollback — revenir à l'état antérieur

Deux niveaux de rollback coexistent. **Choisir le bon selon ce qui a régressé.**

| Niveau                        | Outil           | Portée                                                | RTO cible |
| ----------------------------- | --------------- | ----------------------------------------------------- | --------- |
| Release applicative globale   | `helm rollback` | Tout le chart umbrella `nina-aes` (11 svc + 3 fronts) | < 60 s    |
| `identity-service` uniquement | Argo Rollouts   | Le service le plus critique, en blue-green            | < 30 s    |

### 2.1 — Rollback Helm (release globale)

> **POURQUOI** : un `helm upgrade` a introduit une régression touchant plusieurs services (mauvaise
> valeur, mauvais digest, config cassée). On revient à la révision stable précédente.
>
> **QUAND** : smoke test post-install rouge, erreurs 5xx généralisées après un upgrade, ou alerte
> Alertmanager `DeploymentRegression`.

```bash
# 1) Identifier la révision saine (colonne STATUS=deployed = courante ; on vise la précédente)
helm history nina-aes -n nina-aes
# REVISION  UPDATED                   STATUS      CHART          APP VERSION  DESCRIPTION
# 11        Mon Jun 22 ... 2026       superseded  nina-aes-0.1.0 0.1.0        Upgrade complete
# 12        Wed Jun 25 ... 2026       deployed    nina-aes-0.1.0 0.1.0        Upgrade complete  ← cassée

# 2) Rollback vers la révision 11 (--wait bloque jusqu'à readiness de tous les pods)
helm rollback nina-aes 11 -n nina-aes --wait --timeout 5m

# 3) VÉRIFIER : tous les pods Ready, smoke test vert
kubectl get pods -n nina-aes
curl -fsSL https://api.nina-aes.uqar.ca/health        # backend NestJS : /health (PAS /api/v1/health)
curl -fsSL https://citizen.nina-aes.uqar.ca/api/health # frontend Next.js : /api/health
```

> ⚠️ **Limite du rollback Helm** : il ne **rejoue pas les migrations de base de données à
> l'envers**. Si la révision cassée a appliqué une migration Prisma destructive, un simple
> `helm rollback` ne suffit pas — il faut restaurer la DB (doc 19) et/ou jouer une migration
> descendante. **Règle d'or : migrations DB toujours additives et compatibles N-1** — concrètement :
> on n'`ALTER` jamais une colonne de façon destructive (drop / rename / `NOT NULL` sans défaut) dans
> la même release que le code qui en dépend ; on ajoute la colonne nouvelle, on double-écrit, puis
> on supprime l'ancienne dans une release **ultérieure**. Ainsi le code N **et** le code N-1
> tournent tous les deux sur le schéma courant, et un `helm rollback` du code reste sûr. (Détail à
> venir dans `UPGRADE-GUIDE.md` — ⏳ doc prévu, Phase 2.) Un rollback de code doit toujours pouvoir
> tourner sur le schéma DB courant.

> 💡 **`--atomic` à l'upgrade = rollback automatique** : si l'`helm upgrade` original a été lancé
> avec `--atomic` (recommandé, cf. doc 20 §4.8) et qu'il échoue, Helm **rollback tout seul** vers la
> révision précédente. Le rollback manuel ci-dessus sert quand la régression est détectée **après**
> un upgrade « vert » (le déploiement a réussi techniquement mais le comportement est mauvais).

### 2.2 — Rollback / abort blue-green `identity-service` (Argo Rollouts)

> **POURQUOI** : `identity-service` (validation NINA, recherche citoyens) est déployé en
> **blue-green** précisément pour pouvoir annuler **avant** que le trafic ne bascule. C'est le
> rollback le plus rapide du cluster.
>
> **QUAND** : l'`AnalysisTemplate` de pre-promotion (`smoke-test-identity`) est rouge, OU on a promu
> par erreur, OU la version `preview` se comporte mal.

```bash
# Suivre l'état du rollout en direct (montre stable vs preview, statut de l'analyse)
kubectl argo rollouts get rollout identity-service -n nina-aes --watch

# CAS A — la preview n'a PAS encore été promue : on l'avorte (la stable garde 100% du trafic)
kubectl argo rollouts abort identity-service -n nina-aes

# CAS B — la preview a DÉJÀ été promue et régresse : on revient au ReplicaSet précédent (undo)
kubectl argo rollouts undo identity-service -n nina-aes            # = revision N-1
kubectl argo rollouts undo identity-service -n nina-aes --to-revision=3  # cible explicite

# VÉRIFIER : le service actif sert bien la version stable, error-rate normal
kubectl argo rollouts status identity-service -n nina-aes
curl -fsSL https://api.nina-aes.uqar.ca/health/ready
```

> ⚠️ Après un `abort`, le Rollout reste en état `Degraded` tant que la nouvelle image fautive est
> encore référencée dans le manifest. Pour repartir proprement, corriger l'image (digest) côté
> values puis `helm upgrade`, ou `kubectl argo rollouts retry rollout identity-service -n nina-aes`
> une fois la cause corrigée.

### 2.3 — Drill de rollback (obligatoire, mensuel)

> 🔒 Un rollback **jamais testé** n'est pas un rollback. Le doc 20 (checklist §9) exige un drill
> mensuel avec **RTO mesuré < 1 min**. Procédure de drill :

```bash
# Sur STAGING uniquement (jamais en prod) :
# 1) noter l'heure, 2) upgrade vers une image volontairement cassée, 3) constater le smoke rouge,
# 4) rollback, 5) mesurer le delta jusqu'à readiness complète.
date +%s                                                  # t0
helm upgrade nina-aes ... --set image.tag=BROKEN_TAG      # injecte la panne
helm rollback nina-aes <REV_SAINE> -n nina-aes-staging --wait
date +%s                                                  # t1 ; RTO = t1 - t0
```

> ⏳ **Phase 2** : automatiser ce drill en job CronJob mensuel sur staging + publier le RTO mesuré
> dans Grafana (panneau « DR readiness »).

---

## 3. Scaling — adapter la capacité à la charge

Trois leviers, du plus automatique au plus manuel.

### 3.1 — Horizontal Pod Autoscaler (HPA) — réglage nominal

> **POURQUOI** : la charge citoyenne est cyclique (pics en journée, campagnes d'enrôlement). Le HPA
> ajuste **automatiquement** le nombre de pods sur des seuils CPU/mémoire **et** une métrique métier
> custom (latence p95 issue de Prometheus, cf. doc 17). On ne dimensionne donc PAS pour le pic en
> permanence (coût/ressources gaspillées).

Rappel de la définition (doc 20 §4.3) : `minReplicas: 2`, `maxReplicas: 6`, cibles CPU 70 % /
mémoire 80 % / `http_request_duration_seconds_p95` ≤ 500 ms.

```bash
# Observer le HPA en action (colonnes TARGETS = mesuré/cible, REPLICAS = courant)
kubectl get hpa -n nina-aes
kubectl describe hpa identity-service -n nina-aes   # voir les events de scale-up/down et la raison

# Ajuster les bornes à chaud sans re-déployer le chart (ex. avant une campagne nationale)
kubectl patch hpa identity-service -n nina-aes \
  --type merge -p '{"spec":{"maxReplicas":12}}'
```

> ⚠️ **Le HPA est plafonné par les ressources réelles du cluster.** Demander 12 replicas ne sert à
> rien si les nœuds n'ont pas le CPU/mémoire (pods bloqués en `Pending`, cf. §1). En V1 mono-nœud,
> le scaling horizontal est limité — d'où le scaling **vertical** et l'ajout de nœuds ci-dessous.

> 🔒 **Cohérence PDB** : tout scaling à la baisse respecte le `PodDisruptionBudget`
> (`minAvailable: 1`, doc 20 §4.3) — Kubernetes n'évincera jamais le dernier pod disponible pendant
> un drain/scale-down.

### 3.2 — Persister le réglage dans le chart (durable)

> Le `kubectl patch` ci-dessus est **éphémère** : le prochain `helm upgrade` le réécrase. Pour
> rendre le changement durable, le porter dans les values puis upgrade.

```bash
# Éditer infrastructure/helm/nina-aes/values-production.yaml :
#   identityService: { minReplicas: 3, maxReplicas: 12 }
helm upgrade nina-aes infrastructure/helm/nina-aes/ \
  -n nina-aes --values infrastructure/helm/nina-aes/values-production.yaml \
  --atomic --timeout 15m
```

### 3.3 — Scaling vertical & ajout de nœud (V2 HA)

> **QUAND** : pics de mémoire (`OOMKilled` récurrents malgré le HPA), ou cluster saturé en
> `Pending`.

```bash
# Vertical : augmenter requests/limits dans values puis upgrade (provoque un rolling restart)
#   resources: { requests: { memory: 512Mi }, limits: { memory: 2Gi } }

# Ajouter un agent au cluster (V2) — rejoint le control-plane existant
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.33.4+k3s1 \
  K3S_URL=https://k3s.nina-aes.uqar.ca:6443 K3S_TOKEN=<token-cluster> sh -
kubectl get nodes   # le nouveau nœud doit apparaître Ready ; les pods Pending s'y planifient
```

> ⏳ **Phase 2** : control-plane HA 3 nœuds (etcd embarqué) pour supprimer le SPOF master + cluster
> autoscaler on-premise. En V1, le scaling reste borné par le poste local mono-nœud.

---

## 4. Rotation des secrets (Vault) — sans interruption

> **POURQUOI** : un secret (mot de passe DB, clé de signature JWT, identifiant RabbitMQ) qui ne
> tourne jamais est un secret qui finira par fuiter (logs, dump, départ d'un opérateur). La rotation
> **régulière** et **sur incident** est une exigence ANSSI/RGPD-like. L'enjeu d'exploitation : le
> faire **sans couper le service** (pas de fenêtre où l'ancien et le nouveau secret sont tous deux
> invalides).
>
> 🔒 **CANON** : la source de vérité des secrets est **Vault**. Les `Secret` K8s sont soit
> **scellés** (Sealed Secrets, commitables) soit **hydratés** depuis Vault par l'External Secrets
> Operator (ESO). **JAMAIS** de `VAULT_TOKEN` long-lived : l'accès à Vault se fait par **Kubernetes
> ServiceAccount + rôle Vault + lease court** (auth `kubernetes`), exactement comme `cert-manager`
> (doc 20 §4.2).

### 4.1 — Principe : rotation à double validité (zero-downtime)

La seule façon de tourner un secret sans coupure est de **chevaucher** ancien et nouveau pendant la
bascule :

1. **Créer** la nouvelle valeur dans Vault (versioning KV v2 garde l'ancienne).
2. **Configurer le consommateur pour accepter LES DEUX** (ancien ET nouveau) — fenêtre de
   chevauchement. Ex. : pour une clé de signature JWT, publier les deux clés dans le JWKS ; pour un
   mot de passe DB, créer un second rôle/credential avant de retirer l'ancien.
3. **Recharger** les pods consommateurs pour qu'ils prennent la nouvelle valeur.
4. **Révoquer** l'ancienne valeur une fois sûr que plus aucun pod ne l'utilise.

> ⚠️ Sauter l'étape 2 (chevauchement) = micro-coupure garantie : entre l'instant où l'ancien secret
> est révoqué et celui où tous les pods ont rechargé le nouveau, les requêtes échouent.

### 4.2 — Rotation d'un secret statique (mot de passe DB, identifiant RabbitMQ)

```bash
# 1) Écrire la nouvelle version dans Vault (KV v2 — l'ancienne reste accessible par version)
vault kv put secret/nina-aes/identity-service \
  DATABASE_URL='postgresql://nina:NOUVEAU_MDP@postgresql.infra.svc:5432/nina'

# 2a) Chemin ESO (⏳ Phase 2) : l'ExternalSecret resynchronise selon son refreshInterval.
#     Forcer la resync immédiate :
kubectl annotate externalsecret identity-service -n nina-aes \
  force-sync=$(date +%s) --overwrite

# 2b) Chemin Sealed Secrets (✅ V1) : re-sceller puis commit + upgrade
kubectl create secret generic identity-service-secret \
  --from-literal=DATABASE_URL='postgresql://nina:NOUVEAU_MDP@postgresql.infra.svc:5432/nina' \
  --dry-run=client -o yaml \
  | kubeseal --controller-namespace kube-system --controller-name sealed-secrets -o yaml \
  > infrastructure/helm/nina-aes/secrets/identity-service-sealed.yaml
git add infrastructure/helm/nina-aes/secrets/identity-service-sealed.yaml   # safe : chiffré

# 3) Recharger les pods SANS downtime (rolling restart, maxUnavailable:0 garde le service up)
kubectl rollout restart deployment/identity-service -n nina-aes
kubectl rollout status  deployment/identity-service -n nina-aes

# 4) VÉRIFIER puis révoquer l'ancien côté Postgres une fois la bascule confirmée
kubectl logs deploy/identity-service -n nina-aes | grep -i "database connected"
```

> 💡 **Pourquoi `rollout restart` et pas `delete pod`** : `rollout restart` respecte
> `maxSurge/maxUnavailable` et le PDB → il remplace les pods **un par un**, jamais de trou de
> service. `kubectl delete pod` brutal peut faire tomber sous `minAvailable`.

### 4.3 — Rotation des credentials DB dynamiques (idéal — TTL court)

> ⏳ **Phase 2** : faire émettre les credentials Postgres par le **moteur Vault `database`**. Chaque
> pod reçoit un user/password **éphémère** (TTL ex. 1 h) via ESO ; Vault **révoque automatiquement**
> à expiration. La rotation devient **continue et transparente** — plus de mot de passe statique à
> tourner manuellement. C'est la cible.

### 4.4 — Rotation de la clé de signature JWT (auth-service) — 🔒 cas sensible

> 🔒 **CANON** : les jetons d'auth sont **signés** (pas chiffrés). Selon l'algorithme retenu côté
> `auth-service` :
>
> - **EdDSA / Ed25519** → la clé vit **in-process** (`@noble/ed25519`), Vault Transit ne peut PAS la
>   gérer (ADR-026). La clé privée est stockée comme secret Vault KV et chargée par le pod.
> - **RS256** → signature délégable à Vault Transit (`rsa-2048/4096`) si souhaité.
>
> Dans **tous** les cas, la rotation passe par un **JWKS multi-clés** : on publie l'ancienne **et**
> la nouvelle clé publique pendant la durée de vie maximale d'un jeton, sinon tous les jetons en
> cours sont invalidés d'un coup (déconnexion massive des citoyens).

```bash
# 1) Générer la nouvelle paire et l'ajouter au JWKS (kid distinct) — ancien kid CONSERVÉ
vault kv patch secret/nina-aes/auth-service JWT_SIGNING_KEY_NEXT=@new-ed25519.key

# 2) Recharger auth-service : il signe désormais avec le nouveau kid, mais VALIDE encore l'ancien
kubectl rollout restart deployment/auth-service -n nina-aes

# 3) ATTENDRE l'expiration du jeton le plus long (ex. refresh token 7 j) AVANT de retirer l'ancien kid
#    → fenêtre de chevauchement obligatoire (sinon invalidation massive).

# 4) Retirer l'ancien kid du JWKS puis recharger
vault kv patch secret/nina-aes/auth-service JWT_SIGNING_KEY=@new-ed25519.key
kubectl rollout restart deployment/auth-service -n nina-aes
```

> ⚠️ Ne **jamais** révoquer l'ancien `kid` avant l'expiration du jeton le plus long encore en
> circulation. Le JWKS multi-`kid` est précisément le mécanisme qui rend la rotation **non
> disruptive**.

### 4.5 — Rotation sur incident (secret suspecté compromis)

> Si une fuite est suspectée, on **n'attend pas** la fenêtre de chevauchement : on révoque
> immédiatement, on accepte la micro-coupure, et on bascule. La sécurité prime sur la continuité.
> Renvoyer au [`SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md) pour la procédure d'incident
> de sécurité complète (confinement, forensic, notification).

---

## 5. Gestion des certificats (PKI Vault + renouvellement)

Deux chaînes de confiance distinctes, gérées par cert-manager (doc 20 §4.2) :

| Surface                                   | Issuer             | Autorité                                              | Renouvellement       |
| ----------------------------------------- | ------------------ | ----------------------------------------------------- | -------------------- |
| Certs **publics** (`*.nina-aes.uqar.ca`)  | `letsencrypt-prod` | Let's Encrypt via acme-dns souverain (PAS Cloudflare) | auto, ~60 j de marge |
| Certs **internes** est-ouest (mesh, pods) | `vault-issuer`     | 🔒 **PKI Vault** (AC interne CTDEC, ADR-034)          | auto, TTL court      |

> **POURQUOI deux issuers** : un certificat public vu par le citoyen doit être reconnu par les
> navigateurs (Let's Encrypt). Un certificat interne entre pods n'a **aucune raison** de sortir vers
> une AC publique — il est émis par **notre PKI Vault souveraine**, ce qui évite de divulguer la
> topologie interne et garde le contrôle entièrement on-premise.

### 5.1 — Surveiller l'expiration

> **POURQUOI** : un cert expiré = panne TLS = service injoignable. cert-manager renouvelle
> automatiquement, mais on **vérifie** (le renouvellement auto peut échouer silencieusement si
> l'ACME ou Vault est injoignable).

```bash
kubectl get certificate -A     # READY=True + colonne EXPIRATION ; tout False ou expiration < 30 j = alerte
kubectl describe certificate api-nina-aes-tls -n nina-aes   # events de renouvellement
kubectl get certificaterequest,order,challenge -A           # diagnostiquer un renouvellement bloqué
```

> ⏳ **Phase 2** : alerte Prometheus/Alertmanager sur
> `certmanager_certificate_expiration_timestamp_seconds` < 14 j (cf. doc 17). En V1, vérification
> manuelle au tour de garde.

### 5.2 — Forcer le renouvellement d'un cert public bloqué

> **QUAND** : un cert reste `Pending`/`False` (DNS-01 échoue : acme-dns injoignable ou délégation NS
> `_acme-challenge` cassée).

```bash
# Diagnostiquer le challenge DNS-01 (acme-dns souverain, PAS Cloudflare)
kubectl describe challenge -n nina-aes
# → vérifier que le TXT _acme-challenge.nina-aes.uqar.ca est bien posé sur acme-dns CTDEC

# Forcer un nouveau cycle d'émission : supprimer le Certificate, cert-manager le recrée
kubectl delete certificate api-nina-aes-tls -n nina-aes
kubectl get certificate api-nina-aes-tls -n nina-aes -w     # attendre READY=True
```

> ⚠️ **Rate-limit Let's Encrypt** : 5 échecs/heure et ~50 certs/domaine/semaine. En cas de boucle
> d'échec, **tester d'abord sur `letsencrypt-staging`** (quota large) avant de cramer le quota prod.
> Ne pas supprimer/recréer le cert en boucle.

### 5.3 — Renouveler / vérifier les certs internes PKI Vault — 🔒

> Les certs `vault-issuer` ont un **TTL court** (rotation fréquente = surface réduite) et sont
> renouvelés automatiquement par cert-manager via l'auth Kubernetes (rôle `cert-manager`, lease
> court — **pas de VAULT_TOKEN**).

```bash
# Vérifier que cert-manager peut encore s'authentifier auprès de Vault (rôle K8s SA)
kubectl logs -n cert-manager deploy/cert-manager | grep -i vault

# Inspecter / forcer le renouvellement d'un cert interne
kubectl get certificate -n nina-aes -l issuer=vault-issuer
kubectl delete certificate <cert-interne> -n nina-aes   # cert-manager le ré-émet via pki_int/sign
```

> 🔒 **Rotation de la CA intermédiaire Vault** (`pki_int`) — ⏳ **Phase 2** : opération rare et
> sensible. Émettre une nouvelle intermédiaire **avant** d'expirer l'ancienne (chevauchement des
> bundles CA dans `caBundle`), recharger les consommateurs, puis retirer l'ancienne. Même logique de
> chevauchement que pour les secrets (§4.1). La CA **racine** CTDEC reste hors-ligne (cold).

> ⚠️ **Cohérence mesh Linkerd** : les certs de mTLS du mesh ont leur propre rotation
> (`linkerd identity`). Ne pas confondre avec les certs d'application `vault-issuer`. Vérifier la
> validité de l'identité mesh : `linkerd check --proxy`.

---

## 6. Mise à jour des images (digest + cosign verify)

> **POURQUOI** : deux garanties **indépendantes et complémentaires** protègent ce qui s'exécute dans
> le cluster :
>
> 1. **Digest pinning** (`@sha256:…`) → **immuabilité** : on exécute exactement le binaire audité,
>    un re-push de la même balise ne change rien (doc 20 §4.3).
> 2. **cosign verify** (Kyverno, admission) → **provenance** : seule une image **signée par notre
>    clé cosign souveraine** est admise (doc 20 §4.7bis). Un attaquant qui pousse sur GHCR sans la
>    clé privée est **refusé à l'admission**.
>
> 🔒 **Souveraineté** : signature par **clé cosign** (privée dans Vault/CI), **PAS** keyless
> Fulcio/Rekor (OIDC Sigstore = dépendance SaaS US, `ignoreTlog: true`). Cf. ADR-034.

### 6.1 — Procédure de mise à jour d'image

```bash
# 1) Résoudre le digest immuable du tag qu'on veut déployer (ne JAMAIS déployer un tag mutable seul)
crane digest ghcr.io/nina-aes/identity-service:v1.4.0
# → sha256:abc123...

# 2) VÉRIFIER la signature cosign AVANT de déployer (même contrôle que Kyverno fera à l'admission)
cosign verify \
  --key vault://transit/cosign-public \
  --insecure-ignore-tlog=true \
  ghcr.io/nina-aes/identity-service@sha256:abc123...
# → la sortie liste le payload signé ; un échec ici = NE PAS déployer

# 3) Déployer par digest (pas par tag) via les values
helm upgrade nina-aes infrastructure/helm/nina-aes/ \
  -n nina-aes --values infrastructure/helm/nina-aes/values-production.yaml \
  --set image.tag=v1.4.0 \
  --set image.digest=sha256:abc123... \
  --atomic --timeout 15m
# Pour identity-service, l'upgrade déclenche le blue-green Argo (preview → analyse → promotion §2.2)
```

> ⚠️ Si Kyverno **refuse** un pod (`failed to verify image signature`), c'est que l'image n'est pas
> signée ou que `.Values.cosign.publicKey` ne correspond pas. **Ne pas contourner la policy** (ne
> jamais passer Kyverno en `Audit` pour « débloquer ») — corriger la signature côté CI. Voir
> `kubectl get policyreport -A`.

> ⏳ **Phase 2** : génération de la paire cosign en CI, `cosign sign` après `docker push` GHCR, clé
> privée dans Vault. En V1, la policy Kyverno est définie mais la signature CI reste à câbler (doc
> 20 §4.7bis).

### 6.2 — Vérifier ce qui tourne réellement

```bash
# Lister les digests réellement servis (preuve de l'immuabilité)
kubectl get pods -n nina-aes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[*].imageID}{"\n"}{end}'
```

---

## 7. Gestion d'un incident de production

> **POURQUOI** : sous incident, on suit une boucle disciplinée — **Détecter → Trier → Mitiger →
> Diagnostiquer → Résoudre → Post-mortem**. On **mitige avant de comprendre** (rétablir le service
> d'abord, expliquer ensuite).
>
> 🔒 **Distinguer incident de prod (ce §) et incident de sécurité.** Suspicion de compromission,
> fuite de secret, accès non autorisé → basculer immédiatement sur le
> [`SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md) et le
> [`THREAT-MODEL.md`](../security/THREAT-MODEL.md).

### 7.1 — Sévérités et délais de réaction

| Sév.     | Définition                                                   | Réaction      | Mitigation par défaut        |
| -------- | ------------------------------------------------------------ | ------------- | ---------------------------- |
| **SEV1** | Service citoyen indisponible (identity/auth down, TLS cassé) | immédiate     | rollback (§2)                |
| **SEV2** | Dégradation forte (latence p95 ↑, 5xx partiels, 1 svc down)  | < 30 min      | scale (§3) ou rollback ciblé |
| **SEV3** | Anomalie sans impact citoyen (HPA flappy, cert J-14)         | tour de garde | corriger à froid             |

### 7.2 — Boucle d'incident

```bash
# DÉTECTER / TRIER — d'où vient la panne ?
kubectl get pods -A | grep -Ev 'Running|Completed'      # pods non sains
kubectl get events -A --sort-by=.lastTimestamp | tail -n 40
# Grafana (doc 17) : dashboards latence/erreurs ; Loki : logs ; Tempo : traces de la requête fautive

# DIAGNOSTIQUER un pod
kubectl describe pod <name> -n nina-aes                 # events : OOMKilled, ProbeFailed, FailedScheduling
kubectl logs <name> -n nina-aes --previous              # logs du conteneur AVANT son dernier crash
kubectl exec -it <name> -n nina-aes -- /bin/sh          # shell (si readOnlyRootFilesystem, /tmp seul writable)

# MITIGER — rétablir vite (choisir selon la cause)
helm rollback nina-aes <REV> -n nina-aes --wait         # régression d'un upgrade → §2.1
kubectl argo rollouts abort identity-service -n nina-aes # mauvaise preview identity → §2.2
kubectl rollout restart deployment/<svc> -n nina-aes    # état corrompu en mémoire / fuite
kubectl patch hpa <svc> -n nina-aes --type merge -p '{"spec":{"maxReplicas":12}}'  # saturation → §3
```

### 7.3 — Pannes fréquentes et premier réflexe

| Symptôme                                   | Cause probable                         | Premier réflexe                                                    |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| `CrashLoopBackOff`                         | crash au boot (config/secret manquant) | `logs --previous` ; vérifier ConfigMap/Secret                      |
| `ImagePullBackOff`                         | GHCR privé sans `imagePullSecret`      | créer/vérifier le Secret `ghcr-creds`                              |
| `OOMKilled` répété                         | limit mémoire trop basse               | `kubectl top pod` puis scaling vertical (§3.3)                     |
| 5xx généralisés après upgrade              | régression de release                  | rollback Helm (§2.1)                                               |
| TLS cassé / cert expiré                    | renouvellement cert-manager échoué     | §5.2 (public) ou §5.3 (interne Vault)                              |
| `failed to verify image signature`         | Kyverno refuse une image non signée    | signer côté CI ; **ne pas désactiver la policy** (§6)              |
| `violates PodSecurity "restricted"`        | PSA enforce=restricted (doc 20 §4.4)   | corriger le `securityContext` (pas la policy)                      |
| TLS handshake fail entre pods              | sidecar Linkerd non injecté            | annoter le ns + restart ; `linkerd check --proxy`                  |
| default-deny ne bloque rien (probe répond) | CNI Flannel actif au lieu de Calico    | réinstaller K3s `--flannel-backend=none` + Calico (doc 20 §4.1bis) |
| pod `Pending` `0/n nodes`                  | ressources insuffisantes               | ajuster requests ou ajouter un nœud (§3.3)                         |

### 7.4 — Audit & traçabilité pendant l'incident — 🔒

> 🔒 L'audit (ADR-007) est une **hash-chain SHA-256 linéaire** scellée Ed25519. Pendant un incident,
> **ne JAMAIS** tenter de « réparer » ou supprimer des entrées d'audit : la chaîne est append-only
> et toute altération casse la vérification de la racine ancrée chez le tiers (OCLEI). En cas de
> doute sur l'intégrité, lancer la **vérification de chaîne** (procédure dans le
> `SECURITY-RUNBOOK.md`) et escalader — ne pas écraser.

### 7.5 — Post-mortem (obligatoire SEV1/SEV2)

> ⏳ Rédiger un post-mortem **sans blâme** dans les 48 h : timeline, cause racine, impact citoyen,
> actions correctives (avec tickets). Lier au CHANGELOG. C'est ce qui transforme un incident en
> amélioration durable du runbook.

---

## 8. Checklist de garde (tour d'astreinte)

> **POURQUOI** : une checklist répétable détecte les dérives **avant** qu'elles ne deviennent des
> SEV1. À dérouler au **début de chaque tour de garde** et après tout déploiement.

### 8.1 — Début de garde (santé)

- [ ] `kubectl get pods -A` — tous `Running`/`Completed`, aucun `CrashLoop`/`ImagePull`/`OOMKilled`.
- [ ] `kubectl get rollouts -n nina-aes` — `identity-service` `Healthy` (pas de preview bloquée).
- [ ] `helm list -A` — release `nina-aes` `deployed` (pas `failed`/`pending-upgrade`).
- [ ] `kubectl top nodes` — aucun nœud > 85 % CPU/mémoire soutenu.
- [ ] `kubectl get hpa -n nina-aes` — replicas dans les bornes, pas collé au `maxReplicas`.
- [ ] Grafana (doc 17) — latence p95 et taux d'erreur 5xx dans les seuils ; aucune alerte
      Alertmanager active.

### 8.2 — Sécurité & conformité

- [ ] `kubectl get certificate -A` — tous `READY=True`, aucune expiration < 30 j (public) / TTL
      interne nominal.
- [ ] 🔒 Kyverno `Enforce` actif : `kubectl get cpol verify-nina-aes-images` → `Ready` ; aucun
      `policyreport` en violation.
- [ ] 🔒 PSA `enforce=restricted` toujours présent sur le ns `nina-aes`
      (`kubectl get ns nina-aes -o jsonpath='{.metadata.labels}'`).
- [ ] 🔒 NetworkPolicy intactes : `default-deny-all` + allows ciblés présents
      (`kubectl get netpol -n nina-aes`) ; test timeout default-deny toujours probant (doc 20
      §4.1bis).
- [ ] 🔒 Mesh mTLS : `linkerd check --proxy` vert (identités valides, certs mesh non expirés).
- [ ] 🔒 Aucun secret en clair : `gitleaks detect` propre ; aucun `VAULT_TOKEN` long-lived dans un
      manifest.
- [ ] 🔒 Vault `unsealed` et `cert-manager`/ESO s'y authentifient (lease court, auth K8s).

### 8.3 — Continuité (backup / DR)

- [ ] Backups récents OK (doc 19) : dernier dump DB < 24 h, Velero snapshot K8s récent.
- [ ] 🔒 Vérification d'intégrité de la chaîne d'audit (ADR-007) au vert ; racine ancrée chez le
      tiers à jour (cf. `SECURITY-RUNBOOK.md`).
- [ ] Drill rollback mensuel exécuté ce mois-ci, **RTO mesuré < 1 min** (§2.3).

### 8.4 — Après chaque déploiement

- [ ] Smoke test post-install Helm vert (`/health` backends, `/api/health` frontends).
- [ ] Si `identity-service` : `AnalysisTemplate` pre-promotion vert **avant** `promote` (§2.2).
- [ ] Images servies par **digest** (`@sha256:…`), pas par tag mutable (§6.2).
- [ ] Pas de régression sur Grafana 15 min après bascule ; révision Helm précédente notée pour
      rollback (§2.1).

---

## 9. Références croisées

| Doc                                                                            | Ce qu'on y trouve                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [`docs/20-DEPLOYMENT-K3S-PRODUCTION.md`](../20-DEPLOYMENT-K3S-PRODUCTION.md)   | Déploiement initial (chart, CNI, cert-manager, Argo, Kyverno) — **parent de ce runbook**        |
| `docs/deployment/UPGRADE-GUIDE.md` ⏳ _(doc prévu, Phase 2 — non encore créé)_ | Montée de version inter-Bloc, migrations DB compatibles N-1                                     |
| [`docs/security/SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md)         | Incident **de sécurité** (compromission, fuite, audit chain)                                    |
| [`docs/security/THREAT-MODEL.md`](../security/THREAT-MODEL.md)                 | Modèle de menace — surfaces et contre-mesures                                                   |
| Doc 17 (observabilité)                                                         | Grafana/Loki/Tempo/Alertmanager — détection des incidents                                       |
| Doc 19 (backup/restore)                                                        | Sauvegarde DB + Velero — base du DR                                                             |
| ADR-007 / ADR-020 / ADR-026 / ADR-034                                          | Audit hash-chain ; déploiement K3s ; Vault Transit≠Ed25519 ; sécurité (PKI Vault, cosign, mTLS) |

---

_Document OPS-RUNBOOK — Version 1.0 — Juin 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Complète
`docs/20-DEPLOYMENT-K3S-PRODUCTION.md` §4.9 — respecte le CANON crypto (ADR-007/026/034)._
