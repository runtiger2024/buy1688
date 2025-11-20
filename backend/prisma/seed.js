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

    // 通知開關預設值
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

  // --- [全域修復] 自動修復所有資料表的 ID 序列 (Sequence) ---
  // 這段程式碼會檢查所有使用自動編號的表，並將計數器重置為當前最大 ID + 1
  // 可以防止 P2002 Unique constraint failed 錯誤
  const tableNames = [
    "users",
    "categories",
    "products",
    "warehouses",
    "customers",
    "order_items",
    "orders", // 訂單表放在最後，或單獨處理也可以
  ];

  for (const tableName of tableNames) {
    try {
      // 1. 找出該表目前最大的 ID
      // 注意：這裡使用 raw query 因為 Prisma 的 $queryRaw 比較靈活
      const result = await prisma.$queryRawUnsafe(
        `SELECT MAX(id) as max_id FROM "${tableName}";`
      );
      const maxId = result[0]?.max_id || 0;

      // 訂單表特殊處理：起始 ID 至少為 6001687
      let nextVal = Number(maxId);
      if (tableName === "orders" && nextVal < 6001687) {
        nextVal = 6001687;
      }

      // 2. 更新序列值 (Postgres 語法)
      // setval 的第三個參數 true 表示下一個值是 nextVal + 1
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), ${nextVal}, true);`
      );

      console.log(`🔧 已修復序列: ${tableName} (目前 Max ID: ${nextVal})`);
    } catch (e) {
      // 某些表可能沒有 id 序列 (例如 system_settings 如果手動管理)，忽略錯誤
      // console.log(`⚠️ 無法修復 ${tableName} 序列 (可能無此表或無序列):`, e.message);
    }
  }
  console.log("✅ 所有資料表 ID 序列校正完成。");
  // --- 修復結束 ---

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
