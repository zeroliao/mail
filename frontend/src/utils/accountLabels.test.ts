import { describe, expect, test } from "vitest";
import type { MailAccount } from "../types/mail";
import {
  accountMatchesLabels,
  accountCanRegisterService,
  accountHasServiceIssue,
  accountIsUnboundFromService,
  getAccountServiceNote,
  getReusableAccountLabels,
  getServiceDirectory,
  normalizeAccountLabels,
} from "./accountLabels";

const account = (
  labels: string[],
  serviceStatuses: MailAccount["serviceStatuses"] = {},
): MailAccount => ({
  id: labels.join("-") || "none",
  displayName: "Test",
  email: "test@example.com",
  provider: "microsoft",
  providerLabel: "Outlook / Hotmail",
  status: "connected",
  unreadCount: 0,
  lastSyncAt: new Date(0).toISOString(),
  labels,
  serviceNotes: Object.fromEntries(
    labels.map((label) => [label, `${label} note`]),
  ),
  serviceStatuses,
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

  test("identifies accounts that are not bound to a service", () => {
    expect(accountIsUnboundFromService(account(["OpenAI"]), "GitHub")).toBe(
      true,
    );
    expect(accountIsUnboundFromService(account(["OpenAI"]), "OpenAI")).toBe(
      false,
    );
    expect(accountIsUnboundFromService(account(["OpenAI"]), "  ")).toBe(false);
  });

  test("separates unavailable service accounts from registration candidates", () => {
    const unavailable = account([], { OpenAI: "unavailable" });
    expect(accountHasServiceIssue(unavailable, "OpenAI")).toBe(true);
    expect(accountCanRegisterService(unavailable, "OpenAI")).toBe(false);
    expect(accountCanRegisterService(account([], {}), "OpenAI")).toBe(true);
    expect(
      getServiceDirectory([account(["OpenAI"]), unavailable, account([])]),
    ).toMatchObject([
      {
        name: "OpenAI",
        accountCount: 1,
        availableCount: 1,
        blockedCount: 1,
      },
    ]);
  });

  test("builds a service-first directory from account bindings", () => {
    expect(
      getServiceDirectory([account(["OpenAI", "GitHub"]), account(["OpenAI"])]),
    ).toMatchObject([
      { name: "GitHub", accountCount: 1 },
      { name: "OpenAI", accountCount: 2 },
    ]);
    expect(getAccountServiceNote(account(["OpenAI"]), "OpenAI")).toBe(
      "OpenAI note",
    );
  });
});
