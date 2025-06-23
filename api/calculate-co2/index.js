// api/calculate-co2/index.js

const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { loadData, lookupLocation, haversine } = require("../geoData");

module.exports = async function(context, req) {
  // 1) Enforce Easy Auth
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }
  const principal = JSON.parse(
    Buffer.from(principalHeader, "base64").toString("ascii")
  );
  const userId = principal.userId;

  // 2) Initialize Table client
  const account  = process.env.STORAGE_ACCOUNT_NAME;
  const key      = process.env.STORAGE_ACCOUNT_KEY;
  const cred     = new AzureNamedKeyCredential(account, key);
  const tableUrl = `https://${account}.table.core.windows.net`;
  const tbl      = new TableClient(tableUrl, "UserQuotas", cred);

  // 3) Fetch or create the user’s quota row
  let user;
  try {
    user = await tbl.getEntity("users", userId);
  } catch {
    // not found → create as free tier, zero count
    user = { partitionKey: "users", rowKey: userId, Plan: "free", CountThisMonth: 0 };
    await tbl.createEntity(user);
  }

  // 4) Enforce free-tier limit (5 calcs/month, no upload)
  if (user.Plan === "free" && user.CountThisMonth >= 5) {
    context.res = {
      status: 403,
      body: "Free tier limit reached (5 calculations per day). Upgrade to paid to continue."
    };
    return;
  }

  // 5) Your existing CO₂‐calculation logic
  const CO2_FACTORS = { road: 120, air: 255, sea: 25 };
  if (!context.bindings.initialized) {
    loadData();
    context.bindings.initialized = true;
  }

  const routes = req.body;
  if (!Array.isArray(routes)) {
    context.res = { status: 400, body: "Must POST an array of routes." };
    return;
  }

  const results = routes.map(r => {
    try {
      const opts     = { eu: r.eu, state: r.state };
      const fromInfo = lookupLocation(r.from_location, r.mode, opts);
      const toInfo   = lookupLocation(r.to_location,   r.mode, opts);
      const distKm   = haversine(fromInfo, toInfo);
      const co2Kg    = distKm * (r.weight_kg / 1000) * (CO2_FACTORS[r.mode] || 0);

      return {
        from_input:  r.from_location,
        from_used:   fromInfo.usedName,
        to_input:    r.to_location,
        to_used:     toInfo.usedName,
        mode:        r.mode,
        weight_kg:   r.weight_kg,
        distance_km: distKm.toFixed(2),
        co2_kg:      co2Kg.toFixed(3),
        user_id:     userId
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

  // 6) Increment the user’s counter if on free tier
  if (user.Plan === "free") {
    user.CountThisMonth++;
    await tbl.updateEntity(
      { partitionKey: "users", rowKey: userId, CountThisMonth: user.CountThisMonth },
      "Merge"
    );
  }

  // 7) Return results
  context.res = { status: 200, body: results };
};
