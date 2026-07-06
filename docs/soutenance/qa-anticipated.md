# Questions anticipées du jury et réponses préparées

Ce document recense les questions les plus probables d'un jury mixte — professeur tuteur technique,
tuteurs institutionnels CTDEC, et jury académique UQAR généraliste — accompagnées de réponses
honnêtes et assumées. Chaque réponse tient en 3 à 6 lignes pour rester exploitable à l'oral. Les
positions défendues ici sont des choix de conception délibérés, documentés dans les ADR du dépôt, et
non des justifications a posteriori.

Le principe directeur de toutes les réponses : assumer le périmètre réel du projet (un étudiant
seul, dix semaines de session, contrainte de reproductibilité de la démo) plutôt que de le
maquiller. La crédibilité du travail repose sur la lucidité, pas sur la prétention d'exhaustivité.

---

#### Technique

**Q :** Pourquoi 15 microservices et pas un monolithe, alors que vous êtes un étudiant seul ?

**R :** Le découpage en microservices n'est pas un choix de performance ou de scalabilité — à mon
échelle, un monolithe serait plus simple à exploiter. C'est un choix de _modélisation du domaine
réel_ : NINA-AES doit refléter des frontières institutionnelles strictes (identité, audit immuable,
anti-corruption, interopérabilité transfrontalière). Ces frontières sont des exigences de
souveraineté et de séparation des responsabilités, pas des micro-optimisations. Le découpage
matérialise dans le code ce que la gouvernance d'un état civil impose dans la réalité. J'assume qu'à
mon échelle, seuls ~20 % des services sont réellement exécutables aujourd'hui : le découpage est une
carte d'architecture cible, pas une affirmation que tout tourne en production.

**Q :** Pourquoi le backend n'est-il pas branché dans la démonstration ?

**R :** C'est un choix assumé, pas une lacune. La démo tourne sur des données _mock déterministes_ :
mêmes entrées, mêmes sorties, à chaque exécution, zéro flakiness, zéro dépendance réseau,
reproductibilité totale devant le jury. L'architecture est conçue « en couture » : la couche
`@nina-aes/api-client` est une interface unique dont le mock et l'API réelle sont deux
implémentations interchangeables. Brancher le vrai backend, c'est changer une implémentation
derrière cette interface, pas réécrire le frontend. La roadmap de branchement post-remise est
explicite : rapatrier les derniers mocks codés en dur derrière la couture, puis substituer
l'implémentation réelle service par service.

**Q :** Comment garantissez-vous l'immuabilité du journal d'audit ?

**R :** Par une chaîne de Merkle append-only au niveau PostgreSQL. Chaque entrée d'audit contient le
hash de l'entrée précédente, formant une chaîne où toute modification rétroactive casse tous les
hashes suivants — donc détectable. L'append-only est garanti par un trigger PostgreSQL qui refuse
`UPDATE` et `DELETE` sur la table. Concrètement : on ne peut qu'ajouter, jamais réécrire ni effacer.
C'est la même logique d'intégrité qu'une blockchain, mais centralisée et sans consensus distribué,
ce qui suffit pour un registre d'état souverain.

**Q :** Que se passe-t-il si la clé privée RS256 du QR code fuit ?

**R :** Le QR sécurisé corrige une faille réelle : aujourd'hui les QR d'état civil contiennent
souvent le NINA en clair. Le mien embarque un JWT signé RS256, donc le NINA n'est plus lisible
directement. Si la clé privée fuit, l'attaquant peut forger des QR valides — c'est le risque
classique de toute PKI. La parade est opérationnelle : rotation de clé via Vault, révocation par
mise à jour du `kid` (key id) dans le JWT, et invalidation des QR émis avec l'ancienne clé. Aucune
donnée personnelle n'est compromise par la fuite elle-même : la clé signe, elle ne chiffre pas un
secret citoyen. La défense en profondeur (Vault, courte durée de vie des tokens) limite la fenêtre
d'exploitation.

**Q :** Comment testez-vous sans vraies données NINA ?

**R :** Je ne dispose d'aucune donnée d'état civil réelle — c'est attendu et même souhaitable pour
des raisons éthiques et légales. Les tests s'appuient sur un dataset _synthétique déterministe_
généré localement, respectant le format NINA officiel (14 chiffres plus une lettre de contrôle, ex.
`18903102015042V`). Le module IA est entraîné et évalué exclusivement sur ce dataset synthétique.
Cela teste la _logique_ (validation du format, détection d'incohérences, parcours de correction)
sans jamais manipuler de données personnelles réelles. La limite est honnête : la performance
terrain sur données réelles reste à mesurer après accès encadré aux données du CTDEC.

**Q :** Pourquoi le portail de gouvernance a-t-il été construit en dernier, et avec un périmètre
plus resserré ?

**R :** C'est une priorisation assumée. Sur dix semaines seul, j'ai d'abord livré les parcours à
plus forte valeur démontrable — portail citoyen et console d'administration — à un niveau de
finition élevé, puis bâti la gouvernance sur leur squelette déjà éprouvé. Elle n'est pas un simple
stub : **GOV-01 messagerie officielle signée** (Ed25519, accusés de réception horodatés) et **GOV-02
directives en Kanban drag-and-drop** (escalade visuelle) sont fonctionnels en mock et couvrent
l'objectif O6 (SGOGT). Deux sections seulement (Performance, Rapports) restent volontairement des
**stubs honnêtes** « module en préparation ». Mieux vaut un cœur métier solide et une gouvernance
ciblée que trois apps également inachevées.

---

#### Institutionnel et souveraineté

**Q :** Vous parlez de souveraineté numérique, mais utilisez-vous Cloudflare ou un CDN étranger ?
N'est-ce pas contradictoire ?

**R :** La distinction est entre _couche de transport/diffusion_ et _couche de données souveraines_.
Un CDN comme Cloudflare ne sert qu'à la diffusion d'assets statiques publics (HTML, CSS, polices) et
n'a jamais accès aux données d'état civil : celles-ci vivent dans les services backend (PostgreSQL,
MinIO, Vault) destinés à un hébergement souverain national. Pour un déploiement réel, le CDN serait
remplaçable par une solution régionale ou désactivable. La souveraineté se joue sur _où résident et
qui peut lire les données citoyennes_, pas sur qui sert une feuille de style publique.
L'architecture isole strictement les deux.

**Q :** Avez-vous validé ce système sur le terrain, au Mali ou dans un autre pays de l'AES ?

**R :** Non, et je l'assume clairement. Il s'agit d'un travail universitaire individuel encadré par
un tuteur, sans déploiement terrain ni accès opérationnel au CTDEC. La validation réalisée est
_architecturale et fonctionnelle_ : conformité au format NINA, cohérence avec le contexte documenté
(RAVEC depuis 2009, leçons du fiasco électoral de 2013 et de ses ~9000 cartes non tracées, cadre
BCID-AES de décembre 2025). La validation terrain — tests d'usage avec agents réels, charge réelle,
données réelles — est une étape ultérieure qui dépendrait d'un partenariat institutionnel. Prétendre
l'inverse serait malhonnête.

**Q :** Quel serait le coût d'un déploiement réel de cette plateforme ?

**R :** Je n'avancerai pas de chiffre que je ne peux pas étayer — ce serait inventé. Ce que je peux
cadrer : les coûts se répartissent en hébergement souverain (serveurs nationaux, redondance),
licences/exploitation des briques open-source retenues (PostgreSQL, RabbitMQ, Vault, Keycloak — sans
coût de licence mais avec coût d'exploitation et de support), sécurité (PKI, audits), formation des
agents, et infrastructure d'inclusion (passerelle USSD, bornes). L'usage systématique de logiciel
libre vise précisément à réduire la dépendance et le coût de licence. Un chiffrage sérieux exigerait
une étude dédiée avec les volumétries réelles du CTDEC, hors périmètre de ce travail.

**Q :** En quoi votre interopérabilité AES est-elle réellement « souveraine » entre trois pays ?

**R :** Le principe est : _interopérer sans centraliser ni transmettre de données personnelles_. La
communication inter-pays se fait en mTLS (authentification mutuelle des services) avec des messages
signés en JWS Ed25519. Surtout, aucune donnée personnelle ne franchit la frontière : un pays
interroge un autre et reçoit uniquement un booléen (identité vérifiée ou non) et un score, jamais le
contenu de la fiche. Chaque état garde la souveraineté pleine sur ses propres données ; seule une
réponse minimale et signée circule. C'est l'inverse d'une base centralisée transfrontalière, modèle
politiquement intenable dans le cadre AES.

---

#### Éthique et données

**Q :** Le module IA n'est-il pas un risque éthique, notamment avec un dataset 100 % synthétique ?

**R :** Le caractère synthétique du dataset _réduit_ le risque éthique principal — aucune donnée
citoyenne réelle n'est exposée pendant le développement. Le risque résiduel, que j'assume, est
double. D'abord, un modèle entraîné sur du synthétique peut ne pas généraliser au réel : c'est
pourquoi l'IA est strictement _assistive_, jamais décisionnelle — elle suggère une correction, un
agent humain valide. Ensuite, tout biais dans la génération synthétique se propagerait : il faudra
auditer le dataset réel et le modèle avant tout usage opérationnel. L'IA détecte et propose ; elle
ne tranche jamais le sort d'un citoyen seule. C'est une garde-fou de conception, pas une option.

**Q :** Comment garantissez-vous la protection des données personnelles dans une architecture aussi
distribuée ?

**R :** Par plusieurs couches. Les secrets transitent par HashiCorp Vault (jamais codés en dur), les
mots de passe sont hashés en Argon2id, l'accès est protégé par MFA et un RBAC à 6 rôles. L'audit
immuable chaîné Merkle trace tout accès de façon non réfutable. En transfrontalier, le principe de
minimisation est radical : on ne transmet qu'un booléen et un score, jamais de donnée personnelle.
La posture de conformité vise un cadre RGPD-like adapté à la souveraineté AES (O9). Le point honnête
: ces mécanismes sont implémentés au niveau architecture ; leur certification formelle (audit de
sécurité externe, pentest) reste à mener.

**Q :** Si l'IA se trompe sur la correction d'une identité, qui est responsable et quel est le
recours ?

**R :** L'IA ne corrige jamais seule : elle _propose_ une correction qu'un agent humain doit valider
via la console admin (parcours AD-02). La responsabilité reste donc humaine et institutionnelle,
comme pour toute décision d'état civil. Le citoyen conserve un recours explicite : le parcours
citoyen inclut un wizard de correction (PC-03) qu'il initie lui-même, et un module de signalement
(PC-06). Chaque action est tracée dans l'audit immuable, ce qui rend le processus contestable et
vérifiable. L'IA accélère le traitement, elle ne supprime ni le contrôle humain ni le droit de
recours du citoyen.

**Q :** Que faites-vous concrètement pour ne pas reproduire l'exclusion massive du fiasco électoral
de 2013 ?

**R :** Le fiasco de 2013 — des millions d'exclus, ~9000 cartes non tracées — est ma leçon
directrice. Deux réponses structurelles. La traçabilité d'abord : l'audit immuable garantit
qu'aucune carte ni correction ne peut « disparaître » sans trace, contrairement aux cartes non
tracées de 2013. L'inclusion ensuite : un accès USSD `*123*NINA#` prévu en 8 langues pour les
citoyens sans smartphone, des files prioritaires pour les personnes vulnérables, une approche
offline-first, et un portail diaspora. L'objectif explicite (O7) est que la modernisation n'exclue
personne — c'est la condition même de légitimité du système.

---

#### Gestion de projet et périmètre

**Q :** Quelle est la part réellement vôtre dans ce travail par rapport à ce qui a été généré par IA
?

**R :** Je l'assume sans détour : j'ai utilisé l'assistance IA comme un outil de productivité, comme
un développeur professionnel utilise aujourd'hui ses outils. Ce qui est mien et défendable, c'est
l'_architecture_ (le découpage en services, la couture `api-client`, le choix de l'audit Merkle, du
JWS Ed25519, de la stratégie mock-first), les _décisions de conception_ tracées dans les ADR, la
_priorisation_ du périmètre sous contrainte de dix semaines, et la _compréhension_ de chaque ligne —
que je peux expliquer et défendre ici. L'IA accélère l'écriture ; elle ne prend ni les décisions
d'architecture ni les arbitrages institutionnels. Je suis comptable de l'ensemble.

**Q :** Pourquoi seulement le français et le bambara fonctionnels sur les 8 langues annoncées ?

**R :** Honnêteté de périmètre : le français est livré à 100 %, le bambara est une _vitrine_ à ~11 %
que je finalise en fin de session pour démontrer la capacité multilingue, et les 6 autres langues
(soninké, peul, tamasheq, haoussa, mooré, djerma) sont des stubs avec fallback automatique vers le
français. La posture assumée est : « FR livré, BM vitrine, 6 autres = architecture i18n prête et
fallback FR opérationnel ». L'infrastructure d'internationalisation supporte les 8 langues ; ce qui
manque, c'est la traduction de contenu — un travail linguistique externe, pas un travail
d'ingénierie. Annoncer 8 langues « finies » seul en dix semaines serait mensonger.

**Q :** Comment avez-vous priorisé votre périmètre face à l'échéance, et qu'est-ce qui reste à faire
?

**R :** La règle a été : maximiser la valeur démontrable et reproductible. D'où la stratégie
mock-first (démo fiable sans backend), la finition prioritaire de citizen et admin, puis la
gouvernance en MVP. Ce qui reste explicitement à faire est documenté, pas caché : rapatrier les
derniers mocks codés en dur derrière la couture `api-client`, bâtir GOV-01/GOV-02, finir la vitrine
bambara, compléter `@nina-aes/ui` (4 composants métier sur 18 livrés), brancher le backend
post-remise, et mesurer ce qui doit l'être (couverture de tests, perfs, score IA). Chaque manque est
un bloc « à compléter » daté, pas une zone d'ombre.

**Q :** Une seule capture « preuve d'intégration » backend, est-ce suffisant pour crédibiliser
l'architecture ?

**R :** C'est délibérément minimal et assumé. Le cœur de la démo est le frontend mock-first,
reproductible et sans risque devant le jury. La preuve d'intégration optionnelle — une capture du
Swagger agrégé de l'api-gateway (`localhost:3000/api/docs`) — sert uniquement à montrer que la
couche backend existe, démarre via `pnpm run docker:up`, et expose une API cohérente. Elle prouve
que l'architecture n'est pas qu'un dessin. Je ne survends pas un backend « fini » : ~20 % est
réellement exécutable, et je préfère une preuve honnête et ciblée à une démo backend fragile qui
pourrait échouer en direct.

---

#### Questions humaines et impact

**Q :** Concrètement, qu'est-ce que ce système change pour un citoyen malien ordinaire ?

**R :** Pour un citoyen, c'est d'abord la fin de l'opacité. Aujourd'hui, corriger une erreur sur son
identité peut être lent, coûteux et arbitraire. Avec NINA-AES, il consulte sa fiche (PC-02), initie
lui-même une correction guidée (PC-03), prend rendez-vous (PC-04), suit l'avancement (PC-05) et
signale un abus (PC-06) — chaque étape tracée et contestable. Le QR sécurisé protège son identité
contre la divulgation. L'objectif humain est de redonner au citoyen le contrôle et la visibilité sur
sa propre identité administrative, là où il subissait un système fermé.

**Q :** Et pour la diaspora, souvent coupée des démarches d'état civil au pays ?

**R :** La diaspora est une cible explicite (O3). Un membre de la diaspora ne peut pas se déplacer
au guichet du CTDEC à Bamako ; le portail citoyen lui ouvre à distance les mêmes parcours —
consultation de fiche, correction, rendez-vous, suivi. Cela répond à un problème réel : des
ressortissants à l'étranger dont les démarches d'identité sont aujourd'hui pratiquement bloquées par
la distance. Le portail rétablit un canal numérique souverain, sécurisé, qui ne dépend pas
d'intermédiaires locaux. C'est une question d'équité d'accès autant que de modernisation.

**Q :** Comment ce système atteint-il les plus vulnérables — sans smartphone, sans connexion, ne
lisant pas le français ?

**R :** C'est le test de légitimité du projet (O7), et il est traité de front. Sans smartphone ni
internet : l'accès USSD `*123*NINA#` fonctionne sur n'importe quel téléphone basique, en mode texte.
Ne lisant pas le français : l'USSD et l'interface sont pensés multilingues (8 langues cibles,
fallback FR), et le bambara est la première langue vitrine. Pour ceux qui ne peuvent pas faire la
démarche seuls : des files prioritaires vulnérables et un parcours assisté par agent. La conception
est offline-first et inclusive _par défaut_, parce qu'un système d'identité qui n'atteint pas les
vulnérables manque sa raison d'être.

---

_Document vivant v1. Les réponses dépendant de mesures non encore réalisées (couverture de tests,
performances de charge, score IA sur données réelles, captures terrain) seront affinées au fil de la
session ; aucun chiffre n'est avancé ici sans fondement vérifiable._
