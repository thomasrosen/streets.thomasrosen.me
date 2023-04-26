/*

https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q2646

https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&languages=en&ids=Q2646&

	
entities['Q2646'].claims.P21[0].mainsnak.datavalue.value.id	=== 'Q6581097'

P31 = instance of
Q5 = human



// This shows streets in a specific City.

[out: json];
is_in(52.4578692, 12.9922736);
area._[place = "city"][type = "boundary"][boundary = "administrative"] ->.city;
way(area.city)[highway][name][wikidata]; // [wikidata];
out body;
>;
out skel qt;

https://overpass-api.de/api/interpreter?data=[out%3Ajson]%3Bis_in(___LAT___%2C___LON___)%3Barea._["place"%3D"city"]["type"%3D"boundary"]["boundary"%3D"administrative"]->.city%3Bway["highway"]["name"]["wikidata"](area.city)%3Bout%3B>%3Bout skel qt%3B%0A

*/

const fetch = require('node-fetch')
const geolib = require('geolib')


const { get_gender, simplify_streetname } = require('./get_gender.js')
const { load_from_wikidata_ids } = require('./wikidata_loader.js')

async function get_gender_with_wikidata (ways) {
  const missing_gender_wikidata_ids = [...new Set(
    ways
      .filter(data => data.gender === null && typeof data.wikidata === 'string')
      .flatMap(data => data.wikidata.split(';'))
      .filter(wikidata_id => wikidata_id.startsWith('Q'))
  )]

  const wikidata_data = (await Promise.all(
    (await load_from_wikidata_ids(missing_gender_wikidata_ids))
    .map(async data => {
      if (data.gender === null) {
        const name = data.name_for_gendering
        if (typeof name === 'string' && name.length > 0) {
          data.gender = await get_gender(name)
        }
      }

      if (data.gender === null) {
        return null
      }

      return data
    })
  ))
    .filter(Boolean)

  for (const data of wikidata_data) {
    const way_index = ways.findIndex(way => typeof way.wikidata === 'string' && way.wikidata.includes(data.id))
    if (way_index !== -1) {
      ways[way_index].gender = data.gender
    }
  }

  return ways
}

async function getStreets(lat, lon) {
  const url = `https://overpass-api.de/api/interpreter?data=[out%3Ajson]%3Bis_in(${lat}%2C${lon})%3Barea._["place"%3D"city"]["type"%3D"boundary"]["boundary"%3D"administrative"]->.city%3Bway["highway"]["name"](area.city)%3Bout%3B>%3Bout skel qt%3B%0A`; // ["wikidata"]

  await fetch(url)
    .then(res => res.json())
    .then(async json => {

      const nodes = json
        .elements
        .filter(element => element.type === 'node')

      let ways = await Promise.all(
        json
        .elements
        .filter(element => element.type === 'way')
        .slice(0, 10000)
        .map(async element => {

          const path = element.nodes
            .map(node => {
              const found_node = nodes.find(element => element.id === node);
              return {
                latitude: found_node.lat,
                longitude: found_node.lon,
              }
            })

          let length_in_meter = geolib.getPathLength(path, (start, end) => {
            return geolib.getPreciseDistance(start, end, 1)
          })
          // length_in_kilometer = geolib.convertDistance(length_in_meter, 'km');

          const name = element.tags.name || null
          const gender = (typeof name === 'string' && name.length > 0)
            ? await get_gender(name)
            : null

          return {
            id: element.id,
            name,
            gender,
            length: length_in_meter,
            path,
            wikidata: element.tags.wikidata || element.tags['name:etymology:wikidata'] || null,
          }
        })
      )

      ways = await get_gender_with_wikidata(ways)

      const f_ways = ways.filter(way => way.gender === 'f').length
      const m_ways = ways.filter(way => way.gender === 'm').length
      // const u_ways = ways.filter(way => way.gender === 'u') // .length
      const not_null_ways = ways.filter(way => way.gender !== null).length
      const null_ways = ways.filter(way => way.gender === null)

      console.log('ways.length', ways.length)
      console.log('f_ways', f_ways, `${f_ways / not_null_ways * 100}%`)
      console.log('m_ways', m_ways, `${m_ways / not_null_ways * 100}%`)
      // console.log('u_ways', u_ways.length, `${u_ways.length / not_null_ways * 100}%`)
      console.log('0_ways', null_ways.length)
      console.log(' ')

      // let missing_names = null_ways.map(way => way.name)
      // missing_names = [...new Set(
      //   [...new Set(missing_names)]
      //   .map(name => simplify_streetname(name))
      // )]
      //   // .map(name => `${name} | ${simplify_streetname(name)}`)
      // console.log('\nmissing_names\n\n\n', missing_names.join("\n"))
      // console.log('\n\n')
    })
}

getStreets(52.4578692, 12.9922736)

/*

Jägerstraße
Försterweg
G.-W.-Pabst-Straße
Zarah-Leander-Straße
Joe-May-Straße
Mendelssohn-Bartholdy-Straße
Schubertstraße
Mozartstraße
Edisonallee

*/
