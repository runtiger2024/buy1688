import express from "express";
import prisma from "../db.js";
import { authenticateToken, isAdmin } from "../middleware.js";
import { hashPassword } from "../auth.js";

const router = express.Router();

// --- 系統設定 (匯率/服務費/銀行資訊) ---
// 公開讀取
router.get("/settings", async (req, res, next) => {
  try {
    const settings = await prisma.systemSettings.findMany();
    const obj = {};
    // 自動將所有設定轉為 key-value 物件
    settings.forEach((s) => {
      // 如果是數字就轉數字，否則維持字串 (例如銀行資訊)
      const numVal = parseFloat(s.value);
      obj[s.key] = isNaN(numVal) ? s.value : numVal;
      // 特例：銀行帳號可能是純數字字串，不應轉成 float (會丟失前導0)，這裡做個簡單判斷
      // [優化] 集中判斷不需要轉換為數字的 key
      if (["bank_account", "bank_name", "bank_account_name"].includes(s.key)) {
        obj[s.key] = s.value;
      }
    });
    res.json(obj);
  } catch (err) {
    next(err);
  }
});

// Admin 更新
router.put("/settings", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    // 接收所有可能的設定欄位
    const {
      exchange_rate,
      service_fee,
      bank_name,
      bank_account,
      bank_account_name,
    } = req.body;

    const updates = [];

    // [優化] 確保傳入的數值是數字或可以轉為字串
    if (exchange_rate !== undefined)
      updates.push({ key: "exchange_rate", value: String(exchange_rate) });
    if (service_fee !== undefined)
      updates.push({ key: "service_fee", value: String(service_fee) });

    // [新增] 銀行資訊設定
    if (bank_name !== undefined)
      updates.push({ key: "bank_name", value: bank_name });
    if (bank_account !== undefined)
      updates.push({ key: "bank_account", value: bank_account });
    if (bank_account_name !== undefined)
      updates.push({ key: "bank_account_name", value: bank_account_name });

    // 批次更新 (使用 Promise.all)
    await Promise.all(
      updates.map((setting) =>
        prisma.systemSettings.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: { key: setting.key, value: setting.value },
        })
      )
    );

    res.json({ message: "設定已更新" });
  } catch (err) {
    next(err);
  }
});

// ... (下方的 warehouses, categories, users, dashboard/stats 等程式碼保持不變) ...
// --- 倉庫管理 ---
router.get("/warehouses", async (req, res, next) => {
  try {
    const warehouses = await prisma.warehouses.findMany({
      orderBy: { id: "asc" },
    });
    res.json(warehouses);
  } catch (err) {
    next(err);
  }
});
router.put(
  "/warehouses/:id",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const updated = await prisma.warehouses.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// --- 分類管理 ---
router.get("/categories", async (req, res, next) => {
  try {
    const categories = await prisma.categories.findMany({
      orderBy: { id: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});
router.post(
  "/categories",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const category = await prisma.categories.create({ data: req.body });
      res.status(201).json(category);
    } catch (err) {
      if (err.code === "P2002")
        return res.status(409).json({ message: "名稱重複" });
      next(err);
    }
  }
);
router.put(
  "/categories/:id",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const updated = await prisma.categories.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);
router.delete(
  "/categories/:id",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      await prisma.categories.delete({
        where: { id: parseInt(req.params.id) },
      });
      res.json({ message: "已刪除" });
    } catch (err) {
      if (err.code === "P2003")
        return res.status(400).json({ message: "分類下仍有商品，無法刪除" });
      next(err);
    }
  }
);

// --- 人員管理 (Admin Only) ---
router.get("/users", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        created_at: true,
      },
      orderBy: { id: "asc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});
router.post("/users", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    const hashedPassword = await hashPassword(password);
    const user = await prisma.users.create({
      data: { username, password_hash: hashedPassword, role, status: "active" },
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ message: "帳號已存在" });
    next(err);
  }
});
router.put(
  "/users/:id/status",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      if (parseInt(req.params.id) === req.user.id)
        return res.status(400).json({ message: "不能停權自己" });
      const updated = await prisma.users.update({
        where: { id: parseInt(req.params.id) },
        data: { status: req.body.status },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// --- 績效統計 (Dashboard) ---
router.get(
  "/dashboard/stats",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const stats = await prisma.orders.aggregate({
        _sum: { total_amount_twd: true, total_cost_cny: true },
        where: { status: { not: "Cancelled" }, payment_status: "PAID" },
      });

      const statusCountsRaw = await prisma.orders.groupBy({
        by: ["status"],
        _count: { status: true },
      });
      const statusCounts = statusCountsRaw.reduce(
        (acc, row) => ({ ...acc, [row.status]: row._count.status }),
        {}
      );

      const payRaw = await prisma.orders.groupBy({
        by: ["payment_status"],
        _count: { _all: true },
      });
      const paymentStatusCounts = payRaw.reduce(
        (acc, row) => ({ ...acc, [row.payment_status]: row._count._all }),
        {}
      );

      res.json({
        totalRevenueTWD: stats._sum.total_amount_twd || 0,
        // [優化] 確保是數字類型
        totalCostCNY: Number(stats._sum.total_cost_cny) || 0.0,
        statusCounts: {
          Pending: statusCounts.Pending || 0,
          Processing: statusCounts.Processing || 0,
          Shipped_Internal: statusCounts.Shipped_Internal || 0,
          Warehouse_Received: statusCounts.Warehouse_Received || 0,
          Completed: statusCounts.Completed || 0,
          Cancelled: statusCounts.Cancelled || 0,
        },
        paymentStatusCounts: {
          UNPAID: paymentStatusCounts.UNPAID || 0,
          PAID: paymentStatusCounts.PAID || 0,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
