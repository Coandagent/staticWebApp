const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap = {};
let airportList = [];
let seaportList = [];
let initialized = false;

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Cities ≥1000 pop (semicolon-delimited CSV)
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
    const [lat, lon] = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    const names = [r['Name'], r['ASCII Name'], ...(r['Alternate Names']||'').split(',')];
    names.forEach(n => {
      if (n) cityMap[n.toLowerCase()] = { lat, lon, usedName: n };
    });
  });

  // 2️⃣ Airports (comma CSV)
  const airportCsv = fs.readFileSync(path.join(__dirname, 'data', 'airports.csv'), 'utf8');
  airportList = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  }).map(r => ({
    code: (r.iata_code||r.icao_code||r.ident||'').toLowerCase(),
    name: r.name,
    lat: parseFloat(r.latitude_deg),
    lon: parseFloat(r.longitude_deg)
  })).filter(a => a.lat && a.lon);

  // 3️⃣ Seaports (semicolon CSV)
  const seaportCsv = fs.readFileSync(path.join(__dirname, 'data', 'seaports.csv'), 'utf8');
  seaportList = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  }).map(r => ({
    code: (r.UNLOCODE || r.port_name || '').toLowerCase(),
    name: r.port_name,
    lat: parseFloat(r.latitude),
    lon: parseFloat(r.longitude)
  })).filter(p => p.lat && p.lon);
}

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

// find nearest point in list to coords
function nearest(list, coords) {
  let best = null, bestDist = Infinity;
  list.forEach(p => {
    const d = haversine(coords, { lat: p.lat, lon: p.lon });
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  });
  if (!best) throw new Error('No fallback available');
  return { ...best, usedName: best.name };
}

function lookupLocation(name, mode) {
  loadData();
  const key = (name||'').toLowerCase();
  if (mode === 'road') {
    const c = cityMap[key];
    if (!c) throw new Error(`Unknown city: ${name}`);
    return c;
  }
  if (mode === 'air') {
    // exact code or name
    let a = airportList.find(a=>a.code===key||a.name.toLowerCase()===key);
    if (a) return { ...a, usedName: a.name + ` (${a.code.toUpperCase()})` };
    // fallback: find city coords then nearest airport
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for airport fallback: ${name}`);
    return nearest(airportList, city);
  }
  if (mode === 'sea') {
    let p = seaportList.find(p=>p.code===key||p.name.toLowerCase()===key);
    if (p) return { ...p, usedName: p.name };
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for seaport fallback: ${name}`);
    return nearest(seaportList, city);
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
