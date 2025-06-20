const { loadData, lookupLocation } = require('../geoData');
let initialized = false;

module.exports = async function(context, req) {
  if (!initialized) { loadData(); initialized = true; }
  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: "Must POST an array of routes." };
    return;
  }
  const results = routes.map(r => {
    try {
      const from = lookupLocation(r.from_location);
      const to = lookupLocation(r.to_location);
      const d = haversine(from, to);
      const kg = d * (r.weight_kg/1000) * (CO2_FACTORS[r.mode]||0);
      return { ...r, distance_km: d.toFixed(2), co2_kg: kg.toFixed(3) };
    } catch(e) {
      return { ...r, error: e.message };
    }
  });
  context.res = { status: 200, body: results };
};
