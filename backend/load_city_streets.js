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

const fs = require('fs')
const fetch = require('node-fetch')
const geolib = require('geolib')

const cache_folder_path = './cache'

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

function get_filename(lat_village, lon_village) {
  return `${cache_folder_path}/overpass-${String(lat_village).replace('.', '_')}-${String(lon_village).replace('.', '_')}.json`
}

async function load_streets_from_overpass(lat_village, lon_village) {

  const query = `
[out:json];
is_in(${lat_village},${lon_village});
area._
  ["place"="city"]
  ["type"="boundary"]
  ["boundary"="administrative"]
  ->.city;
way
  ["highway"]
  ["name"]
  (area.city);
out tags geom;
  ` // ["wikidata"]

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

  const content = await fetch(url)
    .then(res => res.json())
    .then(content_parsed => {
      // TODO check if body has an error

      content_parsed.timestamp = Date.now()

      const filename = get_filename(lat_village, lon_village)
      fs.writeFileSync(filename, JSON.stringify(content_parsed))
      return content_parsed
    })

  return content
}

async function get_streets(lat, lon) {

  const village_precision = 0.0001
  const lat_village = Math.round(lat / village_precision) * village_precision
  const lon_village = Math.round(lon / village_precision) * village_precision

  const filename = get_filename(lat_village, lon_village)

  // check if cache folder exists
  if (!fs.existsSync(cache_folder_path)) {
    fs.mkdirSync(cache_folder_path)
  }

  // check if file exists
  if (fs.existsSync(filename)) {
    // IF YES load from file
    const content = fs.readFileSync(filename, 'utf8')
    const content_parsed = JSON.parse(content)
    if (content_parsed.timestamp > Date.now() - 1000 * 60 * 60 * 24 * 7) {
      // if file is NOT older than 7 days
      return content_parsed
    } else {
      // if file is older than 7 days
      const content_parsed = await load_streets_from_overpass(lat, lon)
      return content_parsed
    }
  }

  // ELSE load from overpass

  const content_parsed = await load_streets_from_overpass(lat, lon)
  return content_parsed
}

async function transform_streets(lat, lon) {

  console.info('loading streets')

  get_streets(lat, lon)
    .then(async content_parsed => {
      console.info('parsing ways')

      // const nodes = json
      //   .elements
      //   .filter(element => element.type === 'node')

      let ways = await Promise.all(
        content_parsed
        .elements
        .filter(element => element.type === 'way')
        // .slice(0, 1000)
        .map(async element => {

          // const path = element.geometry
          //   .map(node => ({
          //     latitude: node.lat,
          //     longitude: node.lon,
          //   }))

          // const path = element.nodes
          //   .map(node => {
          //     const found_node = nodes.find(element => element.id === node);
          //     return {
          //       latitude: found_node.lat,
          //       longitude: found_node.lon,
          //     }
          //   })

          // let length_in_meter = geolib.getPathLength(path)
          // let length_in_meter = geolib.getPathLength(geometry, (start, end) => {
          //   return geolib.getPreciseDistance(start, end, 1)
          // })
          // length_in_kilometer = geolib.convertDistance(length_in_meter, 'km');

          const name = element.tags.name || null
          const gender = (typeof name === 'string' && name.length > 0)
            ? await get_gender(name)
            : null

          return {
            id: element.id,
            name,
            gender,
            // length: length_in_meter,
            geometry: element.geometry,
            wikidata: element.tags.wikidata || element.tags['name:etymology:wikidata'] || null,
          }
        })
      )

      console.info('getting gender infos from wikidata')

      ways = await get_gender_with_wikidata(ways)

      console.info(' ')
      console.info('done')
      console.info(' ')

      const f_ways = ways.filter(way => way.gender === 'f')
      const m_ways = ways.filter(way => way.gender === 'm')
      // const u_ways = ways.filter(way => way.gender === 'u') // .length
      const not_null_ways = ways.filter(way => way.gender !== null).length
      const null_ways = ways.filter(way => way.gender === null)

      const m_ways_length = m_ways.length
      const f_ways_length = f_ways.length

      console.log('ways.length', ways.length)
      console.log('f_ways', f_ways_length, `${f_ways_length / not_null_ways * 100}%`)
      console.log('m_ways', m_ways_length, `${m_ways_length / not_null_ways * 100}%`)
      // console.log('u_ways', u_ways.length, `${u_ways.length / not_null_ways * 100}%`)
      console.log('0_ways', null_ways.length)
      console.log(' ')

      let missing_names = f_ways.map(way => way.name)
      missing_names = //[...new Set(
        [...new Set(missing_names)]
        // .map(name => simplify_streetname(name))
      // )]
        // .map(name => `${name} | ${simplify_streetname(name)}`)
        .join("\n")

        fs.writeFileSync('missing_names.txt', missing_names)

      // console.log('\n street names \n\n\n', missing_names)
      // console.log('\n\n')
    })
}

transform_streets(52.4578692, 12.9922736)

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
