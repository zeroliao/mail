-- AlterTable
ALTER TABLE "Account" ADD COLUMN "lastSyncAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "folder" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "fromAddress" JSONB,
    "toAddresses" JSONB,
    "ccAddresses" JSONB,
    "bccAddresses" JSONB,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" DATETIME,
    "sentAt" DATETIME,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MailMessage" ("accountId", "bccAddresses", "bodyHtml", "bodyText", "ccAddresses", "createdAt", "folder", "fromAddress", "hasAttachments", "id", "isRead", "providerMessageId", "rawPayload", "receivedAt", "sentAt", "snippet", "subject", "threadId", "toAddresses", "updatedAt") SELECT "accountId", "bccAddresses", "bodyHtml", "bodyText", "ccAddresses", "createdAt", "folder", "fromAddress", "hasAttachments", "id", "isRead", "providerMessageId", "rawPayload", "receivedAt", "sentAt", "snippet", "subject", "threadId", "toAddresses", "updatedAt" FROM "MailMessage";
DROP TABLE "MailMessage";
ALTER TABLE "new_MailMessage" RENAME TO "MailMessage";
CREATE INDEX "MailMessage_accountId_receivedAt_idx" ON "MailMessage"("accountId", "receivedAt");
CREATE UNIQUE INDEX "MailMessage_accountId_providerMessageId_key" ON "MailMessage"("accountId", "providerMessageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
