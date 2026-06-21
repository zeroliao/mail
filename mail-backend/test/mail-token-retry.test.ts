import assert from "node:assert/strict";
import { test } from "node:test";
import { MailProvider } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import { MailService } from "../src/modules/mail/mail.service";
import { providerRegistry } from "../src/providers/registry";
import { NormalizedMessage } from "../src/types/mail";

test("listMessages: Microsoft 401 后强制刷新并只重试一次", async () => {
  const service = new MailService("mail-token-retry-secret-123456");
  const message: NormalizedMessage = {
    providerMessageId: "msg-1",
    threadId: "thread-1",
    folder: "inbox",
    subject: "hello",
    snippet: "hello",
    from: { email: "sender@example.com", name: "Sender" },
    to: [{ email: "owner@hotmail.com", name: "Owner" }],
    cc: [],
    bcc: [],
    bodyText: "hello",
    bodyHtml: null,
    receivedAt: new Date("2026-06-15T00:00:00.000Z"),
    sentAt: new Date("2026-06-15T00:00:00.000Z"),
    isRead: false,
    hasAttachments: false,
    attachments: [],
    rawPayload: { id: "msg-1" }
  };

  const authorizedAccounts = [
    {
      account: {
        id: "acc-1",
        email: "owner@hotmail.com",
        displayName: "Owner",
        provider: MailProvider.MICROSOFT,
        tokenType: "Bearer",
        metadata: null
      },
      accessToken: "stale-token"
    },
    {
      account: {
        id: "acc-1",
        email: "owner@hotmail.com",
        displayName: "Owner",
        provider: MailProvider.MICROSOFT,
        tokenType: "Bearer",
        metadata: null
      },
      accessToken: "fresh-token"
    }
  ];

  const accountCalls: Array<{ accountId: string; forceRefresh?: boolean }> = [];
  (service as any).accountsService = {
    getAuthorizedAccount: async (accountId: string, forceRefresh?: boolean) => {
      accountCalls.push({ accountId, forceRefresh });
      const next = authorizedAccounts.shift();
      if (!next) {
        throw new Error("unexpected getAuthorizedAccount call");
      }
      return next;
    }
  };

  (service as any).cacheMessages = async () => undefined;
  (service as any).touchAccountSync = async () => undefined;

  const originalGet = providerRegistry.get;
  const providerCalls: string[] = [];
  (providerRegistry as any).get = () => ({
    listMessages: async (accessToken: string) => {
      providerCalls.push(accessToken);
      if (providerCalls.length === 1) {
        throw new AppError("Failed to list Microsoft messages", 401, {
          error: { code: "InvalidAuthenticationToken" }
        });
      }

      return {
        messages: [message],
        nextPageToken: null
      };
    }
  });

  try {
    const result = await service.listMessages("acc-1", {
      folder: "inbox",
      limit: 20,
      pageToken: undefined,
      sync: true
    });

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].providerMessageId, "msg-1");
    assert.deepEqual(providerCalls, ["stale-token", "fresh-token"]);
    assert.deepEqual(accountCalls, [
      { accountId: "acc-1", forceRefresh: undefined },
      { accountId: "acc-1", forceRefresh: true }
    ]);
  } finally {
    (providerRegistry as any).get = originalGet;
  }
});
