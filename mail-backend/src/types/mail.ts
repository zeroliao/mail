export type MailAddress = {
  email: string;
  name?: string | null;
};

export type MessageProviderKind = "gmail" | "microsoft";

export type MailAttachment = {
  providerAttachmentId?: string | null;
  filename: string;
  mimeType?: string | null;
  size?: number | null;
  contentId?: string | null;
  isInline?: boolean;
  storageKey?: string | null;
};

export type NormalizedMessage = {
  providerMessageId: string;
  accountId?: string;
  accountEmail?: string;
  provider?: MessageProviderKind;
  providerLabel?: string;
  threadId?: string | null;
  folder?: string | null;
  subject?: string | null;
  snippet?: string | null;
  from?: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt?: Date | null;
  sentAt?: Date | null;
  isRead: boolean;
  hasAttachments: boolean;
  attachments: MailAttachment[];
  rawPayload?: unknown;
};

export type MessageListResult = {
  messages: NormalizedMessage[];
  nextPageToken?: string | null;
};

export type SendMailAttachmentInput = {
  filename: string;
  contentBase64: string;
  contentType?: string;
  contentId?: string;
  inline?: boolean;
};

export type SendMailInput = {
  subject: string;
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  replyTo?: MailAddress[];
  text?: string;
  html?: string;
  attachments?: SendMailAttachmentInput[];
};
