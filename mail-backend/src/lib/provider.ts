import { MailProvider } from "@prisma/client";

export const providerKindMap: Record<MailProvider, "gmail" | "microsoft"> = {
  [MailProvider.GOOGLE]: "gmail",
  [MailProvider.MICROSOFT]: "microsoft"
};

export const providerLabelMap: Record<MailProvider, string> = {
  [MailProvider.GOOGLE]: "Gmail",
  [MailProvider.MICROSOFT]: "Outlook / Hotmail"
};
