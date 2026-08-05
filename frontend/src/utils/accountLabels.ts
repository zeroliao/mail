import type { MailAccount } from "../types/mail";

export const MAX_ACCOUNT_LABELS = 12;
export const MAX_ACCOUNT_LABEL_LENGTH = 24;

export const normalizeAccountLabels = (labels: string[]) =>
  Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean)),
  ).slice(0, MAX_ACCOUNT_LABELS);

export const getReusableAccountLabels = (accounts: MailAccount[]) =>
  Array.from(new Set(accounts.flatMap((account) => account.labels))).sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );

export const accountMatchesLabels = (
  account: MailAccount,
  selectedLabels: string[],
) =>
  !selectedLabels.length ||
  selectedLabels.some((label) => account.labels.includes(label));
