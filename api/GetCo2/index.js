// GetCo2/index.js

const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

module.exports = async function (context, req) {
  // 1) require Easy Auth
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }
  const principal = JSON.parse(
    Buffer.from(principalHeader, "base64").toString("ascii")
  );
  const userId = principal.userId;

  // 2) connect to your results table
  const tableName = process.env.RESULTS_TABLE_NAME;
  const account   = process.env.STORAGE_ACCOUNT_NAME;
  const key       = process.env.STORAGE_ACCOUNT_KEY;
  const client = new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    new AzureNamedKeyCredential(account, key)
  );

  // 3) list all rows for this user
  const entities = [];
  for await (const e of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}'` }
  })) {
    entities.push({
      timestamp:    e.rowKey,           // row timestamp
      from_input:   e.from_input,
      from_used:    e.from_used,
      to_input:     e.to_input,
      to_used:      e.to_used,
      mode:         e.mode,
      distance_km:  e.distance_km,
      co2_kg:       e.co2_kg,

      // newly persisted fields:
      weight_kg:    e.weight_kg,
      eu:           e.eu,
      state:        e.state,
      error:        e.error
    });
  }

  // 4) sort by timestamp ascending
  entities.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // 5) return
  context.res = { status: 200, body: entities };
};
