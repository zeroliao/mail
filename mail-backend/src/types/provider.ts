import { MailProvider } from "@prisma/client";
import { MessageListResult, NormalizedMessage, SendMailInput } from "./mail";

export type ProviderProfile = {
  email: string;
  displayName?: string | null;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: Date | null;
  scope: string[];
};

export type OAuthExchangeResult = OAuthTokens & {
  profile: ProviderProfile;
};

// 刷新 access_token 时的可选覆盖项。
// 用于 public client（自带 refresh_token + client_id，无 client_secret）的 per-account 刷新。
export type RefreshTokenOptions = {
  clientId?: string;
  clientSecret?: string;
  scope?: string[];
  tenant?: string;
};

export interface MailProviderService {
  readonly provider: MailProvider;
  buildAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthExchangeResult>;
  refreshAccessToken(refreshToken: string, options?: RefreshTokenOptions): Promise<OAuthTokens>;
  listMessages(accessToken: string, params: { folder?: string; limit: number; pageToken?: string }): Promise<MessageListResult>;
  getMessage(accessToken: string, messageId: string): Promise<NormalizedMessage>;
  sendMessage(accessToken: string, input: SendMailInput): Promise<{ providerMessageId?: string | null }>;
}
