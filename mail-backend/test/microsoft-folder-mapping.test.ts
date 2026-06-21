import assert from "node:assert/strict";
import { test } from "node:test";
import { MicrosoftMailProvider } from "../src/providers/microsoft-mail.provider";

// 拦截 fetch，记录请求的 URL 并返回空 messages 列表。
function mockFetchCapture(): { calls: string[] } {
  const state = { calls: [] as string[] };
  (global as any).fetch = async (input: any) => {
    const url = typeof input === "string" ? input : input.toString();
    state.calls.push(url);
    return new Response(JSON.stringify({ value: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  return state;
}

test("listMessages: folder=sent → mailFolders/sentitems/messages", async () => {
  const provider = new MicrosoftMailProvider();
  const state = mockFetchCapture();
  await provider.listMessages("token", { folder: "sent", limit: 10 });
  const url = state.calls[0];
  assert.ok(url.includes("/mailFolders/sentitems/messages"), `URL 应含 sentitems，实际: ${url}`);
  assert.ok(!url.includes("/mailFolders/sent/messages"), "不应直接使用 sent 作为 folder name");
});

test("listMessages: folder=starred → /me/messages + $filter=flag/flagStatus", async () => {
  const provider = new MicrosoftMailProvider();
  const state = mockFetchCapture();
  await provider.listMessages("token", { folder: "starred", limit: 10 });
  const url = state.calls[0];
  assert.ok(url.includes("/me/messages"), `starred 应走 /me/messages，实际: ${url}`);
  assert.ok(!url.includes("/mailFolders/"), "starred 不应走 mailFolders 路径");
  assert.ok(url.includes("flag%2FflagStatus"), `应含 $filter=flag/flagStatus，实际: ${url}`);
});

test("listMessages: folder=trash → mailFolders/deleteditems/messages", async () => {
  const provider = new MicrosoftMailProvider();
  const state = mockFetchCapture();
  await provider.listMessages("token", { folder: "trash", limit: 10 });
  const url = state.calls[0];
  assert.ok(url.includes("/mailFolders/deleteditems/messages"), `URL 应含 deleteditems，实际: ${url}`);
});

test("listMessages: folder=inbox → mailFolders/inbox/messages（不破）", async () => {
  const provider = new MicrosoftMailProvider();
  const state = mockFetchCapture();
  await provider.listMessages("token", { folder: "inbox", limit: 10 });
  const url = state.calls[0];
  assert.ok(url.includes("/mailFolders/inbox/messages"), `URL 应含 inbox，实际: ${url}`);
});

test("listMessages: folder=undefined → /me/messages（全部）", async () => {
  const provider = new MicrosoftMailProvider();
  const state = mockFetchCapture();
  await provider.listMessages("token", { limit: 10 });
  const url = state.calls[0];
  assert.ok(url.includes("/me/messages"), `应走 /me/messages，实际: ${url}`);
  assert.ok(!url.includes("/mailFolders/"), "无 folder 不应走 mailFolders");
});
