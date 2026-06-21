import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 仅清理 bind-oauth e2e 测试残留的 mock 账号（accessToken 为非 JWT 假串，污染账号池导致取邮件 502）。
// 采用软删除（deletedAt + ARCHIVED），与现有 deleteAccount 语义一致、可逆、不物理删数据。
const MOCK_ACCOUNT_ID = "cmqf90oov0000om6cl61bf8ys";
const MOCK_EMAIL = "e2e-owner@hotmail.com";

async function main() {
  const target = await prisma.account.findFirst({
    where: { id: MOCK_ACCOUNT_ID, email: MOCK_EMAIL }
  });

  if (!target) {
    console.log("NO_MATCH: 未找到匹配的 mock 账号（可能已被清理）。");
    return;
  }

  if (target.deletedAt) {
    console.log("ALREADY_DELETED:", target.id, target.email, "deletedAt=", target.deletedAt.toISOString());
    return;
  }

  const updated = await prisma.account.update({
    where: { id: MOCK_ACCOUNT_ID },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
    select: { id: true, email: true, status: true, deletedAt: true }
  });

  console.log("SOFT_DELETED:", JSON.stringify(updated));

  const activeRemaining = await prisma.account.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, provider: true, status: true }
  });
  console.log("ACTIVE_REMAINING", activeRemaining.length);
  for (const a of activeRemaining) {
    console.log(JSON.stringify(a));
  }
}

main()
  .catch((e) => {
    console.error("ERR", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
