import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class CryptoService {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv, tag, encrypted].map((item) => item.toString("base64url")).join(".");
  }

  decrypt(payload: string): string {
    const [ivPart, tagPart, contentPart] = payload.split(".");
    if (!ivPart || !tagPart || !contentPart) {
      throw new Error("Invalid encrypted payload format");
    }

    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const content = Buffer.from(contentPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
  }
}
