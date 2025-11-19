import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth.js"; // 引用 auth.js 的加密功能
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("開始填充 (Seeding) 資料庫...");

  // 1. 填充倉庫資料
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
    where: { name: "东莞倉" },
    update: {},
    create: {
      name: "东莞倉",
      receiver: "跑跑虎轉(會員編號)",
      phone: "13682536948",
      address: "中国广东省东莞市洪梅镇振華路688號2號樓跑跑虎(會員編號)",
    },
  });

  await prisma.warehouses.upsert({
    where: { name: "义乌倉" },
    update: {},
    create: {
      name: "义乌倉",
      receiver: "跑跑虎轉(會員編號)",
      phone: "13682536948",
      address: "中国浙江省金华市义乌市江东街道东新路19号1号楼跑跑虎(會員編號)",
    },
  });
  console.log("✅ 倉庫資料填充完畢。");

  // --- 【第十四批優化：填充預設系統設定】 ---
  // 1. 匯率 (CNY -> TWD)
  await prisma.systemSettings.upsert({
    where: { key: "exchange_rate" },
    update: {},
    create: {
      key: "exchange_rate",
      value: "4.5", // 預設匯率
      description: "人民幣轉台幣匯率",
    },
  });

  // 2. 代購服務費率 (百分比，例如 0.05 代表 5%)
  await prisma.systemSettings.upsert({
    where: { key: "service_fee" },
    update: {},
    create: {
      key: "service_fee",
      value: "0", // 預設 0%
      description: "代購服務費率 (小數點，如 0.1 為 10%)",
    },
  });

  // [新增] 銀行資訊設定
  await prisma.systemSettings.upsert({
    where: { key: "bank_name" },
    update: {},
    create: {
      key: "bank_name",
      value: "玉山銀行 (808)",
      description: "收款銀行名稱/代碼",
    },
  });
  await prisma.systemSettings.upsert({
    where: { key: "bank_account" },
    update: {},
    create: {
      key: "bank_account",
      value: "12345678901234",
      description: "收款銀行帳號",
    },
  });
  await prisma.systemSettings.upsert({
    where: { key: "bank_account_name" },
    update: {},
    create: {
      key: "bank_account_name",
      value: "跑得快國際貿易有限公司",
      description: "收款銀行戶名",
    },
  });

  console.log("✅ 系統設定填充完畢。");
  // --- 【優化結束】 ---

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
