import { MailProvider } from "@prisma/client";
import { MailProviderService } from "../types/provider";
import { GoogleMailProvider } from "./google-mail.provider";
import { MicrosoftMailProvider } from "./microsoft-mail.provider";

const providers: Record<MailProvider, MailProviderService> = {
  [MailProvider.GOOGLE]: new GoogleMailProvider(),
  [MailProvider.MICROSOFT]: new MicrosoftMailProvider()
};

export const providerRegistry = {
  get(provider: MailProvider) {
    return providers[provider];
  }
};
