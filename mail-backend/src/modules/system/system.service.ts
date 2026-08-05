import { MailProvider } from "@prisma/client";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/errors";

export type ShutdownScheduler = () => void | Promise<void>;

export const isLoopbackAddress = (address: string) =>
  address === "::1" ||
  address.startsWith("127.") ||
  address.startsWith("::ffff:127.");

export const scheduleServiceShutdown: ShutdownScheduler = async () => {
  if (process.platform !== "win32") {
    throw new AppError(
      "Service shutdown is only available on the local Windows launcher",
      501,
    );
  }

  const projectRoot = path.resolve(__dirname, "../../../..");
  const shutdownLauncher = path.join(projectRoot, "launch-stop.ps1");
  const stopScript = path.join(projectRoot, "stop.ps1");
  const powershell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );

  if (
    !existsSync(shutdownLauncher) ||
    !existsSync(stopScript) ||
    !existsSync(powershell)
  ) {
    throw new AppError("Local stop command is unavailable", 503);
  }

  await new Promise<void>((resolve, reject) => {
    const launcher = spawn(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        shutdownLauncher,
        "-DelayMilliseconds",
        "1200",
      ],
      {
        cwd: projectRoot,
        stdio: "ignore",
        windowsHide: true,
      },
    );

    launcher.once("error", () => {
      reject(new AppError("Unable to start local shutdown command", 503));
    });
    launcher.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new AppError("Local shutdown command failed to start", 503));
    });
  });
};

export class SystemService {
  async getHealth() {
    const databaseOk = await prisma
      .$queryRawUnsafe("SELECT 1")
      .then(() => true)
      .catch(() => false);

    return {
      status: "ok",
      database: {
        ok: databaseOk,
      },
      oauthProviders: {
        gmailConfigured: Boolean(
          env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
        ),
        microsoftConfigured: Boolean(
          env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET,
        ),
      },
    };
  }

  getOAuthProviderConfig() {
    return {
      gmail: {
        enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        callbackUrl: env.GOOGLE_OAUTH_REDIRECT_URI,
      },
      microsoft: {
        enabled: Boolean(
          env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET,
        ),
        callbackUrl: env.MICROSOFT_OAUTH_REDIRECT_URI,
        tenantId: env.MICROSOFT_TENANT_ID,
      },
    };
  }

  resolveProvider(input: string) {
    const value = input.toLowerCase();
    if (value === "gmail" || value === "google") {
      return MailProvider.GOOGLE;
    }
    if (value === "microsoft" || value === "outlook" || value === "hotmail") {
      return MailProvider.MICROSOFT;
    }
    return null;
  }
}
