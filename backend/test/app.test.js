const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.SKIP_DB_HEALTHCHECK = "true";
process.env.CORS_ORIGIN = "http://localhost:8080";
process.env.TRUST_PROXY = "0";

const { createApp } = require("../src/app");

test("GET /api/health returns service status", async () => {
  const app = createApp();
  const response = await request(app).get("/api/health").expect(200);

  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database.ok, true);
  assert.equal(response.body.database.skipped, true);
});

test("GET /api/config/oauth-providers returns provider flags", async () => {
  const app = createApp();
  const response = await request(app).get("/api/config/oauth-providers").expect(200);

  assert.equal(typeof response.body.gmail.enabled, "boolean");
  assert.equal(typeof response.body.microsoft.enabled, "boolean");
});
