import { MailProvider } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { normalizeMicrosoftMessage } from "../lib/mail";
import { SendMailInput } from "../types/mail";
import {
  MailProviderService,
  OAuthExchangeResult,
  OAuthTokens,
  RefreshTokenOptions,
} from "../types/provider";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";

export const DEFAULT_MICROSOFT_GRAPH_SCOPES = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

const tokenEndpoint = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

export class MicrosoftMailProvider implements MailProviderService {
  readonly provider = MailProvider.MICROSOFT;

  private get tenantBaseUrl() {
    return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0`;
  }

  private ensureConfigured() {
    if (!env.MICROSOFT_CLIENT_ID) {
      throw new AppError("Microsoft OAuth is not configured", 500);
    }
  }

  buildAuthorizationUrl(state: string): string {
    this.ensureConfigured();

    const url = new URL(`${this.tenantBaseUrl}/authorize`);
    url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", env.MICROSOFT_OAUTH_REDIRECT_URI);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", env.microsoftScopes.join(" "));
    url.searchParams.set("state", state);

    return url.toString();
  }

  async exchangeCode(code: string): Promise<OAuthExchangeResult> {
    const tokens = await this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.MICROSOFT_OAUTH_REDIRECT_URI,
    });

    const profile = await this.fetchProfile(tokens.accessToken);

    return {
      ...tokens,
      profile,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
    options?: RefreshTokenOptions,
  ): Promise<OAuthTokens> {
    if (options?.clientId) {
      return this.requestPublicClientToken(
        {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        {
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          scope: options.scope,
          tenant: options.tenant,
        },
      );
    }

    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async exchangeRefreshTokenForPublicClient(input: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
    scope?: string[];
    tenant?: string;
  }): Promise<OAuthExchangeResult> {
    const tokens = await this.requestPublicClientToken(
      {
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
      },
      {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        scope: input.scope,
        tenant: input.tenant,
      },
    );

    const profile = await this.fetchProfile(tokens.accessToken);

    return {
      ...tokens,
      profile,
    };
  }

  private async fetchProfile(
    accessToken: string,
  ): Promise<{ email: string; displayName: string | null }> {
    const profileResponse = await requestMicrosoft(
      `${graphBaseUrl}/me?$select=displayName,mail,userPrincipalName`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      "graph",
    );

    if (!profileResponse.ok) {
      throw new AppError(
        "Failed to fetch Microsoft profile",
        502,
        await safeJson(profileResponse),
      );
    }

    const profile = await profileResponse.json();
    const email = profile.mail ?? profile.userPrincipalName;

    if (!email) {
      throw new AppError("Microsoft account email not available", 502);
    }

    return {
      email,
      displayName: profile.displayName ?? null,
    };
  }

  async listMessages(
    accessToken: string,
    params: { folder?: string; limit: number; pageToken?: string },
  ) {
    // 前端统一文件夹名 → Microsoft Graph wellKnownFolderName 映射。
    // starred 在 Graph 不是文件夹，而是 flag/flagStatus eq 'flagged' 筛选。
    const FOLDER_MAP: Record<string, string> = {
      inbox: "inbox",
      sent: "sentitems",
      drafts: "drafts",
      trash: "deleteditems",
      archive: "archive",
    };

    const rawFolder = params.folder?.toLowerCase() ?? "";
    const isStarred = rawFolder === "starred";
    const graphFolder =
      FOLDER_MAP[rawFolder] ?? (rawFolder && !isStarred ? rawFolder : "");

    let url: URL;
    if (isStarred) {
      // starred = flagged messages，不走 mailFolders 路径，用 $filter 查询全邮箱。
      url = new URL(`${graphBaseUrl}/me/messages`);
      url.searchParams.set("$filter", "flag/flagStatus eq 'flagged'");
    } else if (graphFolder) {
      url = new URL(`${graphBaseUrl}/me/mailFolders/${graphFolder}/messages`);
    } else {
      url = new URL(`${graphBaseUrl}/me/messages`);
    }

    url.searchParams.set("$top", String(params.limit));
    url.searchParams.set(
      "$select",
      "id,conversationId,parentFolderId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,flag",
    );

    if (params.pageToken) {
      url.searchParams.set("$skiptoken", params.pageToken);
    }

    const response = await requestMicrosoft(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.body-content-type="text"',
        },
      },
      "graph",
    );

    if (!response.ok) {
      await throwGraphError(response, "Failed to list Microsoft messages");
    }

    const payload = await response.json();
    return {
      messages: (payload.value ?? []).map(normalizeMicrosoftMessage),
      nextPageToken: extractSkipToken(payload["@odata.nextLink"]) ?? null,
    };
  }

  async getMessage(accessToken: string, messageId: string) {
    const url = new URL(`${graphBaseUrl}/me/messages/${messageId}`);
    url.searchParams.set(
      "$select",
      "id,conversationId,parentFolderId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments",
    );

    const response = await requestMicrosoft(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.body-content-type="text"',
        },
      },
      "graph",
    );

    if (!response.ok) {
      await throwGraphError(response, "Failed to fetch Microsoft message");
    }

    return normalizeMicrosoftMessage(await response.json());
  }

  async sendMessage(accessToken: string, input: SendMailInput) {
    const response = await requestMicrosoft(
      `${graphBaseUrl}/me/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: {
              contentType: input.html ? "HTML" : "Text",
              content: input.html ?? input.text ?? "",
            },
            toRecipients: mapRecipients(input.to),
            ccRecipients: mapRecipients(input.cc),
            bccRecipients: mapRecipients(input.bcc),
            replyTo: mapRecipients(input.replyTo),
            attachments: input.attachments?.map((attachment) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.filename,
              contentType: attachment.contentType ?? "application/octet-stream",
              contentBytes: attachment.contentBase64,
              contentId: attachment.contentId,
              isInline: Boolean(attachment.inline),
            })),
          },
          saveToSentItems: true,
        }),
      },
      "graph",
    );

    if (!response.ok) {
      await throwGraphError(response, "Failed to send Microsoft email");
    }

    return {};
  }

  private async requestToken(
    input: Record<string, string>,
  ): Promise<OAuthTokens> {
    this.ensureConfigured();

    const body = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      scope: env.microsoftScopes.join(" "),
      ...input,
    });

    if (env.MICROSOFT_CLIENT_SECRET) {
      body.set("client_secret", env.MICROSOFT_CLIENT_SECRET);
    }

    const response = await requestMicrosoft(
      `${this.tenantBaseUrl}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      "oauth-token",
    );

    if (!response.ok) {
      throw new AppError(
        "Microsoft token request failed",
        502,
        await safeJson(response),
      );
    }

    return this.parseTokenPayload(await response.json(), env.microsoftScopes);
  }

  private async requestPublicClientToken(
    input: Record<string, string>,
    options: {
      clientId: string;
      clientSecret?: string;
      scope?: string[];
      tenant?: string;
    },
  ): Promise<OAuthTokens> {
    const scope =
      options.scope && options.scope.length > 0
        ? options.scope
        : DEFAULT_MICROSOFT_GRAPH_SCOPES;
    const tenant = options.tenant || "consumers";

    const body = new URLSearchParams({
      client_id: options.clientId,
      scope: scope.join(" "),
      ...input,
    });

    if (options.clientSecret) {
      body.set("client_secret", options.clientSecret);
    }

    const response = await requestMicrosoft(
      tokenEndpoint(tenant),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      "oauth-token",
    );

    if (!response.ok) {
      throw new AppError(
        "Microsoft token request failed",
        502,
        await minimalOAuthError(response),
      );
    }

    return this.parseTokenPayload(await response.json(), scope);
  }

  private parseTokenPayload(
    payload: any,
    fallbackScope: string[],
  ): OAuthTokens {
    if (!payload?.access_token) {
      throw new AppError(
        "Microsoft token response did not include access_token",
        502,
        payload,
      );
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      tokenType: payload.token_type ?? null,
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : null,
      scope:
        typeof payload.scope === "string"
          ? payload.scope.split(" ").filter(Boolean)
          : fallbackScope,
    };
  }
}

const mapRecipients = (list?: Array<{ email: string; name?: string | null }>) =>
  list?.map((item) => ({
    emailAddress: {
      address: item.email,
      name: item.name ?? undefined,
    },
  }));

const extractSkipToken = (nextLink?: string | null) => {
  if (!nextLink) {
    return null;
  }

  const url = new URL(nextLink);
  return url.searchParams.get("$skiptoken");
};

const safeJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return { status: response.status, statusText: response.statusText };
  }
};

export const isGraphAuthError = (status: number, body: unknown): boolean => {
  if (status === 401) {
    return true;
  }

  const code = (body as any)?.error?.code;
  return (
    code === "InvalidAuthenticationToken" ||
    code === "InvalidAuthenticationTokenTenant" ||
    code === "CompactToken_ParsingFailure" ||
    code === "TokenExpired"
  );
};

const throwGraphError = async (
  response: Response,
  message: string,
): Promise<never> => {
  const body = await safeJson(response);
  throw new AppError(
    message,
    isGraphAuthError(response.status, body) ? 401 : 502,
    body,
  );
};

const minimalOAuthError = async (response: Response) => {
  const body = await safeJson(response);
  if (body && typeof body === "object" && "error" in body) {
    const { error, error_description } = body as {
      error?: unknown;
      error_description?: unknown;
    };
    return { error, error_description };
  }

  return { status: response.status, statusText: response.statusText };
};

const requestMicrosoft = async (
  input: string | URL,
  init: RequestInit,
  service: "oauth-token" | "graph",
) => {
  try {
    return await fetch(input, init);
  } catch {
    throw new AppError(
      "Microsoft 服务暂时无法连接，请检查网络或 VPN 后重试",
      502,
      { provider: "microsoft", service, code: "network_unreachable" },
    );
  }
};
