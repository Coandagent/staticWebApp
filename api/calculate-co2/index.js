const { loadData, lookupLocation } = require('../geoData');
let inited = false;
const FACTORS = { road:120, air:255, sea:25 };

module.exports = async function(context, req) {
  if (!inited) { loadData(); inited = true; }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: 'Must POST an array of routes.' };
    return;
  }

  const results = routes.map(r=>{
    try {
      const from = lookupLocation(r.from_location, r.mode);
      const to   = lookupLocation(r.to_location,   r.mode);
      const dist = haversine(from, to);
      const t    = parseFloat(r.weight_kg)/1000;
      const co2  = dist * t * (FACTORS[r.mode]||0);
      return {
        from_input:  r.from_location,
        from_used:   from.usedName,
        to_input:    r.to_location,
        to_used:     to.usedName,
        mode:        r.mode,
        distance_km: dist.toFixed(2),
        co2_kg:      co2.toFixed(3)
      };
    } catch(e) {
      return { from_input:r.from_location, to_input:r.to_location, mode:r.mode, error:e.message };
    }
  });

  context.res = { status: 200, body: results };
};

function haversine(a, b) {
  const toRad = v=>(v*Math.PI)/180;
  const R=6371, dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
