const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

module.exports = async function (context, req) {
  // 1) require Easy Auth
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }
  const principal = JSON.parse(Buffer.from(principalHeader, "base64").toString("ascii"));
  const userId = principal.userId;

  // 2) validate payload
  const arr = req.body?.results;
  if (!Array.isArray(arr)) {
    context.res = { status: 400, body: "Payload must be { results: [...] }" };
    return;
  }

  // 3) connect to table
  const tableName = process.env.RESULTS_TABLE_NAME;
  const account   = process.env.STORAGE_ACCOUNT_NAME;
  const key       = process.env.STORAGE_ACCOUNT_KEY;
  const client = new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    new AzureNamedKeyCredential(account, key)
  );

  // 4) insert each result as a new row
  for (const r of arr) {
    const entry = {
      partitionKey: userId,
      rowKey:       r.timestamp || new Date().toISOString(),
      from_input:   r.from_input,
      from_used:    r.from_used,
      to_input:     r.to_input,
      to_used:      r.to_used,
      mode:         r.mode,
      distance_km:  Number(r.distance_km),
      co2_kg:       Number(r.co2_kg)
    };
    await client.createEntity(entry);
  }

  context.res = { status: 201, body: { inserted: arr.length } };
};
