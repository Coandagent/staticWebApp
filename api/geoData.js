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

  // ─── 1) Load cities ≥ 1000 ─────────────────────────────────────────────
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
    comment: '#'
  });
  cities.forEach(r => {
    // Coordinates field format: "-13.92862, -72.48496"
    const [lat, lon] = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    // Index by Name, ASCII Name, and each Alternate Name
    [ r['Name'], r['ASCII Name'], ...(r['Alternate Names'] || '').split(',') ]
      .map(n => n && n.trim())
      .filter(n => n)
      .forEach(name => {
        cityMap[name.toLowerCase()] = { lat, lon, usedName: name };
      });
  });

  // ─── 2) Load airports (comma-delimited) ───────────────────────────────
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
    const key = (r.IATA || r.ICAO || r.name).toLowerCase();
    airportMap[key] = {
      lat: parseFloat(r.latitude),
      lon: parseFloat(r.longitude),
      usedName: r.name
    };
  });

  // ─── 3) Load seaports (comma-delimited) ──────────────────────────────
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  seaports.forEach(r => {
    const key = (r.UNLOCODE || r.port_name).toLowerCase();
    seaportMap[key] = {
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      usedName: r.port_name
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
  const key = (name || '').toLowerCase();
  if (mode === 'road') {
    if (!cityMap[key]) throw new Error(`Unknown city: ${name}`);
    return cityMap[key];
  }
  if (mode === 'air') {
    if (!airportMap[key]) throw new Error(`Unknown airport: ${name}`);
    return airportMap[key];
  }
  if (mode === 'sea') {
    if (!seaportMap[key]) throw new Error(`Unknown seaport: ${name}`);
    return seaportMap[key];
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
