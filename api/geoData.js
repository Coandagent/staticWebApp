const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap = {};
let airportMap = {};
let seaportMap = {};
let initialized = false;

// great-circle distance
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getNearest(target, map) {
  let best = null, bestDist = Infinity;
  for (const key in map) {
    const pt = map[key];
    const d = haversine(target, pt);
    if (d < bestDist) {
      bestDist = d;
      best = pt;
    }
  }
  return best;
}

function loadData() {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Cities ≥1 000 pop (semicolon delimited)
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes:  true,
    relax_column_count: true
  });
  cities.forEach(r => {
    // "Coordinates" = "-13.92862, -72.48496"
    const [lat, lon] = r['Coordinates'].split(',').map(x => parseFloat(x.trim()));
    // index by Name, ASCII Name, and each alt name
    const allNames = [
      r['Name'], 
      r['ASCII Name'],
      ...r['Alternate Names'].split(',').map(n => n.trim()).filter(n => n)
    ];
    allNames.forEach(n => {
      cityMap[n.toLowerCase()] = { lat, lon, usedName: n };
    });
  });

  // 2️⃣ Airports (comma delimited)
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
    // only commercial, scheduled-service airports
    if (
      (r.type === 'large_airport' || r.type === 'medium_airport') &&
      r.scheduled_service === 'yes'
    ) {
      const code = (r.iata_code || r.icao_code || r.ident || '').toLowerCase();
      if (!code) return;
      airportMap[code] = {
        lat: parseFloat(r.latitude_deg),
        lon: parseFloat(r.longitude_deg),
        usedName: `${r.name} (${r.iata_code || r.icao_code})`
      };
    }
  });

  // 3️⃣ Seaports (semicolon delimited)
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  seaports.forEach(r => {
    const key = (r.UNLOCODE || r.code || '').toLowerCase();
    if (!key) return;
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
  const key = (name || '').toLowerCase();
  if (mode === 'road') {
    if (cityMap[key]) return cityMap[key];
    throw new Error(`Unknown city: ${name}`);
  }
  if (mode === 'air') {
    if (airportMap[key]) return airportMap[key];
    // fallback → nearest airport to the city
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for fallback: ${name}`);
    const nearest = getNearest(city, airportMap);
    if (!nearest) throw new Error(`No airports available`);
    return nearest;
  }
  if (mode === 'sea') {
    if (seaportMap[key]) return seaportMap[key];
    // fallback → nearest seaport to the city
    const city = cityMap[key];
    if (!city) throw new Error(`Unknown city for fallback: ${name}`);
    const nearest = getNearest(city, seaportMap);
    if (!nearest) throw new Error(`No seaports available`);
    return nearest;
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation };
