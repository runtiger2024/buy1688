// backend/prisma/seed.js
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth.js";
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

  // --- 填充系統設定 (包含新功能) ---
  const defaultSettings = [
    { key: "exchange_rate", value: "4.5", description: "人民幣轉台幣匯率" },
    { key: "service_fee", value: "0", description: "代購服務費率" },
    { key: "bank_name", value: "玉山銀行 (808)", description: "收款銀行名稱" },
    {
      key: "bank_account",
      value: "12345678901234",
      description: "收款銀行帳號",
    },
    {
      key: "bank_account_name",
      value: "跑得快國際貿易有限公司",
      description: "收款銀行戶名",
    },

    // [新增] Email 通知設定 (SendGrid)
    { key: "email_api_key", value: "", description: "SendGrid API Key" },
    { key: "email_from_email", value: "", description: "系統發信 Email" },

    // [新增] 發票 API (未來擴充)
    { key: "invoice_merchant_id", value: "", description: "電子發票商店代號" },
    {
      key: "invoice_api_key",
      value: "",
      description: "電子發票 HashKey/API Key",
    },

    // [新增] 金流 API (未來擴充)
    { key: "payment_merchant_id", value: "", description: "金流商店代號" },
    { key: "payment_api_key", value: "", description: "金流 HashKey/API Key" },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSettings.upsert({
      where: { key: setting.key },
      update: {}, // 若存在則不覆蓋
      create: setting,
    });
  }
  console.log("✅ 系統設定填充完畢。");

  // 2. 建立預設管理員
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const hashedPassword = await hashPassword(adminPassword);
    await prisma.users.upsert({
      where: { username: adminUsername },
      update: { password_hash: hashedPassword },
      create: {
        username: adminUsername,
        password_hash: hashedPassword,
        role: "admin",
        status: "active",
      },
    });
    console.log(`✅ 管理員帳號 (${adminUsername}) 已確認/建立。`);
  }

  // 設定訂單 ID 序列
  try {
    const setSequenceSql = `SELECT setval(pg_get_serial_sequence('"orders"', 'id'), 6001687, false)`;
    await prisma.$executeRawUnsafe(setSequenceSql);
    console.log("✅ 訂單 ID 序列已設定為從 6001688 開始。");
  } catch (e) {
    console.error("❌ 設定訂單 ID 序列失敗 (可能已設定過):", e);
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
