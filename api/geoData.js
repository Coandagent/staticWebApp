// api/geoData.js
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let locationMap = {};

// register a name → {lat, lon}
function addLocation(name, lat, lon) {
  if (!name) return;
  const key = name.trim().toLowerCase();
  locationMap[key] = { lat, lon };
}

// 1) Load Cities from semicolon-delimited CSV
function loadCities() {
  const file = path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv');
  const text = fs.readFileSync(file, 'utf8');
  const records = parse(text, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  records.forEach(r => {
    // Coordinates column format: "-13.92862, -72.48496"
    const [latStr, lonStr] = (r.Coordinates || '').split(',').map(x => x.trim());
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return;

    // register primary name + ASCII + each alternate
    addLocation(r.Name,        lat, lon);
    addLocation(r['ASCII Name'],lat, lon);
    (r['Alternate Names'] || '')
      .split(',')
      .forEach(alt => addLocation(alt, lat, lon));
  });

  console.log(`Loaded ${Object.keys(locationMap).length} city locations`);
}

// 2) Load Airports from comma-delimited CSV
function loadAirports() {
  const file = path.join(__dirname, 'data', 'airports.csv');
  const text = fs.readFileSync(file, 'utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  records.forEach(r => {
    const code = (r.IATA_CODE || r.iata || '').toUpperCase();
    const lat  = parseFloat(r.LATITUDE  || r.latitude);
    const lon  = parseFloat(r.LONGITUDE || r.longitude);
    if (code && !isNaN(lat) && !isNaN(lon)) {
      addLocation(code, lat, lon);
      addLocation(r.AIRPORT_NAME || r.name, lat, lon);
    }
  });

  console.log(`Loaded airport entries, total map size: ${Object.keys(locationMap).length}`);
}

// 3) Load Seaports from comma-delimited CSV
function loadSeaports() {
  const file = path.join(__dirname, 'data', 'seaports.csv');
  const text = fs.readFileSync(file, 'utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  records.forEach(r => {
    const code = (r.PORT_CODE || r.code || '').toUpperCase();
    const lat  = parseFloat(r.LATITUDE || r.lat);
    const lon  = parseFloat(r.LONGITUDE|| r.lon);
    if (code && !isNaN(lat) && !isNaN(lon)) {
      addLocation(code, lat, lon);
      addLocation(r.PORT_NAME || r.name, lat, lon);
    }
  });

  console.log(`Loaded seaport entries, total map size: ${Object.keys(locationMap).length}`);
}

// public initializer
function loadData() {
  if (Object.keys(locationMap).length) return;
  loadCities();
  loadAirports();
  loadSeaports();
}

// lookup function
function lookupLocation(name) {
  const key = (name||'').trim().toLowerCase();
  const loc = locationMap[key];
  if (!loc) throw new Error(`Unknown location: ${name}`);
  return loc;
}

module.exports = { loadData, lookupLocation };
