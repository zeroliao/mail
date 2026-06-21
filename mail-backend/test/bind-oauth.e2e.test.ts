import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFile, rm, unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const mockEmail = "bind-oauth-mock@hotmail.com";

function installMockFetch() {
  (global as any).fetch = async (input: any) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/oauth2/v2.0/token")) {
      return new Response(
        JSON.stringify({
          access_token: "mock-access",
          refresh_token: "mock-refresh-new",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/me")) {
      return new Response(JSON.stringify({ displayName: "Bind OAuth Mock", mail: mockEmail }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`unexpected url ${url}`);
  };
}

let app: FastifyInstance;
let token: string;
let testDbPath = "";

before(async () => {
  installMockFetch();

  const dbDir = path.resolve(process.cwd(), "prisma", "prisma");
  const templateDbPath = path.join(dbDir, "test-bind-oauth.db");
  const dbFileName = `test-bind-oauth-${Date.now()}-${process.pid}.db`;
  testDbPath = path.join(dbDir, dbFileName);

  await copyFile(templateDbPath, testDbPath);
  process.env.DATABASE_URL = `file:./prisma/${dbFileName}`;

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { username: process.env.API_ADMIN_USERNAME || "admin", password: process.env.API_ADMIN_PASSWORD }
  });
  assert.equal(login.statusCode, 200, `login failed: ${login.body}`);
  token = login.json().token;
});

after(async () => {
  if (app) {
    await app.close();
  }

  if (testDbPath) {
    await unlink(testDbPath).catch(() => undefined);
    await rm(`${testDbPath}-journal`, { force: true }).catch(() => undefined);
  }
});

test("POST /api/v1/accounts/bind-oauth 缺少 clientId 返回 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    headers: { authorization: `Bearer ${token}` },
    payload: { email: "x@hotmail.com", refreshToken: "r" }
  });
  assert.equal(res.statusCode, 400);
});

test("POST /api/v1/accounts/bind-oauth 未认证返回 401", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    payload: { email: "x@hotmail.com", refreshToken: "r", clientId: "c" }
  });
  assert.equal(res.statusCode, 401);
});

test("POST /api/v1/accounts/bind-oauth 成功绑定 mock 账号到隔离临时库", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    headers: { authorization: `Bearer ${token}` },
    payload: { email: mockEmail, refreshToken: "owner-refresh", clientId: "owner-client" }
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.status, "success");
  assert.equal(body.account.provider, "MICROSOFT");
  assert.equal(body.account.status, "ACTIVE");
});

test("POST /api/v1/accounts/bind-oauth/batch 返回逐条结果汇总", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth/batch",
    headers: { authorization: `Bearer ${token}` },
    payload: [{ email: mockEmail, refreshToken: "r1", clientId: "c1" }]
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.total, 1);
  assert.equal(body.success, 1);
  assert.equal(body.results[0].status, "success");
});

test("Swagger JSON 暴露 bind-oauth 路由", async () => {
  const res = await app.inject({ method: "GET", url: "/docs/json" });
  assert.equal(res.statusCode, 200, res.body);
  const spec = res.json();
  assert.ok(spec.paths["/api/v1/accounts/bind-oauth"], "bind-oauth should be in Swagger");
  assert.ok(spec.paths["/api/v1/accounts/bind-oauth/batch"], "bind-oauth/batch should be in Swagger");
});
