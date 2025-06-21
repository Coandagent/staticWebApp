const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// -- Haversine for nearest-neighbor fallback --
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

let initialized = false;
const cityMap     = {};
const airportMap  = {};
const seaportMap  = {};

function loadData() {
  if (initialized) return;
  initialized = true;

  // ─── 1) Cities ≥ 1000 ─────────────────────────────────────────────────────────
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter:           ';',
    columns:             true,
    skip_empty_lines:    true,
    relax_quotes:        true,
    relax_column_count:  true
  });
  cities.forEach(r => {
    const coords = (r['Coordinates'] || '').split(',').map(s => parseFloat(s));
    if (coords.length !== 2 || coords.some(isNaN)) return;
    const [lat, lon] = coords;
    const canonical  = r['Name'];
    [ r['Name'], r['ASCII Name'], ...((r['Alternate Names']||'').split(',')) ]
      .filter(n => n)
      .forEach(n => {
        cityMap[n.trim().toLowerCase()] = { lat, lon, usedName: canonical };
      });
  });

  // ─── 2) Airports (IATA, ICAO, name) ─────────────────────────────────────────
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'), 'utf8'
  );
  const airports = parse(airportCsv, {
    columns:             true,
    skip_empty_lines:    true,
    relax_quotes:        true,
    relax_column_count:  true
  });
  airports.forEach(r => {
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    const canonical = r.name;
    [ r.IATA, r.ICAO, r.name ]
      .filter(n => n)
      .forEach(n => {
        airportMap[n.trim().toLowerCase()] = { lat, lon, usedName: n.trim() };
      });
  });

  // ─── 3) Seaports (UN/LOCODE, port_name) ────────────────────────────────────
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'), 'utf8'
  );
  const seaports = parse(seaportCsv, {
    columns:             true,
    skip_empty_lines:    true,
    relax_quotes:        true,
    relax_column_count:  true
  });
  seaports.forEach(r => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    [ r.UNLOCODE, r.port_name ]
      .filter(n => n)
      .forEach(n => {
        seaportMap[n.trim().toLowerCase()] = { lat, lon, usedName: n.trim() };
      });
  });

  console.log(
    `Loaded ${Object.keys(cityMap).length} cities, `,
    `${Object.keys(airportMap).length} airports, `,
    `${Object.keys(seaportMap).length} seaports`
  );
}

function lookupLocation(name, mode) {
  const key = (name||'').trim().toLowerCase();
  // ─── Road: exact city match ─────────────────────────────────────────────────
  if (mode === 'road') {
    const loc = cityMap[key];
    if (!loc) throw new Error(`Unknown city: ${name}`);
    return loc;
  }
  // ─── Air: exact airport match, else nearest to city ────────────────────────
  if (mode === 'air') {
    if (airportMap[key]) return airportMap[key];
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown airport or city: ${name}`);
    let nearest = null, minDist = Infinity;
    Object.values(airportMap).forEach(a => {
      const d = haversine(city, a);
      if (d < minDist) { minDist = d; nearest = a; }
    });
    if (!nearest) throw new Error('No airports available');
    return { ...nearest, usedName: `${nearest.usedName} (nearest)` };
  }
  // ─── Sea: exact seaport match, else nearest to city ────────────────────────
  if (mode === 'sea') {
    if (seaportMap[key]) return seaportMap[key];
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown seaport or city: ${name}`);
    let nearest = null, minDist = Infinity;
    Object.values(seaportMap).forEach(s => {
      const d = haversine(city, s);
      if (d < minDist) { minDist = d; nearest = s; }
    });
    if (!nearest) throw new Error('No seaports available');
    return { ...nearest, usedName: `${nearest.usedName} (nearest)` };
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
