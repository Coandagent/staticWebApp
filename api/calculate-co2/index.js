// api/calculate-co2/index.js
const { loadData, lookupLocation } = require('../geoData');
let initialized = false;
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

// ── Make sure haversine is defined *before* you call it ──
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371; // Earth’s radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

module.exports = async function (context, req) {
  if (!initialized) {
    loadData();
    initialized = true;
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: 'Must POST an array of routes.' };
    return;
  }

  const results = [];
  for (const r of routes) {
    try {
      const from = lookupLocation(r.from_location);
      const to = lookupLocation(r.to_location);
      const distance_km = haversine(from, to);
      const co2_kg =
        distance_km *
        (parseFloat(r.weight_kg) / 1000) *
        (CO2_FACTORS[r.mode] || 0);

      results.push({
        from_location: r.from_location,
        to_location: r.to_location,
        mode: r.mode,
        weight_kg: r.weight_kg,
        distance_km: distance_km.toFixed(2),
        co2_kg: co2_kg.toFixed(3),
      });
    } catch (e) {
      results.push({ ...r, error: e.message });
    }
  }

  context.res = {
    status: 200,
    body: results,
  };
};
