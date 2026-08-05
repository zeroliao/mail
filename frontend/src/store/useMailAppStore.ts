import dayjs from "dayjs";
import { create } from "zustand";
import { getAuthToken } from "../services/http";
import { mailApi } from "../services/mailApi";
import { ALL_ACCOUNTS_ID } from "../services/mockData";
import type {
  BindOAuthAccountResponse,
  BindOAuthBatchResponse,
  BindOAuthPayload,
  ComposeDraft,
  FolderCountMap,
  FolderKey,
  HealthResponse,
  MailAccount,
  MailDetail,
  MailSummary,
  PaginatedMailResult,
  ProviderConfigResponse,
  ProviderKind,
} from "../types/mail";

const emptyDraft: ComposeDraft = {
  accountId: "",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "<p></p>",
};

const emptyFolderCounts: FolderCountMap = {
  inbox: 0,
  starred: 0,
  sent: 0,
  drafts: 0,
  archive: 0,
};

type QuickFilter = "all" | "unread" | "starred" | "attachments";

type MailAppStore = {
  bootstrapped: boolean;
  isBootstrapping: boolean;
  backendError: string;
  health: HealthResponse | null;
  providerConfig: ProviderConfigResponse;
  authTokenReady: boolean;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  authError: string;
  accounts: MailAccount[];
  activeAccountId: string;
  activeFolder: FolderKey;
  folderCounts: FolderCountMap;
  messages: MailSummary[];
  mailPagination: PaginatedMailResult;
  selectedMessage: MailDetail | null;
  searchQuery: string;
  quickFilter: QuickFilter;
  composeDraft: ComposeDraft;
  composeMode: "new" | "reply" | "forward";
  lastDraftSavedAt: string;
  isLoadingMessages: boolean;
  isLoadingMessageDetail: boolean;
  messageDetailError: string;
  isBindingAccount: boolean;
  isSendingCompose: boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMailbox: () => Promise<void>;
  selectAccount: (accountId: string) => Promise<void>;
  selectFolder: (folder: FolderKey) => Promise<void>;
  changePage: (page: number) => Promise<void>;
  openMessage: (messageId: string, accountId?: string) => Promise<void>;
  bindAccount: (provider: ProviderKind) => Promise<{ message: string }>;
  bindCredentials: (
    email: string,
    password: string,
  ) => Promise<{ message: string }>;
  bindOAuthAccount: (
    payload: BindOAuthPayload,
  ) => Promise<BindOAuthAccountResponse>;
  bindOAuthAccounts: (
    payload: BindOAuthPayload[],
  ) => Promise<BindOAuthBatchResponse>;
  removeAccount: (accountId: string) => Promise<{ message: string }>;
  updateAccountLabels: (
    accountId: string,
    labels: string[],
  ) => Promise<MailAccount>;
  prepareReply: (messageId: string) => Promise<void>;
  prepareForward: (messageId: string) => Promise<void>;
  setSearchQuery: (value: string) => void;
  setQuickFilter: (value: QuickFilter) => void;
  updateComposeField: (field: keyof ComposeDraft, value: string) => void;
  sendCompose: () => Promise<{ message: string }>;
};

const emptyPagination: PaginatedMailResult = {
  items: [],
  page: 1,
  pageSize: 8,
  total: 0,
  nextPageToken: null,
};

const defaultProviderConfig: ProviderConfigResponse = {
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

const preserveSelection = async (
  nextItems: MailSummary[],
  currentSelectedId: string | null,
  openMessage: (messageId: string, accountId?: string) => Promise<void>,
) => {
  if (!nextItems.length) {
    return;
  }

  const preserved = currentSelectedId
    ? nextItems.find((item) => item.id === currentSelectedId)
    : null;
  const candidate = preserved ?? nextItems[0];
  await openMessage(candidate.id, candidate.accountId);
};

export const useMailAppStore = create<MailAppStore>((set, get) => {
  const reloadAccounts = async () => {
    const accounts = await mailApi.listAccounts();
    const activeAccountId = get().activeAccountId;
    const composeAccountId = get().composeDraft.accountId;
    const nextComposeAccountId =
      composeAccountId && accounts.some((item) => item.id === composeAccountId)
        ? composeAccountId
        : (accounts[0]?.id ?? "");

    set({
      accounts,
      activeAccountId:
        activeAccountId === ALL_ACCOUNTS_ID ||
        accounts.some((item) => item.id === activeAccountId)
          ? activeAccountId
          : ALL_ACCOUNTS_ID,
      composeDraft: {
        ...get().composeDraft,
        accountId: nextComposeAccountId,
      },
    });

    if (!accounts.length) {
      set({
        activeAccountId: ALL_ACCOUNTS_ID,
        folderCounts: emptyFolderCounts,
        messages: [],
        mailPagination: emptyPagination,
        selectedMessage: null,
      });
      return;
    }

    await get().refreshMailbox();
  };

  return {
    bootstrapped: false,
    isBootstrapping: false,
    backendError: "",
    health: null,
    providerConfig: defaultProviderConfig,
    authTokenReady: false,
    isAuthenticated: false,
    isLoggingIn: false,
    authError: "",
    accounts: [],
    activeAccountId: ALL_ACCOUNTS_ID,
    activeFolder: "inbox",
    folderCounts: emptyFolderCounts,
    messages: [],
    mailPagination: emptyPagination,
    selectedMessage: null,
    searchQuery: "",
    quickFilter: "all",
    composeDraft: emptyDraft,
    composeMode: "new",
    lastDraftSavedAt: "",
    isLoadingMessages: false,
    isLoadingMessageDetail: false,
    messageDetailError: "",
    isBindingAccount: false,
    isSendingCompose: false,

    bootstrap: async () => {
      if (get().isBootstrapping || get().bootstrapped) {
        return;
      }

      set({ isBootstrapping: true });
      try {
        const [health, providerConfig] = await Promise.all([
          mailApi.getHealth(),
          mailApi.getProviderConfig(),
        ]);
        set({
          health,
          providerConfig,
          authTokenReady: true,
        });

        if (!getAuthToken()) {
          set({
            isAuthenticated: false,
            bootstrapped: true,
            isBootstrapping: false,
            authError: "",
            accounts: [],
            composeDraft: emptyDraft,
          });
          return;
        }

        try {
          const accounts = await mailApi.listAccounts();
          const defaultComposeAccountId = accounts[0]?.id ?? "";
          const mailPagination = await mailApi.listMessages({
            accountId: ALL_ACCOUNTS_ID,
            folder: "inbox",
            page: 1,
            pageSize: emptyPagination.pageSize,
            accounts,
          });
          const folderCounts = await mailApi.getFolderCounts(
            ALL_ACCOUNTS_ID,
            accounts,
          );
          set({
            isAuthenticated: true,
            bootstrapped: true,
            isBootstrapping: false,
            accounts,
            activeAccountId: ALL_ACCOUNTS_ID,
            folderCounts,
            messages: mailPagination.items,
            mailPagination,
            composeDraft: {
              ...emptyDraft,
              accountId: defaultComposeAccountId,
            },
          });
          await preserveSelection(
            mailPagination.items,
            null,
            get().openMessage,
          );
        } catch (error) {
          set({
            isAuthenticated: false,
            bootstrapped: true,
            isBootstrapping: false,
            authError: error instanceof Error ? error.message : "需要登录认证",
            accounts: [],
            composeDraft: emptyDraft,
          });
        }
      } catch (error) {
        set({
          health: { status: "degraded" },
          backendError:
            error instanceof Error ? error.message : "后端服务不可用",
          authTokenReady: true,
          bootstrapped: true,
          isBootstrapping: false,
        });
      }
    },

    login: async (username, password) => {
      set({ isLoggingIn: true, authError: "" });
      try {
        await mailApi.login(username, password);
        const accounts = await mailApi.listAccounts();
        const mailPagination = await mailApi.listMessages({
          accountId: ALL_ACCOUNTS_ID,
          folder: "inbox",
          page: 1,
          pageSize: get().mailPagination.pageSize,
          accounts,
        });
        const folderCounts = await mailApi.getFolderCounts(
          ALL_ACCOUNTS_ID,
          accounts,
        );
        set({
          isAuthenticated: true,
          isLoggingIn: false,
          accounts,
          activeAccountId: ALL_ACCOUNTS_ID,
          activeFolder: "inbox",
          folderCounts,
          messages: mailPagination.items,
          mailPagination,
          composeDraft: {
            ...emptyDraft,
            accountId: accounts[0]?.id ?? "",
          },
        });
        await preserveSelection(mailPagination.items, null, get().openMessage);
      } catch (error) {
        set({
          isLoggingIn: false,
          isAuthenticated: false,
          authError: error instanceof Error ? error.message : "登录失败",
        });
        throw error;
      }
    },

    logout: () => {
      mailApi.clearToken();
      set({
        isAuthenticated: false,
        authError: "",
        accounts: [],
        activeAccountId: ALL_ACCOUNTS_ID,
        folderCounts: emptyFolderCounts,
        messages: [],
        selectedMessage: null,
        composeDraft: emptyDraft,
      });
    },

    refreshMailbox: async () => {
      const {
        activeAccountId,
        activeFolder,
        mailPagination,
        accounts,
        selectedMessage,
      } = get();
      if (!accounts.length) {
        return;
      }
      set({ isLoadingMessages: true });
      const [folderCounts, nextPagination] = await Promise.all([
        mailApi.getFolderCounts(activeAccountId, accounts),
        mailApi.listMessages({
          accountId: activeAccountId,
          folder: activeFolder,
          page: mailPagination.page,
          pageSize: mailPagination.pageSize,
          accounts,
        }),
      ]);
      set({
        folderCounts,
        messages: nextPagination.items,
        mailPagination: nextPagination,
        isLoadingMessages: false,
      });
      if (!nextPagination.items.length) {
        set({ selectedMessage: null });
        return;
      }
      await preserveSelection(
        nextPagination.items,
        selectedMessage?.id ?? null,
        get().openMessage,
      );
    },

    selectAccount: async (accountId) => {
      const {
        activeFolder,
        mailPagination,
        accounts,
        composeDraft,
        selectedMessage,
      } = get();
      set({
        activeAccountId: accountId,
        isLoadingMessages: true,
      });
      const [folderCounts, nextPagination] = await Promise.all([
        mailApi.getFolderCounts(accountId, accounts),
        mailApi.listMessages({
          accountId,
          folder: activeFolder,
          page: 1,
          pageSize: mailPagination.pageSize,
          accounts,
        }),
      ]);

      set({
        folderCounts,
        messages: nextPagination.items,
        mailPagination: {
          ...nextPagination,
          page: 1,
        },
        isLoadingMessages: false,
        composeDraft: {
          ...composeDraft,
          accountId:
            accountId === ALL_ACCOUNTS_ID
              ? composeDraft.accountId || accounts[0]?.id || ""
              : accountId,
        },
      });

      if (!nextPagination.items.length) {
        set({ selectedMessage: null });
        return;
      }
      await preserveSelection(
        nextPagination.items,
        selectedMessage?.id ?? null,
        get().openMessage,
      );
    },

    selectFolder: async (folder) => {
      const { activeAccountId, mailPagination, accounts, selectedMessage } =
        get();
      set({
        activeFolder: folder,
        isLoadingMessages: true,
      });
      const nextPagination = await mailApi.listMessages({
        accountId: activeAccountId,
        folder,
        page: 1,
        pageSize: mailPagination.pageSize,
        accounts,
      });
      set({
        messages: nextPagination.items,
        mailPagination: {
          ...nextPagination,
          page: 1,
        },
        isLoadingMessages: false,
      });
      if (!nextPagination.items.length) {
        set({ selectedMessage: null });
        return;
      }
      await preserveSelection(
        nextPagination.items,
        selectedMessage?.id ?? null,
        get().openMessage,
      );
    },

    changePage: async (page) => {
      const {
        activeAccountId,
        activeFolder,
        mailPagination,
        accounts,
        selectedMessage,
      } = get();
      set({ isLoadingMessages: true });
      // 基于游标的分页：向后翻页时传递 nextPageToken
      const pageToken =
        page > mailPagination.page
          ? (mailPagination.nextPageToken ?? undefined)
          : undefined;
      const nextPagination = await mailApi.listMessages({
        accountId: activeAccountId,
        folder: activeFolder,
        page,
        pageSize: mailPagination.pageSize,
        accounts,
        pageToken,
      });
      set({
        messages: nextPagination.items,
        mailPagination: {
          ...nextPagination,
          page,
        },
        isLoadingMessages: false,
      });
      if (!nextPagination.items.length) {
        set({ selectedMessage: null });
        return;
      }
      await preserveSelection(
        nextPagination.items,
        selectedMessage?.id ?? null,
        get().openMessage,
      );
    },

    openMessage: async (messageId, accountId) => {
      const targetAccountId =
        accountId ||
        get().messages.find((item) => item.id === messageId)?.accountId ||
        get().activeAccountId;
      if (!targetAccountId || targetAccountId === ALL_ACCOUNTS_ID) {
        return;
      }
      set({ isLoadingMessageDetail: true, messageDetailError: "" });
      try {
        const selectedMessage =
          (await mailApi.getMessage(
            targetAccountId,
            messageId,
            get().accounts,
          )) ?? null;
        set({ selectedMessage, isLoadingMessageDetail: false });
      } catch (error) {
        set({
          selectedMessage: null,
          isLoadingMessageDetail: false,
          messageDetailError:
            error instanceof Error ? error.message : "邮件详情加载失败",
        });
      }
    },

    bindAccount: async (provider) => {
      set({ isBindingAccount: true });
      try {
        const { authUrl } = await mailApi.bindAccount(
          provider,
          `${window.location.origin}/auth`,
        );
        window.location.assign(authUrl);
        return {
          message: "正在跳转到 OAuth 授权页面...",
        };
      } finally {
        set({ isBindingAccount: false });
      }
    },

    bindCredentials: async (email, password) => {
      set({ isBindingAccount: true });
      try {
        const result = await mailApi.bindCredentials(email, password);
        await reloadAccounts();
        return { message: result.message };
      } finally {
        set({ isBindingAccount: false });
      }
    },

    bindOAuthAccount: async (payload) => {
      set({ isBindingAccount: true });
      try {
        const result = await mailApi.bindOAuthAccount(payload);
        await reloadAccounts();
        return result;
      } finally {
        set({ isBindingAccount: false });
      }
    },

    bindOAuthAccounts: async (payload) => {
      set({ isBindingAccount: true });
      try {
        const result = await mailApi.bindOAuthAccounts(payload);
        if (result.success > 0) {
          await reloadAccounts();
        }
        return result;
      } finally {
        set({ isBindingAccount: false });
      }
    },

    removeAccount: async (accountId) => {
      const result = await mailApi.removeAccount(accountId);
      await reloadAccounts();
      return result;
    },

    updateAccountLabels: async (accountId, labels) => {
      const updatedAccount = await mailApi.updateAccountLabels(
        accountId,
        labels,
      );
      set({
        accounts: get().accounts.map((account) =>
          account.id === accountId ? updatedAccount : account,
        ),
      });
      return updatedAccount;
    },

    prepareReply: async (messageId) => {
      const message =
        get().selectedMessage?.id === messageId
          ? get().selectedMessage
          : await mailApi.getMessage(
              get().messages.find((item) => item.id === messageId)?.accountId ||
                "",
              messageId,
              get().accounts,
            );
      if (!message) {
        return;
      }
      set({
        composeMode: "reply",
        lastDraftSavedAt: dayjs().toISOString(),
        composeDraft: {
          accountId: message.accountId,
          to: message.fromEmail,
          cc: "",
          bcc: "",
          subject: message.subject.startsWith("Re:")
            ? message.subject
            : `Re: ${message.subject}`,
          body: `<p></p><blockquote>${message.hasHtml ? message.htmlBody : message.textBody}</blockquote>`,
        },
      });
    },

    prepareForward: async (messageId) => {
      const message =
        get().selectedMessage?.id === messageId
          ? get().selectedMessage
          : await mailApi.getMessage(
              get().messages.find((item) => item.id === messageId)?.accountId ||
                "",
              messageId,
              get().accounts,
            );
      if (!message) {
        return;
      }
      set({
        composeMode: "forward",
        lastDraftSavedAt: dayjs().toISOString(),
        composeDraft: {
          accountId: message.accountId,
          to: "",
          cc: "",
          bcc: "",
          subject: message.subject.startsWith("Fwd:")
            ? message.subject
            : `Fwd: ${message.subject}`,
          body: `<p>转发供参阅。</p><hr />${message.hasHtml ? message.htmlBody : `<pre>${message.textBody}</pre>`}`,
        },
      });
    },

    setSearchQuery: (value) => set({ searchQuery: value }),
    setQuickFilter: (value) => set({ quickFilter: value }),

    updateComposeField: (field, value) => {
      set({
        lastDraftSavedAt: dayjs().toISOString(),
        composeDraft: {
          ...get().composeDraft,
          [field]: value,
        },
      });
    },

    sendCompose: async () => {
      const composeDraft = get().composeDraft;
      if (
        !composeDraft.accountId ||
        !composeDraft.to.trim() ||
        !composeDraft.subject.trim()
      ) {
        throw new Error("发件人、收件人和主题为必填项");
      }
      set({ isSendingCompose: true });
      try {
        const result = await mailApi.sendMail({
          accountId: composeDraft.accountId,
          to: composeDraft.to
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          cc: composeDraft.cc
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          bcc: composeDraft.bcc
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          subject: composeDraft.subject.trim(),
          body: composeDraft.body,
          format: "html",
        });
        set({
          composeMode: "new",
          composeDraft: {
            ...emptyDraft,
            accountId: composeDraft.accountId,
          },
          lastDraftSavedAt: "",
          isSendingCompose: false,
        });
        return result;
      } catch (error) {
        set({ isSendingCompose: false });
        throw error;
      }
    },
  };
});
