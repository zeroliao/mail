import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { NormalizedMessage, MessageListResult, SendMailInput, MailAddress } from "../types/mail";
import { AppError } from "../lib/errors";
import nodemailer from "nodemailer";

// 微软已禁用基本认证的域名
const MICROSOFT_DOMAINS = new Set(["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.cn"]);
// Gmail 域名
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// 创建统一的 ImapFlow 客户端配置
function createImapClient(host: string, port: number, email: string, password: string): ImapFlow {
  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2"
    }
  } as any);
}

// 根据邮箱域名生成 IMAP 认证失败的具体错误提示
function handleImapError(email: string, error: any): never {
  const msg = error?.message || String(error);
  const domain = email.split("@")[1]?.toLowerCase() || "";

  const isAuthError =
    msg.includes("Command failed") ||
    msg.includes("AUTHENTICATIONFAILED") ||
    msg.includes("Invalid credentials") ||
    msg.includes("LOGIN failed") ||
    msg.includes("Authentication failed") ||
    msg.includes("AUTHENTICATE") ||
    msg.includes("not enabled") ||
    msg.includes("BasicAuth") ||
    msg.includes("NO AUTHENTICATE");

  if (isAuthError) {
    if (MICROSOFT_DOMAINS.has(domain)) {
      throw new AppError(
        `认证失败 (${email})：微软已全面禁用 Outlook/Hotmail 的 IMAP 基本身份验证。请前往 https://account.microsoft.com/security 开启两步验证后生成"应用密码"，使用应用密码进行连接。`,
        401
      );
    }
    if (GMAIL_DOMAINS.has(domain)) {
      throw new AppError(
        `认证失败 (${email})：Gmail 不支持直接密码登录 IMAP。请先开启两步验证，然后前往 https://myaccount.google.com/apppasswords 生成"应用密码"进行连接。`,
        401
      );
    }
    throw new AppError(
      `认证失败 (${email})：邮箱或密码错误，或该邮件服务商已禁用基本密码认证。请确认密码正确，或尝试使用应用密码。原始错误：${msg}`,
      401
    );
  }

  // 连接超时或网络问题
  if (msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED") || msg.includes("timeout") || msg.includes("ENOTFOUND")) {
    throw new AppError(`IMAP 连接失败：无法连接到服务器，请检查网络或服务器地址是否正确。(${msg})`, 502);
  }

  throw new AppError(`IMAP 连接失败：${msg}`, 502);
}

// IMAP/SMTP 服务器配置映射
const PROVIDER_CONFIGS: Record<string, { imap: { host: string; port: number }; smtp: { host: string; port: number } }> = {
  "outlook.com": {
    imap: { host: "outlook.office365.com", port: 993 },
    smtp: { host: "smtp.office365.com", port: 587 }
  },
  "hotmail.com": {
    imap: { host: "outlook.office365.com", port: 993 },
    smtp: { host: "smtp.office365.com", port: 587 }
  },
  "live.com": {
    imap: { host: "outlook.office365.com", port: 993 },
    smtp: { host: "smtp.office365.com", port: 587 }
  },
  "gmail.com": {
    imap: { host: "imap.gmail.com", port: 993 },
    smtp: { host: "smtp.gmail.com", port: 587 }
  }
};

// 根据邮箱后缀自动解析服务器配置
export function resolveImapConfig(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) throw new AppError("邮箱地址格式无效", 400);

  const config = PROVIDER_CONFIGS[domain];
  if (!config) {
    // 对于未知域名，尝试通用 IMAP 配置
    return {
      imap: { host: `imap.${domain}`, port: 993 },
      smtp: { host: `smtp.${domain}`, port: 587 }
    };
  }
  return config;
}

// 验证 IMAP 凭据是否有效
export async function verifyImapCredentials(email: string, password: string, imapHost?: string, imapPort?: number): Promise<boolean> {
  const config = resolveImapConfig(email);
  const host = imapHost || config.imap.host;
  const port = imapPort || config.imap.port;

  const client = createImapClient(host, port, email, password);

  try {
    await client.connect();
    await client.logout();
    return true;
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    handleImapError(email, error);
  }
}

// 通过 IMAP 获取邮件列表
export async function fetchImapMessages(
  email: string,
  password: string,
  options: { folder?: string; limit?: number; imapHost?: string; imapPort?: number }
): Promise<MessageListResult> {
  const config = resolveImapConfig(email);
  const host = options.imapHost || config.imap.host;
  const port = options.imapPort || config.imap.port;
  const folder = options.folder || "INBOX";
  const limit = options.limit || 20;

  const client = createImapClient(host, port, email, password);

  const messages: NormalizedMessage[] = [];

  try {
    await client.connect();

    const mailboxPath = resolveMailboxPath(folder);
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      const mailbox = client.mailbox;
      if (!mailbox || !mailbox.exists) {
        return { messages: [], nextPageToken: null };
      }

      const total = mailbox.exists;
      const startSeq = Math.max(1, total - limit + 1);

      // 从最新到最旧获取
      for await (const msg of client.fetch(`${startSeq}:*`, {
        envelope: true,
        bodyStructure: true,
        flags: true,
        uid: true,
        source: true
      })) {
        if (!msg.source) continue;
        const parsed: ParsedMail = await simpleParser(msg.source) as ParsedMail;

        const normalized: NormalizedMessage = {
          providerMessageId: String(msg.uid),
          folder: folder,
          subject: parsed.subject || null,
          snippet: (parsed.text || "").slice(0, 200) || null,
          from: parsed.from?.value?.[0] ? { email: parsed.from.value[0].address || "", name: parsed.from.value[0].name || null } : null,
          to: (parsed.to && !Array.isArray(parsed.to) ? parsed.to.value : Array.isArray(parsed.to) ? parsed.to.flatMap((t: any) => t.value) : []).map((a: any) => ({ email: a.address || "", name: a.name || null })),
          cc: (parsed.cc && !Array.isArray(parsed.cc) ? parsed.cc.value : Array.isArray(parsed.cc) ? parsed.cc.flatMap((c: any) => c.value) : []).map((a: any) => ({ email: a.address || "", name: a.name || null })),
          bcc: [],
          bodyText: parsed.text || null,
          bodyHtml: (typeof parsed.html === "string" ? parsed.html : null),
          receivedAt: parsed.date || null,
          sentAt: parsed.date || null,
          isRead: msg.flags?.has("\\Seen") || false,
          hasAttachments: (parsed.attachments?.length || 0) > 0,
          attachments: (parsed.attachments || []).map((att: any) => ({
            filename: att.filename || "unnamed",
            mimeType: att.contentType || null,
            size: att.size || null
          }))
        };

        messages.push(normalized);
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    handleImapError(email, error);
  }

  // 按时间倒序
  messages.sort((a, b) => {
    const ta = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const tb = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return tb - ta;
  });

  return { messages: messages.slice(0, limit), nextPageToken: null };
}

// 通过 SMTP 发送邮件
export async function sendSmtpMessage(
  email: string,
  password: string,
  input: SendMailInput,
  smtpHost?: string,
  smtpPort?: number
): Promise<{ providerMessageId?: string | null }> {
  const config = resolveImapConfig(email);
  const host = smtpHost || config.smtp.host;
  const port = smtpPort || config.smtp.port;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false }
  });

  const result = await transporter.sendMail({
    from: email,
    to: input.to.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email).join(", "),
    cc: input.cc?.map(a => a.email).join(", "),
    bcc: input.bcc?.map(a => a.email).join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  return { providerMessageId: result.messageId || null };
}

// 获取单封邮件详情
export async function fetchImapMessage(
  email: string,
  password: string,
  messageUid: string,
  options: { folder?: string; imapHost?: string; imapPort?: number }
): Promise<NormalizedMessage | null> {
  const config = resolveImapConfig(email);
  const host = options.imapHost || config.imap.host;
  const port = options.imapPort || config.imap.port;
  const folder = options.folder || "INBOX";

  const client = createImapClient(host, port, email, password);

  try {
    await client.connect();
    const mailboxPath = resolveMailboxPath(folder);
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      const msg = await client.fetchOne(messageUid, {
        envelope: true,
        source: true,
        flags: true,
        uid: true
      }, { uid: true });

      if (!msg || !msg.source) return null;

      const parsed: ParsedMail = await simpleParser(msg.source) as ParsedMail;

      return {
        providerMessageId: String(msg.uid),
        folder,
        subject: parsed.subject || null,
        snippet: (parsed.text || "").slice(0, 200) || null,
        from: parsed.from?.value?.[0] ? { email: parsed.from.value[0].address || "", name: parsed.from.value[0].name || null } : null,
        to: (parsed.to && !Array.isArray(parsed.to) ? parsed.to.value : Array.isArray(parsed.to) ? parsed.to.flatMap((t: any) => t.value) : []).map((a: any) => ({ email: a.address || "", name: a.name || null })),
        cc: (parsed.cc && !Array.isArray(parsed.cc) ? parsed.cc.value : Array.isArray(parsed.cc) ? parsed.cc.flatMap((c: any) => c.value) : []).map((a: any) => ({ email: a.address || "", name: a.name || null })),
        bcc: [],
        bodyText: parsed.text || null,
        bodyHtml: (typeof parsed.html === "string" ? parsed.html : null),
        receivedAt: parsed.date || null,
        sentAt: parsed.date || null,
        isRead: msg.flags?.has("\\Seen") || false,
        hasAttachments: (parsed.attachments?.length || 0) > 0,
        attachments: (parsed.attachments || []).map((att: any) => ({
          filename: att.filename || "unnamed",
          mimeType: att.contentType || null,
          size: att.size || null
        }))
      };
    } finally {
      lock.release();
    }
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    return handleImapError(email, error);
  } finally {
    try { await client.logout(); } catch {}
  }
}

// 文件夹名称映射
function resolveMailboxPath(folder: string): string {
  const map: Record<string, string> = {
    inbox: "INBOX",
    sent: "Sent",
    drafts: "Drafts",
    archive: "Archive",
    starred: "INBOX" // 用 flags 筛选
  };
  return map[folder.toLowerCase()] || folder;
}
