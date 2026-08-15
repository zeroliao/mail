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
      refreshTokenExchangeCount += 1;
      return new Response(
        JSON.stringify({
          access_token: "mock-access",
          refresh_token: "mock-refresh-new",
          token_type: "Bearer",
          expires_in: 3600,
          scope:
            "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/me")) {
      return new Response(
        JSON.stringify({ displayName: "Bind OAuth Mock", mail: mockEmail }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    throw new Error(`unexpected url ${url}`);
  };
}

let app: FastifyInstance;
let token: string;
let testDbPath = "";
let shutdownRequests = 0;
let refreshTokenExchangeCount = 0;

before(async () => {
  installMockFetch();

  const dbDir = path.resolve(process.cwd(), "prisma", "prisma");
  const templateDbPath = path.join(dbDir, "test-bind-oauth.db");
  const dbFileName = `test-bind-oauth-${Date.now()}-${process.pid}.db`;
  testDbPath = path.join(dbDir, dbFileName);

  await copyFile(templateDbPath, testDbPath);
  process.env.DATABASE_URL = `file:./prisma/${dbFileName}`;

  const { buildApp } = await import("../src/app");
  app = buildApp({
    scheduleShutdown: () => {
      shutdownRequests += 1;
    },
  });
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      username: process.env.API_ADMIN_USERNAME || "admin",
      password: process.env.API_ADMIN_PASSWORD,
    },
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
    payload: { email: "x@hotmail.com", refreshToken: "r" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /api/v1/accounts/bind-oauth 未认证返回 401", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    payload: { email: "x@hotmail.com", refreshToken: "r", clientId: "c" },
  });
  assert.equal(res.statusCode, 401);
});

test("POST /api/v1/system/shutdown 要求认证且仅允许本机请求", async () => {
  const unauthenticated = await app.inject({
    method: "POST",
    url: "/api/v1/system/shutdown",
  });
  assert.equal(unauthenticated.statusCode, 401);

  const remote = await app.inject({
    method: "POST",
    url: "/api/v1/system/shutdown",
    headers: { authorization: `Bearer ${token}` },
    remoteAddress: "192.168.1.20",
  });
  assert.equal(remote.statusCode, 403);
  assert.equal(shutdownRequests, 0);

  const local = await app.inject({
    method: "POST",
    url: "/api/v1/system/shutdown",
    headers: { authorization: `Bearer ${token}` },
    remoteAddress: "127.0.0.1",
  });
  assert.equal(local.statusCode, 202, local.body);
  assert.equal(local.json().status, "accepted");
  assert.equal(shutdownRequests, 1);
});

test("POST /api/v1/accounts/bind-oauth 成功绑定 mock 账号到隔离临时库", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      email: mockEmail.toUpperCase(),
      refreshToken: "owner-refresh",
      clientId: "owner-client",
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.status, "success");
  assert.equal(body.account.provider, "MICROSOFT");
  assert.equal(body.account.status, "ACTIVE");
});

test("POST /api/v1/accounts/bind-oauth 对已绑定账号跳过且不校验新凭据", async () => {
  const exchangesBefore = refreshTokenExchangeCount;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      email: mockEmail.toUpperCase(),
      refreshToken: "replacement-refresh-token",
      clientId: "replacement-client-id",
    },
  });

  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().status, "skipped");
  assert.equal(refreshTokenExchangeCount, exchangesBefore);
});

test("PUT /api/v1/accounts/:accountId/labels 可新增和复用账号标签", async () => {
  const accountsResponse = await app.inject({
    method: "GET",
    url: "/api/v1/accounts",
    headers: { authorization: `Bearer ${token}` },
  });
  const account = accountsResponse
    .json()
    .find((item: { email: string }) => item.email === mockEmail);
  assert.ok(account);

  const response = await app.inject({
    method: "PUT",
    url: `/api/v1/accounts/${account.id}/labels`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      labels: ["主账号", "客户", "主账号"],
      serviceNotes: {
        主账号: "owner@example.com",
        客户: "client workspace",
        已删除: "should not persist",
      },
      serviceStatuses: {
        GitHub: "unavailable",
      },
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().labels, ["主账号", "客户"]);
  assert.deepEqual(response.json().serviceNotes, {
    主账号: "owner@example.com",
    客户: "client workspace",
  });
  assert.deepEqual(response.json().serviceStatuses, {
    GitHub: "unavailable",
  });
  assert.equal(response.json().metadata.authMethod, "oauth-refresh");
});

test("POST /api/v1/accounts/bind-oauth/batch 跳过已绑定账号并返回逐条结果", async () => {
  const exchangesBefore = refreshTokenExchangeCount;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts/bind-oauth/batch",
    headers: { authorization: `Bearer ${token}` },
    payload: [{ email: mockEmail, refreshToken: "r1", clientId: "c1" }],
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.total, 1);
  assert.equal(body.success, 0);
  assert.equal(body.skipped, 1);
  assert.equal(body.failed, 0);
  assert.equal(body.results[0].status, "skipped");
  assert.equal(refreshTokenExchangeCount, exchangesBefore);

  const accountsResponse = await app.inject({
    method: "GET",
    url: "/api/v1/accounts",
    headers: { authorization: `Bearer ${token}` },
  });
  const account = accountsResponse
    .json()
    .find((item: { email: string }) => item.email === mockEmail);
  assert.deepEqual(
    account.labels,
    ["主账号", "客户"],
    "跳过已绑定账号不应清除已有标签",
  );
  assert.deepEqual(
    account.serviceStatuses,
    { GitHub: "unavailable" },
    "跳过已绑定账号不应清除服务收码异常标记",
  );
});

test("Swagger JSON 暴露 bind-oauth 路由", async () => {
  const res = await app.inject({ method: "GET", url: "/docs/json" });
  assert.equal(res.statusCode, 200, res.body);
  const spec = res.json();
  assert.ok(
    spec.paths["/api/v1/accounts/bind-oauth"],
    "bind-oauth should be in Swagger",
  );
  assert.ok(
    spec.paths["/api/v1/accounts/bind-oauth/batch"],
    "bind-oauth/batch should be in Swagger",
  );
  assert.ok(
    spec.paths["/api/v1/system/shutdown"],
    "system/shutdown should be in Swagger",
  );
});
