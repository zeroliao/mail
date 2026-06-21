import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MICROSOFT_GRAPH_SCOPES, MicrosoftMailProvider } from "../src/providers/microsoft-mail.provider";

type FetchCall = { url: string; init?: any };

function mockFetch(responder: (url: string, init: any) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  (global as any).fetch = async (input: any, init: any) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  };
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("exchangeRefreshTokenForPublicClient: public client 不发送 client_secret，tenant=consumers，使用 Graph scope", async () => {
  const provider = new MicrosoftMailProvider();
  const calls = mockFetch((url) => {
    if (url.includes("/oauth2/v2.0/token")) {
      return jsonResponse({
        access_token: "access-xyz",
        refresh_token: "refresh-new",
        token_type: "Bearer",
        expires_in: 3600,
        scope: DEFAULT_MICROSOFT_GRAPH_SCOPES.join(" ")
      });
    }

    if (url.includes("/me")) {
      return jsonResponse({ displayName: "Owner Test", mail: "owner@hotmail.com" });
    }

    throw new Error(`unexpected url ${url}`);
  });

  const result = await provider.exchangeRefreshTokenForPublicClient({
    refreshToken: "refresh-old",
    clientId: "client-123"
  });

  assert.equal(result.accessToken, "access-xyz");
  assert.equal(result.refreshToken, "refresh-new");
  assert.equal(result.profile.email, "owner@hotmail.com");
  assert.equal(result.profile.displayName, "Owner Test");

  const tokenCall = calls.find((call) => call.url.includes("/oauth2/v2.0/token"));
  assert.ok(tokenCall, "should request token endpoint");
  assert.ok(tokenCall.url.includes("/consumers/"), "default tenant should be consumers");
  const body = String(tokenCall.init.body);
  assert.ok(body.includes("client_id=client-123"));
  assert.ok(!body.includes("client_secret"), "public client should not send client_secret");
  assert.ok(body.includes("grant_type=refresh_token"));
  assert.ok(body.includes("Mail.ReadWrite"));
  assert.ok(calls.some((call) => call.url.includes("/me")), "should validate Graph /me");
});

test("refreshAccessToken: 传入 clientId 时走 per-account public client 刷新", async () => {
  const provider = new MicrosoftMailProvider();
  const calls = mockFetch((url) => {
    if (url.includes("/oauth2/v2.0/token")) {
      return jsonResponse({
        access_token: "access-refreshed",
        refresh_token: "refresh-rotated",
        token_type: "Bearer",
        expires_in: 3600
      });
    }

    throw new Error(`unexpected url ${url}`);
  });

  const tokens = await provider.refreshAccessToken("refresh-old", {
    clientId: "client-abc",
    tenant: "consumers"
  });

  assert.equal(tokens.accessToken, "access-refreshed");
  assert.equal(tokens.refreshToken, "refresh-rotated");
  const body = String(calls[0].init.body);
  assert.ok(body.includes("client_id=client-abc"));
  assert.ok(!body.includes("client_secret"), "public client refresh should not send client_secret");
});

test("exchangeRefreshTokenForPublicClient: 微软返回错误时抛出最小化错误体的 AppError", async () => {
  const provider = new MicrosoftMailProvider();
  mockFetch((url) => {
    if (url.includes("/oauth2/v2.0/token")) {
      return jsonResponse(
        {
          error: "invalid_scope",
          error_description: "AADSTS70011",
          error_codes: [70011],
          trace_id: "trace-should-be-stripped",
          correlation_id: "corr-should-be-stripped",
          timestamp: "2026-06-15 00:00:00Z"
        },
        400
      );
    }

    throw new Error(`unexpected url ${url}`);
  });

  await assert.rejects(
    () => provider.exchangeRefreshTokenForPublicClient({ refreshToken: "r", clientId: "c" }),
    (err: any) => {
      assert.equal(err.statusCode, 502);
      assert.equal(err.details.error, "invalid_scope");
      assert.equal(err.details.error_description, "AADSTS70011");
      assert.deepEqual(Object.keys(err.details).sort(), ["error", "error_description"]);
      assert.ok(!("trace_id" in err.details));
      assert.ok(!("correlation_id" in err.details));
      assert.ok(!("timestamp" in err.details));
      assert.ok(!("error_codes" in err.details));
      return true;
    }
  );
});

test("listMessages: InvalidAuthenticationToken 需要向上抛 401 供重试逻辑识别", async () => {
  const provider = new MicrosoftMailProvider();
  mockFetch((url) => {
    if (url.includes("/messages")) {
      return jsonResponse(
        {
          error: {
            code: "InvalidAuthenticationToken",
            message: "IDX14100: JWT is not well formed, there are no dots (.)"
          }
        },
        400
      );
    }

    throw new Error(`unexpected url ${url}`);
  });

  await assert.rejects(
    () => provider.listMessages("mock-access", { folder: "inbox", limit: 20 }),
    (err: any) => {
      assert.equal(err.statusCode, 401);
      assert.equal(err.details.error.code, "InvalidAuthenticationToken");
      return true;
    }
  );
});
