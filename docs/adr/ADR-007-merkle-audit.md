# ADR-007 — Chaîne de hash (hash-chain SHA-256 linéaire) pour l'audit immuable

> **Note de nommage** : le fichier s'appelle historiquement `ADR-007-merkle-audit.md`, mais la
> structure retenue est une **hash-chain SHA-256 linéaire**, **PAS un arbre de Merkle**. Chaque
> entrée référence le hash de la précédente (`previous_hash`) ; la vérification est un parcours
> **linéaire** O(n). C'est le CANON sécurité de la plateforme (cf. doc 09, OPS-RUNBOOK, ADR-034).

## Statut

Accepté — Avril 2026

## Contexte

L'exigence EF-A-018 impose un journal d'audit immuable avec une rétention minimale de 10 ans
(EF-A-020). Un attaquant ayant accès à la base de données — ou un agent corrompu avec des droits
d'administration — ne doit pas pouvoir modifier une entrée d'audit passée sans que cette
falsification soit détectable. La table `audit_logs` en mode append-only ne suffit pas : un
administrateur PostgreSQL peut exécuter un `UPDATE` directement.

## Décision

Chaque entrée du journal d'audit contient un hash SHA-256 calculé comme suit :

```
hash(N) = SHA-256( hash(N-1) + serialize(entry(N)) )
```

Le champ `previous_hash` de chaque entrée pointe vers le hash de l'entrée précédente, formant une
**chaîne de hash linéaire** (hash-chain) — **et non un arbre de Merkle** : il n'y a ni nœuds
internes, ni racine d'arbre, ni preuve d'inclusion logarithmique. Un endpoint `/audit/verify`
parcourt la chaîne **linéairement** (O(n)) et recalcule chaque hash pour vérifier l'intégrité.

## Conséquences positives

- **Détection de falsification** : modifier le contenu d'une entrée passée change son hash, ce qui
  invalide en cascade tous les hash suivants — détection immédiate lors de la vérification
- **Vérification en O(n)** : parcours linéaire de la chaîne, implémentation simple
- **Preuve cryptographique** : un auditeur externe peut vérifier l'intégrité sans accès admin à la
  base
- **Plus simple qu'une blockchain** : pas besoin de réseau distribué, de consensus, ni de minage —
  les mêmes garanties d'immutabilité pour un journal d'audit centralisé

## Conséquences négatives

- Vérification complète coûteuse sur de grandes tables (10 ans × milliers d'entrées/jour) — atténué
  par la vérification par segments (dernier mois, dernier trimestre)
- **Intégrité conditionnée à un ancrage tiers (⏳ à implémenter)** : une hash-chain linéaire seule
  n'offre **pas** d'intégrité forte. Un administrateur ayant accès en écriture à la base peut
  **recalculer toute la chaîne** (réécrire les entrées, puis recalculer `hash(N)` de proche en
  proche depuis le point altéré) sans jamais rompre la vérification interne `/audit/verify`. La
  détection de falsification n'est donc garantie que **si la racine (le dernier hash) est ancrée
  périodiquement chez un tiers indépendant** — par exemple un registre signé remis à l'OCLEI ou au
  Bureau du Vérificateur Général. **Cet ancrage tiers périodique est REQUIS** pour atteindre
  l'intégrité forte ; sans lui, la chaîne ne protège que contre une altération non coordonnée.
  Statut : ⏳ à implémenter (le scellement Ed25519 horaire in-process — @noble/ed25519, doc 09 —
  signe la racine localement mais ne constitue pas, à lui seul, l'ancrage externe).
- Performance d'écriture légèrement réduite (calcul SHA-256 à chaque insertion) — négligeable (~0.1
  ms par opération)

## Alternatives rejetées

- **Blockchain complète (Hyperledger Fabric, Ethereum)** : surcoût opérationnel disproportionné pour
  un journal d'audit interne. Nécessite un réseau de nœuds, un mécanisme de consensus, et une
  expertise spécialisée
- **Table append-only sans hash** : détectable en lecture (pas de DELETE/UPDATE SQL autorisé), mais
  un administrateur PostgreSQL peut contourner ces restrictions. Pas de preuve cryptographique pour
  un auditeur externe
- **Signature numérique par entrée (sans chaînage)** : chaque entrée serait individuellement
  vérifiable, mais un attaquant pourrait supprimer des entrées entières sans que les autres soient
  affectées. Le chaînage rend la suppression détectable
