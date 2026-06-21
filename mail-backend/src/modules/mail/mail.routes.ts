import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { booleanQueryParam } from "../../lib/validation";
import { MailService } from "./mail.service";

const listQuerySchema = z.object({
  folder: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  pageToken: z.string().optional(),
  sync: booleanQueryParam(true)
});

const sendBodySchema = z.object({
  subject: z.string().min(1),
  to: z.array(z.object({ email: z.string().email(), name: z.string().optional().nullable() })).min(1),
  cc: z.array(z.object({ email: z.string().email(), name: z.string().optional().nullable() })).optional(),
  bcc: z.array(z.object({ email: z.string().email(), name: z.string().optional().nullable() })).optional(),
  replyTo: z.array(z.object({ email: z.string().email(), name: z.string().optional().nullable() })).optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    contentBase64: z.string().min(1),
    contentType: z.string().optional(),
    contentId: z.string().optional(),
    inline: z.boolean().optional()
  })).optional()
}).refine((body) => Boolean(body.text || body.html), {
  message: "Either text or html content is required"
});

export const mailRoutes: FastifyPluginAsync = async (fastify) => {
  const mailService = new MailService(env.TOKEN_ENCRYPTION_KEY);

  fastify.get("/accounts/:accountId/messages", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["mail"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1) }).parse(request.params);
    const query = listQuerySchema.parse(request.query);
    return mailService.listMessages(params.accountId, query);
  });

  fastify.get("/accounts/:accountId/messages/:messageId", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["mail"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1), messageId: z.string().min(1) }).parse(request.params);
    const query = z.object({ sync: booleanQueryParam(true) }).parse(request.query);
    return mailService.getMessage(params.accountId, params.messageId, query.sync);
  });

  fastify.post("/accounts/:accountId/messages/send", {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ["mail"],
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const params = z.object({ accountId: z.string().min(1) }).parse(request.params);
    const body = sendBodySchema.parse(request.body);
    return mailService.sendMessage(params.accountId, body);
  });
};
