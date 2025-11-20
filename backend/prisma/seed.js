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

  // --- 填充系統設定 ---
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
    { key: "email_api_key", value: "", description: "SendGrid API Key" },
    { key: "email_from_email", value: "", description: "系統發信 Email" },
    { key: "invoice_merchant_id", value: "", description: "電子發票商店代號" },
    {
      key: "invoice_api_key",
      value: "",
      description: "電子發票 HashKey/API Key",
    },
    { key: "payment_merchant_id", value: "", description: "金流商店代號" },
    { key: "payment_api_key", value: "", description: "金流 HashKey/API Key" },

    // [新增] 通知開關預設值
    {
      key: "enable_email_register",
      value: "true",
      description: "開關：會員註冊成功通知信",
    },
    {
      key: "enable_email_order",
      value: "true",
      description: "開關：訂單建立確認信",
    },
    {
      key: "enable_email_payment",
      value: "true",
      description: "開關：收款確認通知信",
    },
    {
      key: "enable_email_status",
      value: "true",
      description: "開關：訂單狀態更新通知信",
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSettings.upsert({
      where: { key: setting.key },
      update: {},
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
      update: {
        password_hash: hashedPassword,
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
  }

  // --- [核心修正] 動態設定訂單 ID 序列 ---
  try {
    // 1. 找出目前資料庫中最大的訂單 ID
    const maxOrder = await prisma.orders.findFirst({
      orderBy: { id: "desc" },
      select: { id: true },
    });

    // 預設起始值為 6001687 (這樣下一筆會是 6001688)
    let nextSeqVal = 6001687;

    // 如果資料庫中已經有訂單，且 ID 比預設值大，就使用該 ID
    if (maxOrder && maxOrder.id > nextSeqVal) {
      nextSeqVal = maxOrder.id;
    }

    // 2. 設定序列值
    const setSequenceSql = `SELECT setval(pg_get_serial_sequence('"orders"', 'id'), ${nextSeqVal})`;

    await prisma.$executeRawUnsafe(setSequenceSql);

    console.log(
      `✅ 訂單 ID 序列已動態校正。目前最大 ID: ${nextSeqVal}，下一筆將是: ${
        nextSeqVal + 1
      }`
    );
  } catch (e) {
    console.error("❌ 設定訂單 ID 序列失敗:", e);
  }
  // --- 修正結束 ---

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
