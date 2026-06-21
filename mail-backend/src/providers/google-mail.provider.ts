import { MailProvider } from "@prisma/client";
import { google } from "googleapis";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { buildRawMimeMessage, normalizeGoogleMessage } from "../lib/mail";
import { MailProviderService, OAuthExchangeResult, OAuthTokens } from "../types/provider";
import { SendMailInput } from "../types/mail";

export class GoogleMailProvider implements MailProviderService {
  readonly provider = MailProvider.GOOGLE;

  private get oauthClient() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new AppError("Google OAuth is not configured", 500);
    }

    return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);
  }

  buildAuthorizationUrl(state: string): string {
    return this.oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: env.googleScopes,
      state
    });
  }

  async exchangeCode(code: string): Promise<OAuthExchangeResult> {
    const client = this.oauthClient;
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new AppError("Google OAuth exchange did not return access token", 502);
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get();

    if (!profile.data.email) {
      throw new AppError("Google account email not available", 502);
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope?.split(" ").filter(Boolean) ?? env.googleScopes,
      profile: {
        email: profile.data.email,
        displayName: profile.data.name ?? null
      }
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const client = this.oauthClient;
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new AppError("Google token refresh did not return access token", 502);
    }

    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? refreshToken,
      tokenType: credentials.token_type ?? null,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      scope: credentials.scope?.split(" ").filter(Boolean) ?? env.googleScopes
    };
  }

  async listMessages(accessToken: string, params: { folder?: string; limit: number; pageToken?: string }) {
    const auth = this.oauthClient;
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    const searchQuery = params.folder ? `label:${params.folder}` : undefined;
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: params.limit,
      pageToken: params.pageToken ?? undefined,
      q: searchQuery
    });

    const messages = await Promise.all(
      (list.data.messages ?? []).map(async (item) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: item.id!,
          format: "full"
        });
        return normalizeGoogleMessage(detail.data);
      })
    );

    return {
      messages,
      nextPageToken: list.data.nextPageToken ?? null
    };
  }

  async getMessage(accessToken: string, messageId: string) {
    const auth = this.oauthClient;
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full"
    });

    return normalizeGoogleMessage(detail.data);
  }

  async sendMessage(accessToken: string, input: SendMailInput) {
    const auth = this.oauthClient;
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });
    const raw = await buildRawMimeMessage(input);
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });

    return {
      providerMessageId: result.data.id ?? null
    };
  }
}
