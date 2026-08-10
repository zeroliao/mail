export type ProviderKind = "gmail" | "microsoft";
export type AccountStatus = "connected" | "syncing" | "attention";
export type ServiceReceptionStatus = "unavailable";
export type FolderKey = "inbox" | "starred" | "sent" | "drafts" | "archive";

export type HealthResponse = {
  status: string;
};

export type ProviderConfigResponse = {
  gmail: {
    enabled: boolean;
    callbackUrl: string;
  };
  microsoft: {
    enabled: boolean;
    callbackUrl: string;
    tenantId: string;
  };
};

export type MailAccount = {
  id: string;
  displayName: string;
  email: string;
  provider: ProviderKind;
  providerLabel: string;
  status: AccountStatus;
  unreadCount: number;
  lastSyncAt: string;
  labels: string[];
  serviceNotes?: Record<string, string>;
  serviceStatuses?: Record<string, ServiceReceptionStatus>;
  scopeText?: string;
};

export type MailSummary = {
  id: string;
  accountId: string;
  accountEmail?: string;
  accountDisplayName?: string;
  provider?: ProviderKind;
  providerLabel: string;
  folder: FolderKey;
  fromName: string;
  fromEmail: string;
  to: string[];
  subject: string;
  preview: string;
  receivedAt: string;
  read: boolean;
  flagged: boolean;
  attachments: number;
  labels: string[];
  hasHtml: boolean;
};

export type MailDetail = MailSummary & {
  cc: string[];
  bcc: string[];
  bodyType: "html" | "text";
  htmlBody: string;
  textBody: string;
};

export type PaginatedMailResult = {
  items: MailSummary[];
  page: number;
  pageSize: number;
  total: number;
  nextPageToken?: string | null;
};

export type FolderCountMap = Record<FolderKey, number>;

export type ComposeDraft = {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type SendMailPayload = {
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  format: "html";
};

export type BindOAuthPayload = {
  email: string;
  refreshToken: string;
  clientId: string;
  displayName?: string;
  scope?: string[];
};

export type BindOAuthAccountResponse = {
  status: string;
  message: string;
  account: {
    id: string;
    email: string;
    provider: "MICROSOFT";
    status: string;
    providerLabel?: string;
  };
};

export type BindOAuthBatchResult = {
  email: string;
  status: "success" | "failed";
  message: string;
  accountId?: string;
};

export type BindOAuthBatchResponse = {
  total: number;
  success: number;
  failed: number;
  results: BindOAuthBatchResult[];
};
