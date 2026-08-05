import { describe, expect, test } from "vitest";
import type { MailAccount } from "../types/mail";
import {
  accountMatchesLabels,
  getReusableAccountLabels,
  normalizeAccountLabels,
} from "./accountLabels";

const account = (labels: string[]): MailAccount => ({
  id: labels.join("-") || "none",
  displayName: "Test",
  email: "test@example.com",
  provider: "microsoft",
  providerLabel: "Outlook / Hotmail",
  status: "connected",
  unreadCount: 0,
  lastSyncAt: new Date(0).toISOString(),
  labels,
});

describe("account label helpers", () => {
  test("normalizes and reuses labels across accounts", () => {
    expect(normalizeAccountLabels([" 客户 ", "主账号", "客户", ""])).toEqual([
      "客户",
      "主账号",
    ]);
    expect(
      getReusableAccountLabels([
        account(["客户"]),
        account(["主账号", "客户"]),
      ]),
    ).toEqual(["客户", "主账号"]);
  });

  test("matches any selected label", () => {
    expect(
      accountMatchesLabels(account(["客户", "主账号"]), ["内部", "客户"]),
    ).toBe(true);
    expect(accountMatchesLabels(account(["主账号"]), ["客户"])).toBe(false);
  });
});
