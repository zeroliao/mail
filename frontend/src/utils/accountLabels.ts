import type { MailAccount } from "../types/mail";

export type ServiceDirectoryItem = {
  name: string;
  accountCount: number;
  connectedCount: number;
  availableCount: number;
  blockedCount: number;
};

export const MAX_ACCOUNT_LABELS = 12;
export const MAX_ACCOUNT_LABEL_LENGTH = 24;

export const normalizeAccountLabels = (labels: string[]) =>
  Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean)),
  ).slice(0, MAX_ACCOUNT_LABELS);

export const getReusableAccountLabels = (accounts: MailAccount[]) =>
  Array.from(
    new Set(
      accounts.flatMap((account) => [
        ...account.labels,
        ...Object.keys(account.serviceStatuses ?? {}),
      ]),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));

export const accountHasServiceIssue = (
  account: MailAccount,
  serviceName: string,
) => account.serviceStatuses?.[serviceName.trim()] === "unavailable";

export const accountCanRegisterService = (
  account: MailAccount,
  serviceName: string,
) =>
  account.status === "connected" &&
  accountIsUnboundFromService(account, serviceName) &&
  !accountHasServiceIssue(account, serviceName);

export const getServiceDirectory = (
  accounts: MailAccount[],
): ServiceDirectoryItem[] =>
  getReusableAccountLabels(accounts).map((name) => {
    const matchingAccounts = accounts.filter((account) =>
      account.labels.includes(name),
    );
    return {
      name,
      accountCount: matchingAccounts.length,
      connectedCount: matchingAccounts.filter(
        (account) => account.status === "connected",
      ).length,
      availableCount: accounts.filter((account) =>
        accountCanRegisterService(account, name),
      ).length,
      blockedCount: accounts.filter((account) =>
        accountHasServiceIssue(account, name),
      ).length,
    };
  });

export const getAccountServiceNote = (
  account: MailAccount,
  serviceName: string,
) => account.serviceNotes?.[serviceName] ?? "";

export const accountMatchesLabels = (
  account: MailAccount,
  selectedLabels: string[],
) =>
  !selectedLabels.length ||
  selectedLabels.some((label) => account.labels.includes(label));

export const accountIsUnboundFromService = (
  account: MailAccount,
  serviceName: string,
) =>
  Boolean(serviceName.trim()) && !account.labels.includes(serviceName.trim());
