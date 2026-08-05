const verificationCodePatterns = [
  /(?:verification|security|confirmation|login|one[- ]time)\s+code\s*(?:is\s*[:：-]?|[:：-])?\s*([a-z0-9]{4,8})\b/i,
  /(?:one[- ]time\s+password|otp)\s*(?:is\s*[:：-]?|[:：-])?\s*([a-z0-9]{4,8})\b/i,
  /(?:验证码|校验码|动态码|安全码|确认码|登录码)\s*(?:(?:是|为)\s*[:：-]?|[:：-])?\s*([a-z0-9]{4,8})\b/i,
  /\bcode\s*(?:is\s*[:：-]?|[:：-])?\s*([a-z0-9]{4,8})\b/i,
];

const toPlainText = (value: string) => {
  if (!value) return "";
  const parsed = new DOMParser().parseFromString(value, "text/html");
  return (parsed.body.textContent ?? value).replace(/\s+/g, " ").trim();
};

export function extractVerificationCode(values: Array<string | undefined>) {
  for (const value of values) {
    const text = toPlainText(value ?? "");
    for (const pattern of verificationCodePatterns) {
      const candidate = text.match(pattern)?.[1];
      if (candidate && /\d/.test(candidate)) return candidate;
    }
  }

  return null;
}
