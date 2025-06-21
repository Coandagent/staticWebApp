const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { haversine } = require('./haversine'); // we'll extract haversine to its own module

let cityMap = {};
let airportList = [];
let seaportList = [];
let initialized = false;

function loadData() {
  if (initialized) return;
  initialized = true;

  // ─── 1️⃣ Cities ≥ 1000 ────────────────────────────────────────────────────
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  }).forEach(r => {
    const coord = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    const lat = coord[0], lon = coord[1];
    const names = [
      r['Name'],
      r['ASCII Name'],
      ...r['Alternate Names'].split(',').map(n => n.trim()).filter(Boolean)
    ];
    for (const rawName of names) {
      const name = rawName.toLowerCase();
      cityMap[name] = { lat, lon, usedName: rawName };
    }
  });

  // ─── 2️⃣ Airports ─────────────────────────────────────────────────────────
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  }).forEach(r => {
    const lat = parseFloat(r.latitude_deg);
    const lon = parseFloat(r.longitude_deg);
    const label = r.name + (r.iata_code ? ` (${r.iata_code})` : '');
    // We'll keep a list so we can fall back by scanning
    airportList.push({
      lat, lon,
      keys: [
        (r.iata_code || '').toLowerCase(),
        (r.icao_code || '').toLowerCase(),
        r.name.toLowerCase()
      ].filter(Boolean),
      usedName: label
    });
  });

  // ─── 3️⃣ Seaports ─────────────────────────────────────────────────────────
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  parse(seaportCsv, {
    delimiter: ';',
    columns: ['UNLOCODE','port_name','lat','lon','country_code','zone_code'],
    skip_empty_lines: true
  }).forEach(r => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const label = r.port_name;
    seaportList.push({
      lat, lon,
      keys: [r.UNLOCODE.toLowerCase(), r.port_name.toLowerCase()],
      usedName: label
    });
  });

  console.log(
    'Loaded:',
    Object.keys(cityMap).length, 'cities,',
    airportList.length, 'airports,',
    seaportList.length, 'seaports'
  );
}

function lookupLocation(rawName, mode) {
  const name = (rawName || '').toLowerCase();
  // Helper: find exact in list
  const findExact = list =>
    list.find(item => item.keys.includes(name));

  // 1) Road: must be a city
  if (mode === 'road') {
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown city: ${rawName}`);
    return city;
  }

  // 2) Air: try exact airport, else nearest by city
  if (mode === 'air') {
    let airport = findExact(airportList);
    if (airport) return airport;
    // fallback: find city coords first
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown city for air fallback: ${rawName}`);
    // nearest
    airport = airportList.reduce((best, ap) => {
      const dist = haversine(city, ap);
      return dist < best.d ? { d: dist, ap } : best;
    }, { d: Infinity }).ap;
    return airport;
  }

  // 3) Sea: same pattern
  if (mode === 'sea') {
    let port = findExact(seaportList);
    if (port) return port;
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown city for sea fallback: ${rawName}`);
    port = seaportList.reduce((best, p) => {
      const dist = haversine(city, p);
      return dist < best.d ? { d: dist, p } : best;
    }, { d: Infinity }).p;
    return port;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
