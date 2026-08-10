import { beforeEach, describe, expect, test, vi } from "vitest";
import { getAuthToken } from "../services/http";
import { mailApi } from "../services/mailApi";
import { useMailAppStore } from "./useMailAppStore";

vi.mock("../services/http", () => ({
  getAuthToken: vi.fn(),
  getApiErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
}));

vi.mock("../services/mailApi", () => ({
  mailApi: {
    clearToken: vi.fn(),
    getHealth: vi.fn(),
    getProviderConfig: vi.fn(),
    listAccounts: vi.fn(),
    listMessages: vi.fn(),
    getFolderCounts: vi.fn(),
  },
}));

describe("mail app bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMailAppStore.setState({
      bootstrapped: false,
      isBootstrapping: false,
      isAuthenticated: false,
      authError: "",
    });
    vi.mocked(getAuthToken).mockReturnValue("");
    vi.mocked(mailApi.getHealth).mockResolvedValue({ status: "ok" });
    vi.mocked(mailApi.getProviderConfig).mockResolvedValue({
      gmail: { enabled: true, callbackUrl: "/google" },
      microsoft: {
        enabled: true,
        callbackUrl: "/microsoft",
        tenantId: "common",
      },
    });
    vi.mocked(mailApi.listMessages).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
      nextPageToken: null,
    });
    vi.mocked(mailApi.getFolderCounts).mockResolvedValue({
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
    });
  });

  test("does not request protected account data without a token", async () => {
    const bootstrap = useMailAppStore.getState().bootstrap;

    await Promise.all([bootstrap(), bootstrap()]);

    expect(mailApi.getHealth).toHaveBeenCalledTimes(1);
    expect(mailApi.getProviderConfig).toHaveBeenCalledTimes(1);
    expect(mailApi.listAccounts).not.toHaveBeenCalled();
    expect(useMailAppStore.getState()).toMatchObject({
      bootstrapped: true,
      isBootstrapping: false,
      isAuthenticated: false,
      authError: "",
    });
  });

  test("keeps cached messages visible and clears loading when mailbox refresh fails", async () => {
    const cachedMessage = {
      id: "message-1",
      accountId: "account-1",
      accountEmail: "owner@hotmail.com",
      accountDisplayName: "owner@hotmail.com",
      provider: "microsoft" as const,
      providerLabel: "Outlook / Hotmail",
      folder: "inbox" as const,
      fromName: "Sender",
      fromEmail: "sender@example.com",
      to: ["owner@hotmail.com"],
      subject: "Cached message",
      preview: "Existing cached preview",
      receivedAt: "2026-08-05T00:00:00.000Z",
      read: false,
      flagged: false,
      attachments: 0,
      labels: ["inbox"],
      hasHtml: false,
    };

    useMailAppStore.setState({
      accounts: [
        {
          id: "account-1",
          displayName: "owner@hotmail.com",
          email: "owner@hotmail.com",
          provider: "microsoft",
          providerLabel: "Outlook / Hotmail",
          status: "connected",
          unreadCount: 0,
          lastSyncAt: "2026-08-05T00:00:00.000Z",
          labels: [],
        },
      ],
      activeAccountId: "account-1",
      activeFolder: "inbox",
      messages: [cachedMessage],
      mailPagination: {
        items: [cachedMessage],
        page: 1,
        pageSize: 8,
        total: 1,
        nextPageToken: null,
      },
      selectedMessage: null,
      isLoadingMessages: false,
      messageListError: "",
    });
    vi.mocked(mailApi.listMessages).mockRejectedValueOnce(
      new Error("Microsoft 服务暂时无法连接，请检查网络或 VPN 后重试"),
    );

    await useMailAppStore.getState().refreshMailbox();

    expect(useMailAppStore.getState()).toMatchObject({
      isLoadingMessages: false,
      messageListError: "Microsoft 服务暂时无法连接，请检查网络或 VPN 后重试",
      messages: [cachedMessage],
    });
  });
});
