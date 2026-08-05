import { config } from "dotenv";
import { z } from "zod";

config();

const rawEnv = process.env;
const resolvedPort = Number(rawEnv.PORT || "3000");
const defaultAppBaseUrl = `http://localhost:${Number.isFinite(resolvedPort) ? resolvedPort : 3000}`;
const resolvedJwtSecret = rawEnv.JWT_SECRET || "";
const normalizedEnv = {
  ...rawEnv,
  CORS_ORIGIN: rawEnv.CORS_ORIGIN || "http://localhost:5173",
  JWT_EXPIRES_IN: rawEnv.JWT_EXPIRES_IN || "7d",
  TOKEN_ENCRYPTION_KEY: rawEnv.TOKEN_ENCRYPTION_KEY || resolvedJwtSecret,
  API_ADMIN_USERNAME: rawEnv.API_ADMIN_USERNAME || "admin",
  API_ADMIN_PASSWORD: rawEnv.API_ADMIN_PASSWORD || resolvedJwtSecret,
  APP_BASE_URL: rawEnv.APP_BASE_URL || defaultAppBaseUrl,
  GOOGLE_CLIENT_ID: rawEnv.GOOGLE_CLIENT_ID || rawEnv.GMAIL_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET:
    rawEnv.GOOGLE_CLIENT_SECRET || rawEnv.GMAIL_CLIENT_SECRET || "",
  GOOGLE_OAUTH_REDIRECT_URI:
    rawEnv.GOOGLE_OAUTH_REDIRECT_URI ||
    rawEnv.GMAIL_REDIRECT_URI ||
    "http://localhost:3000/api/v1/accounts/oauth/google/callback",
  MICROSOFT_OAUTH_REDIRECT_URI:
    rawEnv.MICROSOFT_OAUTH_REDIRECT_URI ||
    rawEnv.MICROSOFT_REDIRECT_URI ||
    "http://localhost:3000/api/v1/accounts/oauth/microsoft/callback",
};

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),
  API_ADMIN_USERNAME: z.string().min(1).default("admin"),
  API_ADMIN_PASSWORD: z.string().min(6),
  APP_BASE_URL: z.string().url(),
  WEB_SUCCESS_REDIRECT_URL: z.string().optional().default(""),
  WEB_FAILURE_REDIRECT_URL: z.string().optional().default(""),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000/api/v1/accounts/oauth/google/callback"),
  GOOGLE_OAUTH_SCOPES: z
    .string()
    .default(
      "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
    ),
  MICROSOFT_CLIENT_ID: z.string().optional().default(""),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  MICROSOFT_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000/api/v1/accounts/oauth/microsoft/callback"),
  MICROSOFT_OAUTH_SCOPES: z
    .string()
    .default(
      "offline_access openid profile email Mail.Read Mail.ReadWrite Mail.Send User.Read",
    ),
});

const parsed = envSchema.safeParse(normalizedEnv);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

const splitScopes = (value: string) =>
  value
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

const splitOrigins = (value: string) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const env = {
  ...parsed.data,
  googleScopes: splitScopes(parsed.data.GOOGLE_OAUTH_SCOPES),
  microsoftScopes: splitScopes(parsed.data.MICROSOFT_OAUTH_SCOPES),
  corsOrigins: splitOrigins(parsed.data.CORS_ORIGIN),
};
