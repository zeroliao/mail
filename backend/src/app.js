const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { config } = require("./config");
const db = require("./db");

function createCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
  };
}

function createApp() {
  const app = express();

  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(
    helmet({
      hsts: config.enableHsts
        ? {
            maxAge: config.hstsMaxAge,
            includeSubDomains: true,
            preload: true
          }
        : false
    })
  );
  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMaxRequests,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: "Too many requests, please try again later."
      }
    })
  );

  app.get("/api/health", async (_request, response) => {
    try {
      const dbHealth = await db.healthcheck();
      response.status(200).json({
        status: "ok",
        app: config.appName,
        environment: config.nodeEnv,
        database: dbHealth,
        oauthProviders: {
          gmailConfigured: Boolean(config.googleClientId && config.googleClientSecret),
          microsoftConfigured: Boolean(config.microsoftClientId && config.microsoftClientSecret)
        }
      });
    } catch (error) {
      response.status(503).json({
        status: "degraded",
        app: config.appName,
        environment: config.nodeEnv,
        database: {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown database error"
        }
      });
    }
  });

  app.get("/api/config/oauth-providers", (_request, response) => {
    response.json({
      gmail: {
        enabled: Boolean(config.googleClientId && config.googleClientSecret),
        callbackUrl: config.googleCallbackUrl
      },
      microsoft: {
        enabled: Boolean(config.microsoftClientId && config.microsoftClientSecret),
        tenantId: config.microsoftTenantId,
        callbackUrl: config.microsoftCallbackUrl
      }
    });
  });

  app.use((error, _request, response, _next) => {
    if (error && /CORS/i.test(error.message || "")) {
      response.status(403).json({
        error: error.message
      });
      return;
    }

    response.status(500).json({
      error: "Internal Server Error"
    });
  });

  return app;
}

module.exports = {
  createApp
};
