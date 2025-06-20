const { loadData, lookupLocation } = require('../geoData');
let initialized = false;
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

function haversine(a, b) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

module.exports = async function(context, req) {
  context.log('🔧 Trigger calculate-co2 with payload:', req.body);

  if (!initialized) {
    try {
      loadData();
      initialized = true;
      context.log('✅ Geo data loaded');
    } catch (e) {
      context.log.error('❌ Failed to load geo data:', e);
      return context.res = { status: 500, body: 'Server error loading data' };
    }
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.log.error('❌ Bad request, body is not array');
    return context.res = { status: 400, body: 'Must POST an array of routes.' };
  }

  const results = [];
  for (const r of routes) {
    context.log('➡️ Processing route:', r);
    try {
      const from = lookupLocation(r.from_location);
      const to = lookupLocation(r.to_location);

      if (!from || !to) {
        throw new Error(`Unknown location: from=${r.from_location}, to=${r.to_location}`);
      }

      const distance_km = haversine(from, to);
      const factor = CO2_FACTORS[r.mode];
      if (!factor) {
        throw new Error(`Invalid transport mode: ${r.mode}`);
      }

      const weight = parseFloat(r.weight_kg);
      if (isNaN(weight)) {
        throw new Error(`Invalid weight_kg: ${r.weight_kg}`);
      }

      const co2_kg = distance_km * (weight / 1000) * factor;
      const entry = {
        from_location: r.from_location,
        to_location: r.to_location,
        mode: r.mode,
        distance_km: distance_km.toFixed(2),
        co2_kg: co2_kg.toFixed(3),
      };
      context.log('✅ Route result:', entry);
      results.push(entry);

    } catch (e) {
      context.log.error('❌ Route error:', e.message);
      results.push({ ...r, error: e.message });
    }
  }

  context.res = {
    status: 200,
    body: results
  };
};
