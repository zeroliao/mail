import { MailProvider } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";

export class SystemService {
  async getHealth() {
    const databaseOk = await prisma.$queryRawUnsafe("SELECT 1").then(() => true).catch(() => false);

    return {
      status: "ok",
      database: {
        ok: databaseOk
      },
      oauthProviders: {
        gmailConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        microsoftConfigured: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)
      }
    };
  }

  getOAuthProviderConfig() {
    return {
      gmail: {
        enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        callbackUrl: env.GOOGLE_OAUTH_REDIRECT_URI
      },
      microsoft: {
        enabled: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
        callbackUrl: env.MICROSOFT_OAUTH_REDIRECT_URI,
        tenantId: env.MICROSOFT_TENANT_ID
      }
    };
  }

  resolveProvider(input: string) {
    const value = input.toLowerCase();
    if (value === "gmail" || value === "google") {
      return MailProvider.GOOGLE;
    }
    if (value === "microsoft" || value === "outlook" || value === "hotmail") {
      return MailProvider.MICROSOFT;
    }
    return null;
  }
}
