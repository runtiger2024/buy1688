import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth.js"; // 引用 auth.js 的加密功能
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("開始填充 (Seeding) 資料庫...");

  // 1. 填充倉庫資料
  // upsert = update or insert, 避免重複建立
  await prisma.warehouses.upsert({
    where: { name: "厦门漳州仓" },
    update: {},
    create: {
      name: "厦门漳州仓",
      receiver: "跑跑虎轉(會員編號)",
      phone: "13682536948",
      address:
        "中国福建省漳州市龙海区東園鎮倉里路普洛斯物流園A02庫1楼一分區1號門跑跑虎(會員編號)",
    },
  });

  await prisma.warehouses.upsert({
    where: { name: "东莞仓" },
    update: {},
    create: {
      name: "东莞仓",
      receiver: "跑跑虎轉(會員編號)",
      phone: "13682536948",
      address: "中国广东省东莞市洪梅镇振華路688號2號樓跑跑虎(會員編號)",
    },
  });

  await prisma.warehouses.upsert({
    where: { name: "义乌仓" },
    update: {},
    create: {
      name: "义乌仓",
      receiver: "跑跑虎轉(會員編號)",
      phone: "13682536948",
      address: "中国浙江省金华市义乌市江东街道东新路19号1号楼跑跑虎(會員編號)",
    },
  });
  console.log("✅ 倉庫資料填充完畢。");

  // 2. 建立預設管理員 (從 .env 讀取)
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const hashedPassword = await hashPassword(adminPassword);

    await prisma.users.upsert({
      where: { username: adminUsername },
      update: {
        password_hash: hashedPassword, // 如果已存在，就更新密碼
        role: "admin",
      },
      create: {
        username: adminUsername,
        password_hash: hashedPassword,
        role: "admin",
        status: "active",
      },
    });
    console.log(`✅ 管理員帳號 (${adminUsername}) 已確認/建立。`);
  } else {
    console.warn(
      "⚠️ 未在 .env 中找到 ADMIN_USERNAME 或 ADMIN_PASSWORD，跳過建立管理員。"
    );
    console.warn("   請在 .env 中加入這兩個變數，然後執行 npm run prisma:seed");
  }

  console.log("資料填充完畢。");
}

main()
  .catch((e) => {
    console.error("❌ 填充資料時發生錯誤:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
