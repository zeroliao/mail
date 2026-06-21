import { timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

type SignJwt = (payload: Record<string, unknown>) => Promise<string> | string;

export class AuthService {
  async login(username: string, password: string, signJwt: SignJwt): Promise<{ token: string }> {
    if (!safeEquals(username, env.API_ADMIN_USERNAME) || !safeEquals(password, env.API_ADMIN_PASSWORD)) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = await signJwt({
      sub: env.API_ADMIN_USERNAME,
      role: "admin"
    });

    return { token };
  }
}

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};
