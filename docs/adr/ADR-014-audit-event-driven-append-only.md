# ADR-014 — Ingestion d'audit événementielle (RabbitMQ) + application append-only niveau base (triggers + RBAC)

**Statut** : ✅ Accepté **Date** : 2026-04-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [09 — Backend Audit Service](../09-BACKEND-AUDIT-SERVICE.md) **Complète** :
[ADR-007 — Chaîne Merkle d'audit](./ADR-007-merkle-audit.md)

> **Mise à jour 2026-06-18 (noms d'exchanges)** — La topologie a évolué depuis la rédaction :
> l'exchange unique `audit.events` (topic) a été scindé en **deux** — `nina.events` (topic,
> événements métier) + `nina.audit` (fanout, audit explicite) — et la file consommée se nomme
> `audit.log`. La **décision de fond** (ingestion RabbitMQ découplée + append-only) reste valable ;
> seuls les noms changent. Source de vérité : `infrastructure/docker/rabbitmq/definitions.json` +
> `services/audit-service/src/audit/audit.consumer.ts` (cf. CHANGELOG `0vicies`).

---

## Contexte

Le [document 09](../09-BACKEND-AUDIT-SERVICE.md) décrit l'implémentation de l'`audit-service`.
L'[ADR-007](./ADR-007-merkle-audit.md) a déjà retenu le principe d'une **chaîne Merkle SHA-256**
avec scellement Ed25519 horaire pour garantir l'intégrité cryptographique du journal.

Mais deux questions architecturales distinctes restaient ouvertes :

1. **Transport** — Comment les autres microservices (identity, correction, auth, interop, etc.)
   envoient-ils leurs événements à auditer ? Via appel HTTP synchrone ? Via file de messages
   asynchrone ? Via log applicatif scruté par un agent ?

2. **Défense en profondeur** — La chaîne Merkle détecte _a posteriori_ une falsification, mais **ne
   l'empêche pas**. Que faire si un attaquant disposant d'un accès DBA exécute
   `DELETE FROM audit_logs WHERE id = 42` ? La chaîne sera rompue, oui, mais la ligne _disparaît_.
   Comment empêcher la suppression/modification au niveau de Postgres lui-même ?

Ces deux questions ont des réponses **indépendantes** — un système peut choisir ingestion
synchrone + triggers, ou événementielle sans triggers, etc. Il est donc utile de documenter chaque
choix explicitement.

---

## Partie 1 — Transport : synchrone vs événementiel

### Option A — Appel HTTP synchrone (RPC)

Chaque microservice appelle `POST /audit/events` sur l'`audit-service` après chaque action sensible.

- ➕ **Simple** : pas de courtier de messages à opérer, code direct
- ➕ **Traçage facile** : la requête HTTP s'inscrit dans le même span OpenTelemetry que l'action
  auditée
- ➕ **Retour immédiat** : le service appelant sait si l'audit a réussi avant de répondre à
  l'utilisateur
- ➖ **Couplage fort** : si l'`audit-service` est down ou lent, **toute la plateforme ralentit ou
  échoue**
- ➖ **Fenêtre d'incohérence** : si l'audit échoue après l'action métier, on a une action non
  auditée — pire que le problème qu'on voulait résoudre
- ➖ **Latence cumulée** : chaque écriture ajoute un round-trip HTTP (5–20 ms) à la réponse
  utilisateur
- ➖ **Scaling couplé** : un pic d'écritures métier impose de scaler l'audit en même temps

### Option B — Log applicatif + agent scraper (ex: Vector, Fluent Bit)

Chaque service écrit ses événements dans un fichier JSON, un agent les parse et les envoie à
l'audit.

- ➕ Aucun couplage runtime
- ➖ **Perte possible** : si le service crash avant flush du fichier, événement perdu (unbuffered
  async)
- ➖ **Format fragile** : tout changement de format JSON casse l'agent
- ➖ **Ordering incertain** entre instances → risque de ruptures Merkle artificielles
- ➖ **Sécurité** : le fichier log contient des données sensibles (NINA, IP) et traîne sur disque

### Option C — File de messages RabbitMQ (choix) ✅

Chaque service publie un événement AMQP vers l'exchange topic `nina.events` (clés de routage par
domaine : `citizen.*`, `correction.*`, `document.*`, …) ; l'audit explicite passe par le fanout
`nina.audit`. L'`audit-service` consomme les deux via sa file `audit.log`.

- ➕ **Découplage** : l'`audit-service` peut être redémarré sans bloquer la plateforme
- ➕ **Durabilité** : RabbitMQ persiste les messages sur disque (quorum queue) — zéro perte même si
  l'audit est down plusieurs heures
- ➕ **Back-pressure** naturelle : si l'audit est lent, les messages s'accumulent dans la file
  (alerte Prometheus si > 10 000 messages)
- ➕ **Prefetch=1** + consumer unique par instance → **ordering garanti** au sein d'une instance
- ➕ **Scaling indépendant** : on scale `audit-service` selon la profondeur de la file, pas selon la
  charge métier
- ➕ **Idempotence** via `UNIQUE(source_event_id)` : si un émetteur republie après un crash, l'audit
  dé-duplique silencieusement
- ➕ **Dead-Letter Queue** (`audit.dlq`) isole les messages malformés pour investigation
- ➖ **Complexité opérationnelle** : RabbitMQ est une dépendance supplémentaire (mais déjà présente
  pour `notification-service`, `correction-service`)
- ➖ **Cohérence éventuelle** : le log d'audit peut être en retard de quelques secondes sur l'action
  réelle — acceptable pour de l'audit (pas pour du temps réel)
- ➖ **Risque transaction distribuée** : si l'écriture métier commit mais la publication RMQ échoue,
  on a une action non auditée. Mitigé par **outbox pattern** (voir section "Conséquences").

### Option D — Kafka

- ➕ Meilleur débit (millions msg/s)
- ➕ Rétention longue native
- ➖ **Overkill** : on attend 1–10 événements/s en pic Bloc A, Kafka serait sous-utilisé
- ➖ Opération et tuning nettement plus exigeants que RabbitMQ pour une équipe solo
- ➖ RabbitMQ déjà installé pour d'autres cas d'usage (notifications, correction async)

### Décision — Option C (RabbitMQ)

---

## Partie 2 — Application append-only

### Option E — Confiance applicative (aucun contrôle DB)

L'application évite simplement d'émettre des `UPDATE`/`DELETE`. Rien ne l'empêche côté base.

- ➕ Zéro configuration DB
- ➖ **Défaite complète** face à un attaquant avec accès Postgres (psql, pgAdmin, fuite de
  credentials)
- ➖ Un bug dans un migration script peut silencieusement effacer des lignes

### Option F — Rôle restreint (RBAC Postgres seul)

Créer un rôle `nina_audit_ingest` qui n'a que `INSERT` sur `audit_logs`. Révoquer `UPDATE`/`DELETE`.

- ➕ Protège contre erreurs applicatives banales
- ➕ Standard (GRANT/REVOKE disponibles depuis Postgres 8)
- ➖ **Contournable** : un superuser, ou un rôle DBA mal cloisonné, peut toujours modifier
- ➖ Si le service doit partager un rôle avec d'autres tables (par commodité), la restriction saute

### Option G — Triggers bloquants (PL/pgSQL `BEFORE UPDATE/DELETE`)

Fonctions `reject_audit_update()` / `reject_audit_delete()` qui lèvent une exception.

- ➕ **Protection au niveau du noyau Postgres** — même le superuser déclenche le trigger
- ➕ Message d'erreur explicite (`'audit_logs is append-only'`) facilite la traçabilité des
  tentatives
- ➕ Non contournable par SQL ordinaire, même via `pgAdmin`, `psql` ou un ORM
- ➖ Contournable par un superuser via `ALTER TABLE ... DISABLE TRIGGER` ou `DROP TRIGGER`
- ➖ Coût minuscule (<1 µs par ligne) mais existant

### Option H — Row-Level Security (RLS)

Politiques RLS interdisant `UPDATE/DELETE` sur toute la table.

- ➕ Feature Postgres native, auditable via `pg_policies`
- ➖ RLS est conçue pour filtrer des lignes par utilisateur, pas pour interdire globalement — usage
  détourné
- ➖ Facilement désactivable par un superuser (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`)

### Option I — Append-only strict via FDW vers un stockage externe (ex: Immudb, BigchainDB)

Déléguer le stockage à un système nativement inviolable.

- ➕ **Immuabilité absolue** (sauf compromission du système cible)
- ➖ **Dépendance supplémentaire** lourde à opérer pour une équipe solo
- ➖ Requêtes analytiques Postgres (JOIN avec `citizens`, etc.) deviennent impossibles
- ➖ Pas compatible avec le cron de scellement horaire (qui lit `MAX(id)` en Postgres)

### Décision — Combinaison F + G (RBAC + triggers)

- **RBAC Postgres** : le rôle applicatif `nina_app` n'a **aucun** `UPDATE`/`DELETE` sur `audit_logs`
  et `audit_roots` → bloque tout bug applicatif banal.
- **Triggers PL/pgSQL** : bloquent même un accès direct avec un rôle intermédiaire mal configuré →
  défense en profondeur.
- **Séparation superuser** : la suppression/modification d'un trigger requiert un `ALTER TRIGGER`
  superuser — opération journalisée dans `pg_audit` (extension) et surveillée par une alerte
  Prometheus/Loki.
- **Compensation** : le scellement Ed25519 horaire (ADR-007) assure qu'un superuser _lui-même_ ne
  peut pas réécrire l'histoire sans invalider la signature publiée en externe.

---

## Décision consolidée

L'`audit-service` ingère ses événements :

1. Exclusivement via la file RabbitMQ durable `audit.log`, liée à l'exchange topic `nina.events`
   (clés de routage par domaine) et au fanout `nina.audit`.
2. Avec idempotence stricte par contrainte `UNIQUE(source_event_id)` et DLQ `audit.dlq` pour les
   échecs de validation.
3. Les tables `audit_logs` et `audit_roots` sont append-only enforced via :
   - Révocation `UPDATE`/`DELETE` pour le rôle applicatif `nina_app`.
   - Triggers PL/pgSQL `reject_audit_update()` / `reject_audit_delete()` actifs sur toutes les
     connexions.
4. Toute tentative `ALTER TRIGGER ... DISABLE` ou `DROP TRIGGER` sur ces tables déclenche une alerte
   Prometheus basée sur `pg_audit`.
5. Les émetteurs utilisent un **outbox pattern local** (table `service_outbox` par microservice)
   pour garantir qu'un événement métier commit toujours en même temps que sa notification audit,
   même en cas de crash entre le commit Postgres et la publication RMQ.

---

## Conséquences

### Positives

- **Résilience** : la plateforme continue de servir les citoyens même si l'`audit-service` est down
  — les événements s'accumulent dans RabbitMQ et seront rattrapés au redémarrage.
- **Sécurité renforcée** : un attaquant doit compromettre simultanément Postgres (superuser),
  RabbitMQ (pour injecter des faux événements passés), **et** la clé privée Ed25519 dans Vault —
  trois surfaces distinctes.
- **Scalabilité** : l'audit scale selon sa propre charge (ingestion + vérifications) sans impacter
  les écritures métier.
- **Observabilité** : la profondeur de `audit.log` devient une métrique de santé globale lisible
  (alerte si > 10 000 ou > 30 s de retard).
- **Testabilité** : le consumer est une unité isolée, testable avec `@testcontainers/rabbitmq` +
  `@testcontainers/postgresql`.

### Négatives

- **Cohérence éventuelle** : une action métier visible à T n'est auditée qu'à T+Δt (Δt ≈ 100 ms
  typique, jusqu'à plusieurs secondes en cas de saturation). Un inspecteur anticorruption doit en
  être conscient quand il consulte un audit frais (< 1 min).
- **Complexité outbox** : l'obligation d'implémenter un outbox pattern dans chaque émetteur ajoute
  ~50 lignes de code par service (acceptable pour 11 services).
- **Opération RabbitMQ** : une seconde queue durable à monitorer (déjà surveillées :
  `notifications.queue`, `correction.queue`).
- **Formation DBA** : tout DBA intervenant sur la base doit être briefé sur l'existence des triggers
  et leur intangibilité. Un runbook explicite est livré dans
  [20 — Deployment K3s Production](../20-DEPLOYMENT-K3S-PRODUCTION.md).

### Risques résiduels

| Risque                                                              | Probabilité | Mitigation                                                      |
| ------------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| RabbitMQ perd des messages (volume plein, crash simultané 3 noeuds) | Faible      | Cluster 3 noeuds + quorum queue + alerte Loki + DLQ             |
| Superuser DBA malveillant drop les triggers                         | Très faible | `pg_audit` + alerte temps réel + accès superuser derrière Vault |
| Outbox pattern mal implémenté → événement perdu                     | Moyen       | Template partagé dans `@nina-aes/shared-lib` + tests dédiés     |
| Clé Ed25519 compromise                                              | Faible      | Rotation 90 j + HSM cible (ADR-007) + racines publiées externes |

---

## Implémentation

- Migrations Prisma :
  `packages/database/prisma/migrations/20260416000000_audit_triggers/migration.sql`
- Publisher partagé : `packages/shared-lib/src/messaging/audit-publisher.ts`
- Consumer : `services/audit-service/src/audit/audit.consumer.ts`
- Outbox pattern : `packages/shared-lib/src/outbox/` (template réutilisable)
- Script de vérification offline : `services/audit-service/scripts/verify-chain.ts`
- Tests E2E avec Testcontainers : `services/audit-service/test/chain-integrity.e2e-spec.ts`

---

## Références

- [ADR-007 — Chaîne Merkle d'audit](./ADR-007-merkle-audit.md)
- [ADR-005 — PostgreSQL 18](./ADR-005-postgresql.md)
- Chris Richardson, _Microservices Patterns_, ch. 4 — Transactional Outbox
- [Postgres Documentation — Trigger Functions](https://www.postgresql.org/docs/18/plpgsql-trigger.html)
- [RabbitMQ Quorum Queues](https://www.rabbitmq.com/quorum-queues.html)
- [RFC 8785 — JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785)

---

_ADR-014 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR_
