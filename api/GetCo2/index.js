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
    entities.push(e);
  }

  // 4) return them sorted by RowKey (ISO timestamp order)
  entities.sort((a, b) => a.rowKey.localeCompare(b.rowKey));
  context.res = { status: 200, body: entities };
};
