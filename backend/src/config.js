const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseOrigins(value) {
  if (!value) {
    return ["http://localhost:8080"];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  appName: process.env.APP_NAME || "Mail Account Manager",
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseNumber(process.env.BACKEND_PORT || process.env.PORT, 3000),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMaxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  databaseUrl:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || "mailapp"}:${process.env.DB_PASSWORD || "mailapp123"}@${process.env.DB_HOST || "db"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "mailapp"}`,
  skipDbHealthcheck: parseBoolean(process.env.SKIP_DB_HEALTHCHECK, false),
  enableHsts: parseBoolean(process.env.ENABLE_HSTS, false),
  hstsMaxAge: parseNumber(process.env.HSTS_MAX_AGE, 31536000),
  jwtSecret: process.env.JWT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  googleClientId: process.env.GMAIL_CLIENT_ID || "",
  googleClientSecret: process.env.GMAIL_CLIENT_SECRET || "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID || "common",
  microsoftCallbackUrl: process.env.MICROSOFT_CALLBACK_URL || ""
};

module.exports = {
  config,
  parseBoolean,
  parseNumber,
  parseOrigins
};
