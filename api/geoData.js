const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Only these facility types count as “commercial”
const ALLOWED_AIRPORT_TYPES = ['large_airport', 'medium_airport'];
const ALLOWED_SEAPORT_TYPES  = ['commercial'];

// In-memory stores
let cityMap    = {}; // name → [city records]
let airportMap = {}; // name → airport record
let seaportMap = {}; // name → seaport record
let inited     = false;

function loadData() {
  if (inited) return;
  inited = true;

  // 1) Cities ≥1 000 from GeoNames
  const cityCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'geonames-all-cities-with-a-population-1000.csv'),
    'utf8'
  );
  const cities = parse(cityCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  });
  cities.forEach(r => {
    const [lat, lon] = r['Coordinates'].split(',').map(s => parseFloat(s.trim()));
    const tz         = (r['Timezone'] || '').trim();
    const inEU       = tz.startsWith('Europe/');
    const state      = (r['Admin1 Code'] || '').split('.')[1] || '';
    const rec        = { lat, lon, inEU, state, usedName: r['Name'] };

    [r['Name'], r['ASCII Name'], ...(r['Alternate Names']||'').split(',')]
      .filter(n => n)
      .map(n => n.trim().toLowerCase())
      .forEach(key => {
        (cityMap[key] = cityMap[key] || []).push(rec);
      });
  });

  // 2) Airports CSV (with scheduled_service, iata & icao)
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  const airports = parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true
  });
  airports.forEach(r => {
    const lat             = parseFloat(r.latitude_deg);
    const lon             = parseFloat(r.longitude_deg);
    const inEU            = (r.continent || '').trim() === 'EU';
    const state           = (r.iso_region || '').split('-')[1] || '';
    const type            = (r.type || '').toLowerCase();
    const scheduled       = (r.scheduled_service || '').toLowerCase() === 'yes';
    const iata            = (r.iata_code   || '').trim();
    const icao            = (r.icao_code   || '').trim();
    const code            = iata || icao || '';
    const nameWithCode    = code ? `${r.name} (${code})` : r.name;

    const rec = {
      lat,
      lon,
      inEU,
      state,
      type,
      scheduledService: scheduled,
      usedName: nameWithCode
    };
    airportMap[r.name.trim().toLowerCase()] = rec;
  });

  // 3) Seaports CSV
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  const seaports = parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true
  });
  seaports.forEach(r => {
    const lat    = parseFloat(r.latitude);
    const lon    = parseFloat(r.longitude);
    const inEU   = (r.zone_code || '').trim().startsWith('EU');
    const rec    = {
      lat,
      lon,
      inEU,
      portType: (r.port_type || '').toLowerCase(),
      usedName: r.name
    };
    seaportMap[r.name.trim().toLowerCase()] = rec;
  });
}

function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R     = 6371;
  const dLat  = toRad(b.lat - a.lat);
  const dLon  = toRad(b.lon - a.lon);
  const x     = Math.sin(dLat/2)**2
              + Math.cos(toRad(a.lat))
              * Math.cos(toRad(b.lat))
              * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * lookupLocation(cityName, mode, options)
 *  - cityName: e.g. "billund"
 *  - mode:     'road'|'air'|'sea'
 *  - options:  { eu: boolean, state?: string }
 */
function lookupLocation(cityName, mode, options) {
  loadData();

  const name     = (cityName||'').trim().toLowerCase();
  const euFlag   = !!(options && options.eu);
  const reqState = (options && options.state) || '';

  if (!name) {
    throw new Error(`Must supply city name`);
  }

  // ROAD MODE
  if (mode === 'road') {
    const recs = cityMap[name] || [];
    if (!recs.length) {
      throw new Error(`Unknown city: "${cityName}"`);
    }
    let cands = recs.filter(r => r.inEU === euFlag && (!reqState || r.state === reqState));
    if (!cands.length) {
      cands = recs.filter(r => r.inEU === euFlag);
    }
    if (!cands.length) {
      throw new Error(`No road-mode city for "${cityName}" with eu=${euFlag}`);
    }
    return cands[0];
  }

  // AIR / SEA MODES
  let facilities = [];
  if (mode === 'air') {
    facilities = Object.values(airportMap).filter(r =>
      r.inEU === euFlag &&
      ALLOWED_AIRPORT_TYPES.includes(r.type) &&
      r.scheduledService &&
      (!reqState || r.state === reqState)
    );
    if (!facilities.length && reqState) {
      facilities = Object.values(airportMap).filter(r =>
        r.inEU === euFlag &&
        ALLOWED_AIRPORT_TYPES.includes(r.type) &&
        r.scheduledService
      );
    }
  } else if (mode === 'sea') {
    facilities = Object.values(seaportMap).filter(r =>
      r.inEU === euFlag &&
      ALLOWED_SEAPORT_TYPES.includes(r.portType)
    );
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  if (!facilities.length) {
    throw new Error(`No ${mode} facilities for eu=${euFlag}${reqState?`, state=${reqState}`:''}`);
  }

  // nearest‐neighbor from the first city record
  const ref = (cityMap[name]||[])[0];
  let best   = facilities[0], bestD = Infinity;
  facilities.forEach(r => {
    const d = haversine(ref, r);
    if (d < bestD) {
      bestD = d;
      best  = r;
    }
  });
  return best;
}

module.exports = { loadData, lookupLocation, haversine };
