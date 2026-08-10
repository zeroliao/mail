import { Account, MailProvider, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { CryptoService } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { providerKindMap, providerLabelMap } from "../../lib/provider";
import { providerRegistry } from "../../providers/registry";
import {
  DEFAULT_MICROSOFT_GRAPH_SCOPES,
  MicrosoftMailProvider,
} from "../../providers/microsoft-mail.provider";
import { OAuthTokens, RefreshTokenOptions } from "../../types/provider";

type OAuthUrlOptions = {
  provider: MailProvider;
  frontendRedirectUri?: string;
};

type CreateImportedAccountInput = {
  provider: MailProvider;
  email: string;
  displayName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: Date | null;
  scope: string[];
  metadata?: Prisma.JsonValue;
};

type UpdateAccountInput = {
  displayName?: string | null;
  status?: Account["status"];
  metadata?: Prisma.JsonValue;
};

// 「邮箱 + 密码 + client_id + refresh_token」直连入池（Microsoft OAuth public client）。
type BindOAuthRefreshInput = {
  email: string;
  refreshToken: string;
  clientId: string;
  displayName?: string | null;
  password?: string | null;
  tenant?: string | null;
  scope?: string[];
};

type BindOAuthResult = {
  email: string;
  status: "success" | "failed";
  message: string;
  accountId?: string;
};

// metadata.authMethod 取值，标识该账号是以 public client refresh_token 入池。
const OAUTH_REFRESH_AUTH_METHOD = "oauth-refresh";

export class AccountsService {
  constructor(private readonly cryptoService: CryptoService) {}

  async listAccounts() {
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: publicAccountSelect,
    });

    return accounts.map(withProviderPresentation);
  }

  async getAccount(accountId: string) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
      select: publicAccountSelect,
    });

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    return withProviderPresentation(account);
  }

  async createImportedAccount(input: CreateImportedAccountInput) {
    const existing = await prisma.account.findUnique({
      where: {
        provider_email: {
          provider: input.provider,
          email: input.email,
        },
      },
      select: { metadata: true },
    });
    const metadata = preserveAccountLabels(input.metadata, existing?.metadata);

    const account = await prisma.account.upsert({
      where: {
        provider_email: {
          provider: input.provider,
          email: input.email,
        },
      },
      create: {
        provider: input.provider,
        email: input.email,
        displayName: input.displayName ?? null,
        accessToken: this.cryptoService.encrypt(input.accessToken),
        refreshToken: input.refreshToken
          ? this.cryptoService.encrypt(input.refreshToken)
          : null,
        tokenType: input.tokenType ?? null,
        expiresAt: input.expiresAt ?? null,
        scope: input.scope.join(" "),
        metadata: toPrismaJson(metadata),
        deletedAt: null,
      },
      update: {
        displayName: input.displayName ?? null,
        accessToken: this.cryptoService.encrypt(input.accessToken),
        refreshToken: input.refreshToken
          ? this.cryptoService.encrypt(input.refreshToken)
          : null,
        tokenType: input.tokenType ?? null,
        expiresAt: input.expiresAt ?? null,
        scope: input.scope.join(" "),
        metadata: toPrismaJson(metadata),
        status: "ACTIVE",
        deletedAt: null,
      },
      select: publicAccountSelect,
    });

    return withProviderPresentation(account);
  }

  /**
   * 凭 refresh_token + client_id 直接入池（Microsoft public client）。
   * 绑定时即用 refresh_token+clientId 换一次 access_token 做连通性校验（拉 Graph /me），
   * 成功才落库为 ACTIVE。client_id/refresh_token 加密存储。
   */
  async bindOAuthRefreshAccount(input: BindOAuthRefreshInput) {
    const microsoftProvider = providerRegistry.get(MailProvider.MICROSOFT);

    if (!(microsoftProvider instanceof MicrosoftMailProvider)) {
      throw new AppError("Microsoft provider is not available", 500);
    }

    const scope =
      input.scope && input.scope.length > 0
        ? input.scope
        : DEFAULT_MICROSOFT_GRAPH_SCOPES;
    const tenant = input.tenant || "consumers";

    // 连通性校验 + 换取首个 access_token（失败直接抛出携带微软原始错误体的 AppError）。
    const exchange =
      await microsoftProvider.exchangeRefreshTokenForPublicClient({
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        scope,
        tenant,
      });

    // 优先使用微软返回的 profile email；owner 传入的 email 仅作兜底/校验展示。
    const email = exchange.profile.email || input.email;
    const displayName =
      input.displayName ?? exchange.profile.displayName ?? null;

    // refresh_token：优先用微软轮换后返回的新值，否则保留入参。
    const refreshTokenToStore = exchange.refreshToken ?? input.refreshToken;

    const existing = await prisma.account.findUnique({
      where: {
        provider_email: {
          provider: MailProvider.MICROSOFT,
          email,
        },
      },
      select: { metadata: true },
    });
    const metadata: Prisma.JsonValue = mergeAccountMetadata(
      existing?.metadata,
      {
        authMethod: OAUTH_REFRESH_AUTH_METHOD,
        clientId: this.cryptoService.encrypt(input.clientId),
        tenant,
        isPublicClient: true,
      },
    );

    const account = await prisma.account.upsert({
      where: {
        provider_email: {
          provider: MailProvider.MICROSOFT,
          email,
        },
      },
      create: {
        provider: MailProvider.MICROSOFT,
        email,
        displayName,
        accessToken: this.cryptoService.encrypt(exchange.accessToken),
        refreshToken: this.cryptoService.encrypt(refreshTokenToStore),
        tokenType: exchange.tokenType ?? "Bearer",
        expiresAt: exchange.expiresAt ?? null,
        scope: exchange.scope.join(" "),
        status: "ACTIVE",
        metadata,
        deletedAt: null,
      },
      update: {
        displayName,
        accessToken: this.cryptoService.encrypt(exchange.accessToken),
        refreshToken: this.cryptoService.encrypt(refreshTokenToStore),
        tokenType: exchange.tokenType ?? "Bearer",
        expiresAt: exchange.expiresAt ?? null,
        scope: exchange.scope.join(" "),
        status: "ACTIVE",
        metadata,
        deletedAt: null,
      },
      select: publicAccountSelect,
    });

    return withProviderPresentation(account);
  }

  // 批量绑定：逐个执行，单条失败不影响其余，返回每条结果。
  async bindOAuthRefreshAccounts(items: BindOAuthRefreshInput[]): Promise<{
    total: number;
    success: number;
    failed: number;
    results: BindOAuthResult[];
  }> {
    const results: BindOAuthResult[] = [];

    for (const item of items) {
      try {
        const account = await this.bindOAuthRefreshAccount(item);
        results.push({
          email: account.email,
          status: "success",
          message: "绑定成功",
          accountId: account.id,
        });
      } catch (error: any) {
        const message =
          error instanceof AppError
            ? error.message
            : error?.message || "未知错误";
        results.push({ email: item.email, status: "failed", message });
      }
    }

    const success = results.filter((r) => r.status === "success").length;
    return {
      total: items.length,
      success,
      failed: items.length - success,
      results,
    };
  }

  async updateAccount(accountId: string, input: UpdateAccountInput) {
    await this.ensureRawAccount(accountId);

    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        displayName: input.displayName,
        status: input.status,
        metadata: toPrismaJson(input.metadata),
      },
      select: publicAccountSelect,
    });

    return withProviderPresentation(account);
  }

  async updateAccountLabels(
    accountId: string,
    labels: string[],
    serviceNotes: Record<string, string> = {},
    serviceStatuses?: Record<string, "unavailable">,
  ) {
    const account = await this.ensureRawAccount(accountId);
    const normalizedLabels = normalizeAccountLabels(labels);
    const normalizedServiceNotes = normalizeAccountServiceNotes(
      serviceNotes,
      normalizedLabels,
    );
    const normalizedServiceStatuses = normalizeAccountServiceStatuses(
      serviceStatuses ?? readAccountServiceStatuses(account.metadata),
    );
    const metadata = mergeAccountMetadata(account.metadata, {
      labels: normalizedLabels,
      serviceNotes: normalizedServiceNotes,
      serviceStatuses: normalizedServiceStatuses,
    });

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { metadata },
      select: publicAccountSelect,
    });

    return withProviderPresentation(updated);
  }

  async deleteAccount(accountId: string) {
    await this.ensureRawAccount(accountId);

    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        deletedAt: new Date(),
        status: "ARCHIVED",
      },
      select: publicAccountSelect,
    });

    return withProviderPresentation(account);
  }

  async createOAuthUrl(options: OAuthUrlOptions) {
    const providerService = providerRegistry.get(options.provider);
    const state = randomUUID();
    const redirectUri =
      options.provider === MailProvider.GOOGLE
        ? env.GOOGLE_OAUTH_REDIRECT_URI
        : env.MICROSOFT_OAUTH_REDIRECT_URI;

    await prisma.oAuthState.create({
      data: {
        provider: options.provider,
        state,
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        metadata: options.frontendRedirectUri
          ? { frontendRedirectUri: options.frontendRedirectUri }
          : Prisma.JsonNull,
      },
    });

    return {
      authUrl: providerService.buildAuthorizationUrl(state),
      state,
    };
  }

  async completeOAuth(provider: MailProvider, state: string, code: string) {
    const stateRecord = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (
      !stateRecord ||
      stateRecord.provider !== provider ||
      stateRecord.expiresAt < new Date()
    ) {
      throw new AppError("OAuth state is invalid or expired", 400);
    }

    const providerService = providerRegistry.get(provider);
    const exchange = await providerService.exchangeCode(code);
    const account = await this.upsertOAuthAccount(
      provider,
      exchange.profile.email,
      exchange.profile.displayName ?? null,
      exchange,
    );

    await prisma.oAuthState.delete({ where: { state } });

    return {
      account: withProviderPresentation(account),
      frontendRedirectUri: readFrontendRedirectUri(stateRecord.metadata),
    };
  }

  async getAuthorizedAccount(accountId: string, forceRefresh = false) {
    const account = await this.ensureRawAccount(accountId);
    const accessToken = this.cryptoService.decrypt(account.accessToken);

    // IMAP 密码直连账号不需要刷新 token
    if (account.tokenType === "imap-password") {
      return { account, accessToken };
    }

    const refreshToken = account.refreshToken
      ? this.cryptoService.decrypt(account.refreshToken)
      : null;

    const shouldRefresh =
      forceRefresh ||
      (account.expiresAt && account.expiresAt.getTime() - Date.now() < 60_000);

    if (shouldRefresh) {
      if (!refreshToken) {
        throw new AppError(
          "Stored token expired and no refresh token is available",
          401,
        );
      }

      const provider = providerRegistry.get(account.provider);
      // public client（oauth-refresh）账号需用 per-account clientId 刷新，且无 client_secret。
      const refreshOptions = this.buildRefreshOptions(account);
      const refreshed = await provider.refreshAccessToken(
        refreshToken,
        refreshOptions,
      );
      const updated = await this.persistTokenRefresh(account.id, refreshed);

      return {
        account: updated,
        accessToken: refreshed.accessToken,
      };
    }

    return {
      account,
      accessToken,
    };
  }

  // 从 account.metadata 解析 per-account 刷新所需的 clientId/scope/tenant（oauth-refresh 账号）。
  private buildRefreshOptions(
    account: Account,
  ): RefreshTokenOptions | undefined {
    const metadata = account.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return undefined;
    }

    const record = metadata as Record<string, unknown>;
    if (record.authMethod !== OAUTH_REFRESH_AUTH_METHOD) {
      return undefined;
    }

    const encryptedClientId =
      typeof record.clientId === "string" ? record.clientId : null;
    if (!encryptedClientId) {
      return undefined;
    }

    return {
      clientId: this.cryptoService.decrypt(encryptedClientId),
      scope: account.scope
        ? account.scope.split(" ").filter(Boolean)
        : undefined,
      tenant: typeof record.tenant === "string" ? record.tenant : undefined,
    };
  }

  private async upsertOAuthAccount(
    provider: MailProvider,
    email: string,
    displayName: string | null,
    tokens: OAuthTokens,
  ) {
    const account = await prisma.account.upsert({
      where: {
        provider_email: {
          provider,
          email,
        },
      },
      create: {
        provider,
        email,
        displayName,
        accessToken: this.cryptoService.encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken
          ? this.cryptoService.encrypt(tokens.refreshToken)
          : null,
        tokenType: tokens.tokenType ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope.join(" "),
      },
      update: {
        displayName,
        accessToken: this.cryptoService.encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken
          ? this.cryptoService.encrypt(tokens.refreshToken)
          : undefined,
        tokenType: tokens.tokenType ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope.join(" "),
        status: "ACTIVE",
        deletedAt: null,
      },
      select: publicAccountSelect,
    });

    return withProviderPresentation(account);
  }

  private async persistTokenRefresh(accountId: string, tokens: OAuthTokens) {
    return prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: this.cryptoService.encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken
          ? this.cryptoService.encrypt(tokens.refreshToken)
          : undefined,
        tokenType: tokens.tokenType ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope.join(" "),
      },
    });
  }

  private async ensureRawAccount(accountId: string) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
    });

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    return account;
  }
}

const publicAccountSelect = {
  id: true,
  provider: true,
  email: true,
  displayName: true,
  status: true,
  tokenType: true,
  scope: true,
  expiresAt: true,
  lastSyncAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AccountSelect;

const readFrontendRedirectUri = (
  value: Prisma.JsonValue | null,
): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>).frontendRedirectUri;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
};

const toPrismaJson = (value: Prisma.JsonValue | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : value;
};

const toMetadataRecord = (
  value: Prisma.JsonValue | null | undefined,
): Record<string, Prisma.JsonValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Prisma.JsonValue>;
};

const normalizeAccountLabels = (labels: string[]) =>
  Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean)),
  ).slice(0, 12);

const readAccountLabels = (metadata: Prisma.JsonValue | null | undefined) => {
  const labels = toMetadataRecord(metadata).labels;
  if (!Array.isArray(labels)) {
    return [];
  }

  return normalizeAccountLabels(
    labels.filter((label): label is string => typeof label === "string"),
  );
};

const normalizeAccountServiceNotes = (
  serviceNotes: Record<string, string>,
  labels: string[],
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const label of labels) {
    const note = serviceNotes[label]?.trim().slice(0, 160) ?? "";
    if (note) {
      normalized[label] = note;
    }
  }
  return normalized;
};

const normalizeAccountServiceStatuses = (
  serviceStatuses: Record<string, string>,
): Record<string, "unavailable"> => {
  const normalized: Record<string, "unavailable"> = {};
  for (const [serviceName, status] of Object.entries(serviceStatuses)) {
    const normalizedName = serviceName.trim().slice(0, 24);
    if (normalizedName && status === "unavailable") {
      normalized[normalizedName] = "unavailable";
    }
  }
  return Object.fromEntries(Object.entries(normalized).slice(0, 24));
};

const readAccountServiceNotes = (
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, string> => {
  const notes = toMetadataRecord(metadata).serviceNotes;
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [label, note] of Object.entries(notes)) {
    if (typeof note === "string" && note.trim().length > 0) {
      normalized[label] = note.trim().slice(0, 160);
    }
  }
  return normalized;
};

const readAccountServiceStatuses = (
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, "unavailable"> => {
  const statuses = toMetadataRecord(metadata).serviceStatuses;
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) {
    return {};
  }

  return normalizeAccountServiceStatuses(
    Object.fromEntries(
      Object.entries(statuses).filter(([, status]) => status === "unavailable"),
    ) as Record<string, string>,
  );
};

export const mergeAccountMetadata = (
  current: Prisma.JsonValue | null | undefined,
  updates: Record<string, Prisma.JsonValue>,
): Prisma.JsonObject => ({
  ...toMetadataRecord(current),
  ...updates,
});

const preserveAccountLabels = (
  next: Prisma.JsonValue | undefined,
  current: Prisma.JsonValue | null | undefined,
) => {
  const labels = readAccountLabels(current);
  const serviceNotes = normalizeAccountServiceNotes(
    readAccountServiceNotes(current),
    labels,
  );
  const serviceStatuses = readAccountServiceStatuses(current);
  return labels.length ||
    Object.keys(serviceNotes).length ||
    Object.keys(serviceStatuses).length
    ? mergeAccountMetadata(next, {
        labels,
        serviceNotes,
        serviceStatuses,
      })
    : next;
};

const withProviderPresentation = <
  T extends { provider: MailProvider; metadata?: Prisma.JsonValue | null },
>(
  account: T,
) => ({
  ...account,
  providerKey: providerKindMap[account.provider],
  providerLabel: providerLabelMap[account.provider],
  labels: readAccountLabels(account.metadata),
  serviceNotes: readAccountServiceNotes(account.metadata),
  serviceStatuses: readAccountServiceStatuses(account.metadata),
});
