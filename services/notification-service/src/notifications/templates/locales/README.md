# Templates de notification — fichiers de langue

Un fichier JSON par langue nationale. Le moteur (`template.registry.ts`) charge les 8 fichiers au
démarrage et **retombe sur le français (`fr.json`)** lorsqu'une clé ou un canal manque dans la
langue demandée.

| Code  | Langue     | Statut traduction                   |
| ----- | ---------- | ----------------------------------- |
| `fr`  | Français   | ✅ Référence (complet, autoritatif) |
| `bm`  | Bamanankan | ⏳ Vide → fallback FR               |
| `snk` | Soninké    | ⏳ Vide → fallback FR               |
| `ff`  | Fulfulde   | ⏳ Vide → fallback FR               |
| `tmq` | Tamasheq   | ⏳ Vide → fallback FR               |
| `hau` | Hausa      | ⏳ Vide → fallback FR               |
| `mos` | Mooré      | ⏳ Vide → fallback FR               |
| `dje` | Zarma      | ⏳ Vide → fallback FR               |

> **Intégrité linguistique** : les messages d'un système d'identité d'État ne doivent pas être
> traduits « à la machine ». Les 7 langues non encore remplies attendent une **relecture par un
> locuteur natif** avant mise en production (cf. gap projet « Fichiers i18n manquants »).
> L'infrastructure i18n supporte déjà les 8 langues ; il suffit d'ajouter les clés dans chaque
> fichier.

## Format

```json
{
  "<clé-de-template>": {
    "sms": "Texte court avec {variables}",
    "email": { "subject": "Objet {variables}", "body": "Corps {variables}" }
  }
}
```

Les variables `{nom}` sont interpolées au rendu ; les variables obligatoires de chaque template sont
déclarées dans `template.catalog.ts` et validées avant envoi (aucun `{id}` brut ne peut partir).
