# ADR-016 — CI/CD via GitHub Actions (workflows séparés + Turbo remote cache + GHCR + déploiement K3s)

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [16 — CI/CD GitHub Actions](../16-CICD-GITHUB-ACTIONS.md)
**Complète** : [ADR-009 — Monorepo Turborepo](./ADR-009-monorepo-turborepo.md),
[ADR-010 — Infrastructure Docker Compose](./ADR-010-infrastructure-docker-compose.md)

---

## Contexte

NINA-AES Platform doit fournir une chaîne d'intégration continue qui :

1. Reproduit fidèlement les contrôles locaux (`pnpm run verify:repo` + lint
   + typecheck + tests Jest/Pytest + Playwright mock) pour qu'un PR ne soit
   jamais vert localement et rouge en CI (ou inversement).
2. Bloque le merge sur `main` si une CVE CRITICAL/HIGH, un secret commité,
   ou une régression de tests est détectée.
3. Construit et publie les 6 images Docker des microservices Bloc A (Node +
   Python) vers une registry, avec déploiement automatique sur staging K3s
   après push sur `main`.
4. Reste **abordable** pour un projet universitaire (cible : < 5 min par PR
   moyen, < 2 000 min/mois sur compte étudiant gratuit).
5. Préserve la souveraineté : pas de dépendance hard à un service US
   non-substituable, et capacité à rejouer chaque workflow en local sans
   pipeline distant.

Le repo est déjà hébergé sur GitHub (choix institutionnel UQAR pour ce
projet) et l'organisation Turborepo (cf. ADR-009) permet une mutualisation
des caches entre packages et services.

---

## Décision

**GitHub Actions** est retenu comme plateforme CI/CD canonique. Le pipeline
est éclaté en **5 workflows séparés** (`verify.yml`, `test.yml`, `e2e.yml`,
`security.yml`, `build.yml`) plus 1 workflow de déploiement
(`deploy-staging.yml`) qui consomme `build.yml` via `workflow_call`.

Décisions structurelles associées :

1. **Granularité par responsabilité** : 1 workflow = 1 type de garantie
   (verify, test, sécurité, build). Permet un diagnostic instantané (label
   `test` rouge → c'est un test, pas un lint) et un parallélisme natif sur
   les runners.

2. **Composite action `setup-node-pnpm`** : la séquence `checkout` →
   `setup-pnpm@v4` → `setup-node@v4` → `pnpm install --frozen-lockfile` est
   factorisée dans `.github/actions/setup-node-pnpm/action.yml`. Évite la
   duplication × 4 + assure que tous les jobs partent du même socle.

3. **Caches multi-niveaux** :
   - pnpm store via `setup-node@v4 cache: 'pnpm'` (cache GitHub Actions
     natif, gratuit)
   - Playwright browsers via `actions/cache@v4` keyed sur `pnpm-lock.yaml`
   - pip wheel cache via `setup-python@v5 cache: 'pip'`
   - Docker buildx via `cache-from: type=gha` (cache GitHub Actions
     spécifique à buildx)
   - Turborepo remote cache via MinIO interne souverain
     (`TURBO_API` → URL self-hosted, **pas Vercel**)

4. **Bloquant vs informatif** : `verify`, `test-node`, `test-python`,
   `gitleaks`, `trivy-fs`, `semgrep` sont **required checks** sur `main`
   (branch protection rule). `e2e` et `docker-images` tournent mais ne
   bloquent pas le merge — leur échec déclenche une investigation manuelle
   sans paralyser un fix urgent.

5. **Registry images** : GHCR (`ghcr.io`) avec authentification via
   `${{ secrets.GITHUB_TOKEN }}` (zéro secret long-lived à gérer). Tag des
   images = `git-sha` (immutable) + `main` (mobile). Pas de tag `latest`
   pour éviter les régressions silencieuses au déploiement.

6. **Renovate plutôt que Dependabot** : configuration plus riche
   (`automergeMinor`, `automergePatch`, grouping Prisma/Next/React),
   schedule nocturne (`after 1am and before 5am`), labels automatiques pour
   triage. Dependabot était l'alternative GitHub-native mais moins flexible
   sur le grouping et le scheduling.

7. **act pour la fidélité locale** : le développeur peut rejouer chaque
   workflow via `act -W .github/workflows/<X>.yml` avant push. Cela élimine
   ~80 % des allers-retours « push → red → fix → push → green ».

---

## Conséquences positives

- **Coût marginal nul** pour le projet universitaire (compte étudiant 2 000
  min/mois ; PR moyen < 5 min après chauffe des caches → ~400 PRs/mois
  possibles).
- **Diagnostic clair** : 5 workflows → 5 statuts indépendants. Un PR avec
  `verify` vert, `test` rouge se résout en regardant un seul onglet.
- **Souveraineté préservée** : tous les outils sont open-source. Le seul
  composant fermé est GitHub Actions lui-même, **substituable** vers GitLab
  CI ou Drone via réécriture des 5 fichiers YAML (~6 h de travail).
- **Marketplace mature** : `pnpm/action-setup`, `aquasecurity/trivy-action`,
  `gitleaks/gitleaks-action`, `docker/build-push-action` sont tous
  officiels et bien maintenus.
- **Intégration native** avec branch protection rules, GitHub Security tab
  (SARIF de Trivy), GHCR, Environments (avec approval gate humain
  optionnel pour staging).
- **Reproductibilité locale** : `act` rejoue les workflows à l'identique.

---

## Conséquences négatives

- **Vendor lock-in léger** : la syntaxe `${{ ... }}` et les actions du
  marketplace sont spécifiques. Migrer vers GitLab CI demande un travail
  manuel (mais reste possible sous 1 jour).
- **Limites GitHub gratuit** : 2 000 min/mois sur runners Ubuntu (4 000 si
  étudiant Pro). Au-delà, facturation à la minute (~0.008 USD/min). À
  surveiller via `gh api /rate_limit` et l'onglet Billing.
- **Pas de cache miss debugging trivial** : quand Turbo remote cache rate,
  diagnostiquer demande `--dry=json` + lecture des hashes. Documenté dans
  doc 16 §6.
- **SARIF vers Security tab** : seul GitHub Advanced Security (payant)
  permet d'**afficher** les findings dans l'onglet Security pour un repo
  privé. En public, c'est gratuit. Pour un repo privé étudiant, les SARIF
  restent en artefacts du run.
- **Self-hosted runner pas immédiat** : pour vraiment maîtriser
  l'environnement d'exécution, il faut provisionner des runners sur du
  hardware souverain (cf. doc 16 §10). Pas urgent en V1.

---

## Note sur la souveraineté numérique

GitHub Actions est un service américain (Microsoft Azure). Les runners
Ubuntu hébergés tournent dans des datacenters US. Quatre mitigations sont
documentées :

1. **Données sensibles jamais en CI** : aucun NINA réel, aucun secret de
   prod ne passe par les runners. Les variables `${{ secrets.* }}` du
   projet étudiant contiennent uniquement des credentials de staging
   éphémères.
2. **Turbo remote cache self-hosted** : les artefacts de build n'atterrissent
   pas chez Vercel — ils restent sur le MinIO interne. Évite que le code
   compilé soit lisible par un fournisseur tiers.
3. **GHCR comme cache distant**, pas comme source de vérité : les images
   sont aussi publiées sur un registry self-hosted (Harbor en option doc 20)
   au moment du déploiement prod.
4. **Plan de migration documenté** : ADR-016 inclut explicitement la
   substituabilité vers GitLab CI auto-hébergé. Si le projet passe en
   gouvernance AES, la migration prend < 1 jour.

Pour un déploiement gouvernemental réel, la recommandation est
**Forgejo Actions** (fork souverain de Gitea Actions, 100 % compatible
syntaxe GitHub Actions) déployé sur l'infra AES — bascule transparente.

---

## Alternatives rejetées

- **GitLab CI (gitlab.com SaaS)** : excellent produit, mais doublerait la
  surface d'hébergement (repo GitHub + CI GitLab) et impose un compte
  séparé pour le tuteur. Pertinent si le projet migrait entièrement vers
  GitLab — non prévu en V1.

- **GitLab CI auto-hébergé (Omnibus)** : souverain mais demande 1-2 jours
  de setup serveur (Postgres + Redis + Runner + reverse proxy + backups).
  Disproportionné pour un projet solo universitaire. Devient pertinent en
  Phase production (cf. doc 20).

- **Drone CI** : léger (binaire Go unique), syntaxe propre, mais
  marketplace pauvre. Aucune action Trivy / Semgrep / gitleaks
  officielle — il faudrait packager soi-même chaque outil dans un image
  Docker. Trop coûteux en maintenance.

- **Jenkins** : trop lourd (JVM, Groovy DSL, plugins parfois abandonnés).
  Inadapté à un workflow « modern monorepo » Turborepo + pnpm. La
  configuration Jenkinsfile reste maintenable mais le coût d'entrée
  pédagogique est disproportionné.

- **CircleCI** : excellent produit US payant. Aucun avantage net vs
  GitHub Actions pour notre cas, et plan gratuit limité (6 000 min/mois
  mais 1 job concurrent — bloquant pour notre pattern 5 workflows
  parallèles).

- **Tout-en-un dans un seul `ci.yml`** : c'était l'état initial du repo
  (cf. `.github/workflows/ci.yml` d'avant cette ADR). Rejeté car (a)
  diagnostic confus quand un step échoue, (b) parallélisme limité, (c)
  re-déclenchement coûteux d'un job entier quand seul un sous-test
  flaké.

---

## Suivi

Métriques à observer pendant les 4 semaines suivant l'activation :

| Métrique                                | Cible             | Outil de mesure                              |
| --------------------------------------- | ----------------- | -------------------------------------------- |
| Temps moyen d'un run PR                 | < 5 min           | onglet Actions → durée moyenne `verify+test`  |
| Taux de cache hit pnpm                  | > 90 %            | log `setup-node@v4` → ligne `Cache restored` |
| Taux de cache hit Turbo                 | > 70 %            | `turbo run build --dry=json` → `cacheStatus` |
| Minutes runners consommées / mois       | < 1 200           | onglet Settings → Billing → Actions          |
| Taux de PR mergeable du 1er coup        | > 80 %            | manuel — feedback étudiant tuteur            |
| Nombre de CVEs CRITICAL bloquées        | 0 toléré          | logs `trivy-fs` + Security tab               |
| Faux positifs gitleaks par mois         | < 2               | manuel — chaque ajout `.gitleaks.toml`        |

Si les métriques dérivent, déclencher une revue ADR (créer ADR-016-bis ou
amender celle-ci avec une section « Révision YYYY-MM-DD »).
