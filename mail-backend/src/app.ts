import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { env } from "./config/env";
import { swaggerOptions, swaggerUiOptions } from "./config/swagger";
import { prisma } from "./db/prisma";
import { AppError } from "./lib/errors";
import { accountsRoutes } from "./modules/accounts/accounts.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { mailRoutes } from "./modules/mail/mail.routes";
import { systemRoutes } from "./modules/system/system.routes";
import type { ShutdownScheduler } from "./modules/system/system.service";

type BuildAppOptions = {
  scheduleShutdown?: ShutdownScheduler;
};

export const buildApp = (options: BuildAppOptions = {}) => {
  const app = Fastify({
    logger: true,
    // Microsoft Graph message IDs are ~156 chars (base64). Fastify's default
    // maxParamLength is 100 which causes route matching to silently fail (404).
    routerOptions: {
      maxParamLength: 500,
    },
  });

  app.register(cors, {
    origin: env.corsOrigins,
  });

  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({
        message: "Unauthorized",
      });
    }
  });

  app.register(swagger, swaggerOptions);
  app.register(swaggerUi, swaggerUiOptions);

  app.register(authRoutes, { prefix: "/api/v1" });
  app.register(accountsRoutes, { prefix: "/api/v1" });
  app.register(mailRoutes, { prefix: "/api/v1" });
  app.register(systemRoutes, {
    prefix: "/api/v1",
    scheduleShutdown: options.scheduleShutdown,
  });
  app.register(authRoutes, { prefix: "/api" });
  app.register(accountsRoutes, { prefix: "/api" });
  app.register(mailRoutes, { prefix: "/api" });
  app.register(systemRoutes, {
    prefix: "/api",
    scheduleShutdown: options.scheduleShutdown,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({
        message: error.message,
        details: error.details,
      });
      return;
    }

    if ((error as any).issues) {
      reply.code(400).send({
        message: "Validation failed",
        details: (error as any).issues,
      });
      return;
    }

    app.log.error(error);
    reply.code(500).send({
      message: "Internal server error",
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
};
