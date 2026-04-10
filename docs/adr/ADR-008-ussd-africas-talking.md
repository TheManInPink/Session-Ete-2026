# ADR-008 — USSD via Africa's Talking

## Statut

Accepté — Avril 2026

## Contexte

L'exigence ENF-025 impose l'accessibilité du système depuis les téléphones basiques (feature phones)
via le protocole USSD. Au Mali et dans les pays de l'AES, une part significative de la population
rurale ne dispose pas de smartphone. Le protocole USSD (Unstructured Supplementary Service Data) est
un standard GSM qui fonctionne sur n'importe quel téléphone mobile, sans connexion internet.

L'implémentation USSD nécessite un intermédiaire (passerelle) entre l'opérateur télécom et notre
serveur applicatif. Cet intermédiaire reçoit les messages USSD de l'opérateur et les transmet à
notre API sous forme de webhooks HTTP.

## Décision

Utilisation de l'API Africa's Talking comme passerelle USSD et SMS pour le projet NINA-AES. Le
shortcode cible est `*123*NINA#`, avec support de 8 langues nationales (français, bambara, songhaï,
peul, tamasheq, haoussa, mooré, djerma).

## Conséquences positives

- **Couverture géographique** : 20+ pays africains couverts dont le Mali, le Niger et le Burkina
  Faso (les 3 pays de l'AES)
- **Mode sandbox gratuit** : environnement de test complet sans coût, avec simulateur USSD intégré —
  idéal pour un projet universitaire
- **API webhook simple** : chaque interaction USSD est un POST HTTP avec `sessionId`, `phoneNumber`
  et `text` — intégration en quelques heures
- **Sessions stateful** : Africa's Talking maintient le contexte de session côté opérateur, notre
  serveur gère l'état dans Redis (TTL 5 min)
- **SDK disponibles** : bibliothèques officielles Node.js et Python
- **Documentation claire** : exemples de code, guides de démarrage, communauté de développeurs
  africains active

## Conséquences négatives

- **Dépendance tierce** : Africa's Talking est un intermédiaire entre nous et l'opérateur télécom.
  En cas de panne de leur infrastructure, le service USSD est indisponible
- **Latence additionnelle** : chaque interaction USSD transite par les serveurs d'Africa's Talking
  (Nairobi, Kenya) avant d'atteindre notre serveur — latence estimée ~200-500 ms supplémentaires
- **Coût en production** : tarification à l'usage (par session USSD) — à négocier avec Africa's
  Talking pour un usage gouvernemental

## Note sur la souveraineté numérique

Africa's Talking est une entreprise kenyane basée à Nairobi — ce n'est pas un GAFAM (Google, Apple,
Facebook, Amazon, Microsoft). Les données qui transitent par leurs serveurs se limitent au
`sessionId`, au `phoneNumber` et au texte saisi par l'utilisateur. **Aucune donnée biométrique,
aucune donnée NINA complète, aucun document d'identité** ne transite par Africa's Talking.

En production, un accord contractuel de protection des données (DPA) serait nécessaire. À plus long
terme, l'AES pourrait envisager de déployer sa propre passerelle USSD via un accord direct avec les
opérateurs (Orange Mali, Moov, Malitel), éliminant complètement cet intermédiaire.

## Alternatives rejetées

- **Accord direct avec les opérateurs télécom** : processus contractuel long (6-12 mois), coût
  d'infrastructure élevé, nécessite une relation institutionnelle. Inadapté pour un projet
  universitaire, mais pertinent pour un déploiement national
- **Twilio** : entreprise américaine (San Francisco). Couverture USSD limitée en Afrique de l'Ouest.
  Problème de souveraineté — données transitant par des serveurs US
- **Infobip** : couverture africaine correcte mais API USSD moins documentée qu'Africa's Talking.
  Pas de mode sandbox gratuit
- **Développement d'une passerelle USSD propre** : nécessite un accord USSD (shortcode) avec chaque
  opérateur télécom de chaque pays — processus administratif incompatible avec le calendrier
  universitaire
