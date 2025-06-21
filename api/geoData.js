const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// In‐memory maps
let cityMap = {};
let airportMap = [];
let seaportMap = [];
let initialized = false;

// Haversine helper
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Find nearest entry in array of { lat, lon, name, code? }
function findNearest(list, lat, lon) {
  let best = null;
  let minD = Infinity;
  for (const item of list) {
    const d = haversine({ lat, lon }, item);
    if (d < minD) {
      minD = d;
      best = item;
    }
  }
  return best;
}

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Cities ≥ 1000
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
  });
  for (const r of cities) {
    const [lat, lon] = r['Coordinates']
      .split(',')
      .map(s => parseFloat(s.trim()));
    const names = [
      r['Name'],
      r['ASCII Name'],
      ...r['Alternate Names'].split(',').map(s => s.trim())
    ].filter(n => n);
    for (const n of names) {
      cityMap[n.toLowerCase()] = { lat, lon, usedName: n };
    }
  }

  // 2️⃣ Airports (commercial only: filter scheduled_service = “yes”)
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const airports = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
  });
  for (const r of airports) {
    if (r.scheduled_service !== 'yes') continue;
    const lat = parseFloat(r.latitude_deg);
    const lon = parseFloat(r.longitude_deg);
    const code = r.iata_code || r.icao_code;
    airportMap.push({
      lat,
      lon,
      name: r.name,
      code,
      key: (r.iata_code || r.icao_code || r.ident).toLowerCase(),
      usedName: `${r.name} (${code || r.ident})`
    });
  }

  // 3️⃣ Seaports
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';',
    columns: ['code','port_name','lat','lon','country','zone'],
    skip_empty_lines: true,
    relax_column_count: true,
  });
  for (const r of seaports) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    seaportMap.push({
      lat,
      lon,
      name: r.port_name,
      code: r.code,
      key: r.code.toLowerCase(),
      usedName: `${r.port_name} (${r.code})`
    });
  }

  console.log(
    `Loaded ${Object.keys(cityMap).length} cities, ` +
    `${airportMap.length} airports, ` +
    `${seaportMap.length} seaports`
  );
}

function lookupLocation(name, mode) {
  const key = (name || '').toLowerCase();
  loadData(); // ensure data loaded

  if (mode === 'road') {
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city: ${name}`);
    return city;
  }

  if (mode === 'air') {
    // exact airport
    let a = airportMap.find(a=> a.key === key);
    if (a) return a;
    // fallback → nearest airport to given city
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown airport or city: ${name}`);
    const near = findNearest(airportMap, city.lat, city.lon);
    return near;
  }

  if (mode === 'sea') {
    let s = seaportMap.find(s=> s.key === key);
    if (s) return s;
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown seaport or city: ${name}`);
    const near = findNearest(seaportMap, city.lat, city.lon);
    return near;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation, haversine };
