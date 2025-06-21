const { loadData, lookupLocation } = require('../geoData');
const { haversine } = require('../haversine');
let inited = false;

// grams CO₂ per tonne-km
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

// Approximate road distance ≈ GC distance × 1.2
function roadDistance(a, b) {
  return +(haversine(a, b) * 1.2).toFixed(2);
}

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
      const { mode, from_location, to_location, weight_kg } = r;
      const fromInfo = lookupLocation(from_location, mode);
      const toInfo   = lookupLocation(to_location,   mode);

      // choose distance
      const distKm =
        mode === 'road'
          ? roadDistance(fromInfo, toInfo)
          : +haversine(fromInfo, toInfo).toFixed(2);

      // weight in tonnes
      const wT = parseFloat(weight_kg) / 1000;
      const co2 = distKm * wT * (CO2_FACTORS[mode] || 0);

      return {
        from_input:  from_location,
        from_used:   fromInfo.usedName,
        to_input:    to_location,
        to_used:     toInfo.usedName,
        mode,
        weight_kg,
        distance_km: distKm,
        co2_kg:      +co2.toFixed(3)
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
