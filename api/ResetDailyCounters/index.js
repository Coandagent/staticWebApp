const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

// read from environment
const account   = process.env["STORAGE_ACCOUNT_NAME"];
const accountKey= process.env["STORAGE_ACCOUNT_KEY"];
const tableName = process.env["QUOTA_TABLE_NAME"] || "UserQuotas";

const credential = new AzureNamedKeyCredential(account, accountKey);
const tableClient = new TableClient(
  `https://${account}.table.core.windows.net`,
  tableName,
  credential
);

module.exports = async function (context, timer) {
  context.log(`ResetDailyCounters function started at ${new Date().toISOString()}`);

  // List all entities in the quota table
  const entities = tableClient.listEntities();
  let count = 0;

  for await (const entity of entities) {
    // Reset the dailyCount property to 0
    entity.dailyCount = 0;
    // Use updateEntity with MERGE to only bump that property
    await tableClient.updateEntity(entity, "Merge");
    count++;
  }

  context.log(`ResetDailyCounters: reset ${count} user counters.`);
};
