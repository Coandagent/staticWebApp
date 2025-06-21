const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap = {};
let airportMap = {};
let seaportMap = {};
let initialized = false;

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Cities ≥1k pop (semicolon-delimited CSV with header)
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    comment: '#'
  });
  cities.forEach(r => {
    const coords = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    const lat = coords[0], lon = coords[1];
    // index by Name, ASCII Name, and each Alternate Name
    [ r['Name'], r['ASCII Name'], ...r['Alternate Names'].split(',') ]
      .map(n => n && n.trim())
      .filter(n => n)
      .forEach(name => {
        cityMap[name.toLowerCase()] = { lat, lon, usedName: name };
      });
  });

  // 2️⃣ Airports (comma-delimited CSV)
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const airports = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  airports.forEach(r => {
    // only scheduled_service 'yes' => commercial
    if (r.scheduled_service && r.scheduled_service.toLowerCase() === 'yes') {
      const key = (r.iata_code || r.icao_code || r.ident || r.name).toLowerCase();
      airportMap[key] = {
        lat: parseFloat(r.latitude_deg),
        lon: parseFloat(r.longitude_deg),
        usedName: r.name + (r.iata_code ? ` (${r.iata_code})` : '')
      };
    }
  });

  // 3️⃣ Seaports (semicolon-delimited CSV)
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  seaports.forEach(r => {
    // index by UNLOCODE and port_name
    [ (r.UNLOCODE || '').toLowerCase(), (r.port_name || '').toLowerCase() ]
      .filter(n => n)
      .forEach(key => {
        seaportMap[key] = {
          lat: parseFloat(r.latitude),
          lon: parseFloat(r.longitude),
          usedName: r.port_name
        };
      });
  });

  console.log(
    `Loaded cities: ${Object.keys(cityMap).length}, airports: ${Object.keys(airportMap).length}, seaports: ${Object.keys(seaportMap).length}`
  );
}

function lookupLocation(name, mode) {
  const key = (name || '').toLowerCase();
  if (mode === 'road') {
    if (!cityMap[key]) throw new Error(`Unknown city: ${name}`);
    return cityMap[key];
  }
  if (mode === 'air') {
    if (airportMap[key]) return airportMap[key];
    // fallback: nearest airport by brute-distance
    return findNearest(cityMap[key], airportMap, `airport for ${name}`);
  }
  if (mode === 'sea') {
    if (seaportMap[key]) return seaportMap[key];
    return findNearest(cityMap[key], seaportMap, `seaport for ${name}`);
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

// brute-force nearest neighbor
function findNearest(base, pool, errMsg) {
  if (!base) throw new Error(`Unknown base location`);
  let best = null, bestD = Infinity;
  Object.values(pool).forEach(loc => {
    const d = haversine(base, loc);
    if (d < bestD) { bestD = d; best = loc; }
  });
  if (!best) throw new Error(`No ${errMsg} available`);
  best.usedName = best.usedName || '(fallback)';
  return best;
}

function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

module.exports = { loadData, lookupLocation };
