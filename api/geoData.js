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

  // — 1️⃣ Cities ≥1 000 from GeoNames (semicolon-delimited) :contentReference[oaicite:2]{index=2}
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
    const [lat, lon] = r['Coordinates']
      .split(',')
      .map(s => parseFloat(s.trim()));
    // index by Name, ASCII Name, and each Alternate Name
    [
      r['Name'],
      r['ASCII Name'],
      ...(
        r['Alternate Names']
          ? r['Alternate Names'].split(',').map(n => n.trim())
          : []
      )
    ]
      .filter(n => n)
      .forEach(name => {
        cityMap[name.toLowerCase()] = { lat, lon, usedName: name };
      });
  });

  // — 2️⃣ Airports (comma-delimited CSV) :contentReference[oaicite:3]{index=3}
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
    const key = (r.iata_code || r.icao_code || r.name).toLowerCase();
    airportMap[key] = {
      lat: parseFloat(r.latitude_deg),
      lon: parseFloat(r.longitude_deg),
      usedName: `${r.name} (${r.iata_code||r.icao_code||''})`.trim()
    };
  });

  // — 3️⃣ Seaports (semicolon-delimited) :contentReference[oaicite:4]{index=4}
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });
  seaports.forEach(r => {
    const key = (r.UNLOCODE || r.name).toLowerCase();
    seaportMap[key] = {
      lat: parseFloat(r.latitude),
      lon: parseFloat(r.longitude),
      usedName: r.name
    };
  });

  console.log(
    'Loaded:',
    Object.keys(cityMap).length, 'cities,',
    Object.keys(airportMap).length, 'airports,',
    Object.keys(seaportMap).length, 'seaports'
  );
}

function lookupLocation(name, mode) {
  const key = (name||'').toLowerCase();
  let map = mode === 'road'
    ? cityMap
    : mode === 'air'
      ? airportMap
      : mode === 'sea'
        ? seaportMap
        : null;
  if (map && map[key]) {
    return map[key];
  }
  // fallback: nearest in appropriate map
  const list = Object.values(map||{});
  if (!list.length) throw new Error(`No ${mode} locations available`);
  // simple linear scan :contentReference[oaicite:5]{index=5}
  let best = list[0], bestD = Infinity;
  list.forEach(loc => {
    const d = haversine(map[key]||cityMap[key]||loc, loc);
    if (d < bestD) { bestD = d; best = loc; }
  });
  return best;
}

module.exports = { loadData, lookupLocation };
