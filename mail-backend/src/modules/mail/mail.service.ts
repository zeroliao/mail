import { MailProvider, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { CryptoService } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { providerKindMap, providerLabelMap } from "../../lib/provider";
import { fetchImapMessage, fetchImapMessages, sendSmtpMessage } from "../../providers/imap-mail.provider";
import { providerRegistry } from "../../providers/registry";
import { MailAddress, NormalizedMessage, SendMailInput } from "../../types/mail";
import { AccountsService } from "../accounts/accounts.service";

type AccountContext = {
  id: string;
  email: string;
  displayName?: string | null;
  provider: MailProvider;
};

type AuthorizedAccount = Awaited<ReturnType<AccountsService["getAuthorizedAccount"]>>;

type ApiMessage = NormalizedMessage & {
  accountId: string;
  accountEmail: string;
  accountDisplayName: string;
  provider: "gmail" | "microsoft";
  providerLabel: string;
};

type CachedMessageRecord = Prisma.MailMessageGetPayload<{
  include: {
    attachments: true;
    account: true;
  };
}>;

export class MailService {
  private readonly accountsService: AccountsService;

  constructor(tokenEncryptionKey: string) {
    this.accountsService = new AccountsService(new CryptoService(tokenEncryptionKey));
  }

  async listMessages(accountId: string, options: { folder?: string; limit: number; pageToken?: string; sync: boolean }) {
    const authorized = await this.accountsService.getAuthorizedAccount(accountId);

    if (authorized.account.tokenType === "imap-password") {
      const metadata = authorized.account.metadata as any;
      const remote = await fetchImapMessages(authorized.account.email, authorized.accessToken, {
        folder: options.folder,
        limit: options.limit,
        imapHost: metadata?.imapHost,
        imapPort: metadata?.imapPort
      });

      await this.cacheMessages(authorized.account.id, remote.messages);
      await this.touchAccountSync(authorized.account.id);
      return {
        messages: remote.messages.map((message) => this.attachAccountContext(message, authorized.account)),
        nextPageToken: remote.nextPageToken ?? null
      };
    }

    if (options.sync) {
      const remote = await this.withTokenRetry(authorized, ({ account, accessToken }) => {
        const provider = providerRegistry.get(account.provider);
        return provider.listMessages(accessToken, options);
      });

      await this.cacheMessages(authorized.account.id, remote.messages);
      await this.touchAccountSync(authorized.account.id);
      return {
        messages: remote.messages.map((message) => this.attachAccountContext(message, authorized.account)),
        nextPageToken: remote.nextPageToken ?? null
      };
    }

    const cached = await prisma.mailMessage.findMany({
      where: { accountId: authorized.account.id },
      include: { attachments: true, account: true },
      orderBy: { receivedAt: "desc" },
      take: options.limit
    });

    return {
      messages: cached.map((message) => toApiMessage(message)),
      nextPageToken: null
    };
  }

  async listMessagesPaginated(options: {
    accountId?: string;
    folder?: string;
    page: number;
    pageSize: number;
    sync: boolean;
  }) {
    if (options.accountId) {
      const accountResult = await this.listMessages(options.accountId, {
        folder: options.folder,
        limit: options.pageSize,
        pageToken: undefined,
        sync: options.sync
      });

      return {
        items: accountResult.messages,
        page: options.page,
        pageSize: options.pageSize,
        total: accountResult.messages.length,
        nextPageToken: accountResult.nextPageToken ?? null
      };
    }

    const where = options.folder ? { folder: { contains: options.folder } } : undefined;
    const [cached, total] = await Promise.all([
      prisma.mailMessage.findMany({
        where,
        include: {
          attachments: true,
          account: true
        },
        orderBy: { receivedAt: "desc" },
        skip: Math.max(0, (options.page - 1) * options.pageSize),
        take: options.pageSize
      }),
      prisma.mailMessage.count({ where })
    ]);

    return {
      items: cached.map((message) => toApiMessage(message)),
      page: options.page,
      pageSize: options.pageSize,
      total,
      nextPageToken: null
    };
  }

  async getMessage(accountId: string, messageId: string, sync: boolean) {
    const authorized = await this.accountsService.getAuthorizedAccount(accountId);

    if (authorized.account.tokenType === "imap-password") {
      const metadata = authorized.account.metadata as any;
      const remote = await fetchImapMessage(authorized.account.email, authorized.accessToken, messageId, {
        imapHost: metadata?.imapHost,
        imapPort: metadata?.imapPort
      });

      if (!remote) {
        throw new AppError("Message not found", 404);
      }

      await this.cacheMessages(authorized.account.id, [remote]);
      await this.touchAccountSync(authorized.account.id);
      return this.attachAccountContext(remote, authorized.account);
    }

    if (sync) {
      const remote = await this.withTokenRetry(authorized, ({ account, accessToken }) => {
        const provider = providerRegistry.get(account.provider);
        return provider.getMessage(accessToken, messageId);
      });

      await this.cacheMessages(authorized.account.id, [remote]);
      await this.touchAccountSync(authorized.account.id);
      return this.attachAccountContext(remote, authorized.account);
    }

    const cached = await prisma.mailMessage.findFirst({
      where: {
        accountId: authorized.account.id,
        providerMessageId: messageId
      },
      include: { attachments: true, account: true }
    });

    if (!cached) {
      throw new AppError("Message not found in cache. Retry with sync=true to fetch from provider.", 404);
    }

    return toApiMessage(cached);
  }

  async sendMessage(accountId: string, input: SendMailInput): Promise<{ providerMessageId?: string | null }> {
    const authorized = await this.accountsService.getAuthorizedAccount(accountId);

    if (authorized.account.tokenType === "imap-password") {
      const metadata = authorized.account.metadata as any;
      return sendSmtpMessage(authorized.account.email, authorized.accessToken, input, metadata?.smtpHost, metadata?.smtpPort);
    }

    return this.withTokenRetry(authorized, ({ account, accessToken }) => {
      const provider = providerRegistry.get(account.provider);
      return provider.sendMessage(accessToken, input);
    });
  }

  private async withTokenRetry<T>(authorized: AuthorizedAccount, execute: (context: AuthorizedAccount) => Promise<T>): Promise<T> {
    try {
      return await execute(authorized);
    } catch (error) {
      if (!this.isRetryableAuthError(error)) {
        throw error;
      }

      let refreshed: AuthorizedAccount;
      try {
        refreshed = await this.accountsService.getAuthorizedAccount(authorized.account.id, true);
      } catch (refreshError) {
        throw this.toProviderFailure(refreshError, error);
      }

      try {
        return await execute(refreshed);
      } catch (retryError) {
        throw this.toProviderFailure(retryError, error);
      }
    }
  }

  private isRetryableAuthError(error: unknown) {
    return error instanceof AppError && error.statusCode === 401;
  }

  private toProviderFailure(error: unknown, fallback: unknown) {
    if (error instanceof AppError && error.statusCode !== 401) {
      return error;
    }

    if (fallback instanceof AppError) {
      return new AppError(fallback.message, 502, fallback.details);
    }

    if (error instanceof AppError) {
      return new AppError(error.message, 502, error.details);
    }

    if (error instanceof Error) {
      return new AppError(error.message, 502);
    }

    return new AppError("Provider request failed after token refresh", 502);
  }

  private async cacheMessages(accountId: string, messages: NormalizedMessage[]) {
    for (const message of messages) {
      const upserted = await prisma.mailMessage.upsert({
        where: {
          accountId_providerMessageId: {
            accountId,
            providerMessageId: message.providerMessageId
          }
        },
        create: {
          accountId,
          providerMessageId: message.providerMessageId,
          threadId: message.threadId ?? null,
          folder: message.folder ?? null,
          subject: message.subject ?? null,
          snippet: message.snippet ?? null,
          fromAddress: message.from ?? Prisma.JsonNull,
          toAddresses: message.to,
          ccAddresses: message.cc,
          bccAddresses: message.bcc,
          bodyText: message.bodyText ?? null,
          bodyHtml: message.bodyHtml ?? null,
          receivedAt: message.receivedAt ?? null,
          sentAt: message.sentAt ?? null,
          isRead: message.isRead,
          isFlagged: false,
          hasAttachments: message.hasAttachments,
          rawPayload: message.rawPayload ?? Prisma.JsonNull
        },
        update: {
          threadId: message.threadId ?? null,
          folder: message.folder ?? null,
          subject: message.subject ?? null,
          snippet: message.snippet ?? null,
          fromAddress: message.from ?? Prisma.JsonNull,
          toAddresses: message.to,
          ccAddresses: message.cc,
          bccAddresses: message.bcc,
          bodyText: message.bodyText ?? null,
          bodyHtml: message.bodyHtml ?? null,
          receivedAt: message.receivedAt ?? null,
          sentAt: message.sentAt ?? null,
          isRead: message.isRead,
          hasAttachments: message.hasAttachments,
          rawPayload: message.rawPayload ?? Prisma.JsonNull
        }
      });

      await prisma.attachment.deleteMany({
        where: { mailMessageId: upserted.id }
      });

      if (message.attachments.length > 0) {
        await prisma.attachment.createMany({
          data: message.attachments.map((attachment) => ({
            mailMessageId: upserted.id,
            providerAttachmentId: attachment.providerAttachmentId ?? null,
            filename: attachment.filename,
            mimeType: attachment.mimeType ?? null,
            size: attachment.size ?? null,
            contentId: attachment.contentId ?? null,
            isInline: Boolean(attachment.isInline),
            storageKey: attachment.storageKey ?? null
          }))
        });
      }
    }
  }

  private attachAccountContext(message: NormalizedMessage, account: AccountContext): ApiMessage {
    return {
      ...message,
      accountId: account.id,
      accountEmail: account.email,
      accountDisplayName: account.displayName ?? account.email,
      provider: providerKindMap[account.provider],
      providerLabel: providerLabelMap[account.provider]
    };
  }

  private async touchAccountSync(accountId: string) {
    await prisma.account.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() }
    });
  }
}

const toApiMessage = (message: CachedMessageRecord): ApiMessage => ({
  providerMessageId: message.providerMessageId,
  threadId: message.threadId,
  folder: message.folder,
  subject: message.subject,
  snippet: message.snippet,
  from: readMailAddress(message.fromAddress),
  to: readMailAddresses(message.toAddresses),
  cc: readMailAddresses(message.ccAddresses),
  bcc: readMailAddresses(message.bccAddresses),
  bodyText: message.bodyText,
  bodyHtml: message.bodyHtml,
  receivedAt: message.receivedAt,
  sentAt: message.sentAt,
  isRead: message.isRead,
  hasAttachments: message.hasAttachments,
  attachments: (message.attachments ?? []).map((attachment) => ({
    providerAttachmentId: attachment.providerAttachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    contentId: attachment.contentId,
    isInline: attachment.isInline,
    storageKey: attachment.storageKey
  })),
  rawPayload: message.rawPayload,
  accountId: message.accountId,
  accountEmail: message.account?.email ?? "",
  accountDisplayName: message.account?.displayName ?? message.account?.email ?? "",
  provider: providerKindMap[(message.account?.provider ?? MailProvider.GOOGLE) as MailProvider],
  providerLabel: providerLabelMap[(message.account?.provider ?? MailProvider.GOOGLE) as MailProvider]
});

const readMailAddress = (value: Prisma.JsonValue | null): MailAddress | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const email = typeof value.email === "string" ? value.email : "";
  if (!email) {
    return null;
  }

  return {
    email,
    name: typeof value.name === "string" ? value.name : null
  };
};

const readMailAddresses = (value: Prisma.JsonValue | null): MailAddress[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readMailAddress(entry as Prisma.JsonValue))
    .filter((entry): entry is MailAddress => Boolean(entry));
};
