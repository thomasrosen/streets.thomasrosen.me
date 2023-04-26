// require('dotenv').config()

const fs = require('fs')
const levenshtein = require('damerau-levenshtein')


// const fetch = require('node-fetch')
// function get_gender_with_huggingface() {
//
//   const huggingface_api_key = process.env.huggingface_api_key
//
//   async function query(data) {
//     const response = await fetch(
//       "https://api-inference.huggingface.co/models/padmajabfrl/Gender-Classification",
//       // 'https://api-inference.huggingface.co/models/malcolm/REA_GenderIdentification_v1',
//       {
//         headers: { Authorization: `Bearer ${huggingface_api_key}` },
//         method: 'POST',
//         body: JSON.stringify(data),
//       }
//     );
//     const result = await response.json();
//     return result;
//   }
//
//   query({
//     inputs: ['Thomas','Sabine'],
//   }).then((response) => {
//     console.log(JSON.stringify(response));
//   })
//
//   // https://api-inference.huggingface.co/models/malcolm/REA_GenderIdentification_v1
//   // LABEL_1 = male
//   // LABEL_0 = female
//   // Thomas [[{"label":"LABEL_1","score":0.9974141120910645},{"label":"LABEL_0","score":0.0025858976878225803}]]
//   // Sabine: [[{"label":"LABEL_0","score":0.9980589747428894},{"label":"LABEL_1","score":0.0019409963861107826}]]
//   // {"error":"Model malcolm/REA_GenderIdentification_v1 is currently loading","estimated_time":20}
//
//   // https://api-inference.huggingface.co/models/padmajabfrl/Gender-Classification
//   // Thomas: [[{"label":"Male","score":0.9999992847442627},{"label":"Female","score":6.875796998428996e-7}]]
//   // Sabine: [[{"label":"Female","score":0.9999998807907104},{"label":"Male","score":1.3536764242871868e-7}]]
//   // {"error":"Model malcolm/REA_GenderIdentification_v1 is currently loading","estimated_time":20}
//
// }
// get_gender_with_huggingface()


const names_cache = {}
function load_names(filename) { // filename = m / f / u
  if (names_cache[filename]) {
    return names_cache[filename]
  }

  let names = fs.readFileSync(`./data_names/names_${filename}.txt`, 'utf8') // read file
    .toLowerCase() // convert to lowercase
    .split(/[\r\n]/) // split by linebreak
    .filter(Boolean) // remove empty lines
    .flatMap(name => [name, ...name.split('-')]) // Split double names (e.g. "Jan-Olaf") into two names (e.g. "Jan" and "Olaf") but also keep the original name ("Jan-Olaf").
    .map(name => name.toLowerCase().trim()) // lowercase
  names = [...new Set(names)] // remove duplicates

  names_cache[filename] = names

  return names // return array
}
function matching_names_count(names, streetname) {
  return (
    names
    .map(name => levenshtein(name, streetname))
    .filter(distance => distance.similarity > 0.8)
    .map(distance => distance.similarity)
    .reduce((acc, similarity) => acc + similarity, 0)
  )
}
function simplify_streetname(streetname) {
  return streetname
    .toLowerCase()
    .replace(/(\s|^)(von|am|an|der|die|das|des|den|zu|zur|zum|im|in|nach|alt)(\s|$)/g, ' ')
    .replace(/(straße|strasse|weg|allee|pfad|chaussee|graben|gasse|damm|platz|ring|brücke|kanal|kolonie|steig|teich|treppe|kirche|terrasse|stieg|berg|remise|ufer|see|hof|dorf|werder)/g, ' ')
    .replace(/[-\/]/g, ' ')
    .replace(/\s+/, ' ')
    .trim()
}
async function get_gender(streetname) {
  streetname = simplify_streetname(streetname)
    .split(' ')
    .filter(Boolean)

  // const names_u = load_names('u') // unisex
  const names_f = load_names('f') // female
  const names_m = load_names('m') // male

  let gender_result_counts = streetname
  .map(sn => ({
    // u: matching_names_count(names_u, sn),
    f: matching_names_count(names_f, sn),
    m: matching_names_count(names_m, sn),
  }))
  .filter(sn => 
    // sn.u !== 0 ||
    sn.f !== 0 ||
    sn.m !== 0
  )
  .reduce((acc, sn) => {
    // acc.u += sn.u
    acc.f += sn.f
    acc.m += sn.m
    return acc
  }, {
    // u: 0,
    f: 0,
    m: 0,
  })

  const gender_results_sorted = Object.entries(gender_result_counts)
    .sort((a, b) => b[1] - a[1])
    .map(i => ({ gender: i[0], count: i[1] }))

  if (
    gender_results_sorted[0].count === 0
    && gender_results_sorted[1].count === 0
    // && gender_results_sorted[2].count === 0
  ) {
    return null
  // } else if (
  //   gender_results_sorted[0].count === gender_results_sorted[1].count
  //   && (
  //     (
  //       gender_results_sorted[0].gender === 'f'
  //       && gender_results_sorted[1].gender === 'm'
  //     )
  //     || (
  //       gender_results_sorted[0].gender === 'm'
  //       && gender_results_sorted[1].gender === 'f'
  //     )
  //   )
  // ) {
  //   return 'u'
  } else {
    return gender_results_sorted[0].gender
  }
}

module.exports = {
  simplify_streetname,
  get_gender,
}

// get_gender('Fürst Thomas von Marienberg Straße')
//   .then(console.log)

// get_gender('Karl-Kurfürstendamm')
//   .then(console.log)
