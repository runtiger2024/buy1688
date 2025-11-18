import { PrismaClient } from "@prisma/client";

// 建立一個 PrismaClient 的單例 (singleton)
const prisma = new PrismaClient();

// 導出這個單例
export default prisma;
