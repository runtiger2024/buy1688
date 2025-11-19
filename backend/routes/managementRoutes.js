// backend/routes/managementRoutes.js
import express from "express";
import prisma from "../db.js";
import { authenticateToken, isAdmin } from "../middleware.js";
import { hashPassword } from "../auth.js";

const router = express.Router();

// --- 系統設定 (匯率/服務費/銀行資訊) ---
router.get("/settings", async (req, res, next) => {
  try {
    const settings = await prisma.systemSettings.findMany();
    const obj = {};
    settings.forEach((s) => {
      const numVal = parseFloat(s.value);
      obj[s.key] = isNaN(numVal) ? s.value : numVal;
      if (["bank_account", "bank_name", "bank_account_name"].includes(s.key)) {
        obj[s.key] = s.value;
      }
    });
    res.json(obj);
  } catch (err) {
    next(err);
  }
});

router.put("/settings", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const {
      exchange_rate,
      service_fee,
      bank_name,
      bank_account,
      bank_account_name,
    } = req.body;

    const updates = [];
    if (exchange_rate !== undefined)
      updates.push({ key: "exchange_rate", value: String(exchange_rate) });
    if (service_fee !== undefined)
      updates.push({ key: "service_fee", value: String(service_fee) });
    if (bank_name !== undefined)
      updates.push({ key: "bank_name", value: bank_name });
    if (bank_account !== undefined)
      updates.push({ key: "bank_account", value: bank_account });
    if (bank_account_name !== undefined)
      updates.push({ key: "bank_account_name", value: bank_account_name });

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

router.post(
  "/warehouses",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const { name, receiver, phone, address, is_active } = req.body;
      if (!name || !receiver || !phone || !address) {
        return res.status(400).json({ message: "請填寫所有必填欄位" });
      }
      const newWarehouse = await prisma.warehouses.create({
        data: {
          name,
          receiver,
          phone,
          address,
          is_active: is_active ?? true,
        },
      });
      res.status(201).json(newWarehouse);
    } catch (err) {
      if (err.code === "P2002")
        return res.status(409).json({ message: "倉庫名稱重複" });
      next(err);
    }
  }
);

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

// --- 人員管理 ---
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
router.put(
  "/users/:id/role",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { role } = req.body;
      if (id === req.user.id) {
        return res.status(400).json({ message: "不能修改自己的權限" });
      }
      if (!["admin", "operator"].includes(role)) {
        return res.status(400).json({ message: "無效的角色設定" });
      }
      const updated = await prisma.users.update({
        where: { id },
        data: { role },
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
      // 1. 財務統計
      const stats = await prisma.orders.aggregate({
        _sum: { total_amount_twd: true, total_cost_cny: true },
        where: { status: { not: "Cancelled" }, payment_status: "PAID" },
      });

      // 2. 狀態計數
      const statusCountsRaw = await prisma.orders.groupBy({
        by: ["status"],
        _count: { status: true },
      });
      const statusCounts = statusCountsRaw.reduce(
        (acc, row) => ({ ...acc, [row.status]: row._count.status }),
        {}
      );

      // 3. 付款狀態計數
      const payRaw = await prisma.orders.groupBy({
        by: ["payment_status"],
        _count: { _all: true },
      });
      const paymentStatusCounts = payRaw.reduce(
        (acc, row) => ({ ...acc, [row.payment_status]: row._count._all }),
        {}
      );

      // 4. [新增] 待核銷憑證計數 (有上傳憑證 但 尚未付款)
      const pendingVoucherCount = await prisma.orders.count({
        where: {
          payment_status: "UNPAID",
          payment_voucher_url: { not: null },
        },
      });

      res.json({
        totalRevenueTWD: stats._sum.total_amount_twd || 0,
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
        pendingVoucherCount, // 回傳新統計
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
