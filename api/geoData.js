// api/geoData.js
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap    = {};
let airportMap = {};
let seaportMap = {};
let initialized = false;

// simple haversine for fallback distance
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Cities ≥1k pop (semicolon CSV)
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
    const pop = parseInt(r.Population, 10) || 0;
    const [lat, lon] = r.Coordinates
      .split(',')
      .map(s => parseFloat(s.trim()));
    const names = [
      r.Name,
      r['ASCII Name'],
      ...r['Alternate Names'].split(',')
    ].map(n => n.trim()).filter(Boolean);
    names.forEach(raw => {
      const key = raw.toLowerCase();
      const existing = cityMap[key];
      if (!existing || pop > existing.population) {
        cityMap[key] = { lat, lon, usedName: r.Name, population: pop };
      }
    });
  });

  // 2️⃣ Airports (comma CSV) — only commercial airports
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
    if (
      !r.type?.toLowerCase().includes('airport') ||
      r.scheduled_service?.toLowerCase() !== 'yes'
    ) return;
    // prefer IATA, then ICAO, then gps_code
    const rawKey = (r.iata_code || r.icao_code || r.gps_code || '').trim();
    if (!rawKey) return;
    const key = rawKey.toLowerCase();
    airportMap[key] = {
      lat: parseFloat(r.latitude_deg),
      lon: parseFloat(r.longitude_deg),
      usedName: r.name
    };
  });

  // 3️⃣ Seaports (comma CSV)
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';', // update as needed ',' or ';'
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  seaports.forEach(r => {
    const rawKey = (r.UNLOCODE || r.name).trim();
    if (!rawKey) return;
    const key = rawKey.toLowerCase();
    seaportMap[key] = {
      lat: parseFloat(r.latitude  ?? r.lat),
      lon: parseFloat(r.longitude ?? r.lon),
      usedName: r.name
    };
  });

  console.log(
    'Loaded:',
    Object.keys(cityMap).length,   'cities,',
    Object.keys(airportMap).length,'airports,',
    Object.keys(seaportMap).length,'seaports'
  );
}

// lookup + fallback
function lookupLocation(rawName, mode) {
  const name = rawName.trim().toLowerCase();
  loadData();

  if (mode === 'road') {
    const c = cityMap[name];
    if (!c) throw new Error(`Unknown city: ${rawName}`);
    return c;
  }

  if (mode === 'air') {
    if (airportMap[name]) return airportMap[name];

    // fallback: nearest airport to city
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown airport or city: ${rawName}`);
    let best = null, dist = Infinity;
    for (const a of Object.values(airportMap)) {
      const d = haversine(city, a);
      if (d < dist) { dist = d; best = a; }
    }
    if (!best) throw new Error(`No airports available`);
    return best;
  }

  if (mode === 'sea') {
    if (seaportMap[name]) return seaportMap[name];

    // fallback: nearest seaport to city
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown seaport or city: ${rawName}`);
    let best = null, dist = Infinity;
    for (const s of Object.values(seaportMap)) {
      const d = haversine(city, s);
      if (d < dist) { dist = d; best = s; }
    }
    if (!best) throw new Error(`No seaports available`);
    return best;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
