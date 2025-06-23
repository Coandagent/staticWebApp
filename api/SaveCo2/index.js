const { TableClient, odata } = require("@azure/data-tables");

module.exports = async function (context, req) {
  // Require authenticated user
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }
  const principal = JSON.parse(Buffer.from(principalHeader, "base64").toString("ascii"));
  const userId = principal.userId;

  // Validate body
  const { from, to, mode, weight_kg, distance_km, co2_kg, timestamp } = req.body || {};
  if (!from || !to || !mode || weight_kg == null) {
    context.res = { status: 400, body: "Invalid payload" };
    return;
  }

  // Connect to table
  const tableName = process.env.RESULTS_TABLE_NAME;
  const client = new TableClient(
    `https://${process.env.STORAGE_ACCOUNT_NAME}.table.core.windows.net`,
    tableName,
    new AzureNamedKeyCredential(
      process.env.STORAGE_ACCOUNT_NAME,
      process.env.STORAGE_ACCOUNT_KEY
    )
  );

  // PartitionKey = userId, RowKey = timestamp GUID
  const entry = {
    partitionKey: userId,
    rowKey:       timestamp || new Date().toISOString(),
    from,
    to,
    mode,
    weight_kg:   Number(weight_kg),
    distance_km: distance_km,
    co2_kg:      co2_kg
  };

  await client.createEntity(entry);

  context.res = { status: 201, body: entry };
};
