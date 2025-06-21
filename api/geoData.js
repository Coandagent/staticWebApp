const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// in-memory maps
let cityMap    = {};
let airports   = [];
let airportMap = {};
let seaports   = [];
let seaportMap = {};
let initialized = false;

// simple haversine for nearest-fallback
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function loadData() {
  if (initialized) return;
  initialized = true;

  // ─── 1️⃣ Cities ≥1000 population (semicolon-delimited, with “Coordinates” col) ───
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });
  cities.forEach(r => {
    const coords = (r['Coordinates'] || '').split(',');
    if (coords.length !== 2) return;
    const lat = parseFloat(coords[0]), lon = parseFloat(coords[1]);
    // index by Name, ASCII Name, and each alt name
    const names = [
      r['Name'],
      r['ASCII Name'],
      ...(r['Alternate Names'] || '').split(',').map(s => s.trim())
    ];
    names.forEach(n => {
      if (!n) return;
      cityMap[n.toLowerCase()] = { lat, lon, usedName: n };
    });
  });

  // ─── 2️⃣ Airports (comma-delimited “openflights” style) ───
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const ap = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true
  });
  ap.forEach(r => {
    // prefer IATA, then ICAO, then gps_code
    const code = (r.iata_code || r.icao_code || r.gps_code || '').toLowerCase();
    if (!code) return;
    const lat = parseFloat(r.latitude_deg), lon = parseFloat(r.longitude_deg);
    airportMap[code] = { lat, lon, usedName: `${r.name} (${(r.iata_code||r.icao_code) || ''})` };
    airports.push({ lat, lon, code, usedName: airportMap[code].usedName });
  });

  // ─── 3️⃣ Seaports (semicolon-delimited) ───
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const sp = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true
  });
  sp.forEach(r => {
    const code = (r.code || '').toLowerCase();
    if (!code) return;
    const lat = parseFloat(r.latitude), lon = parseFloat(r.longitude);
    seaportMap[code] = { lat, lon, usedName: `${r.name} (${r.code})` };
    seaports.push({ lat, lon, code, usedName: seaportMap[code].usedName });
  });

  console.log(
    'Loaded:', 
    Object.keys(cityMap).length, 'cities,',
    airports.length, 'airports,',
    seaports.length, 'seaports'
  );
}

// mode-aware lookup with nearest fallback
function lookupLocation(name, mode) {
  const key = (name || '').toLowerCase();
  if (mode === 'road') {
    if (!cityMap[key]) throw new Error(`Unknown city: ${name}`);
    return cityMap[key];
  }
  if (mode === 'air') {
    // exact airport code
    if (airportMap[key]) return airportMap[key];
    // fallback: use city coords, find nearest airport
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown airport or city: ${name}`);
    let best = airports[0], bestD = haversine(city, airports[0]);
    for (const a of airports) {
      const d = haversine(city, a);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }
  if (mode === 'sea') {
    if (seaportMap[key]) return seaportMap[key];
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown seaport or city: ${name}`);
    let best = seaports[0], bestD = haversine(city, seaports[0]);
    for (const s of seaports) {
      const d = haversine(city, s);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
