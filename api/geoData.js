const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap    = {};
let airportMap = {};
let seaportMap = {};
let initialized = false;

// Haversine for nearest‐fallback lookup
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

  // 1️⃣ Cities ≥1 000 pop (semicolon-delimited)
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  }).forEach(r => {
    const pop = parseInt(r.Population, 10) || 0;
    const [lat, lon] = r.Coordinates.split(',').map(s => parseFloat(s));
    const variants = [
      r.Name,
      r['ASCII Name'],
      ...r['Alternate Names'].split(',').map(n => n.trim())
    ].filter(Boolean);
    variants.forEach(raw => {
      const key = raw.toLowerCase();
      const prev = cityMap[key];
      if (!prev || pop > prev.population) {
        cityMap[key] = { lat, lon, usedName: r.Name, population: pop };
      }
    });
  });

  // 2️⃣ Airports (only scheduled_service=yes)
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'), 'utf8'
  );
  parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true
  }).forEach(r => {
    if ((r.scheduled_service || '').toLowerCase() !== 'yes') return;
    const code = (r.iata_code || r.icao_code || r.gps_code || '').trim().toLowerCase();
    if (!code) return;
    airportMap[code] = {
      lat: parseFloat(r.latitude_deg),
      lon: parseFloat(r.longitude_deg),
      usedName: r.name
    };
  });

  // 3️⃣ Seaports (semicolon-delimited)
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'), 'utf8'
  );
  parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true
  }).forEach(r => {
    const code = (r.UNLOCODE || r.name || '').trim().toLowerCase();
    if (!code) return;
    seaportMap[code] = {
      lat: parseFloat(r.latitude || r.lat),
      lon: parseFloat(r.longitude || r.lon),
      usedName: r.name
    };
  });

  console.log(
    'Loaded',
    Object.keys(cityMap).length, 'cities,',
    Object.keys(airportMap).length, 'airports,',
    Object.keys(seaportMap).length, 'seaports'
  );
}

function lookupLocation(raw, mode) {
  loadData();
  const key = raw.trim().toLowerCase();

  if (mode === 'road') {
    const c = cityMap[key];
    if (!c) throw new Error(`Unknown city: ${raw}`);
    return c;
  }
  if (mode === 'air') {
    if (airportMap[key]) return airportMap[key];
    // fallback: nearest airport to the city
    const c = cityMap[key];
    if (!c) throw new Error(`Unknown airport or city: ${raw}`);
    let best, dist = Infinity;
    Object.values(airportMap).forEach(a => {
      const d = haversine(c, a);
      if (d < dist) { dist = d; best = a; }
    });
    if (!best) throw new Error('No airports available');
    return best;
  }
  if (mode === 'sea') {
    if (seaportMap[key]) return seaportMap[key];
    // fallback: nearest seaport to the city
    const c = cityMap[key];
    if (!c) throw new Error(`Unknown seaport or city: ${raw}`);
    let best, dist = Infinity;
    Object.values(seaportMap).forEach(s => {
      const d = haversine(c, s);
      if (d < dist) { dist = d; best = s; }
    });
    if (!best) throw new Error('No seaports available');
    return best;
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
