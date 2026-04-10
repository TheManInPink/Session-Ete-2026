# ADR-001 — Adoption d'un cahier des charges structuré par exigences numérotées

## Statut

Accepté — Avril 2026

## Contexte

Le projet NINA-AES Platform comporte 9 objectifs, 9 types d'acteurs, 11 microservices et 6 blocs
d'implémentation. Sans structure formelle, le risque de dérive de périmètre est élevé. L'étudiant
est seul et doit pouvoir démontrer au jury exactement ce qui a été planifié, réalisé et testé.

## Décision

Adoption d'un cahier des charges avec :

- Exigences numérotées : `EF-X-NNN` pour les fonctionnelles, `ENF-NNN` pour les non-fonctionnelles
- Priorisation MoSCoW (Must / Should / Could / Won't) pour chaque exigence
- Critères d'acceptation mesurables (temps de réponse, scores, pourcentages)
- Matrice de traçabilité exigences → objectifs (O1–O9) → services (11 microservices)

## Conséquences positives

- Chaque développement futur est traçable à une exigence précise
- Le professeur tuteur peut évaluer le périmètre réalisé vs. planifié objectivement
- Les tests d'acceptation découlent directement des critères définis
- Le jury de soutenance peut vérifier la couverture fonctionnelle

## Conséquences négatives

- Temps initial de rédaction significatif (~8-12 heures)
- Risque de rigidité : les exigences peuvent devoir évoluer en cours de développement

## Alternatives rejetées

- **User Stories Agile** : excellentes pour le développement itératif, mais moins adaptées à un
  document académique qui doit démontrer une vision complète et traçable
- **Spécification formelle (Z, B, TLA+)** : trop complexe pour le contexte. La rigueur des exigences
  numérotées avec critères mesurables est suffisante
- **Prototypage sans spécifications** : risque de dérive de périmètre et difficulté d'évaluation par
  le jury
