# ADR-018 — Stratégie de tests à 4 niveaux (pyramide unit-heavy + Testcontainers + Playwright + k6)

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [18 — Stratégie de tests](../18-TESTING-STRATEGY.md) **Complète** :
[ADR-009 — Monorepo Turborepo](./ADR-009-monorepo-turborepo.md),
[ADR-016 — CI/CD GitHub Actions](./ADR-016-cicd-github-actions.md),
[ADR-017 — Observabilité LGTM](./ADR-017-observabilite-lgtm-stack.md)

---

## Contexte

NINA-AES Platform comprend 11 microservices + 3 frontends + 1 mobile + 1 USSD gateway, soit ~20
surfaces testables. Chaque PR doit prouver que :

1. La logique métier critique (validation NINA, chaîne Merkle audit, signature JWS Ed25519, scoring
   IA) reste correcte.
2. Les contrats inter-services (REST, queues RabbitMQ, schémas Prisma) ne régressent pas
   silencieusement.
3. Les parcours utilisateurs critiques (correction, RDV, scan QR, USSD) restent fonctionnels
   bout-en-bout.
4. Le système supporte les pics réels d'enrôlement (~5 000 req/min) sous les SLO de la doc 17 (p95 <
   500 ms, < 1 % erreurs 5xx).

Contraintes pratiques :

- **Étudiant solo** : pas de QA dédié, pas de pipeline industriel. La discipline est imposée par les
  outils + la CI bloquante.
- **Feedback rapide** : < 5 min par PR (cible doc 16). Donc beaucoup d'unitaires (rapides), peu
  d'E2E (lents).
- **Mock vs réel** : trade-off classique. Trop de mocks = on teste les mocks, pas le système. Trop
  de réel = lent + fragile.

État initial (avant doc 18) :

- Jest 30 installé sur `packages/utils`, `packages/config`, `packages/database` (Vitest 4.1 aussi
  sur database, suites partielles)
- Pytest scaffold sur 2 services FastAPI (`ai-service`, `anticorruption-service`), avec seulement
  `test_health.py`
- 11 tests E2E Playwright livrés en Session 5 (mode `NINA_AUTH_MODE=mock`)
- Aucun test d'intégration Supertest, aucun test de charge

---

## Décision

Stratégie de tests structurée en **pyramide à 4 niveaux**, avec couverture ciblée par niveau et
outils choisis pour chaque :

| Niveau          | Volume cible | Outils                                                   | Couverture cible   |
| --------------- | ------------ | -------------------------------------------------------- | ------------------ |
| **Unitaires**   | ~800 tests   | Jest 30 (TS) · Pytest 8 (Py) · Vitest 4                  | **≥ 80 %**         |
| **Intégration** | ~150 tests   | Supertest 7 + Testcontainers 10 · httpx + pytest-asyncio | ≥ 60 % services    |
| **E2E**         | ~30 tests    | Playwright 1.50 (mock auth)                              | parcours critiques |
| **Charge**      | 4 scénarios  | k6 0.55 + output Prometheus (cf. doc 17)                 | SLO validation     |

Décisions structurelles :

1. **Pyramide stricte, pas glace au chocolat**. Le ratio cible est ~800/150/30/4
   (unit/integ/e2e/load). Un PR qui livre 1 test E2E sans tests unitaires est rejeté en review.

2. **Coverage threshold bloquante en CI** : `jest --coverage` + `pytest --cov-fail-under=80`
   retournent exit 1 si < 80 %. Pas de moyenne, pas d'exclusion sauf fichiers explicitement exclus
   (`*.config.cjs`, `main.ts`, `observability.ts`, `index.ts` barrel).

3. **Factories Faker centralisées** dans `packages/test-fixtures` (nouveau package workspace). Une
   factory = `make<Entity>(overrides?)`. Aucune donnée de test écrite à la main dans les
   `*.test.ts`.

4. **Testcontainers pour intégration**, pas de DB statique partagée. Chaque suite `*.e2e-spec.ts`
   démarre son propre `postgis/postgis:18-3.6` container, applique les migrations Prisma, exécute
   les tests, nettoie. Coût : ~30 s warmup × N suites. Acceptable pour ~10 suites d'intégration en
   parallèle.

5. **MSW (Mock Service Worker) pour les tests frontend**, pas `jest.mock('fetch')`. MSW intercepte
   au niveau réseau et permet de réutiliser le même handler en E2E et en unitaire. Compatible avec
   les Server Components Next.js 16 via `setupServer`.

6. **k6 contre staging uniquement, jamais prod**. Output Prometheus remote-write vers le Prometheus
   de la doc 17, dashboards Grafana réutilisables. Lancement manuel (étudiant) + nightly CI sur
   staging.

7. **Stryker en P2 manuel** : score mutation seulement sur `@nina-aes/utils` (logique pure, sans
   I/O), exécuté avant chaque release majeure. Pas en CI bloquante (trop long, ~5 min).

---

## Conséquences positives

- **Régressions captées tôt** : 80 % de la logique métier dans les unitaires → un bug remonte en < 5
  min sur le PR au lieu d'un incident prod 3 semaines plus tard.
- **Confiance pour refactorer** : la pyramide unit-heavy permet de changer le code interne sans
  craindre de casser l'API publique (Supertest valide les contrats).
- **Contrats API bétonnés** : Testcontainers + Supertest font tourner un Postgres réel → impossible
  de casser une migration sans le voir immédiatement.
- **Parcours utilisateur démontrable** : 30 tests E2E Playwright fournissent une démo automatisée
  pour la soutenance.
- **SLO validés par tests de charge** : avant chaque release, k6 démontre que les seuils p95/p99
  sont tenus → preuve formelle pour les audits ANSSI/OCLEI.
- **Discipline imposée par CI** : seuils 80 % bloquants → impossible de livrer du code non testé. La
  pression est sur l'outil, pas sur la volonté individuelle.
- **Outils open-source souverains** : Jest, Pytest, Playwright, Testcontainers, k6 = tous
  open-source. Aucune dépendance SaaS US (BrowserStack, Sauce Labs, Datadog Synthetics, Cypress
  Cloud rejetés).

---

## Conséquences négatives

- **Temps initial significatif** : monter la pyramide complète (~800 unit + 150 integ + 30 E2E + 4
  load) demande 18-24 h pour un étudiant solo. La doc 18 livre la spec ; l'implémentation est étalée
  sur les semaines post-Bloc-A.
- **Testcontainers requiert Docker** : runners CI doivent avoir Docker daemon disponible.
  GitHub-hosted runners Ubuntu l'ont, mais des alternatives (Forgejo self-hosted minimal) demandent
  provisioning explicite.
- **Coverage 80 % peut frustrer** : certains modules (orchestrateurs, glue code) sont durs à tester
  sans tests d'intégration pénibles. La doc 18 documente les exclusions légitimes (`main.ts`,
  `observability.ts`).
- **Faker non-déterministe** : par défaut, Faker change à chaque appel. Pour les tests
  reproductibles à debug, fixer `faker.seed(123)` dans un `beforeEach`. À documenter dans
  `TEST-CHARTER.md`.
- **k6 contre staging coûte** : ~10 min de charge soutenue × 4 scénarios × 2 runs/semaine =
  ressources cluster non négligeables. Mitigation : staging dimensionné en autoscaling Down → 1
  réplique en heures creuses.
- **Stryker très lent** : 5 min sur `packages/utils` (~50 fichiers). Pas question de l'activer en CI
  bloquante. Reste un outil manuel de revue.

---

## Note sur la souveraineté numérique

Toute la stack de test est open-source et auto-hébergeable :

- **Jest, Pytest, Playwright, Testcontainers, k6, Stryker, Faker, MSW** — tous MIT/Apache 2.0 sans
  backend SaaS obligatoire.
- **Pas de Cypress Cloud / Sauce Labs / BrowserStack** : Cypress Cloud est SaaS US, Sauce
  Labs/BrowserStack idem. Playwright Test self-hosted couvre 95 % des besoins (multi-browser,
  parallel exec, traces, video).
- **Coverage reports** : Codecov est optionnel (SaaS US) — fallback artefact `coverage-final.json`
  dans GitHub Actions. En prod gouvernementale, on s'auto-héberge `lcov` + GitHub Pages internes ou
  Sonarqube self-hosted.
- **k6 output** : remote-write Prometheus self-hosted (cf. ADR-017). Pas de Grafana Cloud Synthetic
  Monitoring.

Aucun screenshot, aucune trace, aucun log de test ne quitte l'infrastructure CTDEC/AES.

---

## Alternatives rejetées

- **Tout-en-E2E (« E2E first »)** : couvrir tout via Cypress/Playwright seul. Rejeté car (a) coût de
  feedback PR insupportable (10+ min/run), (b) flake taux élevé sur tests purement frontend, (c)
  impossible de tester la logique pure NINA validation côté algo.

- **Mocking total (« mock-driven »)** : utiliser Jest mocks pour tout, jamais de réel. Rejeté car
  (a) faux sentiment de sécurité (on teste les mocks), (b) migrations Prisma jamais validées, (c)
  bugs de sérialisation Decimal/Date non détectés.

- **Cypress** (vs Playwright) : excellent produit, mais (a) plus lent que Playwright, (b) limité au
  browser-only (pas Node test runner intégré), (c) Cypress Cloud SaaS US tentant — Playwright
  self-hosted est plus aligné souveraineté.

- **Vitest partout** (à la place de Jest) : Vitest est plus rapide qu'Jest et déjà installé sur
  `@nina-aes/database`. Mais (a) écosystème Jest mature (ts-jest, jest-mock-extended), (b)
  compatibilité NestJS testing utilities officielle uniquement avec Jest. Compromis : Jest pour
  services NestJS, Vitest toléré sur packages purs.

- **JMeter** (vs k6) : standard historique tests de charge. Rejeté car (a) DSL XML obscur, (b) JVM
  lourde, (c) k6 scripts en JS = mêmes compétences que le reste du repo, (d) output Prometheus natif
  k6 s'intègre directement à Grafana doc 17.

- **Locust** (Python, vs k6) : alternative open-source. Pertinente si le projet était 100 % Python.
  Pour un monorepo TS-dominant, k6 est plus naturel.

- **SonarQube self-hosted** : pertinent pour qualité statique avancée (duplication, complexité
  cyclomatique). Hors scope V1 — le couple ESLint + Semgrep (doc 15) couvre l'essentiel.

- **Synthetic monitoring SaaS (Datadog, Checkly)** : excluée par souveraineté. Blackbox Exporter
  Prometheus self-hosted est l'option retenue (cf. doc 17 §10).

---

## Suivi

Métriques à observer pendant les 4 semaines suivant l'activation :

| Métrique                                     | Cible            | Outil de mesure                     |
| -------------------------------------------- | ---------------- | ----------------------------------- | -------------------------------- | ------ |
| Nombre de tests unitaires (Jest + Pytest)    | ≥ 800            | `jest --listTests                   | wc -l`+`pytest --collect-only -q | wc -l` |
| Couverture globale Bloc A                    | ≥ 80 %           | rapport lcov agrégé                 |
| Temps moyen suite unitaire                   | < 30 s           | `time pnpm test`                    |
| Temps moyen suite intégration                | < 5 min          | `time pnpm --filter ... test:e2e`   |
| Temps moyen suite E2E Playwright             | < 3 min          | output Playwright report            |
| Taux de tests flaky (3 runs CI)              | < 1 %            | manuel + `jest --runInBand` retries |
| Score mutation Stryker sur `@nina-aes/utils` | ≥ 80 %           | rapport HTML Stryker                |
| Coverage gates CI                            | 100 % respectées | onglet Actions → workflow `test`    |
| k6 enrollment-peak                           | p95 < 500 ms     | dashboard Grafana k6 (cf. doc 17)   |
| Skipped tests (`xit`, `@pytest.mark.skip`)   | 0 sans ticket    | grep manuel                         |

Si le **taux flaky** dépasse 1 %, ou si la **couverture globale tombe sous 75 %**, déclencher une
revue ADR (créer ADR-018-bis ou amender avec « Révision YYYY-MM-DD »).
