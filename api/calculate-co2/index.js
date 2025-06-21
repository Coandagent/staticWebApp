// api/calculate-co2/index.js

const { loadData, lookupLocation, haversine } = require('../geoData');

// grams CO₂ per tonne-km
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

let inited = false;

module.exports = async function (context, req) {
  if (!inited) {
    loadData();
    inited = true;
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: 'Must POST an array of routes.' };
    return;
  }

  const results = routes.map(r => {
    try {
      // Pass through mandatory `eu` boolean and optional `state`
      const opts     = { eu: r.eu, state: r.state };
      const fromInfo = lookupLocation(r.from_location, r.mode, opts);
      const toInfo   = lookupLocation(r.to_location,   r.mode, opts);
      const distKm   = haversine(fromInfo, toInfo);
      const co2Kg    = distKm * (parseFloat(r.weight_kg) / 1000) * (CO2_FACTORS[r.mode] || 0);

      return {
        from_input:   r.from_location,
        from_used:    fromInfo.usedName,
        to_input:     r.to_location,
        to_used:      toInfo.usedName,
        mode:         r.mode,
        weight_kg:    r.weight_kg,
        distance_km:  distKm.toFixed(2),
        co2_kg:       co2Kg.toFixed(3)
      };
    } catch (e) {
      return {
        from_input: r.from_location,
        to_input:   r.to_location,
        mode:       r.mode,
        weight_kg:  r.weight_kg,
        error:      e.message
      };
    }
  });

  context.res = { status: 200, body: results };
};
