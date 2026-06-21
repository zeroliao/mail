import { AccountStatus, MailProvider, Prisma } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { CryptoService } from "../../lib/crypto";
import { verifyImapCredentials, resolveImapConfig } from "../../providers/imap-mail.provider";
import { prisma } from "../../db/prisma";
import { AccountsService } from "./accounts.service";

const providerSchema = z.enum(["GOOGLE", "MICROSOFT"]);
const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);

const createAccountSchema = z.object({
  provider: providerSchema,
  email: z.string().email(),
  displayName: z.string().optional().nullable(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional().nullable(),
  tokenType: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  scope: z.array(z.string().min(1)).min(1),
  metadata: jsonValueSchema.optional()
});

const updateAccountSchema = z.object({
  displayName: z.string().optional().nullable(),
  status: z.nativeEnum(AccountStatus).optional(),
  metadata: jsonValueSchema.optional()
});

const oauthUrlSchema = z.object({
  frontendRedirectUri: z.string().url().optional()
});

const queryCodeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

export const accountsRoutes: FastifyPluginAsync = async (fastify) => {
  const accountsService = new AccountsService(new CryptoService(env.TOKEN_ENCRYPTION_KEY));

  fastify.get("/accounts", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["accounts"],
      security: [{ bearerAuth: [] }]
    }
  }, async () => accountsService.listAccounts());

  fastify.post("/accounts", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["accounts"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const body = createAccountSchema.parse(request.body);
    return accountsService.createImportedAccount({
      provider: MailProvider[body.provider],
      email: body.email,
      displayName: body.displayName ?? null,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken ?? null,
      tokenType: body.tokenType ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      scope: body.scope,
      metadata: body.metadata
    });
  });

  fastify.get("/accounts/:accountId", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["accounts"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1) }).parse(request.params);
    return accountsService.getAccount(params.accountId);
  });

  fastify.patch("/accounts/:accountId", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["accounts"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1) }).parse(request.params);
    const body = updateAccountSchema.parse(request.body);
    return accountsService.updateAccount(params.accountId, body);
  });

  fastify.delete("/accounts/:accountId", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["accounts"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1) }).parse(request.params);
    return accountsService.deleteAccount(params.accountId);
  });

  fastify.post("/accounts/oauth/google/url", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["oauth"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const body = oauthUrlSchema.parse(request.body ?? {});
    const result = await accountsService.createOAuthUrl({
      provider: MailProvider.GOOGLE,
      frontendRedirectUri: body.frontendRedirectUri
    });
    return {
      ...result,
      url: result.authUrl
    };
  });

  fastify.post("/accounts/oauth/microsoft/url", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["oauth"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const body = oauthUrlSchema.parse(request.body ?? {});
    const result = await accountsService.createOAuthUrl({
      provider: MailProvider.MICROSOFT,
      frontendRedirectUri: body.frontendRedirectUri
    });
    return {
      ...result,
      url: result.authUrl
    };
  });

  fastify.get("/accounts/oauth/google/callback", {
    schema: {
      tags: ["oauth"]
    }
  }, async (request, reply) => {
    const query = queryCodeSchema.parse(request.query);
    const result = await accountsService.completeOAuth(MailProvider.GOOGLE, query.state, query.code);
    return handleCallbackReply(reply, result);
  });

  fastify.get("/accounts/oauth/microsoft/callback", {
    schema: {
      tags: ["oauth"]
    }
  }, async (request, reply) => {
    const query = queryCodeSchema.parse(request.query);
    const result = await accountsService.completeOAuth(MailProvider.MICROSOFT, query.state, query.code);
    return handleCallbackReply(reply, result);
  });

  // ========== IMAP 密码直连接口 ==========

  const bindCredentialsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    imapHost: z.string().optional(),
    imapPort: z.number().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional()
  });

  const batchImportSchema = z.array(z.object({
    email: z.string().email(),
    password: z.string().min(1),
    imapHost: z.string().optional(),
    imapPort: z.number().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional()
  })).min(1).max(100);

  // ========== Token 直连导入（Microsoft OAuth public client）==========
  // 第三种格式：邮箱 + 密码 + client_id + refresh_token，凭 refresh_token 直接入池。
  const bindOAuthSchema = z.object({
    email: z.string().email(),
    refreshToken: z.string().min(1),
    clientId: z.string().min(1),
    displayName: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    tenant: z.string().optional().nullable(),
    scope: z.array(z.string().min(1)).optional()
  });

  const bindOAuthBatchSchema = z.array(bindOAuthSchema).min(1).max(100);

  // 单个账号绑定（IMAP 密码直连）
  fastify.post("/accounts/bind-credentials", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["imap"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const body = bindCredentialsSchema.parse(request.body);
    const cryptoService = new CryptoService(env.TOKEN_ENCRYPTION_KEY);

    // 验证 IMAP 连接
    await verifyImapCredentials(body.email, body.password, body.imapHost, body.imapPort);

    // 确定提供商
    const provider = detectProvider(body.email);
    const config = resolveImapConfig(body.email);

    // 存储账号（密码加密存储在 accessToken 字段）
    const account = await prisma.account.upsert({
      where: {
        provider_email: { provider, email: body.email }
      },
      create: {
        provider,
        email: body.email,
        displayName: body.email.split("@")[0],
        accessToken: cryptoService.encrypt(body.password),
        refreshToken: null,
        tokenType: "imap-password",
        scope: "imap smtp",
        expiresAt: null,
        metadata: {
          authMethod: "imap-password",
          imapHost: body.imapHost || config.imap.host,
          imapPort: body.imapPort || config.imap.port,
          smtpHost: body.smtpHost || config.smtp.host,
          smtpPort: body.smtpPort || config.smtp.port
        }
      },
      update: {
        accessToken: cryptoService.encrypt(body.password),
        tokenType: "imap-password",
        scope: "imap smtp",
        status: "ACTIVE",
        deletedAt: null,
        metadata: {
          authMethod: "imap-password",
          imapHost: body.imapHost || config.imap.host,
          imapPort: body.imapPort || config.imap.port,
          smtpHost: body.smtpHost || config.smtp.host,
          smtpPort: body.smtpPort || config.smtp.port
        }
      }
    });

    return {
      status: "success",
      message: `已绑定 ${body.email}`,
      account: { id: account.id, email: account.email, provider: account.provider, status: account.status }
    };
  });

  // 单个账号绑定（Token 直连：refresh_token + client_id）
  fastify.post("/accounts/bind-oauth", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["oauth"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const body = bindOAuthSchema.parse(request.body);
    const account = await accountsService.bindOAuthRefreshAccount({
      email: body.email,
      refreshToken: body.refreshToken,
      clientId: body.clientId,
      displayName: body.displayName ?? null,
      password: body.password ?? null,
      tenant: body.tenant ?? null,
      scope: body.scope
    });

    return {
      status: "success",
      message: `已绑定 ${account.email}`,
      account: {
        id: account.id,
        email: account.email,
        provider: account.provider,
        status: account.status,
        providerLabel: account.providerLabel
      }
    };
  });

  // 批量账号绑定（Token 直连：refresh_token + client_id，≤100）
  fastify.post("/accounts/bind-oauth/batch", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["oauth"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const items = bindOAuthBatchSchema.parse(request.body);
    return accountsService.bindOAuthRefreshAccounts(
      items.map((item) => ({
        email: item.email,
        refreshToken: item.refreshToken,
        clientId: item.clientId,
        displayName: item.displayName ?? null,
        password: item.password ?? null,
        tenant: item.tenant ?? null,
        scope: item.scope
      }))
    );
  });

  // 批量导入账号
  fastify.post("/accounts/batch-import", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["imap"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const items = batchImportSchema.parse(request.body);
    const cryptoService = new CryptoService(env.TOKEN_ENCRYPTION_KEY);

    const results: Array<{ email: string; status: "success" | "failed"; message: string; accountId?: string }> = [];

    for (const item of items) {
      try {
        await verifyImapCredentials(item.email, item.password, item.imapHost, item.imapPort);

        const provider = detectProvider(item.email);
        const config = resolveImapConfig(item.email);

        const account = await prisma.account.upsert({
          where: {
            provider_email: { provider, email: item.email }
          },
          create: {
            provider,
            email: item.email,
            displayName: item.email.split("@")[0],
            accessToken: cryptoService.encrypt(item.password),
            refreshToken: null,
            tokenType: "imap-password",
            scope: "imap smtp",
            expiresAt: null,
            metadata: {
              authMethod: "imap-password",
              imapHost: item.imapHost || config.imap.host,
              imapPort: item.imapPort || config.imap.port,
              smtpHost: item.smtpHost || config.smtp.host,
              smtpPort: item.smtpPort || config.smtp.port
            }
          },
          update: {
            accessToken: cryptoService.encrypt(item.password),
            tokenType: "imap-password",
            scope: "imap smtp",
            status: "ACTIVE",
            deletedAt: null,
            metadata: {
              authMethod: "imap-password",
              imapHost: item.imapHost || config.imap.host,
              imapPort: item.imapPort || config.imap.port,
              smtpHost: item.smtpHost || config.smtp.host,
              smtpPort: item.smtpPort || config.smtp.port
            }
          }
        });

        results.push({ email: item.email, status: "success", message: "绑定成功", accountId: account.id });
      } catch (error: any) {
        results.push({ email: item.email, status: "failed", message: error?.message || "未知错误" });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    return {
      total: items.length,
      success: successCount,
      failed: items.length - successCount,
      results
    };
  });
};

function detectProvider(email: string): MailProvider {
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return MailProvider.GOOGLE;
  }
  return MailProvider.MICROSOFT;
}

const handleCallbackReply = (reply: any, result: { account: unknown; frontendRedirectUri: string | null }) => {
  if (result.frontendRedirectUri) {
    const redirectUrl = new URL(result.frontendRedirectUri);
    redirectUrl.searchParams.set("status", "success");
    reply.redirect(redirectUrl.toString());
    return reply;
  }

  return result.account;
};
