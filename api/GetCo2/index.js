const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
  // Auth
  const principalHeader = req.headers["x-ms-client-principal"];
  if (!principalHeader) {
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }
  const principal = JSON.parse(Buffer.from(principalHeader, "base64").toString("ascii"));
  const userId = principal.userId;

  // Connect
  const tableName = process.env.RESULTS_TABLE_NAME;
  const client = new TableClient(
    `https://${process.env.STORAGE_ACCOUNT_NAME}.table.core.windows.net`,
    tableName,
    new AzureNamedKeyCredential(
      process.env.STORAGE_ACCOUNT_NAME,
      process.env.STORAGE_ACCOUNT_KEY
    )
  );

  // Query all entries for this user
  const entities = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}'` }
  })) {
    entities.push(entity);
  }

  context.res = {
    status: 200,
    body: entities.sort((a, b) => a.rowKey.localeCompare(b.rowKey)) // ascending by timestamp
  };
};
