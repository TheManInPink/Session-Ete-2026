# ADR-007 — Chaîne de hash Merkle pour l'audit immuable

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
chaîne de type Merkle. Un endpoint `/audit/verify` parcourt la chaîne et recalcule chaque hash pour
vérifier l'intégrité.

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
- Si le premier hash de la chaîne est compromis, toute la chaîne peut être reconstruite
  frauduleusement — atténué par la publication périodique du hash racine dans un registre externe
  (par exemple, un document signé remis au Bureau du Vérificateur Général)
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
