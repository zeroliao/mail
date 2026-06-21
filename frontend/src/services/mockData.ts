import dayjs from "dayjs";
import type { FolderCountMap, FolderKey, MailAccount, MailDetail, MailSummary, ProviderKind } from "../types/mail";

export const ALL_ACCOUNTS_ID = "all-accounts";

const providerLabels: Record<ProviderKind, string> = {
  gmail: "Gmail",
  microsoft: "Outlook / Hotmail"
};

let accountIndex = 3;
let messageIndex = 12;

export let accountsSeed: MailAccount[] = [
  {
    id: "acct-gmail-1",
    displayName: "Growth Inbox",
    email: "growth.board@gmail.com",
    provider: "gmail",
    providerLabel: providerLabels.gmail,
    status: "connected",
    unreadCount: 7,
    lastSyncAt: dayjs().subtract(10, "minute").toISOString()
  },
  {
    id: "acct-ms-1",
    displayName: "Founder Outlook",
    email: "founder@outlook.com",
    provider: "microsoft",
    providerLabel: providerLabels.microsoft,
    status: "connected",
    unreadCount: 4,
    lastSyncAt: dayjs().subtract(22, "minute").toISOString()
  },
  {
    id: "acct-ms-2",
    displayName: "Support Hotmail",
    email: "support_ops@hotmail.com",
    provider: "microsoft",
    providerLabel: providerLabels.microsoft,
    status: "syncing",
    unreadCount: 2,
    lastSyncAt: dayjs().subtract(54, "minute").toISOString()
  }
];

const detailsSeed: Omit<MailDetail, "accountEmail" | "accountDisplayName" | "provider">[] = [
  {
    id: "mail-1",
    accountId: "acct-gmail-1",
    providerLabel: providerLabels.gmail,
    folder: "inbox",
    fromName: "Stripe Billing",
    fromEmail: "billing@stripe.com",
    to: ["growth.board@gmail.com"],
    cc: [],
    bcc: [],
    subject: "Your May payout report is ready",
    preview: "Daily settlements, refunds, and chargebacks are now available in the dashboard.",
    receivedAt: dayjs().subtract(32, "minute").toISOString(),
    read: false,
    flagged: true,
    attachments: 1,
    labels: ["Finance", "Priority"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<h2>May payout report</h2><p>Your updated payout summary is now available.</p><ul><li>Gross volume up 18%</li><li>Refund rate 0.7%</li><li>2 disputes require review</li></ul><p>Please reconcile by EOD.</p>",
    textBody: ""
  },
  {
    id: "mail-2",
    accountId: "acct-gmail-1",
    providerLabel: providerLabels.gmail,
    folder: "inbox",
    fromName: "Product Design",
    fromEmail: "design@agency.studio",
    to: ["growth.board@gmail.com"],
    cc: ["ops@example.com"],
    bcc: [],
    subject: "Revised inbox navigation proposal",
    preview: "Attached is the two-column tablet variant with drawer-based detail behavior.",
    receivedAt: dayjs().subtract(2, "hour").toISOString(),
    read: false,
    flagged: false,
    attachments: 2,
    labels: ["Design"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Hi team,</p><p>The revised tablet navigation keeps the account rail pinned and moves message detail into a drawer when width drops below 1200px.</p><p>Feedback welcome before handoff.</p>",
    textBody: ""
  },
  {
    id: "mail-3",
    accountId: "acct-gmail-1",
    providerLabel: providerLabels.gmail,
    folder: "starred",
    fromName: "Legal Ops",
    fromEmail: "legal@vendor.net",
    to: ["growth.board@gmail.com"],
    cc: [],
    bcc: [],
    subject: "DPA addendum for review",
    preview: "Please review the highlighted storage clauses before procurement signs.",
    receivedAt: dayjs().subtract(5, "hour").toISOString(),
    read: true,
    flagged: true,
    attachments: 1,
    labels: ["Legal"],
    hasHtml: false,
    bodyType: "text",
    htmlBody: "",
    textBody: "Please review the highlighted storage clauses before procurement signs. The vendor requests an answer by Friday 16:00."
  },
  {
    id: "mail-4",
    accountId: "acct-gmail-1",
    providerLabel: providerLabels.gmail,
    folder: "sent",
    fromName: "Growth Inbox",
    fromEmail: "growth.board@gmail.com",
    to: ["ceo@example.com"],
    cc: [],
    bcc: [],
    subject: "Weekly mail operations summary",
    preview: "Shared account health, pending OAuth secrets, and inbox response SLA.",
    receivedAt: dayjs().subtract(1, "day").toISOString(),
    read: true,
    flagged: false,
    attachments: 0,
    labels: ["Report"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Team,</p><p>OAuth status, send failures, and queue lag are all summarized below. No blocking incidents detected.</p>",
    textBody: ""
  },
  {
    id: "mail-5",
    accountId: "acct-ms-1",
    providerLabel: providerLabels.microsoft,
    folder: "inbox",
    fromName: "Microsoft 365",
    fromEmail: "noreply@microsoft.com",
    to: ["founder@outlook.com"],
    cc: [],
    bcc: [],
    subject: "Security alert: new sign-in to your mailbox",
    preview: "We noticed a login from a new device in Shanghai. Review if this was expected.",
    receivedAt: dayjs().subtract(18, "minute").toISOString(),
    read: false,
    flagged: true,
    attachments: 0,
    labels: ["Security"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>A new sign-in to <strong>founder@outlook.com</strong> was detected.</p><p>If this was not you, reset credentials and revoke sessions immediately.</p>",
    textBody: ""
  },
  {
    id: "mail-6",
    accountId: "acct-ms-1",
    providerLabel: providerLabels.microsoft,
    folder: "inbox",
    fromName: "Ops Manager",
    fromEmail: "ops@example.com",
    to: ["founder@outlook.com"],
    cc: [],
    bcc: [],
    subject: "Customer escalation requires founder reply",
    preview: "A high-value account is waiting for direct confirmation on migration timing.",
    receivedAt: dayjs().subtract(3, "hour").toISOString(),
    read: false,
    flagged: false,
    attachments: 0,
    labels: ["Customer"],
    hasHtml: false,
    bodyType: "text",
    htmlBody: "",
    textBody: "A high-value account is waiting for direct confirmation on migration timing. Please reply before 17:00."
  },
  {
    id: "mail-7",
    accountId: "acct-ms-1",
    providerLabel: providerLabels.microsoft,
    folder: "archive",
    fromName: "Board Secretary",
    fromEmail: "board@company.org",
    to: ["founder@outlook.com"],
    cc: [],
    bcc: [],
    subject: "Archived: board deck notes",
    preview: "Final notes from the last board meeting were filed for reference.",
    receivedAt: dayjs().subtract(3, "day").toISOString(),
    read: true,
    flagged: false,
    attachments: 1,
    labels: ["Board"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Board deck notes are archived. See attachment for versioned changes.</p>",
    textBody: ""
  },
  {
    id: "mail-8",
    accountId: "acct-ms-2",
    providerLabel: providerLabels.microsoft,
    folder: "inbox",
    fromName: "Help Scout",
    fromEmail: "notifications@helpscout.com",
    to: ["support_ops@hotmail.com"],
    cc: [],
    bcc: [],
    subject: "7 tickets breached first response target",
    preview: "Two billing tickets and five onboarding tickets are waiting in the support queue.",
    receivedAt: dayjs().subtract(47, "minute").toISOString(),
    read: false,
    flagged: false,
    attachments: 0,
    labels: ["Support"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Seven tickets breached the target first response window.</p><p>Please clear the queue within the next 45 minutes.</p>",
    textBody: ""
  },
  {
    id: "mail-9",
    accountId: "acct-ms-2",
    providerLabel: providerLabels.microsoft,
    folder: "drafts",
    fromName: "Support Hotmail",
    fromEmail: "support_ops@hotmail.com",
    to: ["customer@example.com"],
    cc: [],
    bcc: [],
    subject: "Draft: migration instructions",
    preview: "Saved draft for onboarding reply with migration checklist.",
    receivedAt: dayjs().subtract(6, "hour").toISOString(),
    read: true,
    flagged: false,
    attachments: 0,
    labels: ["Draft"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Thanks for your patience.</p><p>Below is the migration checklist for mailbox connection and token refresh.</p>",
    textBody: ""
  },
  {
    id: "mail-10",
    accountId: "acct-ms-2",
    providerLabel: providerLabels.microsoft,
    folder: "sent",
    fromName: "Support Hotmail",
    fromEmail: "support_ops@hotmail.com",
    to: ["vip@example.com"],
    cc: [],
    bcc: [],
    subject: "Issue resolved: mailbox sync delay",
    preview: "Confirmed resolution and shared expected sync cadence.",
    receivedAt: dayjs().subtract(18, "hour").toISOString(),
    read: true,
    flagged: false,
    attachments: 0,
    labels: ["Resolved"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Sync delay has been resolved. The mailbox should resume its normal 5-minute polling window.</p>",
    textBody: ""
  },
  {
    id: "mail-11",
    accountId: "acct-gmail-1",
    providerLabel: providerLabels.gmail,
    folder: "archive",
    fromName: "Analytics Robot",
    fromEmail: "analytics@internal.ai",
    to: ["growth.board@gmail.com"],
    cc: [],
    bcc: [],
    subject: "Archived: retention report snapshot",
    preview: "Weekly retention analysis completed and archived.",
    receivedAt: dayjs().subtract(2, "day").toISOString(),
    read: true,
    flagged: false,
    attachments: 1,
    labels: ["Analytics"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Weekly retention analysis completed and archived for finance and product review.</p>",
    textBody: ""
  },
  {
    id: "mail-12",
    accountId: "acct-ms-1",
    providerLabel: providerLabels.microsoft,
    folder: "starred",
    fromName: "Recruiting",
    fromEmail: "talent@partner.io",
    to: ["founder@outlook.com"],
    cc: [],
    bcc: [],
    subject: "Candidate interview recap",
    preview: "Sharing detailed notes from the final interview panel.",
    receivedAt: dayjs().subtract(9, "hour").toISOString(),
    read: true,
    flagged: true,
    attachments: 1,
    labels: ["Hiring"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: "<p>Panel feedback is attached. Candidate strength is systems thinking; watch for limited ops exposure.</p>",
    textBody: ""
  }
];

// Enrich seed entries with account-level fields required by MailSummary
function enrichWithAccountFields(entries: Omit<MailDetail, "accountEmail" | "accountDisplayName" | "provider">[]): MailDetail[] {
  return entries.map((entry) => {
    const account = accountsSeed.find((a) => a.id === entry.accountId);
    return {
      ...entry,
      accountEmail: account?.email ?? "",
      accountDisplayName: account?.displayName ?? "",
      provider: account?.provider ?? "gmail",
    } as MailDetail;
  });
}

export let detailsStore: MailDetail[] = enrichWithAccountFields(detailsSeed as Omit<MailDetail, "accountEmail" | "accountDisplayName" | "provider">[]);

export function listSummariesForAccount(accountId: string, folder: FolderKey): MailSummary[] {
  return detailsStore
    .filter((message) =>
      (accountId === ALL_ACCOUNTS_ID || message.accountId === accountId) &&
      message.folder === folder
    )
    .sort((left, right) => dayjs(right.receivedAt).valueOf() - dayjs(left.receivedAt).valueOf())
    .map(({ htmlBody: _htmlBody, textBody: _textBody, cc: _cc, bcc: _bcc, ...summary }) => summary);
}

export function getMessageById(messageId: string): MailDetail | undefined {
  return detailsStore.find((message) => message.id === messageId);
}

export function getFolderCounts(accountId: string): FolderCountMap {
  return detailsStore
    .filter((message) => accountId === ALL_ACCOUNTS_ID || message.accountId === accountId)
    .reduce<FolderCountMap>(
    (counts, message) => ({
      ...counts,
      [message.folder]: counts[message.folder] + 1
    }),
    {
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      archive: 0
    }
  );
}

export function addMockAccount(provider: ProviderKind, emailSeed?: string): MailAccount {
  accountIndex += 1;
  const email = emailSeed?.trim() || (provider === "gmail" ? `team.mailbox.${accountIndex}@gmail.com` : `operations${accountIndex}@outlook.com`);

  const account: MailAccount = {
    id: `acct-${provider}-${accountIndex}`,
    displayName: provider === "gmail" ? `Gmail ${accountIndex}` : `Microsoft ${accountIndex}`,
    email,
    provider,
    providerLabel: providerLabels[provider],
    status: "connected",
    unreadCount: 0,
    lastSyncAt: dayjs().toISOString()
  };

  accountsSeed = [account, ...accountsSeed];
  return account;
}

export function removeMockAccount(accountId: string) {
  accountsSeed = accountsSeed.filter((account) => account.id !== accountId);
  detailsStore = detailsStore.filter((message) => message.accountId !== accountId);
}

export function appendSentMessage(payload: {
  accountId: string;
  fromEmail: string;
  providerLabel: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
}) {
  messageIndex += 1;
  const account = accountsSeed.find((a) => a.id === payload.accountId);
  const detail: MailDetail = {
    id: `mail-${messageIndex}`,
    accountId: payload.accountId,
    accountEmail: account?.email ?? payload.fromEmail,
    accountDisplayName: account?.displayName ?? "You",
    provider: account?.provider ?? "gmail",
    providerLabel: payload.providerLabel,
    folder: "sent",
    fromName: "You",
    fromEmail: payload.fromEmail,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    preview: payload.body.replace(/<[^>]+>/g, "").slice(0, 110),
    receivedAt: dayjs().toISOString(),
    read: true,
    flagged: false,
    attachments: 0,
    labels: ["Sent"],
    hasHtml: true,
    bodyType: "html",
    htmlBody: payload.body,
    textBody: ""
  };

  detailsStore = [detail, ...detailsStore];
}
