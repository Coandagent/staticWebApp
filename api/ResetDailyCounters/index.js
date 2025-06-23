const { TableClient, odata } = require("@azure/data-tables");

module.exports = async function (context, myTimer) {
  const acct    = process.env.STORAGE_ACCOUNT_NAME;
  const key     = process.env.STORAGE_ACCOUNT_KEY;
  const table   = process.env.USER_TABLE_NAME;
  const cred    = new AzureNamedKeyCredential(acct, key);
  const client  = new TableClient(
    `https://${acct}.table.core.windows.net`,
    table,
    cred
  );

  try {
    // Query all user rows
    const entities = client.listEntities({
      queryOptions: { filter: odata`PartitionKey eq 'user'` }
    });

    for await (const ent of entities) {
      // Reset their counter back to zero
      ent.calculationCount = 0;
      await client.updateEntity(ent, "Merge");
    }

    context.log(`✅ Reset ${table} counters at ${new Date().toISOString()}`);
  } catch (err) {
    context.log.error("Failed to reset daily counters:", err.message);
    throw err;
  }
};
