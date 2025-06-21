const { lookupLocation, haversine } = require('../geoData');

let initialized = false;
const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

module.exports = async function (context, req) {
  if (!initialized) {
    // loadData is called inside lookupLocation
    initialized = true;
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = {
      status: 400,
      body: 'Must POST an array of routes.'
    };
    return;
  }

  const results = routes.map(r => {
    try {
      // normalize
      const { from_location, to_location, mode, weight_kg } = r;
      const fromInfo = lookupLocation(from_location, mode);
      const toInfo   = lookupLocation(to_location,   mode);

      // distance
      let dist = haversine(fromInfo, toInfo);
      // approximate real‐world road distance
      if (mode === 'road') dist *= 1.2;

      // CO2 (kg)
      const weightT = parseFloat(weight_kg) / 1000;
      const factor  = CO2_FACTORS[mode] || 0;
      const co2kg   = dist * weightT * factor;

      return {
        from_input:  from_location,
        from_used:   fromInfo.usedName,
        to_input:    to_location,
        to_used:     toInfo.usedName,
        mode,
        weight_kg,
        distance_km: dist.toFixed(2),
        co2_kg:      co2kg.toFixed(3)
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

  context.res = {
    status: 200,
    body: results
  };
};
