const { createApp } = require("./app");
const { config } = require("./config");
const { closePool } = require("./db");

const app = createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${config.port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
