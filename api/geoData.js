// geoData.js

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// === User-configurable filters ===
const ALLOWED_AIRPORT_TYPES = ['large_airport', 'medium_airport'];
const ALLOWED_SEAPORT_TYPES  = ['commercial'];
const EU_COUNTRIES = [
  'at','be','bg','hr','cy','cz','dk','ee','fi','fr','de',
  'gr','hu','ie','it','lv','lt','lu','mt','nl','pl','pt',
  'ro','sk','si','es','se'
];

// In-memory maps
let cityMap    = {};
let airportMap = {};
let seaportMap = {};
let initialized = false;

// Load all CSVs once
function loadData() {
  if (initialized) return;
  initialized = true;

  //1️⃣ Cities ≥1 000 — GeoNames
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';', columns: true,
    skip_empty_lines: true, relax_quotes: true
  });
  cities.forEach(r => {
    const [lat, lon] = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    const country    = (r['Country Code'] || '').toLowerCase();
    const state      = (r['Admin1 Code'] || '').split('.')[1]?.toLowerCase() || '';
    const inEU       = EU_COUNTRIES.includes(country);
    const record     = { lat, lon, country, state, inEU, usedName: r['Name'] };

    // index by Name, ASCII Name, alternate names
    [
      r['Name'],
      r['ASCII Name'],
      ...(r['Alternate Names'] ? r['Alternate Names'].split(',') : [])
    ]
      .filter(n => n)
      .forEach(name => {
        const key = name.trim().toLowerCase();
        cityMap[key] = record;
        cityMap[`${key},${country}`] = record;
      });
  });

  // 2️⃣ Airports — Our CSV
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const airports = parse(airportCsv, {
    delimiter: ',', columns: true,
    skip_empty_lines: true, relax_column_count: true
  });
  airports.forEach(r => {
    const [country, state] = (r.iso_region || '').toLowerCase().split('-');
    const inEU     = EU_COUNTRIES.includes(country);
    const type     = (r.type || '').toLowerCase();
    const code     = (r.iata_code || r.icao_code || '').trim();
    const name     = r.name;
    const display  = code ? `${name} (${code})` : name;
    const rec      = {
      lat: parseFloat(r.latitude_deg),
      lon: parseFloat(r.longitude_deg),
      country, state, inEU,
      type, usedName: display
    };
    const key = (code || name).toLowerCase();
    airportMap[key] = rec;
    airportMap[`${key},${country}`] = rec;
  });

  // 3️⃣ Seaports — Our CSV
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';', columns: true,
    skip_empty_lines: true, relax_quotes: true
  });
  seaports.forEach(r => {
    const unlocode = (r.UNLOCODE || '').trim().toUpperCase();
    const country  = unlocode.slice(0, 2).toLowerCase();
    const inEU     = EU_COUNTRIES.includes(country);
    const portType = (r.port_type || '').toLowerCase();
    const rec      = {
      lat: parseFloat(r.latitude),
      lon: parseFloat(r.longitude),
      country, inEU,
      portType, usedName: r.name
    };
    const key = (unlocode || r.name).toLowerCase();
    seaportMap[key] = rec;
    seaportMap[`${key},${country}`] = rec;
  });
}

// Haversine distance (km)
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R     = 6371;
  const dLat  = toRad(b.lat - a.lat);
  const dLon  = toRad(b.lon - a.lon);
  const x     =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
    Math.cos(toRad(b.lat)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Parse “Name,CC” or “Name,CC,State”
function parseQualifiedName(input) {
  const parts = (input || '').split(',').map(s => s.trim().toLowerCase());
  return { name: parts[0], country: parts[1], state: parts[2] };
}

/**
 * lookupLocation(nameInput, mode, options)
 *   nameInput:   e.g. "Paris,FR" or "BILLUND,DK"
 *   mode:        'road' | 'air' | 'sea'
 *   options:     { eu: boolean, state?: string }
 */
function lookupLocation(nameInput, mode, options = {}) {
  loadData();
  const { name, country } = parseQualifiedName(nameInput);
  const { eu, state: reqState } = options;
  if (!name) throw new Error(`Invalid name: "${nameInput}"`);

  let map, filterFn;
  if (mode === 'road') {
    map = cityMap;
    filterFn = rec =>
      rec.inEU === !!eu &&
      (!reqState || rec.state === reqState);
  } else if (mode === 'air') {
    map = airportMap;
    filterFn = rec =>
      ALLOWED_AIRPORT_TYPES.includes(rec.type) &&
      rec.inEU === !!eu &&
      (!reqState || rec.state === reqState);
  } else if (mode === 'sea') {
    map = seaportMap;
    filterFn = rec =>
      ALLOWED_SEAPORT_TYPES.includes(rec.portType) &&
      rec.inEU === !!eu;
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  // 1) exact match
  const exactKey = country ? `${name},${country}` : name;
  if (map[exactKey] && filterFn(map[exactKey])) {
    return map[exactKey];
  }

  // 2) find reference city
  const cityKey = country ? `${name},${country}` : name;
  const cityRef = cityMap[cityKey];
  if (!cityRef) {
    throw new Error(
      `"${nameInput}" not found as a city. Use "City,CC" to disambiguate.`
    );
  }

  // 3) build candidate list
  let candidates = Object.values(map).filter(filterFn);

  // 4) for sea, if none in-country/EU, allow any inEU/global
  if (mode === 'sea' && !candidates.length) {
    candidates = Object.values(map).filter(
      rec => ALLOWED_SEAPORT_TYPES.includes(rec.portType) && rec.inEU === !!eu
    );
  }

  if (!candidates.length) {
    throw new Error(`No ${mode} facilities found for "${nameInput}".`);
  }

  // 5) nearest-neighbor
  let best = candidates[0],
      bestD = Infinity;
  for (const rec of candidates) {
    const d = haversine(cityRef, rec);
    if (d < bestD) {
      bestD = d;
      best  = rec;
    }
  }
  return best;
}

module.exports = { loadData, lookupLocation, haversine };
