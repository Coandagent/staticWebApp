// api/geoData.js
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap = {};
let airportList = [];
let seaportList = [];
let initialized = false;

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1) Cities ≥1000 population (semicolon-delimited)
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
  cities.forEach(r => {
    const [lat, lon] = r['Coordinates']
      .split(',')
      .map(s => parseFloat(s.trim()));
    [
      r['Name'],
      r['ASCII Name'],
      ...(r['Alternate Names'] || '').split(',')
    ].forEach(n => {
      const key = (n || '').toLowerCase().trim();
      if (key) cityMap[key] = { lat, lon, usedName: n.trim() };
    });
  });

  // 2) Airports (comma-delimited CSV)
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  airportList = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  })
    .map(r => ({
      code: ((r.iata_code || r.icao_code) || '').toLowerCase(),
      name: r.name,
      lat: parseFloat(r.latitude_deg),
      lon: parseFloat(r.longitude_deg)
    }))
    .filter(a => !isNaN(a.lat) && !isNaN(a.lon));

  // 3) Seaports (semicolon-delimited CSV)
  const portCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  seaportList = parse(portCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  })
    .map(r => ({
      code: (r.UNLOCODE || r.port_name || '').toLowerCase(),
      name: r.port_name,
      lat: parseFloat(r.latitude),
      lon: parseFloat(r.longitude)
    }))
    .filter(p => !isNaN(p.lat) && !isNaN(p.lon));
}

// Great‐circle distance
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

// Find nearest facility in list to coords
function nearest(list, coords) {
  let best = null, bestDist = Infinity;
  list.forEach(p => {
    const d = haversine(coords, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  });
  if (!best) throw new Error('No fallback available');
  return { ...best, usedName: best.name };
}

// Lookup by mode, with nearest fallback for air/sea
function lookupLocation(name, mode) {
  loadData();
  const key = (name || '').toLowerCase().trim();

  if (mode === 'road') {
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city: ${name}`);
    return city;
  }

  if (mode === 'air') {
    let a = airportList.find(a =>
      a.code === key || a.name.toLowerCase() === key
    );
    if (a) return { ...a, usedName: `${a.name} (${a.code.toUpperCase()})` };
    // fallback: nearest airport to the named city
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for airport fallback: ${name}`);
    return nearest(airportList, city);
  }

  if (mode === 'sea') {
    let p = seaportList.find(p =>
      p.code === key || p.name.toLowerCase() === key
    );
    if (p) return { ...p, usedName: p.name };
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for seaport fallback: ${name}`);
    return nearest(seaportList, city);
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation, haversine };
