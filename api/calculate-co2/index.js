const { loadData, lookupLocation } = require('../geoData');
let initialized = false;

// grams CO₂ per tonne-km
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

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

  const results = routes.map(({ from_location, to_location, mode, weight_kg }) => {
    try {
      const from = lookupLocation(from_location, mode);
      const to   = lookupLocation(to_location,   mode);
      const distKm = haversine(from, to);
      const weightT = parseFloat(weight_kg) / 1000;
      const co2Kg = distKm * weightT * (CO2_FACTORS[mode] || 0);

      return {
        from_input:   from_location,
        from_used:    from.usedName,
        to_input:     to_location,
        to_used:      to.usedName,
        mode,
        weight_kg,
        distance_km:  distKm.toFixed(2),
        co2_kg:       co2Kg.toFixed(3)
      };
    } catch (e) {
      return {
        from_input: from_location,
        to_input:   to_location,
        mode,
        weight_kg,
        error:      e.message
      };
    }
  });

  context.res = { status: 200, body: results };
};
