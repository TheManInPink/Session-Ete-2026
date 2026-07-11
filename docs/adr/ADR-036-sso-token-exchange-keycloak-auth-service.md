# ADR-036 — Échange SSO : token Keycloak (web) → session applicative (auth-service)

## Statut

Accepté — 2026-07-11. **Livraison par tranches** : tranche 1 (endpoint auth-service, vérificateur et
tests) **livrée** ; tranche 2 (câblage du portail citoyen : callback / BFF / refresh / logout) et
tranche 3 (bascule du gate live PC-04) **à suivre** — la bascule live n'intervient qu'**après
revue**.

## Contexte

La plateforme a **deux systèmes d'authentification non interopérables** :

1. **Portail web citoyen** (`apps/citizen`, `packages/auth`) — OIDC **Authorization Code + PKCE**
   contre **Keycloak**. La session est un cookie `access_token` portant un JWT **signé par
   Keycloak** (JWKS `…/realms/nina-aes/protocol/openid-connect/certs`).
2. **Services backend** (api-gateway, appointment-service, identity-service, …) — ne font confiance
   qu'aux **JWT RS256 émis par auth-service** (clés Vault, JWKS propre
   `:3002/.well-known/jwks.json`, claim `role` **singulier** + claim `nina` pour l'anti-IDOR).
   auth-service émet ces tokens via un **login par mot de passe** (grant password Keycloak → mint
   interne).

Conséquence : le cookie du citoyen web est **rejeté** par la gateway et les services (émetteur ≠
auth-service). ADR-028 (self-service `/appointments/me`) l'a explicitement acté comme **réserve
d'exploitation** : « le login web est émis par Keycloak alors que gateway + appointment-service
vérifient la JWKS d'auth-service — la **réconciliation d'émetteur** est le prérequis avant de servir
un citoyen en live ». Le présent ADR tranche cette réconciliation.

Contraintes directrices : ne pas affaiblir l'**intégrité d'identité** ni la **traçabilité** ; ne pas
régresser l'anti-IDOR (`nina`) ; **ne pas** exposer les apps internes (admin/gouvernance) ; **aucun
secret** en clair ; **données honnêtes**.

## Décisions

### 1. Un **échange SSO** dédié, côté citoyen, plutôt que de faire confiance à Keycloak en aval

Nouvel endpoint **`POST /api/v1/auth/sso/exchange`** (auth-service) : il **vérifie** un access token
Keycloak présenté par le portail citoyen, puis **émet une session applicative** (paire
access/refresh auth-service) pour le citoyen correspondant. Les services aval restent **inchangés**
: ils continuent de ne vérifier que la JWKS d'auth-service. On **n'élargit pas** la confiance des
services à Keycloak (cf. Alternatives).

### 2. Vérification du token Keycloak — **fail-closed**, sans confiance dans les claims applicatifs

`KeycloakTokenVerifier` contrôle, dans l'ordre (toute erreur ⇒ **401 uniforme**, raison journalisée
côté serveur uniquement — anti-oracle) :

- **Signature RS256** contre le **JWKS Keycloak** (clé résolue par `kid`). `algorithms:['RS256']` +
  pré-contrôle de l'en-tête bloquent toute **confusion d'algorithme** (`none` / HS256 avec la clé
  publique en secret).
- **`iss`** = l'émetteur **vu par le navigateur** (`KEYCLOAK_ISSUER`, à défaut dérivé de
  `KEYCLOAK_URL`/`REALM`). Le JWKS, lui, est récupéré via **`KEYCLOAK_URL`** (URL **interne** du
  service) : ce découplage gère le **split-horizon** (le service peut joindre Keycloak sur un
  hostname différent de celui gravé dans l'`iss`).
- **`azp`** = **`nina-citizen`** (`KEYCLOAK_SSO_CLIENT_ID`) : scope l'échange au **seul portail
  citoyen** — un token émis pour un autre client est refusé.
- **`typ`** ≠ `ID`/`Refresh` : refuse un id/refresh token (un access token Keycloak porte
  `typ:'Bearer'`).
- **`exp`/`nbf`** (tolérance d'horloge 5 s).

Seul le **`sub`** (identifiant Keycloak) est extrait comme donnée de confiance ; **aucun** claim
applicatif du token (rôle, nina) n'est cru.

### 3. Identité résolue en base ; **rôle issu de la DB, jamais du token**

Le `sub` Keycloak est résolu en compte plateforme via `findByKeycloakId`. Un token valide **sans
compte provisionné** (drift Keycloak/DB) est **refusé** (401 uniforme). Le **rôle** vient de
`User.role` (DB). Le `nina` du citoyen est **résolu en base** (`findCitizenNinaByEmail`, réutilisé
via `issueSession`) et gravé dans le claim `nina` — c'est ce claim que `NinaOwnershipGuard` compare
(anti-IDOR/BOLA), **identique** au login classique.

### 4. Échange **strictement citoyen** — pas de contournement du MFA

L'endpoint n'émet que pour le rôle **CITIZEN**. Tout rôle interne (agent/superviseur/admin/auditeur/
inspecteur) — qui appartient à `MFA_REQUIRED_ROLES` — est **refusé** : l'émettre ici
court-circuiterait le **challenge MFA** du login classique (escalade). Un privilégié qui aurait un
token du client citoyen n'obtient donc **aucune** session applicative par cette voie ; il doit
passer par `/auth/login` + MFA. `role !== CITIZEN ⇔ MFA_REQUIRED_ROLES.has(role)` (seul CITIZEN est
hors MFA), la garantie est donc totale.

### 5. Normalisation de **casse** du rôle (correctness d'identité)

`User.role` (enum **Prisma**) est en **casse haute** (`CITIZEN`) tandis que le contrat de token
(`@nina-aes/auth-guards` `UserRole` + claim `role`) est en **casse basse** (`citizen`). L'échange
**normalise explicitement en casse basse** avant émission : sans cela, le token citoyen serait émis
**sans `nina`** (le gate de résolution NINA de `issueSession` teste `=== UserRole.CITIZEN` bas de
casse) **et refusé** par le `RolesGuard` aval (`@Roles(UserRole.CITIZEN)`). C'est la première voie
d'émission d'un token **citoyen fonctionnel de bout en bout**.

> **Note (dette pré-existante, hors périmètre)** : `AuthService.login` projette le rôle via
> `user.role as unknown as UserRole` **sans** cette normalisation. Pour un citoyen ce chemin
> émettrait donc aussi un token sans `nina` ; pour un rôle interne,
> `MFA_REQUIRED_ROLES.has('AGENT')` est **faux** (le set est bas de casse) ⇒ **MFA potentiellement
> contournée au login password**. Ce chemin n'est pas exercé en live (le web passe par Keycloak),
> mais le défaut est réel et mérite un correctif dédié (normaliser à la source, idéalement dans
> `UserRepository`).

### 6. Modèle **dual-token** côté web (tranches 2-3), sessions internes inchangées

Le portail citoyen conserve sa **session Keycloak** (`access_token`, `getSession` **inchangé** ⇒
admin/gouvernance **non impactés**). Le token **auth-service** obtenu par l'échange est stocké
**séparément** (cookie `backend_access_token`, httpOnly) et **transmis par le BFF** en `Bearer` aux
appels backend. refresh/logout couvriront ce cookie additionnel. Aucune fusion des deux émetteurs
n'est imposée.

### 7. Anti-abus & traçabilité

Rate-limit **par IP** dédié (`SsoExchangeThrottleGuard`, espace de clés Redis distinct du login) —
l'échange exige déjà un token Keycloak **signé** (donc pas un oracle de credentials), le plafond
borne surtout la **frappe de tokens** en cas de token volé ou de boucle défectueuse. Erreurs
**uniformes** (anti-énumération). Événements significatifs (drift, rôle refusé, succès)
**journalisés en clair côté serveur** (pipeline observabilité) : on ne crée **pas** de nouveau canal
d'audit — cohérent avec le login, qui ne publie pas d'événement métier propre.

## Conséquences

### Positives

- **PC-04 citoyen débloqué en live** sans élargir la surface de confiance des services à Keycloak.
- **Anti-IDOR préservé** : `nina` gravé depuis la DB, `NinaOwnershipGuard` inchangé.
- **Intégrité MFA préservée** : aucun rôle interne émis par cette voie.
- **Apps internes intactes** : `getSession` (Keycloak) inchangé ; le dual-token est **additif**.
- **Aucun secret** en jeu : l'échange ne manipule que des tokens signés, la clé de mint reste Vault.

### Négatives / limites

- **Complexité dual-token** sur le portail (deux cookies, deux cycles de vie) — tranche 2.
- **Dépendance à la config Keycloak** : le client `nina-citizen` doit émettre `azp=nina-citizen`
  (cas par défaut). En **split-horizon** (Docker), `KEYCLOAK_ISSUER` doit être renseigné (l'`iss`
  navigateur ≠ `KEYCLOAK_URL` interne).
- **Échange sans re-consentement** : quiconque détient un access token citoyen valide (non expiré,
  bon `azp`) obtient une session applicative — mitigé par la **courte durée** du token Keycloak, la
  vérification complète et le rate-limit.
- **Dette de casse du rôle** au login (cf. Décision 5, note) à traiter séparément.

## Alternatives écartées

| Alternative                                                           | Pourquoi écartée                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Faire vérifier la **JWKS Keycloak** directement par les services aval | Couple **tous** les services à Keycloak ; perd la forme de claim d'auth-service (`role` DB, `nina`, MFA) ; grand rayon de souffle. |
| Basculer le login **web citoyen** en password via auth-service        | Abandonne OIDC/PKCE/SSO Keycloak ; UX et sécurité moindres ; ne réutilise pas l'IdP.                                               |
| **Émetteur unique** partagé (auth-service = IdP OIDC)                 | Migration lourde, hors budget ; Keycloak reste l'IdP de la plateforme.                                                             |
| Émettre pour **tous les rôles** dans l'échange                        | Contournerait le **MFA** des rôles internes (escalade).                                                                            |
| Faire confiance au **rôle/nina du token Keycloak**                    | Le rôle plateforme fait foi en **DB** ; un claim Keycloak pourrait diverger. Source de vérité = DB.                                |

## Références

- ADR-028 — appointment-service : self-service `/appointments/me` + **réserve d'émetteur** (résolue
  ici)
- ADR-029 — api-gateway : terminaison d'auth / JWS (vérification JWKS auth-service en périphérie)
- ADR-034 — durcissement sécurité (Vault, mTLS, OWASP)
- `services/auth-service/src/keycloak/keycloak-token.verifier.ts` · `…/modules/auth/auth.service.ts`
  (`exchangeSsoToken`)
- `infrastructure/keycloak/import/realm-nina-aes.json` — client `nina-citizen` (audience/azp)
- OWASP ASVS V3 (gestion de session) / V11 (contrôle d'accès) · JWT BCP (RFC 8725) — pinning
  alg/iss/aud
