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

function simplify_streetname(streetname) {
  return streetname
    .toLowerCase()
    .replace(/[-\/\.,’0-9\(\)\[\]  ]/g, ' ')
    .replace(/ß/g, 'ss')
    .replace(/(?:\s|^)(?:von|am|an|der|die|das|des|den|zu|zur|zum|im|in|nach|alt|st\.)(?=\s|$)/g, ' ')
    .replace(/(?:straße|strasse|weg|allee|pfad|chaussee|graben|gasse|damm|platz|ring|brücke|kanal|kolonie|steig|teich|treppe|kirche|terrasse|stieg|berg|remise|ufer|see|hof|dorf|werder|heide|groß|gross|klein|siedlung|horst|süd|nord|ost|west|park)(?:\s|$)/g, ' ')
    .replace(/\s+/, ' ')
    .trim()
}

const names_cache = {}
const full_names_cache = {}
function load_names(filename) { // filename = m / f / u
  if (names_cache[filename]) {
    return names_cache[filename]
  }

  let names = fs.readFileSync(`./data_names/names_${filename}.txt`, 'utf8') // read file
    .toLowerCase() // convert to lowercase
    .split(/[\r\n]/) // split by linebreak
    .filter(Boolean) // remove empty lines
    .flatMap(name => [name, ...name.split('-')]) // Split double names (e.g. "Jan-Olaf") into two names (e.g. "Jan" and "Olaf") but also keep the original name ("Jan-Olaf").
    .map(name => name.trim()) // lowercase
  names = [...new Set(names)] // remove duplicates

  names_cache[filename] = names

  return names // return array
}
function load_full_names(filename) { // filename = m / f / u
  if (full_names_cache[filename]) {
    return full_names_cache[filename]
  }

  let names = fs.readFileSync(`./data_names/full_names_${filename}.txt`, 'utf8') // read file
    .toLowerCase() // convert to lowercase
    .split(/[\r\n]/) // split by linebreak
    .filter(Boolean) // remove empty lines
    // .flatMap(name => [name, ...name.split(/[\-\s]/g)]) // split into any name part
    .map(name => simplify_streetname(name).trim())
  names = [...new Set(names)] // remove duplicates

  console.log('names', names)

  full_names_cache[filename] = names

  return names // return array
}
function matching_names_count(names, streetname, options = {}) {

  const {
    min_similarity = 0.9,
  } = options

  // let check = false
  // if (streetname === 'alten' || streetname === 'fried') {
  //   check = true
  // }

  const first_letter = streetname[0]

  let res = (
    names
      .filter(name => name[0] === first_letter)
      .map(name => ({
        streetname: streetname,
        name: name,
        distance: levenshtein(name, streetname)
      }))
      .filter(({ distance }) => distance.similarity > min_similarity)
  )

  // if (check) { // && res.length > 0
  //   console.log(names[0][0], streetname, res)
  // }

  res = res
    .map(({ distance }) => distance.similarity)

  if (res.length === 0) {
    res = [0]
  }

  const max = Math.max(0, ...res)
  const sum = res.reduce((acc, similarity) => acc + similarity, 0)
  const avg = sum / res.length
  const score = max + avg * 0.1 // if the max is the same for female and male, the amount of positive names will also be used

  if (score > 1.1) {
    console.log(names[0][0], streetname, score)
  }

  // if (check) { // && res.length > 0
  //   console.log(names[0][0], streetname, score, max, sum, avg)
  // }

  return score
}

async function get_gender(streetname) {
  streetname = simplify_streetname(streetname)

  if (streetname.length < 3) {
    return {
      f: 0,
      m: 0,
    }
  }

  const streetname_parts = simplify_streetname(streetname)
    .split(' ')
    .filter(Boolean)

  const names_f = [
    ...load_names('u'), // unisex
    ...load_names('f'), // female
  ]
  const names_m = load_names('m') // male

  let gender_result_counts = streetname_parts
  .map(sn => ({
    f: matching_names_count(names_f, sn),
    m: matching_names_count(names_m, sn),
  }))
  .filter(sn => 
    sn.f !== 0 ||
    sn.m !== 0
  )
  .reduce((acc, sn) => {
    acc.f += sn.f
    acc.m += sn.m
    return acc
  }, {
    f: 0,
    m: 0,
  })

  // let gap = false
  // if (gender_result_counts.f !== 0) {
  //   console.log('gender_result_counts.f-1', gender_result_counts.f)
  //   console.log('gender_result_counts.m-1', gender_result_counts.m)
  //   gap = true
  // }
  const full_names_f = load_full_names('f')
  const full_names_m = load_full_names('m')
  const full_names_options = { min_similarity: 0.9 }
  gender_result_counts.f += matching_names_count(full_names_f, streetname, full_names_options)
  gender_result_counts.m += matching_names_count(full_names_m, streetname, full_names_options)

  // if (gender_result_counts.f !== 0) {
  //   console.log('gender_result_counts.f-2', gender_result_counts.f)
  //   console.log('gender_result_counts.m-2', gender_result_counts.m)
  //   gap = true
  // }
  // if (gap) {
  //   console.log(' ')
  // }


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
