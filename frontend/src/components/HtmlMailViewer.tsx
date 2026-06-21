import DOMPurify from "dompurify";
import type { MailDetail } from "../types/mail";

type HtmlMailViewerProps = {
  message: MailDetail;
};

export default function HtmlMailViewer({ message }: HtmlMailViewerProps) {
  if (message.bodyType === "text") {
    return (
      <div className="html-mail">
        <pre className="plain-mail">{message.textBody}</pre>
      </div>
    );
  }

  return (
    <div
      className="html-mail"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(message.htmlBody)
      }}
    />
  );
}
