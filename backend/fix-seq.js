import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("正在修復 Orders ID 序列...");
  
  // 1. 找出目前最大的訂單 ID
  const maxOrder = await prisma.orders.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true }
  });

  let nextId = 6001688; // 預設起始值
  if (maxOrder && maxOrder.id >= nextId) {
    nextId = maxOrder.id + 1;
  }

  console.log(`目前最大 ID: ${maxOrder?.id || '無'}, 下一個 ID 設定為: ${nextId}`);

  // 2. 強制更新序列
  // 注意：Prisma 的 executeRaw 需要完整的 SQL 字串
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"orders"', 'id'), ${nextId}, false)`);
  
  console.log("✅ ID 序列修復完成！");
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
