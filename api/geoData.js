const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Only these facility types count as “commercial”
const ALLOWED_AIRPORT_TYPES = ['large_airport', 'medium_airport'];
const ALLOWED_SEAPORT_TYPES  = ['commercial'];

// In-memory stores
let cityMap    = {}; // name → [city records]
let airportMap = {}; // key (name, iata, or icao) → airport record
let seaportMap = {}; // key (name or UN/LOCODE) → seaport record
let inited     = false;

function loadData() {
  if (inited) return;
  inited = true;

  // 1) Cities ≥1 000 from GeoNames
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

  // 2) Airports CSV
  const airportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'airports.csv'),
    'utf8'
  );
  parse(airportCsv, {
    delimiter: ',',
    columns: true,
    skip_empty_lines: true
  }).forEach(r => {
    const lat             = parseFloat(r.latitude_deg);
    const lon             = parseFloat(r.longitude_deg);
    const inEU            = (r.continent || '').trim() === 'EU';
    const state           = (r.iso_region || '').split('-')[1] || '';
    const type            = (r.type || '').toLowerCase();
    const scheduled       = (r.scheduled_service || '').toLowerCase() === 'yes';
    const iata            = (r.iata_code   || '').trim().toUpperCase();
    const icao            = (r.icao_code   || '').trim().toUpperCase();
    const nameKey         = r.name.trim().toLowerCase();
    const rec             = {
      lat,
      lon,
      inEU,
      state,
      type,
      scheduledService: scheduled,
      usedName: `${r.name}${iata ? ` (${iata})` : ''}`,
      iata,
      icao
    };

    // index by name, iata, and icao
    airportMap[nameKey] = rec;
    if (iata) airportMap[iata.toLowerCase()] = rec;
    if (icao) airportMap[icao.toLowerCase()] = rec;
  });

  // 3) Seaports CSV
  const seaportCsv = fs.readFileSync(
    path.join(__dirname, 'data', 'seaports.csv'),
    'utf8'
  );
  parse(seaportCsv, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true
  }).forEach(r => {
    const lat      = parseFloat(r.latitude);
    const lon      = parseFloat(r.longitude);
    const inEU     = (r.zone_code || '').trim().startsWith('EU');
    const locode   = (r.UNLOCODE || '').trim().toUpperCase();
    const nameKey  = r.name.trim().toLowerCase();
    const rec      = {
      lat,
      lon,
      inEU,
      portType: 'commercial',
      usedName: r.name
    };

    // index by name and UN/LOCODE
    seaportMap[nameKey] = rec;
    if (locode) seaportMap[locode.toLowerCase()] = rec;
  });
}

function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R     = 6371; // km
  const dLat  = toRad(b.lat - a.lat);
  const dLon  = toRad(b.lon - a.lon);
  const x     = Math.sin(dLat/2)**2 +
                Math.cos(toRad(a.lat)) *
                Math.cos(toRad(b.lat)) *
                Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * lookupLocation(nameOrCode, mode, options)
 *  - nameOrCode: city name, airport IATA/ICAO code, or seaport UN/LOCODE
 *  - mode: 'road'|'air'|'sea'
 *  - options: { eu: boolean, state?: string }
 */
function lookupLocation(nameOrCode, mode, options) {
  loadData();
  const key      = (nameOrCode||'').trim().toLowerCase();
  const euFlag   = !!(options && options.eu);
  const reqState = (options && options.state) || '';

  if (!key) {
    throw new Error(`Must supply a location name or code`);
  }

  // ROAD: cities only
  if (mode === 'road') {
    const recs = cityMap[key] || [];
    if (!recs.length) throw new Error(`Unknown city: "${nameOrCode}"`);
    let cands = recs.filter(r => r.inEU === euFlag && (!reqState || r.state === reqState));
    if (!cands.length) cands = recs.filter(r => r.inEU === euFlag);
    if (!cands.length) throw new Error(`No road-mode city for "${nameOrCode}" with eu=${euFlag}`);
    return cands[0];
  }

  // AIR: direct code or nearest
  if (mode === 'air') {
    if (airportMap[key]) return airportMap[key];
    const facilities = Object.values(airportMap).filter(r =>
      r.inEU === euFlag &&
      ALLOWED_AIRPORT_TYPES.includes(r.type) &&
      r.scheduledService &&
      (!reqState || r.state === reqState)
    );
    if (!facilities.length) throw new Error(`No commercial airports for eu=${euFlag}`);
    const refRecs = cityMap[key] || [];
    if (!refRecs.length) throw new Error(`Cannot locate reference city: "${nameOrCode}"`);
    const ref = refRecs[0];
    let best, bestD = Infinity;
    facilities.forEach(f => {
      const d = haversine(ref, f);
      if (d < bestD) { bestD = d; best = f; }
    });
    return best;
  }

  // SEA: direct port or nearest fallback
  if (mode === 'sea') {
    // 1) direct match
    if (seaportMap[key]) return seaportMap[key];

    // 2) filter to allowed seaports
    const facilities = Object.values(seaportMap).filter(r =>
      r.inEU === euFlag &&
      ALLOWED_SEAPORT_TYPES.includes(r.portType)
    );
    if (!facilities.length) throw new Error(`No commercial seaports for eu=${euFlag}`);

    // 3) get reference city coords
    const refRecs = cityMap[key] || [];
    if (!refRecs.length) throw new Error(`Cannot locate reference city: "${nameOrCode}"`);
    const ref = refRecs[0];

    // 4) find nearest port to city
    let best, bestD = Infinity;
    facilities.forEach(f => {
      const d = haversine(ref, f);
      if (d < bestD) { bestD = d; best = f; }
    });
    return best;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { loadData, lookupLocation, haversine };
