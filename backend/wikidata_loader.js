const fetch = require('node-fetch')

class SPARQLQueryDispatcher {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  query(sparqlQuery) {
    const fullUrl = this.endpoint + '?query=' + encodeURIComponent(sparqlQuery);
    const user_agent = 'Non-Male-Streets/1.0 (https://github.com/thomasrosen/streets.thomasrosen.me; streets@thomasrosen.me)'
    const headers = {
      'Accept': 'application/sparql-results+json',
      'User-Agent': user_agent,
      'Api-User-Agent': user_agent,
    };

    return fetch(fullUrl, { headers })
    .then(body => body.json());
  }
}

function load_from_wikidata_ids_internal(ids) {
  return new Promise((resolve, reject) => {
    // ids = array of wikidata ids

    const endpointUrl = 'https://query.wikidata.org/sparql';
    const sparqlQuery = `
SELECT ?item ?itemLabel ?name_en ?gender ?named_after_en ?sitelinks WHERE {
  VALUES ?item {
    ${ids.map(id => `wd:${id}`).join('\n    ')}
  }
  OPTIONAL {
    ?item wikibase:sitelinks ?sitelinks;
  }
  OPTIONAL {
    ?item wdt:P21 ?gender_tmp.
    ?gender_tmp rdfs:label ?gender.
    FILTER(LANG(?gender) = "en") # filter for English labels only
  }
  # OPTIONAL {
  #   ?item wdt:P138 ?named_after_tmp.
  #   ?named_after_tmp rdfs:label ?named_after_de.
  #   FILTER(LANG(?named_after_de) = "de") # filter for English labels only
  # }
  OPTIONAL {
    ?item wdt:P138 ?named_after_tmp.
    ?named_after_tmp rdfs:label ?named_after_en.
    FILTER(LANG(?named_after_en) = "en") # filter for English labels only
  }
  # OPTIONAL {
  #   ?item rdfs:label ?name_de.
  #   FILTER(LANG(?name_de) = "de") # filter for English labels only
  # }
  OPTIONAL {
    ?item rdfs:label ?name_en.
    FILTER(LANG(?name_en) = "en") # filter for English labels only
  }
  # SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}
ORDER BY DESC(?sitelinks)
`;

    const queryDispatcher = new SPARQLQueryDispatcher(endpointUrl);
    queryDispatcher.query(sparqlQuery)
      .then(data => {

        const transformed_data = data.results.bindings
          .map(binding => {
            const name_en = binding?.name_en?.value || null
            const named_after_en = binding?.named_after_en?.value || null
            const name_for_gendering = named_after_en || name_en || null

            let gender = binding?.gender?.value || null
            if (gender === 'female') {
              gender = 'f'
            } else if (gender === 'male') {
              gender = 'm'
            }

            const link = binding?.item?.value || null
            const sitelinks_count = parseInt(binding?.sitelinks?.value || '0')

            return {
              link,
              id: link.split('/').pop(),
              sitelinks_count,
              name_en,
              name_for_gendering,
              gender,
              // itemLabel: binding?.itemLabel?.value || null,
              // name_de: binding?.name_de?.value || null,
              // named_after_en,
              // named_after_de: binding?.named_after_de?.value || null,
            }
          })

        resolve(transformed_data)
      })
      .catch(reject);
  })
}

function load_from_wikidata_ids(ids) {
  if (ids.length === 0) {
    return Promise.resolve([])
  }

  return new Promise(async (resolve, reject) => {
    // split ids into chunks of 50
    let chunks = []
    while (ids.length > 0) {
      chunks.push(ids.splice(0, 50))
    }

    const result = (await Promise.all(
      chunks.map(chunk => load_from_wikidata_ids_internal(chunk))
    ))
    .flat()

    resolve(result)
  })
}

function load_wikidata(wikidata_id) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&languages=en&ids=${wikidata_id}`
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      const entities = json.entities
      const entity = entities[wikidata_id]

      const properties = {
        is_human: false,
        is_male: false,
      }
      if (entity.claims.P31 && entity.claims.P31[0].mainsnak.datavalue.value.id === 'Q5') {
        result.is_human = true
        if (entity.claims.P21 && entity.claims.P21[0].mainsnak.datavalue.value.id === 'Q6581097') {
          result.is_male = true
        }
      }

      return properties
    })
}

// const ids = 'Q55753970,Q63532607,Q75380186,Q105492052'.split(',');
// load_from_wikidata_ids(ids)
//   .then(console.log)

module.exports = {
  load_from_wikidata_ids,
}
