import dayjs from "dayjs";
import { apiClient, setAuthToken } from "./http";
import { ALL_ACCOUNTS_ID } from "./mockData";
import type {
  BindOAuthAccountResponse,
  BindOAuthBatchResponse,
  BindOAuthPayload,
  FolderCountMap,
  FolderKey,
  HealthResponse,
  MailAccount,
  MailDetail,
  MailSummary,
  PaginatedMailResult,
  ProviderConfigResponse,
  ProviderKind,
  SendMailPayload,
} from "../types/mail";

type BackendAccount = {
  id: string;
  provider: "GOOGLE" | "MICROSOFT";
  email: string;
  displayName: string | null;
  status: string;
  tokenType: string | null;
  scope: string;
  expiresAt: string | null;
  lastSyncAt: string | null;
  metadata: unknown;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
};

type BackendAddress = {
  email: string;
  name?: string | null;
};

type BackendMessage = {
  providerMessageId: string;
  accountId?: string;
  accountEmail?: string;
  accountDisplayName?: string;
  provider?: ProviderKind | BackendAccount["provider"];
  providerLabel?: string;
  threadId?: string | null;
  folder?: string | null;
  subject?: string | null;
  snippet?: string | null;
  from?: BackendAddress | null;
  to: BackendAddress[];
  cc: BackendAddress[];
  bcc: BackendAddress[];
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt?: string | null;
  sentAt?: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  attachments: Array<{ filename: string }>;
  rawPayload?: unknown;
};

const providerMap: Record<BackendAccount["provider"], ProviderKind> = {
  GOOGLE: "gmail",
  MICROSOFT: "microsoft",
};

const providerLabelMap: Record<ProviderKind, string> = {
  gmail: "Gmail",
  microsoft: "Outlook / Hotmail",
};

const normalizeProvider = (
  provider?: ProviderKind | BackendAccount["provider"],
  fallback?: ProviderKind,
): ProviderKind => {
  if (provider === "gmail" || provider === "microsoft") {
    return provider;
  }
  if (provider === "GOOGLE" || provider === "MICROSOFT") {
    return providerMap[provider];
  }
  return fallback ?? "gmail";
};

const normalizeFolder = (folder?: string | null): FolderKey => {
  const value = (folder || "inbox").toLowerCase();
  if (value.includes("star")) return "starred";
  if (value.includes("sent")) return "sent";
  if (value.includes("draft")) return "drafts";
  if (value.includes("archive")) return "archive";
  return "inbox";
};

const toAccountStatus = (status: string) =>
  status === "ACTIVE" ? ("connected" as const) : ("attention" as const);

const toFrontendAccount = (account: BackendAccount): MailAccount => {
  const provider = providerMap[account.provider];
  return {
    id: account.id,
    provider,
    providerLabel: providerLabelMap[provider],
    email: account.email,
    displayName: account.displayName || account.email,
    status: toAccountStatus(account.status),
    unreadCount: 0,
    lastSyncAt: account.lastSyncAt || account.updatedAt,
    labels: account.labels ?? [],
    scopeText: account.scope,
  };
};

const toMailSummary = (
  message: BackendMessage,
  account?: MailAccount,
): MailSummary => {
  const provider = normalizeProvider(message.provider, account?.provider);
  return {
    id: message.providerMessageId,
    accountId: message.accountId || account?.id || "",
    accountEmail: message.accountEmail || account?.email || "",
    accountDisplayName:
      message.accountDisplayName ||
      account?.displayName ||
      message.accountEmail ||
      account?.email ||
      "",
    provider,
    providerLabel:
      message.providerLabel ||
      account?.providerLabel ||
      providerLabelMap[provider],
    folder: normalizeFolder(message.folder),
    fromName: message.from?.name || message.from?.email || "未知发件人",
    fromEmail: message.from?.email || "",
    to: (message.to || []).map((item) => item.email),
    subject: message.subject || "（无主题）",
    preview: message.snippet || message.bodyText || "暂无预览",
    receivedAt: message.receivedAt || message.sentAt || dayjs().toISOString(),
    read: message.isRead,
    flagged: false,
    attachments: message.attachments?.length || 0,
    labels: message.folder ? [normalizeFolder(message.folder)] : [],
    hasHtml: Boolean(message.bodyHtml),
  };
};

const toMailDetail = (
  message: BackendMessage,
  account?: MailAccount,
): MailDetail => ({
  ...toMailSummary(message, account),
  cc: (message.cc || []).map((item) => item.email),
  bcc: (message.bcc || []).map((item) => item.email),
  bodyType: message.bodyHtml ? "html" : "text",
  htmlBody: message.bodyHtml || "",
  textBody: message.bodyText || "",
});

export const mailApi = {
  async login(username: string, password: string) {
    const response = await apiClient.post<{ token: string }>("/auth/login", {
      username,
      password,
    });
    setAuthToken(response.data.token);
    return response.data;
  },

  clearToken() {
    setAuthToken("");
  },

  async getHealth(): Promise<HealthResponse> {
    const response = await apiClient.get<HealthResponse>("/health");
    return response.data;
  },

  async stopServices() {
    const response = await apiClient.post<{
      status: "accepted";
      message: string;
    }>("/system/shutdown");
    return response.data;
  },

  async getProviderConfig(): Promise<ProviderConfigResponse> {
    return {
      gmail: {
        enabled: true,
        callbackUrl: "/api/v1/accounts/oauth/google/callback",
      },
      microsoft: {
        enabled: true,
        callbackUrl: "/api/v1/accounts/oauth/microsoft/callback",
        tenantId: "common",
      },
    };
  },

  async listAccounts(): Promise<MailAccount[]> {
    const response = await apiClient.get<BackendAccount[]>("/accounts");
    return response.data.map(toFrontendAccount);
  },

  async bindAccount(provider: ProviderKind, frontendRedirectUri?: string) {
    const path =
      provider === "gmail"
        ? "/accounts/oauth/google/url"
        : "/accounts/oauth/microsoft/url";
    const response = await apiClient.post<{ authUrl: string; state: string }>(
      path,
      {
        frontendRedirectUri,
      },
    );
    return response.data;
  },

  // IMAP 密码直连绑定
  async bindCredentials(email: string, password: string) {
    const response = await apiClient.post<{
      status: string;
      message: string;
      account: { id: string; email: string };
    }>("/accounts/bind-credentials", {
      email,
      password,
    });
    return response.data;
  },

  async bindOAuthAccount(
    payload: BindOAuthPayload,
  ): Promise<BindOAuthAccountResponse> {
    const response = await apiClient.post<BindOAuthAccountResponse>(
      "/accounts/bind-oauth",
      payload,
    );
    return response.data;
  },

  async bindOAuthAccounts(
    payload: BindOAuthPayload[],
  ): Promise<BindOAuthBatchResponse> {
    const response = await apiClient.post<BindOAuthBatchResponse>(
      "/accounts/bind-oauth/batch",
      payload,
    );
    return response.data;
  },

  async removeAccount(accountId: string) {
    const response = await apiClient.delete<BackendAccount>(
      `/accounts/${accountId}`,
    );
    return {
      message: `已移除 ${response.data.email}`,
    };
  },

  async updateAccountLabels(accountId: string, labels: string[]) {
    const response = await apiClient.put<BackendAccount>(
      `/accounts/${accountId}/labels`,
      { labels },
    );
    return toFrontendAccount(response.data);
  },

  async listMessages(params: {
    accountId: string;
    folder: FolderKey;
    page: number;
    pageSize: number;
    accounts: MailAccount[];
    pageToken?: string | null;
  }): Promise<PaginatedMailResult> {
    if (params.accountId === ALL_ACCOUNTS_ID) {
      // 使用统一 /mail 端点，支持服务端 page+pageSize 分页
      type UnifiedResponse = {
        items: BackendMessage[];
        page: number;
        pageSize: number;
        total: number;
        nextPageToken: string | null;
      };
      const response = await apiClient.get<UnifiedResponse>("/mail", {
        params: {
          folder: params.folder,
          page: params.page,
          pageSize: params.pageSize,
          sync: false,
        },
      });
      return {
        items: response.data.items.map((message) => toMailSummary(message)),
        page: response.data.page,
        pageSize: response.data.pageSize,
        total: response.data.total,
        nextPageToken: response.data.nextPageToken ?? null,
      };
    }

    const account = params.accounts.find(
      (item) => item.id === params.accountId,
    );
    if (!account) {
      return {
        items: [],
        page: params.page,
        pageSize: params.pageSize,
        total: 0,
        nextPageToken: null,
      };
    }

    const queryParams: Record<string, unknown> = {
      folder: params.folder,
      limit: params.pageSize,
      sync: true,
    };
    if (params.pageToken) {
      queryParams.pageToken = params.pageToken;
    }

    const response = await apiClient.get<{
      messages: BackendMessage[];
      nextPageToken?: string | null;
    }>(`/accounts/${params.accountId}/messages`, { params: queryParams });

    return {
      items: response.data.messages.map((message) =>
        toMailSummary(message, account),
      ),
      page: params.page,
      pageSize: params.pageSize,
      total: response.data.messages.length,
      nextPageToken: response.data.nextPageToken ?? null,
    };
  },

  async getMessage(
    accountId: string,
    messageId: string,
    accounts: MailAccount[],
  ): Promise<MailDetail | undefined> {
    const account = accounts.find((item) => item.id === accountId);
    const response = await apiClient.get<BackendMessage>(
      `/accounts/${accountId}/messages/${messageId}`,
      {
        params: {
          sync: true,
        },
      },
    );
    return toMailDetail(response.data, account);
  },

  async getFolderCounts(accountId: string, accounts: MailAccount[]) {
    if (!accounts.length) {
      return {
        inbox: 0,
        starred: 0,
        sent: 0,
        drafts: 0,
        archive: 0,
      };
    }

    if (accountId === ALL_ACCOUNTS_ID) {
      const folders: FolderKey[] = [
        "inbox",
        "starred",
        "sent",
        "drafts",
        "archive",
      ];
      const entries = await Promise.all(
        folders.map(async (folder) => {
          const result = await this.listMessages({
            accountId,
            folder,
            page: 1,
            pageSize: 50,
            accounts,
          });
          return [folder, result.items.length] as const;
        }),
      );

      return entries.reduce<FolderCountMap>(
        (acc, [folder, count]) => ({
          ...acc,
          [folder]: count,
        }),
        {
          inbox: 0,
          starred: 0,
          sent: 0,
          drafts: 0,
          archive: 0,
        },
      );
    }

    const folders: FolderKey[] = [
      "inbox",
      "starred",
      "sent",
      "drafts",
      "archive",
    ];
    const entries = await Promise.all(
      folders.map(async (folder) => {
        const result = await this.listMessages({
          accountId,
          folder,
          page: 1,
          pageSize: 20,
          accounts,
        });
        return [folder, result.items.length] as const;
      }),
    );

    return entries.reduce<FolderCountMap>(
      (acc, [folder, count]) => ({
        ...acc,
        [folder]: count,
      }),
      {
        inbox: 0,
        starred: 0,
        sent: 0,
        drafts: 0,
        archive: 0,
      },
    );
  },

  async sendMail(payload: SendMailPayload) {
    const response = await apiClient.post(
      `/accounts/${payload.accountId}/messages/send`,
      {
        subject: payload.subject,
        to: payload.to.map((email) => ({ email })),
        cc: payload.cc.map((email) => ({ email })),
        bcc: payload.bcc.map((email) => ({ email })),
        html: payload.body,
        text: payload.body.replace(/<[^>]+>/g, " "),
      },
    );
    return {
      message: response.data?.id ? "邮件发送成功。" : "发送请求已被后端接受。",
    };
  },
};
