import { render, screen } from "@testing-library/react";
import HtmlMailViewer from "./components/HtmlMailViewer";

test("renders plain text mail content", () => {
  render(
    <HtmlMailViewer
      message={{
        id: "mail-test",
        accountId: "acct-test",
        accountEmail: "owner@example.com",
        accountDisplayName: "Test Account",
        provider: "gmail" as const,
        providerLabel: "Gmail",
        folder: "inbox",
        fromName: "Sender",
        fromEmail: "sender@example.com",
        to: ["owner@example.com"],
        cc: [],
        bcc: [],
        subject: "Subject",
        preview: "Preview",
        receivedAt: new Date().toISOString(),
        read: true,
        flagged: false,
        attachments: 0,
        labels: [],
        hasHtml: false,
        bodyType: "text",
        htmlBody: "",
        textBody: "Hello from the mailbox"
      }}
    />
  );

  expect(screen.getByText("Hello from the mailbox")).toBeTruthy();
});
