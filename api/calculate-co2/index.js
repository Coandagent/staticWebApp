const { loadData, lookupLocation } = require('../geoData');

// grams CO₂ per tonne-km
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

// Haversine great-circle formula :contentReference[oaicite:6]{index=6}
function haversine(a, b) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

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
      const fromInfo = lookupLocation(r.from_location, r.mode);
      const toInfo   = lookupLocation(r.to_location,   r.mode);
      const distKm   = haversine(fromInfo, toInfo);
      const co2Kg    = distKm * (parseFloat(r.weight_kg)/1000) * (CO2_FACTORS[r.mode]||0);
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
