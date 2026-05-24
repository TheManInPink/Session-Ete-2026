#!/bin/bash
# ============================================================================
# NINA-AES Platform — Initialisation Elasticsearch
# ============================================================================
# Usage : exécuter après le premier 'docker compose up'
#   bash scripts/init-elasticsearch.sh
# ============================================================================

set -e

ES_URL="http://localhost:9200"
ES_USER="elastic"
ES_PASS="${ELASTIC_PASSWORD:-elastic_dev_2026!}"

echo "=== Initialisation Elasticsearch — Index et analyseurs ==="

# Attendre qu'Elasticsearch soit prêt
echo "  Attente d'Elasticsearch..."
until curl -s -u "$ES_USER:$ES_PASS" "$ES_URL/_cluster/health" | grep -q '"status":"green\|yellow"'; do
  sleep 2
done
echo "  ✓ Elasticsearch est prêt"

# Créer l'index principal pour les citoyens NINA
# avec des analyseurs personnalisés pour les noms bambara/français
curl -s --fail-with-body -u "$ES_USER:$ES_PASS" -X PUT "$ES_URL/nina_citizens" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "filter": {
        "french_stop": {
          "type": "stop",
          "stopwords": "_french_"
        },
        "nina_phonetic": {
          "type": "phonetic",
          "encoder": "double_metaphone",
          "replace": false
        },
        "nina_synonym": {
          "type": "synonym",
          "synonyms": [
            "mamadou,mamady,mamadu,mamadow",
            "mohamed,mohamad,mohammed,muhamed,mouhamad",
            "sekou,secou,seku",
            "oumar,omar,oumare,umar",
            "aminata,aminatou,aminta",
            "fatoumata,fatou,fatouma,fatu",
            "ibrahima,ibrahim,brehima,brahima",
            "moussa,musa,mussa,mousa",
            "issa,isa,hissa",
            "boubacar,boubakar,abubakar,abubacar"
          ]
        }
      },
      "analyzer": {
        "nina_name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding",
            "nina_synonym",
            "nina_phonetic"
          ]
        },
        "nina_search_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "nina_number": {
        "type": "keyword"
      },
      "last_name": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "search_analyzer": "nina_search_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "nina_search_analyzer"
          }
        }
      },
      "first_names": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "search_analyzer": "nina_search_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "nina_search_analyzer"
          }
        }
      },
      "birth_date": {
        "type": "date",
        "format": "yyyy-MM-dd"
      },
      "birth_place": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "fields": {
          "exact": { "type": "keyword" }
        }
      },
      "sex": {
        "type": "keyword"
      },
      "region_code": {
        "type": "keyword"
      },
      "cercle_code": {
        "type": "keyword"
      },
      "commune_code": {
        "type": "keyword"
      },
      "status": {
        "type": "keyword"
      },
      "created_at": {
        "type": "date"
      },
      "updated_at": {
        "type": "date"
      }
    }
  }
}' && echo ""
echo "  ✓ Index nina_citizens créé avec analyseurs phonétiques"

# Créer l'index pour les localités (régions, cercles, communes)
curl -s --fail-with-body -u "$ES_USER:$ES_PASS" -X PUT "$ES_URL/nina_locations" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "analyzer": {
        "location_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "code": { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "location_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "location_analyzer"
          }
        }
      },
      "type": { "type": "keyword" },
      "parent_code": { "type": "keyword" },
      "country": { "type": "keyword" }
    }
  }
}' && echo ""
echo "  ✓ Index nina_locations créé"

echo ""
echo "=== Elasticsearch initialisé avec succès ==="
echo "  URL : $ES_URL"
echo "  Index : nina_citizens, nina_locations"