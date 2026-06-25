# 20 — Déploiement production K3s (Helm charts + Ingress Nginx + cert-manager + rolling/blue-green)

> **Bloc concerné** : Transversal (clôture des docs 15 → 20) — déploiement du Bloc A complet sur
> cluster K3s on-premise CTDEC. **Prérequis** : documents 00 → 19 complétés ; images Docker des 11
> services présentes sur GHCR (cf. doc 16) ; observabilité doc 17 et backup doc 19 prêts à
> instrumenter le cluster. **Durée estimée** : 14 à 20 heures pour un étudiant seul. **Livrables de
> cette étape** :
>
> - **Cluster K3s 1.33** opérationnel : 1 control-plane + 2 agents (poste local en V1 ; 3 VMs CTDEC
>   en V2)
> - **Helm chart umbrella `nina-aes`** dans `infrastructure/helm/nina-aes/` qui orchestre 11
>   microservices + 3 frontends + infrastructure deps
> - **Ingress Nginx 4.12** comme reverse proxy unique
> - **cert-manager 1.18** : ClusterIssuer Let's Encrypt (DNS-01 via **acme-dns souverain**, PAS
>   Cloudflare) pour les certs publics + ClusterIssuer **PKI Vault** (ADR-034) pour les certs
>   internes est-ouest — certs auto-renouvelés
> - **3 namespaces** : `nina-aes` (services métier), `observability` (LGTM, cf. doc 17), `infra`
>   (Postgres, Redis, RabbitMQ, MinIO, Vault, Keycloak)
> - **NetworkPolicy** restrictives : default-deny + allow ciblé entre namespaces
> - **Pod Security Admission (PSA)** : label `enforce=restricted` sur `nina-aes` (PodSecurityPolicy
>   est supprimée depuis K8s 1.25 — on utilise PSA, natif sur K3s 1.33)
> - **Resources limits + requests** documentés par service
> - **Stratégies de déploiement** :
>   - `RollingUpdate` (défaut) pour les services stateless (citizen, admin, identity, auth, audit,
>     etc.) — `maxSurge: 25%`, `maxUnavailable: 0`
>   - `Blue-Green` pour `identity-service` (zéro downtime sur le service le plus critique) via Argo
>     Rollouts 1.8 ou stratégie manuelle
> - **Smoke tests post-deploy** automatiques (Helm hooks `post-install`)
> - **HorizontalPodAutoscaler (HPA)** : CPU/memory + métriques custom Prometheus (cf. doc 17)
> - **Staging + Production** : 2 environments séparés via Helm values `staging.yaml` et
>   `production.yaml`
> - **Runbook ops** : `docs/deployment/OPS-RUNBOOK.md`
> - `docs/adr/ADR-020-deployment-k3s-production.md`

---

## 1. Objectif pédagogique

Un microservice qui marche en `docker compose up` sur le poste de l'étudiant n'est **pas** un
microservice en production. Le passage à K3s impose 5 disciplines :

1. **Configuration externalisée** : aucun secret en image Docker, tout dans ConfigMaps (config
   non-sensible) + Secrets. Les Secrets K8s ne sont que du base64 ; on les protège soit via **Sealed
   Secrets** (chiffrés au repos par la clé du contrôleur, commitables — Étape 4.5), soit via
   **External Secrets Operator** qui les hydrate depuis **Vault** (chiffrement applicatif Vault
   Transit / `transit`, PAS un « KMS » cloud — souveraineté ADR-034).
2. **Tolérance aux pannes** : un pod doit pouvoir mourir sans impact (HPA replicas ≥ 2,
   PodDisruptionBudget min-available, readinessProbe stricte).
3. **Découplage temporel** : un service consommateur n'attend pas un service producteur — il retry
   avec backoff (cf. shared `@nina-aes/utils` retry helper).
4. **Observabilité bout-en-bout** : chaque pod expose `/metrics` + envoie ses traces OTLP vers le
   Collector (doc 17).
5. **Rollback < 60 s** : `helm rollback nina-aes <REVISION>` doit ramener l'état précédent en moins
   d'1 min. Validé par drill mensuel.

> 💡 **Pourquoi K3s et pas K8s vanilla ?** K3s est conçu pour on-premise / edge : 1 binaire Go (~60
> MB), SQLite par défaut (option etcd pour HA), pas de cloud-controller-manager nécessaire. Idéal
> pour un déploiement CTDEC sans dépendance cloud. ADR-020 documente le choix.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                           | Version        | Rôle                                                                    |
| ----------------------------------- | -------------- | ----------------------------------------------------------------------- |
| **K3s**                             | `v1.33.4+k3s1` | Distribution K8s légère on-premise                                      |
| **Helm**                            | `3.16.4`       | Package manager K8s                                                     |
| **Helmfile** (optionnel)            | `0.169`        | Déclaratif multi-environment (au lieu de bash scripts)                  |
| **Ingress Nginx**                   | `4.12.0`       | Reverse proxy + TLS termination                                         |
| **cert-manager**                    | `1.18.0`       | Émission/renouvellement certs Let's Encrypt                             |
| **Argo Rollouts**                   | `1.8.0`        | Blue-green + canary pour `identity-service`                             |
| **Sealed Secrets**                  | `0.27.0`       | Secrets chiffrés commitable dans Git                                    |
| **External Secrets Operator**       | `0.10.x`       | Pull secrets depuis Vault → K8s Secret (alternative)                    |
| **Prometheus operator (kube-prom)** | `0.78.0`       | CRDs `ServiceMonitor` + `PodMonitor` (cf. doc 17)                       |
| **Velero**                          | `1.16.x`       | Backup K8s manifests + PV snapshots (complète doc 19)                   |
| **MetalLB** (optionnel)             | `0.14.x`       | LoadBalancer on-premise (au lieu de cloud LB)                           |
| **Calico**                          | `3.28.x`       | **CNI NetworkPolicy (requis)** — installé AVANT le chart (Étape 4.1bis) |
| **Cilium** (optionnel)              | `1.17.x`       | CNI avancé avec eBPF NetworkPolicy L7 (P2, alternative Calico)          |
| **Kyverno**                         | `3.2.x`        | Admission policies — cosign verify + digest pinning (ADR-034)           |
| **acme-dns** (souverain)            | `1.0`          | Serveur DNS-01 auto-hébergé CTDEC (remplace Cloudflare)                 |
| **Linkerd**                         | `2.16.x`       | Service mesh mTLS strict est-ouest (ADR-034, cf. doc 15)                |

> 🔒 Tous open-source / souverains. K3s est CNCF (Rancher / SUSE EU).

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_K3sDeployment
title Déploiement K3s NINA-AES — topologie cible

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle  { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database   { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud      { BackgroundColor #ECFDF5; BorderColor #059669 }

cloud "Internet" as Internet

rectangle "Ingress Nginx 4.12\n(TLS termination)" as Ingress {
}

cloud "Cluster K3s 1.33 — DC CTDEC Bamako" {
  rectangle "ns: nina-aes (services métier)" #DBEAFE {
    rectangle "citizen\n(:4001)" as Citizen
    rectangle "admin\n(:4002)" as Admin
    rectangle "governance\n(:4003)" as Gov
    rectangle "identity-service\n(:3001)\n[Argo Rollouts]" as Identity
    rectangle "auth-service\n(:3002)" as Auth
    rectangle "audit-service\n(:3007)" as Audit
    rectangle "ai-service\n(:3003)" as AI
    rectangle "anticorruption-service\n(:3009)" as SIGAC
    rectangle "+ 7 autres microservices" as Others
  }

  rectangle "ns: infra" #FEE2E2 {
    database "PostgreSQL 18 + PostGIS" as PG
    database "Redis 8.6" as Redis
    rectangle "RabbitMQ 4.2" as RMQ
    rectangle "MinIO" as MinIO
    rectangle "HashiCorp Vault 1.20" as Vault
    rectangle "Keycloak 26.5" as KC
  }

  rectangle "ns: observability\n(cf. doc 17)" #FEF3C7 as Obs {
    rectangle "Prometheus + Grafana\n+ Loki + Tempo\n+ Alertmanager"
  }

  rectangle "ns: cert-manager + ingress-nginx" #ECFDF5 as System {
    rectangle "cert-manager 1.18\n+ ClusterIssuer LE"
    rectangle "Argo Rollouts 1.8"
    rectangle "Sealed Secrets 0.27"
  }
}

Internet --> Ingress : HTTPS :443
Ingress --> Citizen   : citizen.nina-aes.uqar.ca
Ingress --> Admin     : admin.nina-aes.uqar.ca
Ingress --> Gov       : governance.nina-aes.uqar.ca
Ingress --> Identity  : api.nina-aes.uqar.ca/v1/citizens
Ingress --> Auth      : api.nina-aes.uqar.ca/v1/auth
Ingress --> Audit     : api.nina-aes.uqar.ca/v1/audit

Citizen --> Identity : NetworkPolicy allow
Citizen --> Auth     : NetworkPolicy allow
Admin --> Identity
Admin --> SIGAC
Identity --> PG      : Prisma via DATABASE_URL
Identity --> Redis   : cache + sessions
Auth --> KC          : OIDC delegate
Audit --> PG         : append-only writes
AI --> PG            : queries readonly
SIGAC --> PG         : chiffré (Vault Transit)

Identity ..> Obs : OTel SDK → Collector
AI       ..> Obs
SIGAC    ..> Obs

note bottom of Identity
  Argo Rollouts blue-green :
  v1 (stable) ← traffic 100%
  v2 (preview) ← traffic 0%
  Promotion manuelle après
  smoke test OK.
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Installer K3s sur le poste de travail (dev) puis VMs (prod)

**Pourquoi** : K3s est self-contained — pas besoin de provisionner etcd séparé, pas besoin de
cloud-controller-manager. Idéal pour CTDEC.

```bash
# Sur le control-plane (1 nœud V1, 3 en V2 HA mode)
# Drapeaux réseau (commentés ci-dessous, hors de la commande pour ne pas casser le `\`) :
#   --disable=traefik         → on installe ingress-nginx à la place
#   --flannel-backend=none    → ⚠️ on désactive Flannel : il n'applique PAS les NetworkPolicy
#   --disable-network-policy  → on délègue tout le réseau au CNI Calico/Cilium (cf. Étape 4.1bis)
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.33.4+k3s1 \
  K3S_TOKEN=$(openssl rand -hex 32) \
  sh -s - server \
    --cluster-init \
    --tls-san=k3s.nina-aes.uqar.ca \
    --write-kubeconfig-mode=0640 \
    --disable=traefik \
    --flannel-backend=none \
    --disable-network-policy

# Récupérer le kubeconfig
sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/config
sed -i "s/127.0.0.1/k3s.nina-aes.uqar.ca/" ~/.kube/config

# Sur les agents (V2 HA)
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.33.4+k3s1 \
  K3S_URL=https://k3s.nina-aes.uqar.ca:6443 \
  K3S_TOKEN=<token-cluster> \
  sh -

# Vérifier
kubectl get nodes
# NAME              STATUS   ROLES                  AGE   VERSION
# k3s-master-01     Ready    control-plane,master   2m    v1.33.4+k3s1
```

**Pré-requis hôtes** :

- Ubuntu 24.04 LTS minimal (server, sans desktop)
- CPU 4 cores, RAM 8 GB, disque 100 GB SSD minimum par nœud
- Réseau : VLAN dédié `nina-aes-prod` (192.168.42.0/24 en V1)
- Firewall : ports 6443 (API), 10250 (kubelet), 179 (Calico BGP) ou 8472 (VXLAN) ouverts entre
  nœuds. **Note** : Flannel étant désactivé (`--flannel-backend=none`), le port VXLAN 8472 n'est
  utile que si le CNI choisi reste en mode overlay VXLAN.

---

### Étape 4.1bis — Installer le CNI (Calico) AVANT tout le reste

> ⚠️ **Ordre critique zero-trust.** K3s livre Flannel par défaut, qui **n'implémente pas** les
> `NetworkPolicy`. Si on déploie le chart `nina-aes` (qui contient `default-deny-all`) sur Flannel,
> la policy est **inerte** : elle est acceptée par l'API server mais **aucun paquet n'est filtré** —
> on croit être en zero-trust alors que tout le trafic est ouvert. Le CNI doit donc être installé
> **avant** le chart, sinon le default-deny donne une fausse assurance de sécurité.

**Pourquoi Calico ici** : mature, léger, applique nativement les `NetworkPolicy` K8s (L3/L4). Cilium
(eBPF, NetworkPolicy L7) reste l'option P2 documentée §10 ; le choix est tracé dans ADR-020.

```bash
# 1) Installer l'opérateur Tigera (Calico)
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/tigera-operator.yaml

# 2) Installer Calico en pinnant le CIDR pods K3s (défaut 10.42.0.0/16)
kubectl apply -f - <<'EOF'
apiVersion: operator.tigera.io/v1
kind: Installation
metadata: { name: default }
spec:
  calicoNetwork:
    ipPools:
      - cidr: 10.42.0.0/16
        encapsulation: VXLANCrossSubnet
EOF

# 3) Attendre que Calico soit Ready AVANT d'installer le chart
kubectl -n calico-system rollout status ds/calico-node --timeout=180s

# 4) Smoke test : prouver que le default-deny mord vraiment (cf. Étape 4.4)
#    Sans CNI compatible, le test ci-dessous PASSERAIT (trafic non filtré) = drapeau rouge.
```

> 💡 **Vérification anti-fausse-assurance** : après avoir appliqué `default-deny-all` (Étape 4.4),
> lancer `kubectl run probe --rm -it --image=curlimages/curl -- curl -m3 identity-service:3001` doit
> **timeout** (trafic bloqué). Si ça répond, le CNI n'applique pas les NetworkPolicy → STOP.

---

### Étape 4.2 — Installer Ingress Nginx + cert-manager

```bash
# Ingress Nginx (mode hostNetwork pour bare-metal)
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --version 4.12.0 \
  --set controller.hostNetwork=true \
  --set controller.dnsPolicy=ClusterFirstWithHostNet \
  --set controller.kind=DaemonSet \
  --set controller.service.type=ClusterIP

# cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --version v1.18.0 \
  --set installCRDs=true
```

**Fichier(s) à créer** : `infrastructure/k8s/cert-manager/cluster-issuer.yaml`

> 🔒 **Souveraineté (ADR-034)** : on N'utilise PAS le solver Cloudflare (SaaS US — le token CF donne
> à un tiers américain le contrôle DNS du domaine régalien). Deux émetteurs distincts selon la
> surface :
>
> 1. **Certs PUBLICS** (`*.nina-aes.uqar.ca`, vus par les citoyens) → Let's Encrypt via **acme-dns
>    souverain auto-hébergé** (délégation NS de `_acme-challenge.nina-aes.uqar.ca` vers un serveur
>    acme-dns CTDEC). Le DNS-01 reste obligatoire pour les wildcards (HTTP-01 ne les gère pas).
> 2. **Certs INTERNES** (trafic est-ouest entre pods, mesh, endpoints non exposés) → **PKI Vault**
>    (`vault-issuer`), pas d'autorité externe du tout. C'est l'AC interne CTDEC d'ADR-034.

```yaml
# ── 1) Certs PUBLICS : Let's Encrypt + acme-dns souverain (PAS Cloudflare) ──
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@nina-aes.uqar.ca
    privateKeySecretRef: { name: letsencrypt-prod-key }
    solvers:
      - dns01:
          # acme-dns : micro-serveur DNS souverain hébergé au CTDEC. cert-manager y pousse
          # le TXT _acme-challenge via l'API acme-dns. Aucun SaaS tiers, aucune clé hors AES.
          acmeDNS:
            host: https://acme-dns.nina-aes.uqar.ca
            accountSecretRef: { name: acme-dns-credentials, key: acmedns.json }
        selector:
          dnsZones: ['nina-aes.uqar.ca']
---
# Issuer staging (pour les tests, quota LE plus large) — même solver souverain
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ops@nina-aes.uqar.ca
    privateKeySecretRef: { name: letsencrypt-staging-key }
    solvers:
      - dns01:
          acmeDNS:
            host: https://acme-dns.nina-aes.uqar.ca
            accountSecretRef: { name: acme-dns-credentials, key: acmedns.json }
---
# ── 2) Certs INTERNES : PKI Vault (AC souveraine CTDEC, ADR-034) ──
# Émet les certs est-ouest sans jamais sortir vers une AC publique.
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: vault-issuer
spec:
  vault:
    server: https://vault.infra.svc:8200
    path: pki_int/sign/nina-aes-internal # rôle PKI intermédiaire Vault
    caBundle: { { .Values.vault.caBundleB64 } } # CA racine CTDEC (base64), pas une CA publique
    auth:
      # Auth Kubernetes : ServiceAccount + lease court, JAMAIS de VAULT_TOKEN long-lived.
      kubernetes:
        role: cert-manager
        mountPath: /v1/auth/kubernetes
        serviceAccountRef: { name: cert-manager }
```

> 💡 **acme-dns** : on délègue UNIQUEMENT le sous-domaine `_acme-challenge.nina-aes.uqar.ca` (record
> NS pointant vers acme-dns), pas la zone entière — surface minimale. Le compte acme-dns
> (`acmedns.json`) est scellé via Sealed Secrets (Étape 4.5), pas en clair.
>
> ⏳ **À implémenter en Phase 2** : déploiement du pod acme-dns + montage `pki_int` Vault + rôle
> `cert-manager` côté Vault auth/kubernetes. Tracé dans ADR-034 (PKI Vault) et ADR-020.

---

### Étape 4.3 — Helm chart umbrella `nina-aes`

**Structure** :

```text
infrastructure/helm/nina-aes/
├── Chart.yaml
├── Chart.lock
├── values.yaml                          # défauts (= staging)
├── values-staging.yaml
├── values-production.yaml
├── charts/                              # sous-charts vendor (Postgres, Redis)
│   ├── postgresql-14.0.0.tgz
│   └── redis-19.0.0.tgz
├── templates/
│   ├── _helpers.tpl
│   ├── namespaces.yaml                    # labels PSA enforce=restricted + linkerd.io/inject
│   ├── policies/
│   │   └── verify-image-cosign.yaml       # Kyverno ClusterPolicy (cosign + digest, ADR-034)
│   ├── networkpolicies/
│   │   ├── default-deny.yaml
│   │   ├── allow-identity-to-postgres.yaml
│   │   └── allow-citizen-to-identity.yaml
│   ├── identity-service/
│   │   ├── deployment.yaml             # rollout via Argo (alt: deployment)
│   │   ├── service.yaml
│   │   ├── ingress.yaml
│   │   ├── hpa.yaml
│   │   ├── pdb.yaml
│   │   ├── serviceaccount.yaml
│   │   └── servicemonitor.yaml         # Prometheus operator CRD
│   ├── auth-service/  (idem)
│   ├── audit-service/ (idem)
│   ├── … 8 autres services
│   ├── citizen/ admin/ governance/     # 3 frontends Next.js
│   └── crds/
│       └── rollouts.yaml               # CRDs Argo
└── tests/
    └── test-connection.yaml             # Helm test post-install
```

**`Chart.yaml`** :

```yaml
apiVersion: v2
name: nina-aes
description: NINA-AES Platform — umbrella chart pour 11 microservices + 3 apps Next.js
type: application
version: 0.1.0
appVersion: '0.1.0'
dependencies:
  - name: postgresql
    version: 14.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: 19.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
  - name: rabbitmq
    version: 14.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: rabbitmq.enabled
```

**Template `identity-service/deployment.yaml`** (extrait) :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: identity-service
  namespace: nina-aes
  labels:
    app.kubernetes.io/name: identity-service
    app.kubernetes.io/part-of: nina-aes
spec:
  replicas: { { .Values.identityService.replicas | default 2 } }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }
  selector:
    matchLabels:
      app.kubernetes.io/name: identity-service
  template:
    metadata:
      labels:
        app.kubernetes.io/name: identity-service
        app.kubernetes.io/version: { { .Chart.AppVersion } }
        # ⚠️ version=stable est OBLIGATOIRE pour que l'AnalysisTemplate blue-green
        # puisse discriminer le trafic stable vs preview (cf. §4.6). Argo Rollouts
        # surcharge ce label à "preview" sur les pods du ReplicaSet en cours de test.
        version: stable
      annotations:
        prometheus.io/scrape: 'true'
        prometheus.io/port: '3001'
        prometheus.io/path: '/metrics'
        # Zero-trust mesh : injection automatique du sidecar Linkerd (mTLS strict, ADR-034).
        # Hérité du label de namespace, mais on l'expose ici pour les pods hors-namespace annoté.
        linkerd.io/inject: enabled
    spec:
      serviceAccountName: identity-service
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: identity-service
          # 🔒 Digest pinning (immuable). On NE référence PAS un tag mutable comme `:latest`
          # ou `:v1.2.3` : un attaquant qui repousse la même balise change le binaire exécuté.
          # `image.digest` est résolu en CI (cosign / crane) après le push GHCR. Le tag reste
          # à titre documentaire mais c'est le `@sha256:…` qui fait foi.
          # → cf. §4.10 (cosign verify en admission Kyverno) pour le contrôle de signature.
          image:
            ghcr.io/nina-aes/identity-service:{{ .Values.image.tag }}@{{ .Values.image.digest }}
          imagePullPolicy: IfNotPresent
          ports:
            - { name: http, containerPort: 3001 }
          envFrom:
            - configMapRef: { name: identity-service-config }
            - secretRef: { name: identity-service-secret }
          env:
            - name: SERVICE_NAME
              value: identity-service
            - name: ENV
              value: { { .Values.env } }
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: http://otel-collector.observability.svc:4317
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { cpu: 1000m, memory: 1Gi }
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /health/live, port: http }
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ['ALL'] }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - { name: tmp, emptyDir: { medium: Memory, sizeLimit: 100Mi } }
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: identity-service
```

**Template `identity-service/hpa.yaml`** :

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: identity-service
  namespace: nina-aes
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: identity-service
  minReplicas: { { .Values.identityService.minReplicas | default 2 } }
  maxReplicas: { { .Values.identityService.maxReplicas | default 6 } }
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
    - type: Resource
      resource: { name: memory, target: { type: Utilization, averageUtilization: 80 } }
    - type: Pods
      pods:
        metric: { name: http_request_duration_seconds_p95 }
        target: { type: AverageValue, averageValue: '500m' } # 500ms
```

**Template `identity-service/pdb.yaml`** :

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: identity-service, namespace: nina-aes }
spec:
  minAvailable: 1
  selector: { matchLabels: { app.kubernetes.io/name: identity-service } }
```

---

### Étape 4.4 — NetworkPolicy par défaut deny + allow ciblé

**Pourquoi** : pour zero-trust, un pod compromis ne doit pas pouvoir contacter ce qui n'a pas été
explicitement autorisé.

**Pré-requis — Namespaces durcis (PSA + mesh + label de sélection)** : avant les policies, les
namespaces doivent porter (a) le label `name:` que les `namespaceSelector` ci-dessous référencent,
(b) les labels **Pod Security Admission** `enforce=restricted` (refus à l'admission de tout pod
privilégié), (c) l'annotation d'injection Linkerd pour le mTLS strict (ADR-034).

```yaml
# infrastructure/helm/nina-aes/templates/namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nina-aes
  labels:
    name: nina-aes # ← référencé par les namespaceSelector des NetworkPolicy
    # 🔒 Pod Security Admission — niveau le plus strict, BLOQUANT à l'admission.
    # Refuse runAsRoot, hostPath, capabilities, privileged, hostNetwork, etc.
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
  annotations:
    # Tous les pods du namespace reçoivent le sidecar Linkerd (mTLS auto, ADR-034).
    linkerd.io/inject: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: infra
  labels:
    name: infra
    # `restricted` n'est PAS appliqué tel quel à infra : certaines images Bitnami (Postgres,
    # Redis) exigent encore un fsGroup/initContainer → niveau `baseline` enforce + `restricted`
    # en audit/warn pour suivre la dérive sans casser le démarrage. À durcir en Phase 2.
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
  annotations:
    linkerd.io/inject: enabled
---
# infrastructure/helm/nina-aes/templates/networkpolicies/default-deny.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-all, namespace: nina-aes }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  # Aucune règle ingress/egress = tout est bloqué par défaut
---
# Allow citizen frontend → identity-service
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-citizen-to-identity, namespace: nina-aes }
spec:
  podSelector: { matchLabels: { app.kubernetes.io/name: identity-service } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { app.kubernetes.io/name: citizen } }
        - podSelector: { matchLabels: { app.kubernetes.io/name: admin } }
      ports:
        - { protocol: TCP, port: 3001 }
---
# Allow identity-service → Postgres (cross-namespace)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-identity-to-postgres, namespace: infra }
spec:
  podSelector: { matchLabels: { app.kubernetes.io/name: postgresql } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { name: nina-aes } }
          podSelector: { matchLabels: { app.kubernetes.io/name: identity-service } }
      ports: [{ protocol: TCP, port: 5432 }]
---
# ── ⚠️ EGRESS obligatoire ── default-deny-all ferme AUSSI l'egress ([Ingress, Egress]).
# Sans règle egress, identity-service ne peut NI résoudre le DNS NI joindre Postgres/Redis/
# RabbitMQ/OTEL → tous les pods cassent et le test de timeout (Étape 4.1bis) passerait pour
# la mauvaise raison. Une policy egress par sortie autorisée est donc indispensable.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-identity-egress, namespace: nina-aes }
spec:
  podSelector: { matchLabels: { app.kubernetes.io/name: identity-service } }
  policyTypes: [Egress]
  egress:
    # 1) DNS (kube-dns/CoreDNS) — UDP+TCP 53, sinon aucune résolution de nom
    - to:
        - namespaceSelector: {}
          podSelector: { matchLabels: { k8s-app: kube-dns } }
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
    # 2) Postgres / Redis / RabbitMQ dans le namespace infra
    - to:
        - namespaceSelector: { matchLabels: { name: infra } }
      ports:
        - { protocol: TCP, port: 5432 } # Postgres
        - { protocol: TCP, port: 6379 } # Redis
        - { protocol: TCP, port: 5672 } # RabbitMQ
    # 3) OTel Collector (traces/metrics) dans observability
    - to:
        - namespaceSelector: { matchLabels: { name: observability } }
      ports:
        - { protocol: TCP, port: 4317 } # OTLP gRPC
```

> ⚠️ **Egress n'est PAS optionnel ici.** Comme `default-deny-all` déclare
> `policyTypes: [Ingress, Egress]`, l'absence de règle egress bloque jusqu'au DNS. Toute
> revendication « N rules allow » DOIT compter les egress (DNS + datastores + OTEL) par service,
> sinon le cluster est inopérant malgré un `helm install` « vert ».

> ⚠️ **K3s par défaut** utilise Flannel comme CNI qui n'implémente PAS les NetworkPolicy → le
> default-deny serait **inerte** (fausse assurance). C'est exactement pourquoi le CNI Calico est
> installé **avant** le chart (cf. **Étape 4.1bis**) et vérifié par le test de timeout. Cf. ADR-020.

---

### Étape 4.5 — Sealed Secrets pour les secrets en Git

**Pourquoi** : les Secrets K8s sont base64, pas chiffrés. Sealed Secrets les chiffre avec une clé
publique du contrôleur — seul le cluster de destination peut les déchiffrer. Commitable en Git en
toute sécurité.

```bash
# Installer le contrôleur
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system --version 2.16.0

# Créer un Secret normal puis le sceller
kubectl create secret generic identity-service-secret \
  --from-literal=DATABASE_URL='postgresql://...' \
  --dry-run=client -o yaml \
  | kubeseal --controller-namespace kube-system \
             --controller-name sealed-secrets \
             -o yaml > infrastructure/helm/nina-aes/secrets/identity-service-sealed.yaml

# Commit en Git — totalement safe
git add infrastructure/helm/nina-aes/secrets/identity-service-sealed.yaml
```

> 💡 **Alternative** : External Secrets Operator (ESO) pull les secrets depuis Vault au runtime,
> créant des K8s Secrets éphémères. Plus dynamique, mais ajoute une dépendance Vault stricte au
> startup. Trade-off documenté ADR-020.

---

### Étape 4.6 — Stratégie blue-green pour `identity-service` via Argo Rollouts

**Pourquoi** : `identity-service` est le service le plus critique (validation NINA, recherche
citoyens). Un déploiement raté = panne publique. Blue-green permet de vérifier la nouvelle version
sur du trafic synthétique AVANT bascule.

```bash
# Installer Argo Rollouts
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/download/v1.8.0/install.yaml

# Plugin kubectl
curl -LO https://github.com/argoproj/argo-rollouts/releases/download/v1.8.0/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
```

**Template `identity-service/rollout.yaml`** (remplace deployment.yaml) :

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata: { name: identity-service, namespace: nina-aes }
spec:
  replicas: 2
  strategy:
    blueGreen:
      activeService: identity-service
      previewService: identity-service-preview
      autoPromotionEnabled: false # promotion manuelle après check
      scaleDownDelaySeconds: 30
      # 🩹 FIX label version=preview : sans ces deux blocs, Argo NE pose PAS le label
      # `version` sur les pods/ReplicaSets. La requête Prometheus de l'AnalysisTemplate
      # (qui filtre version="preview") ne matchait alors RIEN → ratio 0/0 = NaN, et
      # l'analyse passait/échouait de façon non déterministe. previewMetadata/activeMetadata
      # injectent le label sur le ReplicaSet courant selon son rôle dans le blue-green.
      previewMetadata:
        labels: { version: preview }
      activeMetadata:
        labels: { version: stable }
      prePromotionAnalysis:
        templates:
          - templateName: smoke-test-identity
        args:
          # On passe à la fois le DNS du preview-service (sonde web) ET la valeur de label
          # `version` que la requête Prometheus doit filtrer — plus de littéral codé en dur.
          - name: service-name
            value: identity-service-preview
          - name: version
            value: preview
  selector: { matchLabels: { app.kubernetes.io/name: identity-service } }
  template:
    metadata:
      labels:
        app.kubernetes.io/name: identity-service
        # Label de base ; previewMetadata/activeMetadata le surchargent par ReplicaSet.
        version: stable
    # ... reste identique au Deployment template précédent
```

> ⚠️ **Pourquoi `previewMetadata` est indispensable** : en blue-green, les deux ReplicaSets portent
> le même `app.kubernetes.io/name`. Le seul moyen de distinguer le trafic « nouvelle version en test
> » dans Prometheus est un label distinct (`version=preview`) posé **uniquement** sur le RS preview.
> Le poser en dur dans `template.metadata.labels` le mettrait sur les DEUX → analyse faussée. C'est
> Argo qui doit le poser dynamiquement.

**AnalysisTemplate** (smoke test automatique en pre-promotion) :

> ⚠️ **Échappement Helm obligatoire** : ce fichier vit dans le répertoire `templates/` du chart
> umbrella. La syntaxe `{{args.version}}` est le templating **d'Argo Rollouts**, pas celui de Helm.
> Or Helm rend TOUT fichier de `templates/` à l'install/lint et tenterait d'évaluer
> `{{args.version}}` comme un pipeline Go → `helm lint` échoue avec `function "args" not defined`.
> On doit donc émettre les accolades Argo **littéralement** via `{{` `}}` (ou un bloc
> `define`/`.Files.Get` brut). Sans cet échappement, le chart ne s'installe pas.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata: { name: smoke-test-identity, namespace: nina-aes }
spec:
  args:
    - name: service-name
    - name: version # ← injecté par le Rollout (= "preview"), plus de littéral codé en dur
  metrics:
    - name: health-check
      provider:
        web:
          # Route santé harmonisée : /health (exclue du préfixe api/v1 côté NestJS,
          # cf. convention health-route-prefix + docs 16/20). PAS /api/v1/health.
          # ⚠️ {{ "{{args.service-name}}" }} : accolades Argo émises LITTÉRALEMENT par Helm
          # (sinon helm lint plante sur `function "args" not defined`).
          url: 'http://{{ "{{args.service-name}}" }}:3001/health/ready'
          jsonPath: '{$.status}'
      successCondition: 'result == "ok"'
      failureLimit: 0
      count: 5
      interval: 10s
    - name: error-rate
      provider:
        prometheus:
          address: http://prometheus.observability.svc:9090
          # {{ "{{args.version}}" }} = "preview" → matche les pods réellement labellisés par
          # previewMetadata. La requête vise donc bien le ReplicaSet en cours de test.
          # Les accolades Argo sont émises littéralement (échappement Helm), cf. note ci-dessus.
          query: |
            sum(rate(http_requests_total{service="identity-service",status=~"5..",version="{{ "{{args.version}}" }}"}[2m]))
            / sum(rate(http_requests_total{service="identity-service",version="{{ "{{args.version}}" }}"}[2m]))
      successCondition: 'result < 0.01'
      failureLimit: 0
      count: 6
      interval: 30s
```

> 💡 **Garde anti-NaN** : si le RS preview n'a encore servi aucune requête, le dénominateur est 0 →
> `result` = NaN, et `NaN < 0.01` est faux ⇒ l'analyse échoue à tort. En production, ajouter une
> garde `clamp_min(... , 1)` au dénominateur ou un `or vector(0)` au numérateur. ⏳ à affiner en
> Phase 2 selon le volume de trafic synthétique injecté avant promotion.

**Promotion manuelle après tests verts** :

```bash
kubectl argo rollouts get rollout identity-service -n nina-aes --watch
kubectl argo rollouts promote identity-service -n nina-aes

# Rollback rapide si problème
kubectl argo rollouts abort identity-service -n nina-aes
```

---

### Étape 4.7 — Ingress + TLS automatique

**Template `identity-service/ingress.yaml`** :

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-nina-aes
  namespace: nina-aes
  annotations:
    # Issuer PUBLIC (acme-dns souverain) car l'Ingress est exposé aux citoyens.
    # Le trafic est-ouest interne utilise vault-issuer (cf. Étape 4.2), pas celui-ci.
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit-rps: '100'
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload";
spec:
  ingressClassName: nginx
  tls:
    - hosts: [api.nina-aes.uqar.ca]
      secretName: api-nina-aes-tls
  rules:
    - host: api.nina-aes.uqar.ca
      http:
        paths:
          - {
              path: /v1/citizens,
              pathType: Prefix,
              backend: { service: { name: identity-service, port: { number: 3001 } } },
            }
          - {
              path: /v1/auth,
              pathType: Prefix,
              backend: { service: { name: auth-service, port: { number: 3002 } } },
            }
          - {
              path: /v1/audit,
              pathType: Prefix,
              backend: { service: { name: audit-service, port: { number: 3007 } } },
            }
          - {
              path: /v1/sigac,
              pathType: Prefix,
              backend: { service: { name: anticorruption-service, port: { number: 3009 } } },
            }
```

---

### Étape 4.7bis — Admission : vérifier la signature cosign des images (Kyverno)

**Pourquoi** : le digest pinning (§4.3) garantit l'**immuabilité** mais pas la **provenance**. Sans
contrôle de signature, un attaquant qui obtient un push sur GHCR pourrait pousser une image au
digest légitime-en-apparence. On exige donc que **toute** image `ghcr.io/nina-aes/*` soit signée par
notre clé cosign (générée en CI, doc 16) et on **refuse à l'admission** toute image non signée.
C'est le contrôle « supply-chain » d'ADR-034 (cf. aussi §10 « interdire les images non signées »).

```bash
# Kyverno (préféré ici : policies déclaratives YAML, plus léger qu'OPA Gatekeeper/Rego)
helm repo add kyverno https://kyverno.github.io/kyverno/
helm install kyverno kyverno/kyverno --namespace kyverno --create-namespace --version 3.2.x
```

**Policy `infrastructure/helm/nina-aes/templates/policies/verify-image-cosign.yaml`** :

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-nina-aes-images
spec:
  validationFailureAction: Enforce # BLOQUANT : refuse l'admission si la signature manque/invalide
  background: false
  webhookTimeoutSeconds: 30
  rules:
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds: [Pod]
      verifyImages:
        # Ne s'applique qu'à NOS images ; les images tierces (Bitnami, curl) ont leurs propres règles.
        - imageReferences: ['ghcr.io/nina-aes/*']
          # mutateDigest:true réécrit le tag en digest immuable à l'admission → double filet
          # avec le digest pinning du template (§4.3).
          mutateDigest: true
          required: true
          attestors:
            - count: 1
              entries:
                # Vérification par clé publique cosign (la privée vit dans Vault/CI, ADR-034).
                # Variante keyless (Fulcio/Rekor) = OIDC Sigstore = dépendance SaaS US → ÉVITÉE
                # pour le cœur régalien ; on reste sur une clé souveraine.
                - keys:
                    publicKeys: { { .Values.cosign.publicKey | quote } }
                    rekor:
                      ignoreTlog: true # pas de transparency log public Sigstore (souveraineté)
```

> ⏳ **À implémenter en Phase 2** : génération de la paire cosign en CI (doc 16), stockage de la clé
> privée dans Vault (`pki`/`transit`), et étape `cosign sign` après `docker push` GHCR. Le présent
> doc ne fait que définir la policy d'admission ; la signature elle-même est produite côté pipeline.

> 💡 **Alternative OPA Gatekeeper** : possible mais exige du Rego + un provider externe pour la
> vérif cosign (`ratify`). Kyverno intègre `verifyImages` nativement → moins de pièces mobiles.
> Trade-off tracé ADR-020.

---

### Étape 4.8 — Helm install / upgrade

**Workflow déploiement** :

```powershell
# Première install (staging)
helm dependency build infrastructure/helm/nina-aes/
helm install nina-aes infrastructure/helm/nina-aes/ \
  --namespace nina-aes --create-namespace \
  --values infrastructure/helm/nina-aes/values-staging.yaml \
  --set image.tag=$(git rev-parse HEAD) \
  --wait --timeout 10m

# Upgrade (rolling pour la plupart, blue-green automatique pour identity)
helm upgrade nina-aes infrastructure/helm/nina-aes/ \
  --namespace nina-aes \
  --values infrastructure/helm/nina-aes/values-production.yaml \
  --set image.tag=$(git rev-parse HEAD) \
  --atomic --timeout 15m

# Rollback en cas de problème
helm rollback nina-aes <REVISION> --namespace nina-aes --wait
```

**Helm hooks `post-install`** (smoke test global) :

```yaml
# infrastructure/helm/nina-aes/templates/post-install-smoke-test.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-test
  annotations:
    helm.sh/hook: post-install,post-upgrade
    helm.sh/hook-weight: '0'
    helm.sh/hook-delete-policy: hook-succeeded,before-hook-creation
spec:
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: smoke
          image: curlimages/curl:8.11.1
          command:
            - sh
            - -c
            - |
              set -e
              # Convention santé (harmonisée docs 16/20) :
              #  - Backends NestJS : /health (exclu du préfixe api/v1, cf. setGlobalPrefix exclude)
              #    → c'est aussi ce que sonde le HEALTHCHECK Docker (doc 16). PAS /api/v1/health.
              #  - Frontends Next.js : /api/health (route handler app/api/health, propre à Next).
              curl -fsSL --retry 10 --retry-delay 5 https://api.{{ .Values.domain }}/health
              curl -fsSL --retry 10 --retry-delay 5 https://citizen.{{ .Values.domain }}/api/health
              echo "Smoke test OK"
```

---

### Étape 4.9 — Runbook ops `OPS-RUNBOOK.md`

**Fichier à créer** : `docs/deployment/OPS-RUNBOOK.md`

````markdown
# OPS-RUNBOOK — Opérations courantes K3s NINA-AES

## Voir l'état général

```bash
kubectl get pods,svc,ingress -A
kubectl get rollouts -n nina-aes
helm list -A
```
````

## Déployer une nouvelle version

```bash
helm upgrade nina-aes infrastructure/helm/nina-aes/ \
  --namespace nina-aes \
  --values infrastructure/helm/nina-aes/values-production.yaml \
  --set image.tag=<git-sha> \
  --atomic --timeout 15m
```

## Rollback rapide

```bash
helm history nina-aes -n nina-aes
helm rollback nina-aes <REVISION> -n nina-aes --wait
```

## Promouvoir un blue-green identity-service

```bash
kubectl argo rollouts promote identity-service -n nina-aes
# ou abort si problème
kubectl argo rollouts abort identity-service -n nina-aes
```

## Debug un pod qui crash

```bash
kubectl describe pod <name> -n nina-aes
kubectl logs <name> -n nina-aes --previous
kubectl exec -it <name> -n nina-aes -- /bin/sh
```

## Re-générer un cert TLS bloqué

```bash
kubectl delete certificate api-nina-aes-tls -n nina-aes
# cert-manager le recrée automatiquement (rate-limit LE : 5 essais / heure)
```

…

````

---

## 5. Validation locale et staging

```powershell
# 1) Linter le chart
helm lint infrastructure/helm/nina-aes/
helm template infrastructure/helm/nina-aes/ --debug > /tmp/manifests.yaml

# 2) Validation kubeconform / kubeval
kubeconform -summary -strict /tmp/manifests.yaml

# 3) Dry-run sur staging
helm install nina-aes infrastructure/helm/nina-aes/ \
  --namespace nina-aes-staging --create-namespace \
  --values infrastructure/helm/nina-aes/values-staging.yaml \
  --dry-run --debug

# 4) Vrai install
helm install nina-aes infrastructure/helm/nina-aes/ \
  --namespace nina-aes-staging --create-namespace \
  --values infrastructure/helm/nina-aes/values-staging.yaml \
  --wait --timeout 15m

# 5) Vérifier
kubectl get pods,svc,ingress -n nina-aes-staging
kubectl get rollouts -n nina-aes-staging
helm test nina-aes -n nina-aes-staging

# 6) Smoke test public
# Frontend Next.js (host citizen) → route Next /api/health :
curl -fsSL https://staging.nina-aes.uqar.ca/api/health
# → {"status":"ok"}
# Backend NestJS (host api) → /health SANS préfixe api/v1 (convention harmonisée doc 16) :
curl -fsSL https://api.staging.nina-aes.uqar.ca/health
# → {"status":"ok"}
````

---

## 6. Pièges courants & dépannage

| Symptôme                                                  | Cause probable                                        | Solution                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `kubectl get pods` montre `ImagePullBackOff`              | GHCR privé sans `imagePullSecret`                     | Créer un Secret `ghcr-creds` + ajouter `imagePullSecrets` dans le PodSpec                                  |
| cert-manager : Cert reste `Pending`                       | DNS-01 échoue (acme-dns injoignable / NS non délégué) | `kubectl describe challenge <name>` ; vérifier la délégation NS `_acme-challenge` → acme-dns CTDEC         |
| Pods crash : `OOMKilled`                                  | Limit memory trop basse                               | Augmenter `resources.limits.memory` ; valider via `kubectl top pod`                                        |
| NetworkPolicy bloque tout                                 | Flannel par défaut ne supporte pas NP                 | Installer Calico ou Cilium AVANT le chart                                                                  |
| Helm install hang sur `waiting for resources to be ready` | readinessProbe trop stricte                           | `kubectl describe pod` → adjuster `initialDelaySeconds`                                                    |
| Argo Rollouts : preview pas créé                          | CRD pas installé                                      | Re-appliquer manifests Argo Rollouts                                                                       |
| Ingress 404 sur le bon host                               | Path mismatch ou `ingressClassName` manquant          | Vérifier `kubectl get ingress -A` + `kubectl logs -n ingress-nginx <controller>`                           |
| Sealed Secret pas déchiffré                               | Contrôleur changé de clé après recréation             | Re-sceller le secret avec la nouvelle clé publique                                                         |
| HPA : `unable to fetch metrics`                           | metrics-server pas installé                           | `helm install metrics-server ...` ou activer flag K3s                                                      |
| Pods en Pending : `0/3 nodes available`                   | Pas assez de ressources                               | Ajuster `requests` ; ou scale-up nœuds                                                                     |
| TLS handshake fail entre pods (mTLS doc 15)               | Linkerd sidecar pas injecté                           | `kubectl annotate ns nina-aes linkerd.io/inject=enabled` + restart                                         |
| LoadBalancer en `EXTERNAL-IP: <pending>`                  | Pas de cloud LB sur bare-metal                        | Installer MetalLB + configurer pool d'IPs                                                                  |
| Pod refusé : `failed to verify image signature`           | Kyverno bloque une image non signée cosign            | Signer l'image (`cosign sign`) ou vérifier `.Values.cosign.publicKey` ; voir `kubectl get policyreport -A` |
| Pod refusé : `violates PodSecurity "restricted"`          | PSA enforce=restricted sur nina-aes                   | Corriger le securityContext (runAsNonRoot, drop ALL caps, readOnlyRootFilesystem)                          |
| default-deny ne bloque rien (probe répond)                | CNI Flannel encore actif / Calico pas Ready           | Réinstaller K3s avec `--flannel-backend=none` + Calico AVANT le chart (Étape 4.1bis)                       |

---

## 7. Documentation à produire

- `docs/adr/ADR-020-deployment-k3s-production.md` — décision K3s on-premise vs alternatives (CNI
  Calico avant le chart, Kyverno vs Gatekeeper, Sealed Secrets vs ESO).
- **ADR-034 (existant, NE PAS dupliquer)** — couvre la couche sécurité de ce doc : mTLS strict
  Linkerd, PKI Vault (`vault-issuer`), rotation clés/JWKS, cosign verify en admission. Ce doc 20
  référence ADR-034 pour acme-dns souverain, PKI interne et signature d'images.
- `docs/deployment/OPS-RUNBOOK.md` — opérations courantes (déjà §4.9 esquissé).
- `docs/deployment/UPGRADE-GUIDE.md` — comment passer d'une version Bloc A à la suivante (migration
  DB, breaking changes).
- `infrastructure/helm/nina-aes/README.md` — values documentées, examples staging/prod.
- Mise à jour `docs/CHANGELOG.md` §18 : livrables déploiement.
- Mise à jour `docs/00-README-INDEX.md` : doc 20 livré + clôture phase transversale 15-20.

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — Déploiement K3s production — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Cluster K3s** : ✅ 1 control-plane + 2 agents Ubuntu 24.04, Flannel désactivé (V2: 3+3 HA)
- **CNI Calico** : ✅ installé AVANT le chart, test timeout default-deny vert
- **Ingress Nginx** : ✅ DaemonSet hostNetwork, 4 domaines actifs
- **cert-manager** : ✅ LE prod (acme-dns souverain) + vault-issuer interne, 4 certs auto-renouvelés
- **Kyverno cosign** : ✅ ClusterPolicy Enforce, images non signées refusées à l'admission
- **Helm chart** : ✅ 11 services + 3 frontends + sous-charts Bitnami (images par digest)
- **PSA + mesh** : ✅ `enforce=restricted` sur nina-aes + Linkerd injecté
- **NetworkPolicy** : ✅ default-deny (Ingress+Egress) + N rules allow ciblées (ingress ET egress :
  DNS, datastores infra, OTEL — sinon les pods ne résolvent rien)
- **Sealed Secrets** : ✅ 8 secrets commités en Git, déchiffrement OK
- **Argo Rollouts** : ✅ identity-service en blue-green, smoke test pre-promotion OK
- **HPA** : ✅ 11 services avec metrics CPU + custom Prometheus
- **Smoke test post-install** : ✅ Helm hook vert sur 5 derniers déploiements
- **Rollback drill** : RTO mesuré X min (cible < 1 min)
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : tests load (k6) sur staging, MetalLB pour V2 HA
- **Captures jointes** : k3s-topology.png, helm-list.png, rollouts-blue-green.png,
  grafana-cluster.png
```

---

## 9. Checklist de fin d'étape

- [ ] K3s 1.33.4 installé avec `--flannel-backend=none --disable-network-policy`,
      `kubectl get nodes` Ready
- [ ] **CNI Calico installé AVANT le chart** + test de timeout default-deny prouvé (pas de fausse
      assurance)
- [ ] Ingress Nginx 4.12 déployé en DaemonSet hostNetwork
- [ ] cert-manager 1.18 + ClusterIssuer LE prod (acme-dns souverain) + ClusterIssuer `vault-issuer`
      (PKI interne)
- [ ] **AUCUN solver Cloudflare** ; délégation NS `_acme-challenge` → acme-dns CTDEC vérifiée
- [ ] DNS pointant vers cluster (A records `*.nina-aes.uqar.ca`)
- [ ] Helm chart `nina-aes` lint passe (`helm lint` clean — délimiteurs `{{ }}` corrects)
- [ ] Kyverno installé + ClusterPolicy `verify-nina-aes-images` (cosign) en `Enforce`
- [ ] Images référencées par digest `@sha256:…` (pas de tag mutable seul)
- [ ] `helm install` staging réussit, smoke test post-install vert
- [ ] 3 namespaces créés (`nina-aes`, `infra`, `observability`)
- [ ] PSA `enforce=restricted` activé sur `nina-aes` (label namespace) + `linkerd.io/inject=enabled`
- [ ] NetworkPolicy default-deny (Ingress+Egress) + allow ciblé sur 11 services
- [ ] **Egress autorisé** par service (DNS kube-dns 53, datastores infra, OTEL 4317) — sinon DNS et
      DB cassés malgré un `helm install` vert
- [ ] Sealed Secrets installé, 8+ secrets sealés commités en Git
- [ ] Argo Rollouts installé, `identity-service` en mode `Rollout` blue-green
- [ ] `previewMetadata`/`activeMetadata` posent bien `version=preview`/`stable` (label vérifié sur
      les RS)
- [ ] AnalysisTemplate `smoke-test-identity` vert sur pre-promotion (requête Prom matche le RS
      preview)
- [ ] HPA actif sur les 11 services + 3 frontends
- [ ] PodDisruptionBudget sur tous les services (minAvailable: 1)
- [ ] HelmTest Job (`helm test nina-aes`) vert
- [ ] Drill rollback mensuel exécuté : RTO < 1 min
- [ ] `OPS-RUNBOOK.md` + `UPGRADE-GUIDE.md` rédigés
- [ ] `ADR-020` rédigé
- [ ] `docs/CHANGELOG.md` §18 + `docs/00-README-INDEX.md` mis à jour
- [ ] Aucun secret en clair dans les manifests (`gitleaks detect`)
- [ ] Tag Git `production-mvp` posé après validation tutorat
- [ ] Commit conventionnel : `feat(deploy): K3s + Helm + Ingress + cert-manager + Argo + ADR-020`

---

## 10. Pour aller plus loin

- **HA control-plane K3s** (3 masters embedded etcd) : passer en mode HA dès V2 pour éviter le SPOF
  master unique. Doc K3s officielle : <https://docs.k3s.io/datastore/ha-embedded>.
- **Cilium + Hubble** : remplacer Calico par Cilium pour observabilité réseau eBPF + NetworkPolicy
  L7 (filtrage HTTP path/method, pas seulement L4).
- **GitOps avec Argo CD ou Flux** : déclencher les `helm upgrade` depuis un repo Git (le cluster
  pull les manifests, plus de `helm install` manuel). Excellent pour audit ANSSI.
- **MetalLB BGP mode** : pour load balancing on-premise sans dépendre d'un cloud. Mode BGP préféré
  au mode L2 (plus scalable).
- **Velero backups K8s** : sauvegarder les manifests + PV snapshots → complète doc 19 pour la couche
  K8s.
- **Kyverno (déjà en place §4.7bis)** : étendre les policies déclaratives au-delà de cosign/digest
  (« interdire containers sans resource limits », « refuser `:latest` », « exiger
  `readOnlyRootFilesystem` »). OPA Gatekeeper reste une alternative (Rego + `ratify` pour cosign).
- **Service Mesh Linkerd (déjà injecté §4.4)** : mTLS strict automatique entre pods (cf. doc 15 §4.2
  - ADR-034). Aller plus loin avec les `ServerAuthorization` Linkerd (autorisation L7 par identité
    de ServiceAccount, en complément des NetworkPolicy L4).
- **Disaster Recovery cluster complet** : restore depuis Velero + pgBackRest cold storage → RTO
  testé semestriellement.
- **Lectures recommandées** :
  - <https://docs.k3s.io/>
  - <https://helm.sh/docs/chart_best_practices/>
  - <https://kubernetes.io/docs/concepts/configuration/overview/>
  - <https://argo-rollouts.readthedocs.io/>
  - _Kubernetes Patterns_ (Bilgin Ibryam, O'Reilly 2023)
  - Production K8s checklist (Lachlan Evenson, KubeCon talks)

---

_Document 20 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
