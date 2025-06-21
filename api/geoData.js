const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let cityMap = {};
let airportArr = [];
let seaPortArr = [];

function loadData() {
  // 1) Load cities (semicolon-delimited CSV with header line)
  const cityText = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cityRecs = parse(cityText, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  cityRecs.forEach(r => {
    // using "Name" column for lookup
    cityMap[r.Name] = {
      lat: parseFloat(r.Coordinates.split(',')[0]),
      lon: parseFloat(r.Coordinates.split(',')[1]),
      usedName: r.Name
    };
  });

  // 2) Load airports (CSV with headers: e.g. name,lat,lon,...)
  const airportsText = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const airportRecs = parse(airportsText, {
    columns: true,
    skip_empty_lines: true
  });
  airportArr = airportRecs.map(r => ({
    name: r.name,
    lat: parseFloat(r.latitude),
    lon: parseFloat(r.longitude)
  }));

  // 3) Load seaports (CSV with headers: e.g. name,lat,lon,...)
  const portsText = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const portRecs = parse(portsText, {
    columns: true,
    skip_empty_lines: true
  });
  seaPortArr = portRecs.map(r => ({
    name: r.name,
    lat: parseFloat(r.latitude),
    lon: parseFloat(r.longitude)
  }));

  console.log(
    `Loaded ${Object.keys(cityMap).length} cities, ` +
    `${airportArr.length} airports, ${seaPortArr.length} seaports`
  );
}

function findNearest(point, arr) {
  let best = null;
  let bestDist = Infinity;
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
  arr.forEach(p => {
    const dLat = toRad(p.lat - point.lat);
    const dLon = toRad(p.lon - point.lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(point.lat)) *
        Math.cos(toRad(p.lat)) *
        Math.sin(dLon / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  });
  return best;
}

function lookupLocation(name, mode) {
  name = name.trim();

  if (mode === 'air') {
    // exact airport
    const exact = airportArr.find(p => p.name === name);
    if (exact) return { lat: exact.lat, lon: exact.lon, usedName: exact.name };
    // fallback: nearest airport to city
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown air location: "${name}"`);
    const nearest = findNearest(city, airportArr);
    return { lat: nearest.lat, lon: nearest.lon, usedName: nearest.name };
  }

  if (mode === 'sea') {
    // exact seaport
    const exact = seaPortArr.find(p => p.name === name);
    if (exact) return { lat: exact.lat, lon: exact.lon, usedName: exact.name };
    // fallback: nearest seaport to city
    const city = cityMap[name];
    if (!city) throw new Error(`Unknown sea location: "${name}"`);
    const nearest = findNearest(city, seaPortArr);
    return { lat: nearest.lat, lon: nearest.lon, usedName: nearest.name };
  }

  // road: use city coordinates directly
  const city = cityMap[name];
  if (city) return { lat: city.lat, lon: city.lon, usedName: city.usedName };
  throw new Error(`Unknown road location: "${name}"`);
}

module.exports = { loadData, lookupLocation };
