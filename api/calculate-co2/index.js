const { loadData, lookupLocation } = require('../geoData');
let initialized = false;

// grams CO₂ per tonne-km
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

// haversine reused here for distance
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
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

  const results = routes.map(r => {
    try {
      const { from_location, to_location, mode, weight_kg } = r;
      const fromInfo = lookupLocation(from_location, mode);
      const toInfo   = lookupLocation(to_location,   mode);

      const distance_km = haversine(fromInfo, toInfo);
      const weight_t    = parseFloat(weight_kg) / 1000;
      const factor      = CO2_FACTORS[mode] || 0;
      const co2_kg      = distance_km * weight_t * factor;

      return {
        from_input:   from_location,
        from_used:    fromInfo.usedName,
        to_input:     to_location,
        to_used:      toInfo.usedName,
        mode,
        weight_kg,
        distance_km: distance_km.toFixed(2),
        co2_kg:      co2_kg.toFixed(3)
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
