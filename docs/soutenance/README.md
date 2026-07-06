# Dossier de soutenance NINA-AES — Index

Ce dossier rassemble les pièces écrites de la soutenance du projet **NINA-AES Platform** (Système
Sécurisé de Gestion d'Identité Numérique pour l'Alliance des États du Sahel). Il est destiné à un
**jury mixte** : le professeur tuteur technique de l'UQAR, les tuteurs institutionnels du CTDEC, et
le jury académique généraliste de l'UQAR. Chaque pièce est rédigée pour rester lisible par ces trois
publics à la fois — la profondeur technique y est cadrée par des rappels de contexte et des
justifications de choix.

Principe de production : **le fichier `.md` est la source de vérité**, versionné dans le dépôt et
relu en revue ; **le `.docx` distribué au jury est généré** à partir de ces `.md` par un
convertisseur maison (`scripts/md-to-docx.py`). On ne corrige jamais le `.docx` à la main : toute
modification passe par le Markdown, puis par une régénération. Cela garantit que le document remis
correspond exactement à l'état relu et commité.

---

## Pièces du dossier

Légende des statuts :

- ✅ **rédigé** — contenu complet et relu, prêt à intégrer le `.docx`.
- 🟡 **v1 à enrichir** — structure complète et contenu de premier jet ; certaines sections seront
  densifiées au fil des jalons.

| Fichier                 | Rôle                                                                                                                                  | Statut           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `README.md`             | Index du dossier (ce fichier) : carte des pièces, procédure de régénération `.docx`, conventions captures, légende du document vivant | ✅ rédigé        |
| `plan-presentation.md`  | Plan de soutenance minuté (≈30 min + Q&A), adapté au jury mixte, avec règle d'or et checklists                                        | ✅ rédigé        |
| `slides-content.md`     | Trame de contenu des ~30 slides (une section par slide, notes de visuel)                                                              | ✅ rédigé        |
| `demo-script.md`        | Script de démonstration live **mock-first** : préparation, parcours exacts citizen / admin / governance, plan B, checklists           | ✅ rédigé        |
| `qa-anticipated.md`     | Top ~28 questions du jury + réponses préparées (technique, institutionnel, éthique, gestion de projet)                                | ✅ rédigé        |
| `metrics.md`            | Métriques consolidées : **faits vérifiés** (périmètre du code) vs **🔲 à mesurer** (couverture, perfs k6, score IA)                   | 🟡 v1 à enrichir |
| `captions.md`           | **Légendes des 23 captures**, écran par écran (fichier → légende → point à souligner au jury)                                         | ✅ rédigé        |
| `retrospective.md`      | Rétrospective honnête : ce qui a marché, ce qui a moins marché, ce qu'on referait                                                     | 🟡 v1 à enrichir |
| `ROADMAP-COMPLETION.md` | Feuille de route de complétion post-remise : _Definition of Complete_, couture échangeable, backlog priorisé                          | ✅ rédigé        |

> Les pièces marquées 🟡 sont des **documents vivants** : leur structure est figée, leur contenu se
> complète au rythme des jalons (les seules zones en attente sont les **métriques mesurées** —
> couverture de tests, perfs, score IA — qui dépendent du branchement backend ; voir « Document
> vivant » plus bas).

---

## Régénérer le `.docx`

Le `.docx` remis au jury est produit par le convertisseur maison `scripts/md-to-docx.py` (sans
dépendance externe). Il assemble plusieurs `.md` dans l'ordre passé en arguments, ajoute une page de
garde, puis écrit le fichier de sortie.

Commande de référence (depuis la racine du dépôt) :

```bash
python scripts/md-to-docx.py \
  --out docs/soutenance/DOSSIER-SOUTENANCE.docx \
  --title "NINA-AES — Dossier de soutenance" \
  --subtitle "UQAR — v1 (juin 2026)" \
  docs/soutenance/README.md \
  docs/soutenance/plan-presentation.md \
  docs/soutenance/slides-content.md \
  docs/soutenance/demo-script.md \
  docs/soutenance/qa-anticipated.md \
  docs/soutenance/metrics.md \
  docs/soutenance/captions.md \
  docs/soutenance/retrospective.md \
  docs/soutenance/ROADMAP-COMPLETION.md
```

L'ordre des fichiers d'entrée détermine l'ordre des sections dans le `.docx`.

> **Même outil pour le rapport final.** Ce convertisseur est le même que celui prévu pour générer le
> futur **rapport final de 60 à 80 pages**. Toute amélioration apportée au script (gestion des
> tableaux, des blocs de code, des sauts de page) bénéficie donc aux deux livrables. C'est pourquoi
> le Markdown du dossier respecte une discipline stricte (titres `#` à `####`, listes `- `, tableaux
> pipe, pas de HTML) : ce qui passe proprement ici passera proprement dans le rapport final.

---

## Captures d'écran

Les **23 captures** finales (HD ×2, mock-first) sont rangées par application sous
`docs/soutenance/screenshots/`, une sous-arborescence par cible :

```text
docs/soutenance/
├── captions.md   # légendes : nom de fichier -> légende du jury
└── screenshots/
    ├── citizen/      # portail citoyen (port 4001) — PC-01 à PC-06 (+ mobile, + BM)
    ├── admin/        # back-office agent (port 4002) — AD-01 à AD-03 (+ login, stubs)
    ├── governance/   # gouvernance SGOGT (port 4003) — login, GOV-01, GOV-02, stubs
    └── infra/        # preuve d'intégration optionnelle (Swagger gateway) — à produire au besoin
```

**Convention de nommage** : `<code-écran>-<slug-court>-<langue>.png`, en minuscules, mots séparés
par des tirets.

- Code d'écran : `pc-02`, `ad-01`, `gov-01`, etc.
- Slug court : description en quelques mots (`fiche-citoyen`, `dashboard`, `sigac`).
- Suffixe de langue : `-fr` pour le français (langue de référence), `-bm` pour la version vitrine
  bambara ; suffixe `-mobile` pour les captures responsive.

Exemples : `pc-02-fiche-citoyen-fr.png`, `ad-01-dashboard-fr.png`, `pc-01-accueil-bm.png`,
`pc-01-accueil-mobile-fr.png`.

Les captures sont **reproductibles** via Playwright (Chromium déjà installé, mode
`NINA_AUTH_MODE=mock`, `deviceScaleFactor: 2`) — voir l'en-tête de `captions.md` pour la commande
exacte. Chaque capture a sa **légende** dans `captions.md` (clé = nom de fichier, valeur = texte
affiché sous l'image dans le rapport).

---

## Document vivant

Ce dossier est un **document vivant v1** : la structure complète existe, et l'essentiel du contenu
est rédigé. Les seules sections en attente sont celles qui dépendent d'une **mesure** non encore
réalisée (couverture de tests, perfs k6, score du modèle IA) — car elles supposent un backend
branché, hors du périmètre de la démo mock-first. Plutôt que d'inventer un chiffre, ces sections
portent un bloc honnête :

> 🔲 **À COMPLÉTER (Sx)** : _quoi produire + comment l'obtenir._

Ce marqueur a deux fonctions :

1. **Transparence envers le jury** — aucun résultat n'est affirmé tant qu'il n'est pas mesuré ; les
   zones en attente sont signalées, pas masquées.
2. **Pilotage interne** — chaque 🔲 reste rattaché à un jalon, ce qui en fait une liste de tâches
   traçable jusqu'à la remise du **22 août 2026**.

Au fil des jalons, chaque bloc 🔲 est remplacé par le contenu réel, et le `.docx` est régénéré à
chaque palier significatif.

---

## Référence méthodologique

La pièce canonique **`docs/26-RAPPORT-FINAL-SOUTENANCE.md`** sert de **référence méthodologique**
pour ce dossier : cadrage académique UQAR, ton, niveau d'exigence, conventions de rédaction et
structure attendue du rapport final. En cas de doute sur la forme ou le périmètre d'une pièce, c'est
ce document qui fait foi.
