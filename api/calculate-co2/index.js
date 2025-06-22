// api/calculate-co2/index.js

module.exports = async function(context, req) {
  // 1) Enforce authentication via Static Web Apps Easy Auth
  const principalHeader = req.headers['x-ms-client-principal'];
  if (!principalHeader) {
    context.res = { status: 401, body: 'Unauthorized' };
    return;
  }

  // 2) Decode the user principal (Base64-encoded JSON)
  const principal = JSON.parse(
    Buffer.from(principalHeader, 'base64').toString('ascii')
  );
  // principal contains fields like userId, userDetails, and roles

  // 3) CO₂-calculation logic (unchanged)
  const { loadData, lookupLocation, haversine } = require('../geoData');
  const CO2_FACTORS = { road: 120, air: 255, sea: 25 };

  // Initialize data only once per cold start
  if (!context.bindings.initialized) {
    loadData();
    context.bindings.initialized = true;
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: 'Must POST an array of routes.' };
    return;
  }

  const results = routes.map(r => {
    try {
      const opts      = { eu: r.eu, state: r.state };
      const fromInfo  = lookupLocation(r.from_location, r.mode, opts);
      const toInfo    = lookupLocation(r.to_location,   r.mode, opts);
      const distKm    = haversine(fromInfo, toInfo);
      const co2Kg     = distKm * (r.weight_kg/1000) * (CO2_FACTORS[r.mode]||0);

      return {
        from_input:  r.from_location,
        from_used:   fromInfo.usedName,
        to_input:    r.to_location,
        to_used:     toInfo.usedName,
        mode:        r.mode,
        weight_kg:   r.weight_kg,
        distance_km: distKm.toFixed(2),
        co2_kg:      co2Kg.toFixed(3),
        user_id:     principal.userId       // attach caller’s ID
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
