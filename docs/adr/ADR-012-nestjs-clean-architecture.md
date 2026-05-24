# ADR-012 — Architecture en couches (Clean Architecture) pour les microservices NestJS

**Statut** : ✅ Accepté **Date** : 2026-04-09 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [07 — Backend Identity Service](../07-BACKEND-IDENTITY-SERVICE.md)

---

## Contexte

Le microservice `identity-service` est le **premier service métier** de la plateforme NINA-AES et
servira de **modèle de référence** pour les 8 autres services NestJS à venir (auth, audit, document,
notification, interop, appointment, governance, vulnerability).

Trois styles d'architecture sont possibles pour un microservice NestJS :

### Option A — Controller → Service direct (style NestJS "starter")

```
Controller → Service (contient Prisma + logique métier)
```

- ➕ Simple, rapide à démarrer
- ➖ Couplage fort avec Prisma
- ➖ Tests unitaires lents (nécessitent mock Prisma dans chaque service)
- ➖ Difficile de changer d'ORM
- ➖ Mélange de responsabilités (métier + accès DB)

### Option B — Clean Architecture stricte (Hexagonal / Ports & Adapters)

```
Controller → Use Case → Entity (Domain) ← Repository Interface ← Repository Impl
```

- ➕ Découplage total
- ➕ Tests rapides (mock des interfaces)
- ➖ **Très verbose** (4-5 fichiers par feature)
- ➖ Over-engineering pour un projet solo de 11 services
- ➖ Courbe d'apprentissage raide

### Option C — Architecture en couches simplifiée (choisie) ✅

```
Controller → Service → Repository (Prisma)
              ↓
       @nina-aes/utils (validation pure)
```

- ➕ 3 fichiers par feature (acceptable)
- ➕ Tests unitaires rapides (mock `Repository` seulement)
- ➕ Si on change d'ORM un jour, seul `Repository` bouge
- ➕ Pattern largement documenté dans l'écosystème NestJS
- ➕ Cohérent avec les conventions du framework (pas d'abstraction inutile)

---

## Décision

Adopter une **architecture en 3 couches** par module métier :

| Couche             | Fichier           | Responsabilité                                   |
| ------------------ | ----------------- | ------------------------------------------------ |
| **Presentation**   | `*.controller.ts` | Routes HTTP, validation DTO, décorateurs Swagger |
| **Application**    | `*.service.ts`    | Logique métier, orchestration, appels helpers    |
| **Infrastructure** | `*.repository.ts` | Accès DB via Prisma (y.c. `$queryRaw`)           |

Règles invariantes :

1. **Le `Controller` ne touche jamais Prisma directement** — il passe systématiquement par
   `*.service.ts`
2. **Le `Service` ne touche jamais Express/HTTP directement** — il lève des `HttpException` NestJS
   qui seront traduites par le filtre global
3. **Le `Repository` ne contient aucune logique métier** — uniquement des requêtes DB
4. **La validation pure (ex: algorithme NINA modulo 23) vit dans `@nina-aes/utils`** — réutilisable
   depuis le frontend, les autres services, et les tests
5. **Les DTOs (`dto/*.ts`) sont la seule interface publique du module** — Swagger les lit
   automatiquement

---

## Conséquences

### ✅ Positives

- **Testabilité** : `NinaService` peut être testé en < 50 ms avec un mock de `NinaRepository` — pas
  besoin de base de données
- **Réutilisabilité** : `validateNina()` dans `@nina-aes/utils` sert à la fois au backend
  (`identity-service`) et au frontend (`apps/citizen`) — validation cohérente partout
- **Évolutivité** : ajouter un endpoint gRPC ou GraphQL consiste à créer une nouvelle classe
  "presentation" qui appelle le même `NinaService`
- **Lecture facile** : un nouveau contributeur comprend la structure en 5 minutes
- **Cohérence** : les 8 autres services (doc 08–14, 21) suivront exactement le même pattern

### ⚠️ Négatives / compromis acceptés

- **Un peu de duplication** entre entités Prisma et DTOs de réponse → acceptable car Swagger a
  besoin de décorateurs `@ApiProperty()` qui n'ont pas leur place sur les entités Prisma
- **Le `Repository` contient parfois du SQL brut** (cas pg_trgm) → documenté avec des commentaires
  explicites
- **Pas d'abstraction Domain Model distincte** de l'entité Prisma → on accepte que `Citizen` de
  Prisma = notre modèle métier pour ce projet académique (un vrai projet d'entreprise créerait une
  classe `Nina` séparée)

### 🔄 Alternatives rejetées et raisons

| Alternative                                                           | Raison du rejet                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **CQRS avec `@nestjs/cqrs`**                                          | Overkill pour un CRUD simple ; ajoute 4 couches (Command, Query, Handler, Aggregate) sans bénéfice pour un projet solo |
| **Event Sourcing**                                                    | Demande une infrastructure dédiée (EventStore, projections), incompatible avec les délais académiques                  |
| **Controller manipulant Prisma directement**                          | Impossible de tester sans DB ; couplage qui empêcherait le remplacement futur                                          |
| **Feature-based folders (`nina/{controller,service}` vs type-based)** | Choix retenu — c'est exactement ce qu'on fait, mais dans un style NestJS classique avec un dossier par feature métier  |

---

## Implementation notes

### Structure imposée pour chaque module métier

```
src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.repository.ts
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts
│   ├── <feature>-response.dto.ts
│   └── [search/query DTOs]
└── entities/              # optionnel — uniquement si mapping custom
    └── <feature>.entity.ts
```

### Injection de dépendances (DI)

- `Repository` est injecté dans `Service` via le constructeur
- `Service` est injecté dans `Controller` via le constructeur
- `PrismaService` est fourni globalement par `PrismaModule` avec `@Global()` → pas besoin de
  l'importer dans chaque module

### Tests unitaires — template obligatoire

```ts
describe('XxxService', () => {
  let service: XxxService;
  let repo: jest.Mocked<XxxRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        XxxService,
        {
          provide: XxxRepository,
          useValue: {
            /* mock de toutes les méthodes utilisées */
          },
        },
      ],
    }).compile();

    service = module.get(XxxService);
    repo = module.get(XxxRepository);
  });

  // ... tests
});
```

---

## Statut des services utilisant ce pattern

| Service                 | Document | Statut      |
| ----------------------- | -------- | ----------- |
| `identity-service`      | 07       | 🚧 En cours |
| `auth-service`          | 08       | ⏳ Planifié |
| `audit-service`         | 09       | ⏳ Planifié |
| `document-service`      | 10       | ⏳ Planifié |
| `notification-service`  | 11       | ⏳ Planifié |
| `interop-service`       | 12       | ⏳ Planifié |
| `appointment-service`   | 13       | ⏳ Planifié |
| `governance-service`    | 14       | ⏳ Planifié |
| `vulnerability-service` | 21       | ⏳ Planifié |

> **Note** : les 2 services Python (`ai-service`, `anticorruption-service`) suivront une
> architecture équivalente en FastAPI (Router → Service → Repository), documentée dans leurs ADR
> respectifs (22 et 25).

---

## Références

- Eric Evans, _Domain-Driven Design_ (2003) — concept général des couches
- Robert C. Martin, _Clean Architecture_ (2017) — principe d'inversion de dépendance
- [NestJS Documentation — Fundamentals](https://docs.nestjs.com/fundamentals)
- [ADR-002 — Choix des microservices](./ADR-002-microservices.md)
- [ADR-003 — Choix de NestJS](./ADR-003-nestjs.md)
- [ADR-011 — Database Schema Prisma](./ADR-011-database-schema-prisma.md)
