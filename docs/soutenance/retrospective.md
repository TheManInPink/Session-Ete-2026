# Rétrospective honnête du projet NINA-AES

> Document vivant (v1). Cette rétrospective est rédigée _avant_ la livraison finale du 22 août 2026.
> Elle assume une posture d'honnêteté méthodologique : devant un jury mixte (professeur tuteur
> technique, tuteurs CTDEC institutionnels, jury académique UQAR), une faiblesse documentée et
> analysée vaut mieux qu'une force exagérée. La rétrospective n'est pas un aveu de défaite : c'est
> la preuve d'un recul critique sur sa propre démarche.

---

## 1. Cadre de la rétrospective

Ce document répond à trois questions, dans l'ordre :

1. **Ce qui a bien marché** — les décisions structurantes qui ont tenu sur la durée.
2. **Ce qui a moins marché** — les angles morts et les dettes accumulées, nommés sans détour.
3. **Ce qu'on referait autrement** — les correctifs de méthode tirés de l'expérience.

Le contexte impose son cadre de lecture : un **étudiant seul**, encadré par un professeur tuteur,
sur **~10 semaines effectives** avant la remise, pour un système dont l'ambition fonctionnelle
dépasse largement ce qu'une personne peut implémenter de bout en bout dans ce délai. La stratégie
assumée a été la suivante : livrer une **démonstration front MOCK-FIRST déterministe** (données mock
reproductibles, aucun backend branché), bâtie sur une architecture « en couture » échangeable, le
branchement réel du backend étant explicitement reporté _après_ la remise.

C'est à l'aune de ce cadre — et non à celle d'un produit commercial fini — que les réussites et les
échecs ci-dessous doivent être évalués.

---

## 2. Ce qui a bien marché

### 2.1 Monorepo et design system mis en place tôt

Le choix d'un **monorepo Turborepo/pnpm** dès le départ, avec des packages partagés (`@nina-aes/ui`,
`@nina-aes/i18n`, `@nina-aes/shared-types`, `@nina-aes/api-client`, etc.), a donné une colonne
vertébrale au projet. Trois applications Next.js (citizen, admin, governance) partagent la même
configuration TypeScript, le même socle de composants et le même système de types, sans duplication
de plomberie. Le coût d'entrée d'un monorepo (configuration initiale, orchestration des builds) a
été payé une fois, tôt, et a rapporté ensuite à chaque nouvelle surface ajoutée.

Côté **design system**, le fait de poser une base de composants et de tokens avant de construire les
écrans a permis une cohérence visuelle entre citizen et admin sans repartir de zéro à chaque page.
C'est ce qui rend la démo crédible : l'œil du jury perçoit un produit homogène, pas un assemblage de
prototypes hétérogènes.

### 2.2 Approche doc-driven

Le projet s'est construit **par la documentation** : un corpus de docs numérotées (carte des 27
documents + 25 ADRs recensés dans `docs/DOCUMENTATION-MAP.md`), un `CHANGELOG.md`, un
`MAINTENANCE.md` qui mappe « quel changement impose quelle mise à jour de doc », et des ADRs qui
tracent les décisions d'architecture. Pour un étudiant seul, cette discipline a joué le rôle d'une
**mémoire externe** : elle a permis de reprendre le travail après interruption sans reconstruire
mentalement le contexte, et de justifier chaque choix a posteriori.

Pour un jury académique, ce corpus est un atout direct : il matérialise la **rigueur de conception**
attendue d'un travail de fin d'études, indépendamment du taux d'exécution du code.

### 2.3 Sécurité pensée dès le départ

La sécurité n'a pas été un vernis appliqué en fin de course mais un axe de conception initial,
visible dans plusieurs décisions structurantes :

- **QR sécurisé en JWT RS256** : le QR code ne contient plus le NINA en clair (faille corrigée) mais
  un jeton signé.
- **Journal d'audit immuable chaîné Merkle** : append-only, garanti par trigger PostgreSQL.
- **Interopérabilité AES décentralisée** : mTLS + JWS Ed25519, _aucune donnée personnelle_ transmise
  entre États (seulement un booléen et un score).
- **Gestion des secrets** via HashiCorp Vault, mots de passe en Argon2id, MFA, RBAC à 6 rôles.

Ces choix donnent au projet une **colonne vertébrale sécurité** cohérente avec les objectifs de
souveraineté et de conformité (O8, O9), et ils sont défendables un par un devant le tuteur
technique.

### 2.4 Périmètre fonctionnel ambitieux et cohérent

Les 9 objectifs (modernisation NINA, IA de correction, portail diaspora, interopérabilité AES,
anti-corruption SIGAC, gouvernance traçable, accessibilité des publics vulnérables, sécurité,
conformité) forment un **ensemble cohérent**, pas un catalogue de fonctionnalités juxtaposées.
Chaque brique répond à une leçon du contexte institutionnel réel (CTDEC, RAVEC, fiasco électoral de
2013 et ses milliers de cartes non tracées). L'ambition est lisible et le « fil rouge » se tient :
c'est ce qui distingue un projet d'ingénierie d'un simple exercice technique.

---

## 3. Ce qui a moins marché

### 3.1 Dispersion : la largeur avant la profondeur

Quinze répertoires de services backend ont été ouverts (11 cœur + api-gateway + 3 différés), pour un
seul développeur. Résultat mesuré honnêtement : **environ 20 % seulement est réellement
exécutable**. L'énergie s'est dispersée sur la _largeur_ du système (poser tous les services) au
détriment de la _profondeur_ (en faire fonctionner un de bout en bout). Pour un étudiant seul sur 10
semaines, c'est le déséquilibre le plus coûteux du projet : beaucoup de squelettes, peu de parcours
complets.

### 3.2 Mocks en dur au lieu d'être derrière la couture

L'architecture prévoyait `@nina-aes/api-client` comme **couture de données** unique : une interface,
deux implémentations interchangeables (mock et API réelle). En pratique, des mocks restent **codés
en dur dans les composants** (par exemple un générateur de créneaux de rendez-vous directement dans
l'écran), au lieu d'être rapatriés derrière la couture. La conséquence est double : le branchement
futur du backend sera plus laborieux que prévu, et l'argument « architecture échangeable » est
aujourd'hui _partiellement_ tenu plutôt que pleinement démontré. Le chantier de rapatriement est
identifié mais pas terminé.

### 3.3 i18n « trompe-l'œil »

Huit langues sont annoncées (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE). L'état réel est très contrasté :
**FR à 100 %, bambara (BM) autour de 11 % (langue vitrine)**, et **six langues à l'état de stubs (<
1 %)**. L'architecture i18n est prête et le fallback FR fonctionne, mais afficher « 8 langues » sans
nuance serait un effet d'optique. La posture honnête retenue — « FR livré, BM vitrine, 6 autres =
architecture prête + fallback FR » — est défendable ; la version naïve ne l'aurait pas été.

### 3.4 Governance laissée vide trop longtemps

L'application **governance (port 4003) est restée quasi vide (~2 %)** pendant l'essentiel du projet,
réduite à un layout et une page par défaut. Reporter cette app aussi loin a créé un risque de «
troisième app fantôme » dans la démo. Le risque a finalement été **résorbé en S5-S7** : shell bâti
sur le squelette d'admin (S5), puis **GOV-01 messagerie signée Ed25519** (S6) et **GOV-02 directives
en Kanban** drag-and-drop (S7), livrés et passés en revue adversariale. Leçon : démarrer la
troisième app plus tôt aurait lissé l'effort plutôt que de le concentrer en fin de parcours.

### 3.5 `@nina-aes/ui` sous-utilisé

Le package UI partagé ne livre que **4 composants métier sur 18 prévus**. Le reste a été
**réimplémenté localement dans les apps**, ce qui contredit en partie la promesse du design system
mutualisé (§2.1). On a donc le paradoxe d'un design system posé tôt et bien pensé, mais dont la
_réutilisation effective_ est restée en dessous de l'intention. Chaque réimplémentation locale est
une petite dette de cohérence et de maintenance.

---

## 4. Ce qu'on referait autrement

### 4.1 Un vertical slice complet avant la largeur

La leçon centrale. Plutôt que d'ouvrir 15 services en surface, on commencerait par **un seul
parcours de bout en bout** — par exemple « consulter sa fiche NINA » — branché du front au backend
réel (un service, une vraie base, un vrai appel API), puis on élargirait. Un _vertical slice_
fonctionnel à 100 % est plus convaincant, et plus instructif sur les vrais points de friction
d'intégration, que vingt slices horizontaux à 20 %.

### 4.2 Le mock derrière la couture dès le premier jour

On imposerait dès J1 la règle : **aucun mock dans un composant**. Toute donnée passe par
`@nina-aes/api-client`, mock et API réelle étant deux implémentations de la même interface. Le coût
est minime au début et énorme à rattraper ensuite — comme le montre §3.2. Cette discipline aurait
fait du basculement mock → réel un simple changement de configuration.

### 4.3 Un périmètre explicitement jalonné

On poserait dès le départ un **découpage en jalons assumés** : ce qui est _dans_ le périmètre de la
remise, ce qui est _vitrine_ (démontré mais non exhaustif), ce qui est _reporté après remise_. Une
partie des tensions du projet vient d'un périmètre théorique (8 langues, 15 services, 18 composants)
jamais explicitement réconcilié avec le périmètre réellement atteignable par une personne en 10
semaines. Nommer cet écart tôt, c'est le transformer de dette cachée en choix stratégique documenté.

### 4.4 Définir « complet » tôt

Corollaire du point précédent : on écrirait, dès le lancement, une **définition de « terminé »** par
fonctionnalité (Definition of Done). Sans elle, une page « à 45 % » et une page « à 95 % »
cohabitent sans critère partagé, et l'estimation de l'avancement reste subjective. Une DoD explicite
(par exemple : « branchée à la couture + i18n FR complet + état vide/chargement/erreur gérés »)
aurait rendu l'avancement mesurable et priorisable.

---

## 5. L'honnêteté comme atout devant le jury

La règle directrice de cette rétrospective — et du dossier de soutenance dans son ensemble — est que
**le jury repère immédiatement l'esbroufe**. Annoncer « 8 langues, 15 services, plateforme complète
» serait un piège : la première question technique précise ferait s'effondrer l'argument. À
l'inverse, présenter un périmètre lucidement mesuré (« FR livré, BM vitrine ; ~20 % du backend
exécutable ; démo mock-first déterministe par choix assumé ») transforme chaque limite en **décision
défendable**.

Cette posture est cohérente avec la nature du travail : un **exercice académique**, pas un produit
commercial. La perfection n'est pas attendue ; la **rigueur de conception et le recul critique**,
oui. Une rétrospective qui sait nommer ses propres angles morts est, à ce titre, l'un des éléments
les plus valorisants du dossier.

---

## 6. Synthèse

| Axe                                               | Bilan honnête                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Monorepo + design system tôt                      | Réussite structurante, base saine et homogène                                          |
| Approche doc-driven (27 docs + ADRs)              | Réussite ; mémoire externe et preuve de rigueur                                        |
| Sécurité dès la conception (QR JWT, Merkle, mTLS) | Réussite ; colonne vertébrale défendable                                               |
| Périmètre ambitieux et cohérent                   | Réussite de vision ; mais cause de la dispersion                                       |
| 15 services pour un étudiant seul                 | Dette : largeur > profondeur, ~20 % exécutable                                         |
| Mocks en dur hors de la couture                   | Dette : branchement futur alourdi                                                      |
| i18n FR ok, 7 langues stubs                       | À présenter sans effet d'optique                                                       |
| Governance laissée vide trop longtemps            | Risque géré tardivement                                                                |
| `@nina-aes/ui` 4/18 utilisé                       | Réutilisation sous l'intention                                                         |
| À refaire                                         | Vertical slice d'abord ; mock derrière la couture dès J1 ; jalons explicites ; DoD tôt |

---

🔲 **À COMPLÉTER en S9-S10 : leçons finales après la livraison.** Cette section recueillera, une
fois la remise du 22 août passée, les enseignements qui ne peuvent être tirés qu'a posteriori : ce
que la répétition de la démo live aura révélé (points de fragilité réels, questions du jury non
anticipées), le bilan final du chantier de rapatriement des mocks derrière la couture, l'écart
constaté entre l'avancement estimé en cours de route et l'avancement réel à la livraison, et — le
cas échéant — le premier retour d'expérience sur le branchement du backend amorcé après la remise.
_Comment l'obtenir : passe rétrospective dédiée après la répétition générale et après la soutenance,
à intégrer ici sans réécrire les sections 2 à 4 (figées comme témoignage du raisonnement tenu avant
la remise)._
