# Workflow d'enrichissement via INSTAT Mali

> **Statut V1 (mai 2026)** : INSTAT n'expose pas de catalogue téléchargeable
> public. Les données administratives complètes (159 cercles, 466
> arrondissements, 819 communes, 12 712 villages avec coordonnées) nécessitent
> une **demande officielle** auprès de l'Institut National de la Statistique
> du Mali.
>
> Ce document fournit le template et le workflow pour faire cette demande.

---

## 1. Pourquoi passer par INSTAT ?

| Niveau              | Coverage publique actuelle                | Source INSTAT requise pour                |
| ------------------- | ----------------------------------------- | ----------------------------------------- |
| Régions (20)        | ✅ 100 % (loi 2023 + Wikipedia)            | Validation officielle                     |
| Cercles (159)       | ⚠️ 64 noms confirmés + 50 polygones (CC BY)| 95 cercles restants + coordonnées RGPH    |
| Arrondissements (466) | ❌ 0                                       | RGPH 2009/2024 — **demande requise**      |
| Communes (819)      | ⚠️ 10 échantillons                         | RGPH — **demande requise**                |
| Villages (12 712)   | ❌ 0                                       | Microdata RGPH — **demande très formelle**|

INSTAT est la **seule** source officielle qui peut fournir :

1. Les noms officiels exacts (orthographe française + transcription bambara)
2. Les coordonnées géographiques précises (centroides ou polygones)
3. Le rattachement hiérarchique (commune ⊂ arrondissement ⊂ cercle)
4. Les codes administratifs internes utilisés par les autres ministères
5. Les données démographiques associées (population par localité)

Sans ces données, les sites comme la cartographie heatmap par arrondissement,
les RDV CTDEC par commune, et la suggestion de centre RAVEC le plus proche
restent **incomplets**.

---

## 2. Points de contact officiels

| Canal                  | Adresse                                      | Usage                          |
| ---------------------- | -------------------------------------------- | ------------------------------ |
| Email officiel         | `direction@instat.ml`                        | Demande formelle, accord       |
| Téléphone              | `+223 20 22 24 55`                           | Suivi, relance                 |
| Adresse postale        | INSTAT, Rue 7, Porte 18, Bamako              | Courrier officiel papier (rare)|
| Microdata catalog      | `microdata.instat.ml`                        | Inscription pour datasets RGPH |
| Open Data Africa Mali  | `mali.opendataforafrica.org`                 | Datasets agrégés (pas microdata)|
| Plateforme PxWeb       | `pxweb.instat.ml`                            | Indicateurs statistiques       |

**Conseil pratique** : commencer par s'inscrire sur `microdata.instat.ml`
(libre, 5 min) avant la demande formelle. L'inscription donne accès aux
métadonnées et permet de cibler la demande précisément.

---

## 3. Template de demande officielle

À envoyer à `direction@instat.ml` avec copie à `info@instat.ml` :

```text
Objet : Demande d'accès aux données administratives géoréférencées
        pour la plateforme NINA-AES (CTDEC / DNEC)

Monsieur le Directeur Général de l'INSTAT,

Dans le cadre du projet universitaire NINA-AES Platform porté par
[NOM ÉTUDIANT], étudiant à l'Université du Québec à Rimouski (UQAR) sous
l'encadrement de [NOM PROFESSEUR TUTEUR], en partenariat avec le Centre
de Traitement des Données de l'État Civil (CTDEC) et la Direction
Nationale de l'État Civil (DNEC), nous sollicitons l'accès aux données
administratives géoréférencées suivantes :

1. Liste exhaustive des 159 cercles du Mali (loi N°2023-001 du 13 mars
   2023), incluant pour chaque cercle :
   • Code administratif officiel INSTAT
   • Nom officiel français + transcription bambara
   • Rattachement régional (1 sur les 19 régions + District de Bamako)
   • Coordonnées géographiques du chef-lieu (lat/lng WGS84)
   • Date de création / loi de référence

2. Liste exhaustive des 466 arrondissements, format identique au point 1.

3. Liste des 819 communes (urbaines et rurales), avec coordonnées et
   rattachement à leur arrondissement parent.

4. Si possible, liste des 12 712 villages issue du RGPH 2009 (ou RGPH5
   2024 si publié), avec coordonnées approximatives. À défaut, nous
   utiliserons OpenStreetMap pour ce niveau de granularité.

USAGE DES DONNÉES
─────────────────
Ces données seront utilisées exclusivement pour :
• Le référentiel administratif de la plateforme NINA-AES (recherche
  NINA, sélection de centre RAVEC, validation des adresses citoyennes)
• La cartographie publique souveraine (visualisation par région)
• L'instruction des demandes de correction d'erreurs sur les FDI

Aucune donnée nominative de citoyen n'est concernée par cette demande.

FORMAT SOUHAITÉ
───────────────
• CSV UTF-8 ou JSON (priorité au CSV pour faciliter la conversion)
• Encodage strict UTF-8 NFC (accents préservés)
• 1 fichier par niveau administratif

LICENCE & ATTRIBUTION
─────────────────────
Nous nous engageons à :
• Mentionner explicitement l'INSTAT comme source officielle dans toutes
  les publications du projet
• Respecter la licence d'utilisation que vous nous communiquerez
• Ne pas redistribuer les données brutes sans autorisation expresse

Nous restons à votre disposition pour signer toute convention nécessaire
(NDA, accord de recherche, etc.).

Délai souhaité : sous 4 à 6 semaines, pour intégration dans la
soutenance prévue [DATE].

Bien cordialement,

[NOM ÉTUDIANT]
Étudiant en Informatique
Université du Québec à Rimouski
Email : [EMAIL]
Téléphone : [TÉLÉPHONE]

[NOM PROFESSEUR TUTEUR]
Encadrant universitaire
Email : [EMAIL]

Cc : direction.ctdec@gouv.ml
     direction.dnec@gouv.ml
```

---

## 4. Workflow d'intégration une fois les données reçues

Hypothèse : INSTAT fournit un fichier CSV ou Excel par niveau admin.

### 4.1 Réception et validation

```powershell
# 1. Sauvegarder les fichiers bruts dans un dossier privé du repo
mkdir -p data/_raw/instat-rgph5/
# Copier les fichiers reçus dedans (PAS commiter — ajouter à .gitignore)

# 2. Vérifier l'encodage (doit être UTF-8 NFC)
file -i data/_raw/instat-rgph5/*.csv

# 3. Compter les lignes (doit correspondre aux nombres officiels)
wc -l data/_raw/instat-rgph5/*.csv
```

### 4.2 Conversion vers format projet

Créer un script `scripts/import-from-instat.mjs` (template à dériver de
`generate-seed-sql.mjs`) qui :

1. Lit les CSV INSTAT
2. Normalise les noms (NFC, espaces, casse)
3. Croise avec les données existantes (`cercles.json`, `regions.json`)
4. Détecte les conflits (orthographes divergentes, codes différents)
5. Émet :
   - `data/mali/arrondissements.json` (nouveau)
   - `data/mali/communes.json` (nouveau, remplace l'échantillon)
   - `data/mali/villages.json` (nouveau, si fourni)
   - Un rapport de conflits à arbitrer manuellement

```powershell
# Lancer l'import (mode dry-run par défaut)
node scripts/import-from-instat.mjs --source data/_raw/instat-rgph5/

# Si conflits OK, appliquer
node scripts/import-from-instat.mjs --source data/_raw/instat-rgph5/ --write
```

### 4.3 Régénération des artefacts dérivés

```powershell
# 1. Régénérer le SQL avec les nouvelles données
make seed-locations-generate

# 2. Re-valider la chaîne complète
pnpm run verify:repo

# 3. Re-seeder la base de dev
docker exec -i nina-postgres psql -U nina_admin -d nina_aes_db `
  < infrastructure/scripts/seed-locations.sql

# 4. Re-seed Prisma (si l'app NestJS lit aussi les JSON)
pnpm --filter @nina-aes/database db:seed
```

### 4.4 Mise à jour de la doc

- `docs/data/mali-divisions.md §3` : actualiser les chiffres de complétude
- `data/mali/README.md` : ajouter les nouveaux fichiers
- `docs/CHANGELOG.md` : entrée datée

---

## 5. Sources alternatives en attendant la réponse INSTAT

Si la réponse INSTAT tarde (commun : 4-12 semaines), enrichir
partiellement via :

| Source                    | Coverage attendue                          | Effort           |
| ------------------------- | ------------------------------------------ | ---------------- |
| Wikipedia FR (scrap)      | ~80 % des cercles (noms + chefs-lieux)    | 4 h (script Python) |
| geoBoundaries ADM3        | Polygones arrondissements si disponibles  | 2 h              |
| OpenStreetMap Overpass    | Villages (~80 % coverage)                 | 8 h + ~5 MB data |
| OCHA HDX                  | Shapefile officiel ADM (inscription CC BY)| 2 h              |

**Recommandation** : faire la demande INSTAT **maintenant** (délai
incompressible) et enrichir partiellement via geoBoundaries ADM3 ou
Wikipedia en parallèle.

---

## 6. Suivi de la demande

| Date      | Étape                       | Statut          |
| --------- | --------------------------- | --------------- |
| YYYY-MM-DD| Envoi courriel à `direction@instat.ml` | ⏳ À faire |
| YYYY-MM-DD| Accusé de réception INSTAT  |                 |
| YYYY-MM-DD| Demande de précisions       |                 |
| YYYY-MM-DD| Réception données           |                 |
| YYYY-MM-DD| Intégration v1              |                 |

Tenir à jour ce tableau au fil des échanges.

---

## 7. Pour aller plus loin

- **Microdata INSTAT** : <https://microdata.instat.ml> (inscription)
- **Loi N°2023-001 du 13 mars 2023** : Journal Officiel du Mali
- **CTDEC** : `direction.ctdec@gouv.ml` (peut aussi fournir des données
  internes à des fins de prototypage si projet validé par la DNEC)
- **Convention de partenariat type CTDEC-UQAR** : à demander à votre
  professeur tuteur si une convention encadrante existe déjà
