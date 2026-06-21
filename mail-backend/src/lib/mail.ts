import MailComposer from "nodemailer/lib/mail-composer";
import { MailAddress, MailAttachment, NormalizedMessage, SendMailInput } from "../types/mail";

type GmailHeader = {
  name?: string | null;
  value?: string | null;
};

type GmailPayloadPart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: {
    attachmentId?: string | null;
    size?: number | null;
    data?: string | null;
  } | null;
  headers?: GmailHeader[] | null;
  parts?: GmailPayloadPart[] | null;
};

const addressPattern = /(?:"?([^"]*)"?\s)?<?([^<>@\s]+@[^<>@\s]+)>?/;

export const parseAddressHeader = (value?: string | null): MailAddress[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(addressPattern);
      if (!match) {
        return { email: entry };
      }

      return {
        name: match[1]?.trim() || null,
        email: match[2]
      };
    });
};

export const decodeBase64Url = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  return Buffer.from(value, "base64url").toString("utf8");
};

const findHeaderValue = (headers: GmailHeader[] | null | undefined, headerName: string): string | null =>
  headers?.find((header) => header.name?.toLowerCase() === headerName.toLowerCase())?.value ?? null;

const collectBody = (
  part: GmailPayloadPart | null | undefined,
  state: { text?: string | null; html?: string | null; attachments: MailAttachment[] }
) => {
  if (!part) {
    return;
  }

  if (part.parts?.length) {
    part.parts.forEach((child) => collectBody(child, state));
  }

  if (part.filename) {
    state.attachments.push({
      providerAttachmentId: part.body?.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body?.size,
      contentId: findHeaderValue(part.headers, "Content-Id"),
      isInline: (findHeaderValue(part.headers, "Content-Disposition") ?? "").toLowerCase().includes("inline")
    });
    return;
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    state.text = state.text ?? decodeBase64Url(part.body.data);
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    state.html = state.html ?? decodeBase64Url(part.body.data);
  }
};

export const normalizeGoogleMessage = (message: {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: GmailPayloadPart | null;
  internalDate?: string | null;
}): NormalizedMessage => {
  const payload = message.payload ?? {};
  const headers = payload.headers ?? [];
  const bodyState: { text?: string | null; html?: string | null; attachments: MailAttachment[] } = {
    attachments: []
  };

  collectBody(payload, bodyState);

  return {
    providerMessageId: message.id ?? "",
    threadId: message.threadId ?? null,
    folder: message.labelIds?.[0] ?? "INBOX",
    subject: findHeaderValue(headers, "Subject"),
    snippet: message.snippet ?? null,
    from: parseAddressHeader(findHeaderValue(headers, "From"))[0] ?? null,
    to: parseAddressHeader(findHeaderValue(headers, "To")),
    cc: parseAddressHeader(findHeaderValue(headers, "Cc")),
    bcc: parseAddressHeader(findHeaderValue(headers, "Bcc")),
    bodyText: bodyState.text ?? null,
    bodyHtml: bodyState.html ?? null,
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
    sentAt: findHeaderValue(headers, "Date") ? new Date(findHeaderValue(headers, "Date") as string) : null,
    isRead: !(message.labelIds ?? []).includes("UNREAD"),
    hasAttachments: bodyState.attachments.length > 0,
    attachments: bodyState.attachments,
    rawPayload: message
  };
};

const toGraphAddress = (entry?: { emailAddress?: { address?: string | null; name?: string | null } | null } | null): MailAddress | null => {
  const address = entry?.emailAddress?.address;
  if (!address) {
    return null;
  }

  return {
    email: address,
    name: entry?.emailAddress?.name ?? null
  };
};

const toGraphAddressList = (entries?: Array<{ emailAddress?: { address?: string | null; name?: string | null } | null }> | null): MailAddress[] =>
  (entries ?? []).map((entry) => toGraphAddress(entry)).filter((entry): entry is MailAddress => Boolean(entry));

export const normalizeMicrosoftMessage = (message: any): NormalizedMessage => ({
  providerMessageId: message.id,
  threadId: message.conversationId ?? null,
  folder: message.parentFolderId ?? "unknown",
  subject: message.subject ?? null,
  snippet: message.bodyPreview ?? null,
  from: toGraphAddress(message.from),
  to: toGraphAddressList(message.toRecipients),
  cc: toGraphAddressList(message.ccRecipients),
  bcc: toGraphAddressList(message.bccRecipients),
  bodyText: message.body?.contentType === "text" ? message.body?.content ?? null : null,
  bodyHtml: message.body?.contentType === "html" ? message.body?.content ?? null : null,
  receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : null,
  sentAt: message.sentDateTime ? new Date(message.sentDateTime) : null,
  isRead: Boolean(message.isRead),
  hasAttachments: Boolean(message.hasAttachments),
  attachments: [],
  rawPayload: message
});

export const buildRawMimeMessage = async (input: SendMailInput): Promise<string> => {
  const composer = new MailComposer({
    to: input.to.map(formatAddress),
    cc: input.cc?.map(formatAddress),
    bcc: input.bcc?.map(formatAddress),
    replyTo: input.replyTo?.map(formatAddress),
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.from(attachment.contentBase64, "base64"),
      contentType: attachment.contentType,
      cid: attachment.contentId,
      contentDisposition: attachment.inline ? "inline" : "attachment"
    }))
  });

  const compiled = await composer.compile().build();
  return Buffer.from(compiled).toString("base64url");
};

const formatAddress = (address: MailAddress): string => (address.name ? `${address.name} <${address.email}>` : address.email);
