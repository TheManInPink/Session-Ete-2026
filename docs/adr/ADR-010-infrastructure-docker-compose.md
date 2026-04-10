# ADR-010 — Infrastructure Docker Compose pour le développement

## Statut

Accepté — Avril 2026

## Contexte

La NINA-AES Platform nécessite 8 services d'infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO,
Elasticsearch, Keycloak, Vault, Maildev) pour fonctionner. Ces services doivent être disponibles de
manière identique sur tout poste de développement, sans polluer le système d'exploitation hôte avec
des installations permanentes.

Le projet est développé sous Windows par un étudiant seul. La reproductibilité et la simplicité
d'installation sont prioritaires.

## Décision

Utilisation de **Docker Compose** pour orchestrer les 8 services d'infrastructure dans des
conteneurs isolés. Les microservices applicatifs (NestJS, FastAPI) tournent en local (hors Docker)
pour bénéficier du hot-reload. Tous les conteneurs sont connectés à un réseau bridge dédié
(`nina-aes-network`) et utilisent des volumes nommés pour la persistance.

Choix spécifiques :

- **Images Alpine** quand disponibles (3-5× plus légères)
- **Healthchecks** sur chaque service (sauf Maildev)
- **`depends_on: condition: service_healthy`** pour Keycloak → PostgreSQL
- **Mode dev-server** pour Vault (données en mémoire, non chiffrées)
- **`start-dev`** pour Keycloak (rechargement à chaud des thèmes)

## Conséquences positives

- **Reproductibilité** : `docker compose up -d` produit un environnement identique sur n'importe
  quel poste Windows, macOS ou Linux
- **Isolation** : chaque service tourne dans son propre conteneur sans conflits de versions. Pas de
  « works on my machine »
- **Cleanup instantané** : `docker compose down -v` supprime tout en 5 secondes. On peut recommencer
  à zéro à tout moment
- **Healthchecks** : les microservices savent quand l'infrastructure est prête, évitant les erreurs
  de connexion au démarrage
- **Documentation vivante** : le fichier `docker-compose.dev.yml` est la documentation exécutable de
  l'infrastructure

## Conséquences négatives

- **Consommation RAM** : ~1,4 Go pour les 8 conteneurs (Elasticsearch seul prend ~512 Mo). Nécessite
  un poste avec au moins 16 Go
- **Temps de démarrage** : 60-90 secondes pour que tous les healthchecks passent (Elasticsearch et
  Keycloak sont lents)
- **Complexité Docker Desktop** : sous Windows, Docker Desktop utilise WSL2 qui peut parfois poser
  des problèmes de performances I/O et de configuration réseau
- **Écart dev/prod** : en production, les microservices seront aussi conteneurisés. L'architecture
  dev (services locaux + infra Docker) diffère de l'architecture prod (tout Docker/K3s)

## Alternatives rejetées

- **Installation native** (PostgreSQL, Redis, etc. installés directement sur Windows) : pas
  reproductible, pollue le système, conflits de versions entre projets
- **Vagrant** : trop lourd (VM complète), plus lent que Docker, nécessite plus de RAM
- **Podman Compose** : meilleure sécurité (daemonless) mais support Windows moins mature,
  intégration VS Code limitée
- **Docker Swarm** : orchestrateur de production, trop complexe pour le dev local
