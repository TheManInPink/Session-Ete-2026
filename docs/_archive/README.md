# `docs/_archive/` — Documents archivés (superposés)

> **Statut** : archive en lecture seule. Ces fichiers ne font **PAS** partie du parcours canonique
> `00-README-INDEX.md`. Ils sont conservés pour traçabilité historique uniquement.

## Pourquoi ces fichiers sont ici

Deux documents de génération antérieure ont été **superposés** par les versions canoniques
numérotées du parcours `docs/00 → docs/26`. Ils contenaient **2 908 lignes de contenu fantôme**
(versions divergentes, commandes périmées) susceptibles d'induire en erreur un lecteur humain ou un
assistant IA. La carte `docs/DOCUMENTATION-MAP.md` (§3.3 et §6 drift #4, recommandation P0 « Option
A ») préconisait leur archivage.

| Fichier archivé                                | Remplacé par (canonique)                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `01-fondations-monorepo-outillage-dx.md`       | `docs/01-CAHIER-DES-CHARGES.md` + `docs/04-MONOREPO-STRUCTURE.md`              |
| `02-infrastructure-docker-services-donnees.md` | `docs/02-ARCHITECTURE-GLOBALE.md` + `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md` |

## Règle

- **Ne pas** modifier ces fichiers : toute mise à jour doit viser le document canonique
  correspondant.
- **Ne pas** les référencer depuis un document canonique.
- Pour l'historique complet : `git log --follow docs/_archive/<fichier>`.

_Archivé le 18 juin 2026 — consolidation documentaire Phase 1 (audit contenu + sécurité)._
