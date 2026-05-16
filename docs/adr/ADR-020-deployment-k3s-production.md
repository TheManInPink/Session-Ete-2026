# ADR-020 — Déploiement production K3s + Helm umbrella + Argo Rollouts blue-green + Sealed Secrets

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [20 — Déploiement K3s production](../20-DEPLOYMENT-K3S-PRODUCTION.md)
**Complète** : [ADR-002 — Microservices](./ADR-002-microservices.md),
[ADR-010 — Infrastructure Docker Compose](./ADR-010-infrastructure-docker-compose.md),
[ADR-015 — Sécurité hardening (mTLS, Vault)](./ADR-015-ml-stack-detection-erreurs-nina.md),
[ADR-016 — CI/CD GitHub Actions](./ADR-016-cicd-github-actions.md),
[ADR-017 — Observabilité LGTM](./ADR-017-observabilite-lgtm-stack.md),
[ADR-019 — Backup & DRP](./ADR-019-backup-recovery-strategy.md)

---

## Contexte

NINA-AES Platform doit être déployable en production sur infrastructure
**on-premise CTDEC** (Bamako, Mali) avec extensions ultérieures vers les
DC AES (Ouagadougou, Niamey). Cinq exigences :

1. **Souveraineté absolue** : pas de dépendance à AWS EKS, Azure AKS, GKE
   ou tout cloud managed K8s américain. L'infrastructure doit pouvoir
   tourner dans un datacenter CTDEC isolé d'Internet pour les opérations
   critiques (mode air-gap partiel possible).

2. **Légèreté opérationnelle** : un étudiant solo + futurs admins CTDEC
   non-experts K8s doivent pouvoir maintenir le cluster. Pas de cluster
   3-noeuds 12-cores nécessaire pour le MVP.

3. **Zéro downtime sur `identity-service`** : c'est le service le plus
   critique (validation NINA pour 11M de citoyens). Un déploiement raté
   sans rollback rapide = panne nationale.

4. **TLS partout** : certificats valides Let's Encrypt (ou CA interne
   souveraine en mode air-gap) sur tous les endpoints publics. Renouvelle-
   ment automatique.

5. **GitOps-ready** : les manifests sont sous Git, tout changement est
   tracé, les secrets sont commitables sans risque (via Sealed Secrets).

Contraintes pratiques :

- **Budget infra V1** : 3 VMs Ubuntu 24.04 (4 vCPU / 8 GB / 100 GB SSD
  chacune) — autour de 60 €/mois en V1 sur OVH/Scaleway, gratuit en
  bare-metal CTDEC en V2.
- **Compétences** : on connaît `docker compose` (doc 05) mais pas K8s en
  profondeur. Le choix doit minimiser la dette de connaissance.
- **Domaine** : `nina-aes.uqar.ca` (sous-domaine UQAR pour V1) ; en V2,
  `nina-aes.ml` ou `nina-aes.aes.int` quand l'AES délivrera un domaine.

---

## Décision

**Stack de déploiement** :

1. **K3s 1.33** comme distribution K8s — 1 binaire Go, SQLite par défaut
   (etcd en HA V2), pas de cloud-controller-manager.

2. **Helm 3.16 chart umbrella `nina-aes`** dans `infrastructure/helm/
   nina-aes/` qui orchestre 11 microservices + 3 frontends Next.js + 3
   sous-charts Bitnami (Postgres, Redis, RabbitMQ).

3. **Ingress Nginx 4.12** comme unique reverse proxy public, en DaemonSet
   hostNetwork (évite la dépendance LoadBalancer cloud).

4. **cert-manager 1.18 + ClusterIssuer Let's Encrypt** (DNS-01 via
   Cloudflare en V1 ; `acme-dns` self-hosted en V2 air-gap).

5. **Argo Rollouts 1.8 pour `identity-service`** — stratégie blue-green
   avec `AnalysisTemplate` qui exécute des smoke tests + queries
   Prometheus avant la promotion automatique.

6. **Stratégie `RollingUpdate` (maxSurge 25 %, maxUnavailable 0)** pour
   les 10 autres services + 3 frontends — zero downtime sans la complexité
   blue-green.

7. **Sealed Secrets 0.27** pour les secrets dans Git (alternative à
   External Secrets Operator, plus simple).

8. **CNI Calico 3.30 ou Cilium 1.17** (pas Flannel par défaut K3s) pour
   supporter les NetworkPolicy. Cilium préféré V2 pour eBPF L7.

9. **3 namespaces séparés** : `nina-aes` (services métier),
   `observability` (cf. doc 17), `infra` (Postgres, Redis, RabbitMQ,
   MinIO, Vault, Keycloak).

10. **NetworkPolicy default-deny + allow ciblé** : zero-trust intra-cluster.

11. **HPA Metrics-server + Prometheus custom metrics** : autoscaling sur
    CPU/memory + p95 latency.

12. **Helm values multi-env** : `values-staging.yaml` + `values-production.
    yaml`, déployable via `helm upgrade` depuis le workflow
    `deploy-staging.yml` (doc 16).

---

## Conséquences positives

- **Souveraineté garantie** : K3s tourne sur n'importe quel Linux. Pas
  de dépendance cloud managed. CTDEC peut migrer son cluster sans
  fournisseur tiers.
- **Légèreté** : K3s = 60 MB binaire vs ~1 GB pour K8s vanilla. Démarre
  en < 30 s sur une VM modeste. Idéal pour CTDEC qui n'a pas une
  équipe SRE 10+ ETP.
- **Helm Chart unique** : 1 `helm install` déploie tout. Les
  upgrade/rollback se font en 1 commande, traçables via `helm history`.
- **Zero-downtime identity-service** : blue-green + smoke test
  pre-promotion → impossible de pousser une version cassée en production.
- **TLS auto** : cert-manager renouvelle 60j avant expiration. Aucune
  intervention humaine pour les certs.
- **Secrets en Git sans risque** : Sealed Secrets chiffre avec la clé
  publique du contrôleur — seul le cluster cible peut déchiffrer.
- **GitOps-friendly** : tous les manifests sont sous Git + values
  multi-env → audit ANSSI trivial.
- **NetworkPolicy bétonnées** : un pod compromis ne peut pas pivoter,
  même s'il a `kubectl exec` (parce qu'il ne peut pas joindre les autres
  services).
- **Autoscaling natif** : HPA + Prometheus custom metrics → adaptation
  aux pics d'enrôlement RAVEC sans intervention manuelle.

---

## Conséquences négatives

- **Courbe d'apprentissage K8s** : malgré la légèreté de K3s, c'est plus
  complexe que `docker compose`. ~10 jours pour qu'un étudiant solo
  monte en compétence sur Helm + manifests + debugging.
- **Pas de LoadBalancer natif on-premise** : K3s ne crée pas de LB cloud.
  Solution : Ingress Nginx en DaemonSet hostNetwork (V1) ou MetalLB (V2
  HA). Documenté ADR mais ajoute une étape.
- **Helm complexity** : les templates Go peuvent devenir illisibles sur
  des charts complexes. Mitigation : `_helpers.tpl` rigoureux + lint
  systématique.
- **Sealed Secrets vs ESO trade-off** : Sealed Secrets demande une
  re-encryption à chaque rotation de clé contrôleur (5j-30j). ESO est
  dynamique mais ajoute Vault comme SPOF startup. Choix V1 = Sealed
  (plus simple), V2 = ESO (plus dynamique).
- **CNI à remplacer** : Flannel K3s par défaut ne supporte pas
  NetworkPolicy → installer Calico/Cilium AVANT le chart. Étape
  supplémentaire mais incontournable pour zero-trust.
- **Argo Rollouts CRDs supplémentaires** : ajoute 2 CRDs (`Rollout`,
  `AnalysisTemplate`) — vendor lock-in moyen. Documenté : migration vers
  Kubernetes Gateway API + Flagger possible en V2.
- **K3s sur 1 nœud SPOF V1** : MVP solo n'a pas la HA. Doc V2 (§10)
  documente la migration vers 3 masters etcd embedded.

---

## Note sur la souveraineté numérique

K3s est développé par **SUSE (Allemagne)** et **Rancher Labs** (filiale
SUSE, racheté 2020). Open-source CNCF (Apache 2.0). Le binaire ne
contient aucune télémétrie envoyée à un cloud — il est 100 %
self-contained.

Trois mitigations supplémentaires :

1. **Image registry souveraine** : tous les images Docker viennent de
   GHCR (doc 16) ou d'un Harbor self-hosted en V2. Pas de Docker Hub
   public en production.
2. **DNS-01 alternative** : si l'utilisation de Cloudflare est exclue,
   `acme-dns` self-hosted permet le challenge DNS-01 sans dépendance
   externe.
3. **Air-gap-ready** : K3s supporte le mode air-gap avec un mirror
   d'images privé. Documenté en cas de déploiement CTDEC isolé.

Pour un déploiement gouvernemental réel, la recommandation est de
**provisionner un Harbor souverain** + **acme-dns self-hosted** + **DNS
interne** — autonomie totale sans Internet.

---

## Alternatives rejetées

- **AWS EKS / Azure AKS / GKE** : managed K8s SaaS US. Rejeté par
  souveraineté (CLOUD Act, juridiction US). Aussi : coût élevé
  (~70 €/mois control-plane seul) et lock-in.

- **OpenShift (Red Hat)** : K8s entreprise excellent, mais (a) licence
  payante, (b) complexité sur-dimensionnée pour le MVP, (c) Red Hat
  (filiale IBM, US).

- **Vanilla Kubernetes (kubeadm)** : K8s standard, plus de flexibilité
  que K3s. Rejeté pour le MVP universitaire car (a) installation
  complexe (cni, csi, cloud-controller-manager à configurer), (b)
  consommation mémoire 2-3× K3s, (c) overkill pour 11 services.

- **microk8s (Canonical)** : alternative à K3s, comparable. Choisi K3s
  car (a) communauté plus large CNCF, (b) SQLite par défaut (microk8s
  utilise dqlite), (c) doc plus accessible.

- **Nomad + Consul (HashiCorp)** : orchestrateur léger alternative à
  K8s. Rejeté car (a) écosystème plus petit, (b) compétences
  transférables réduites pour l'étudiant, (c) Helm n'existe pas (pas
  d'équivalent direct).

- **Docker Swarm** : déjà rejeté pour son écosystème mourant
  (cf. ADR-002). Mais à mentionner : Swarm aurait été plus simple si on
  acceptait son absence de NetworkPolicy et HPA natifs.

- **Plain Docker Compose en prod** : ce qu'on a en dev (doc 05). Rejeté
  pour la prod car (a) pas de HA, (b) pas de healthcheck-based
  restart, (c) pas de stratégie de déploiement (rolling/blue-green), (d)
  pas de NetworkPolicy.

- **Flagger** (vs Argo Rollouts) : alternative open-source pour le
  blue-green/canary. Préféré Argo Rollouts car (a) UI native plus
  agréable, (b) écosystème Argo (CD, Workflows) potentiellement
  pertinent en V2.

- **External Secrets Operator d'emblée** (vs Sealed Secrets) : pertinent
  mais ajoute Vault comme SPOF startup. V1 = Sealed Secrets, V2 = ESO
  documenté §10 doc 20.

- **Traefik** (par défaut K3s, vs Ingress Nginx) : excellent reverse
  proxy. Préféré Ingress Nginx car (a) écosystème plus large (community,
  annotations), (b) features de rate-limiting et headers built-in, (c)
  documentation plus exhaustive pour audits.

- **MetalLB d'emblée** : pertinent V2 HA. V1 = Ingress Nginx hostNetwork
  (simple, pas de IP virtuelles à gérer).

---

## Suivi

Métriques à observer pendant les 4 semaines suivant l'activation :

| Métrique                                                | Cible              | Outil de mesure                                |
| ------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| Disponibilité cluster (`kubectl get nodes` Ready)       | 100 %              | Blackbox exporter Prometheus                   |
| Helm upgrade réussi (sur push main)                     | > 95 %             | onglet GitHub Actions deploy-staging           |
| Rollback drill mensuel (RTO mesuré)                     | < 1 min            | `OPS-RUNBOOK.md` log                           |
| Cert TLS valide ≥ 30 jours                              | 100 % endpoints    | cert-manager `kubectl get cert`                |
| Pods en `CrashLoopBackOff` / semaine                    | < 5                | Prometheus `kube_pod_status_phase`             |
| NetworkPolicy violations / jour                         | 0                  | Cilium/Calico logs Loki                        |
| HPA scaling events / jour                               | tracking only      | Prometheus `horizontalpodautoscaler_status_*`  |
| Argo Rollouts pre-promotion analysis success rate       | > 95 %             | UI Argo Rollouts                               |
| Sealed Secret déchiffrement échec                       | 0                  | logs contrôleur                                |
| Temps moyen `helm upgrade`                              | < 5 min            | log workflow CI                                |

Si **RTO rollback dépasse 1 min**, ou si **3 helm upgrade consécutifs
échouent**, déclencher une revue ADR (créer ADR-020-bis ou amender avec
« Révision YYYY-MM-DD »).
