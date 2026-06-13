const { Pool } = require("pg");
const { config } = require("./config");

const pool = new Pool({
  connectionString: config.databaseUrl
});

async function healthcheck() {
  if (config.skipDbHealthcheck) {
    return {
      ok: true,
      skipped: true
    };
  }

  const startedAt = Date.now();
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
    return {
      ok: true,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  closePool,
  healthcheck,
  pool
};
