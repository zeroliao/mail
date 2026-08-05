import { MailProvider } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { CryptoService } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { booleanQueryParam } from "../../lib/validation";
import { AccountsService } from "../accounts/accounts.service";
import { MailService } from "../mail/mail.service";
import {
  isLoopbackAddress,
  scheduleServiceShutdown,
  ShutdownScheduler,
  SystemService,
} from "./system.service";

const oauthInitSchema = z.object({
  provider: z.string().min(1),
  frontendRedirectUri: z.string().url().optional(),
});

type SystemRoutesOptions = {
  scheduleShutdown?: ShutdownScheduler;
};

export const systemRoutes: FastifyPluginAsync<SystemRoutesOptions> = async (
  fastify,
  options,
) => {
  const systemService = new SystemService();
  const accountsService = new AccountsService(
    new CryptoService(env.TOKEN_ENCRYPTION_KEY),
  );
  const mailService = new MailService(env.TOKEN_ENCRYPTION_KEY);

  fastify.get(
    "/health",
    {
      schema: {
        tags: ["system"],
      },
    },
    async () => systemService.getHealth(),
  );

  fastify.get(
    "/config/oauth-providers",
    {
      schema: {
        tags: ["system"],
      },
    },
    async () => systemService.getOAuthProviderConfig(),
  );

  fastify.post(
    "/system/shutdown",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["system"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      if (!isLoopbackAddress(request.ip)) {
        throw new AppError(
          "Service shutdown is only allowed from this computer",
          403,
        );
      }

      await (options.scheduleShutdown ?? scheduleServiceShutdown)();
      reply.code(202);
      return {
        status: "accepted",
        message: "Service shutdown has been scheduled",
      };
    },
  );

  fastify.post(
    "/accounts/oauth/init",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["oauth"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const body = oauthInitSchema.parse(request.body);
      const provider = systemService.resolveProvider(body.provider);
      if (!provider) {
        throw new AppError("Unsupported provider", 400);
      }

      const result = await accountsService.createOAuthUrl({
        provider,
        frontendRedirectUri: body.frontendRedirectUri,
      });

      return {
        url: result.authUrl,
        authUrl: result.authUrl,
        state: result.state,
      };
    },
  );

  fastify.get(
    "/auth/gmail/init",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["oauth"],
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
      const result = await accountsService.createOAuthUrl({
        provider: MailProvider.GOOGLE,
      });
      return {
        url: result.authUrl,
        authUrl: result.authUrl,
        state: result.state,
      };
    },
  );

  fastify.get(
    "/auth/microsoft/init",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["oauth"],
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
      const result = await accountsService.createOAuthUrl({
        provider: MailProvider.MICROSOFT,
      });
      return {
        url: result.authUrl,
        authUrl: result.authUrl,
        state: result.state,
      };
    },
  );

  fastify.get(
    "/auth/gmail/callback",
    {
      schema: {
        tags: ["oauth"],
      },
    },
    async (request) => {
      const query = z
        .object({ code: z.string().min(1), state: z.string().min(1) })
        .parse(request.query);
      const result = await accountsService.completeOAuth(
        MailProvider.GOOGLE,
        query.state,
        query.code,
      );
      return result.account;
    },
  );

  fastify.get(
    "/auth/microsoft/callback",
    {
      schema: {
        tags: ["oauth"],
      },
    },
    async (request) => {
      const query = z
        .object({ code: z.string().min(1), state: z.string().min(1) })
        .parse(request.query);
      const result = await accountsService.completeOAuth(
        MailProvider.MICROSOFT,
        query.state,
        query.code,
      );
      return result.account;
    },
  );

  fastify.get(
    "/mail",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["mail"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const query = z
        .object({
          accountId: z.string().optional(),
          folder: z.string().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          sync: booleanQueryParam(false),
        })
        .parse(request.query);

      return mailService.listMessagesPaginated(query);
    },
  );

  fastify.get(
    "/mail/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["mail"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const query = z
        .object({
          accountId: z.string().min(1),
          sync: booleanQueryParam(false),
        })
        .parse(request.query);

      return mailService.getMessage(query.accountId, params.id, query.sync);
    },
  );

  fastify.post(
    "/mail/send",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["mail"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const body = z
        .object({
          accountId: z.string().min(1),
          subject: z.string().min(1),
          to: z.array(z.string().email()).default([]),
          cc: z.array(z.string().email()).default([]),
          bcc: z.array(z.string().email()).default([]),
          html: z.string().optional(),
          text: z.string().optional(),
          body: z.string().optional(),
        })
        .parse(request.body);

      const result = await mailService.sendMessage(body.accountId, {
        subject: body.subject,
        to: body.to.map((email) => ({ email })),
        cc: body.cc.map((email) => ({ email })),
        bcc: body.bcc.map((email) => ({ email })),
        html: body.html ?? body.body,
        text: body.text ?? body.body,
      });

      return {
        message: result.providerMessageId
          ? "Mail sent successfully."
          : "Send request accepted by the backend.",
        id: result.providerMessageId ?? null,
      };
    },
  );
};
