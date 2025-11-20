// backend/routes/managementRoutes.js
import express from "express";
import prisma from "../db.js";
import {
  authenticateToken,
  isAdmin,
  isOperator,
  canManageFinance,
} from "../middleware.js";
import { hashPassword } from "../auth.js";
import Joi from "joi"; // 確保 Joi 有引入

const router = express.Router();

// --- 系統設定 (匯率/服務費/銀行/API整合/通知開關) ---

router.get("/settings", async (req, res, next) => {
  try {
    const settings = await prisma.systemSettings.findMany();
    const obj = {};
    settings.forEach((s) => {
      const numVal = parseFloat(s.value);
      // 針對非數值欄位 (API Key, ID, 開關等) 保持字串格式
      const isNumericField = ["exchange_rate", "service_fee"].includes(s.key);
      obj[s.key] = isNumericField && !isNaN(numVal) ? numVal : s.value;
    });
    res.json(obj);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/settings",
  authenticateToken,
  canManageFinance,
  async (req, res, next) => {
    try {
      const {
        exchange_rate,
        service_fee,
        bank_name,
        bank_account,
        bank_account_name,
        // Email
        email_api_key,
        email_from_email,
        // 發票
        invoice_merchant_id,
        invoice_api_key,
        // 金流
        payment_merchant_id,
        payment_api_key,
        // [新增] 通知開關
        enable_email_register,
        enable_email_order,
        enable_email_payment,
        enable_email_status,
      } = req.body;

      const updates = [];

      // 基礎設定
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

      // Email 設定
      if (email_api_key !== undefined)
        updates.push({ key: "email_api_key", value: email_api_key });
      if (email_from_email !== undefined)
        updates.push({ key: "email_from_email", value: email_from_email });

      // 發票設定
      if (invoice_merchant_id !== undefined)
        updates.push({
          key: "invoice_merchant_id",
          value: invoice_merchant_id,
        });
      if (invoice_api_key !== undefined)
        updates.push({ key: "invoice_api_key", value: invoice_api_key });

      // 金流設定
      if (payment_merchant_id !== undefined)
        updates.push({
          key: "payment_merchant_id",
          value: payment_merchant_id,
        });
      if (payment_api_key !== undefined)
        updates.push({ key: "payment_api_key", value: payment_api_key });

      // [新增] 通知開關設定 (轉為字串儲存)
      if (enable_email_register !== undefined)
        updates.push({
          key: "enable_email_register",
          value: String(enable_email_register),
        });
      if (enable_email_order !== undefined)
        updates.push({
          key: "enable_email_order",
          value: String(enable_email_order),
        });
      if (enable_email_payment !== undefined)
        updates.push({
          key: "enable_email_payment",
          value: String(enable_email_payment),
        });
      if (enable_email_status !== undefined)
        updates.push({
          key: "enable_email_status",
          value: String(enable_email_status),
        });

      await Promise.all(
        updates.map((setting) =>
          prisma.systemSettings.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: { key: setting.key, value: setting.value },
          })
        )
      );

      res.json({ message: "系統設定已更新" });
    } catch (err) {
      next(err);
    }
  }
);

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

// --- 人員管理 (Staff) ---
router.get("/users", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        email: true,
        receive_notifications: true,
        // [新增] 彈性權限
        can_manage_products: true,
        can_manage_finance: true,
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
    const {
      username,
      password,
      role,
      email,
      receive_notifications,
      can_manage_products, // 新增
      can_manage_finance, // 新增
    } = req.body;

    const hashedPassword = await hashPassword(password);
    const user = await prisma.users.create({
      data: {
        username,
        password_hash: hashedPassword,
        role,
        status: "active",
        email: email || null,
        receive_notifications: receive_notifications || false,
        // [新增] 彈性權限
        can_manage_products: can_manage_products || false,
        can_manage_finance: can_manage_finance || false,
      },
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ message: "帳號已存在" });
    next(err);
  }
});

// [新增] 更新用戶彈性權限
router.put(
  "/users/:id/permissions",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      // 確保傳入的值是明確的布林值
      const can_manage_products =
        req.body.can_manage_products === true ||
        req.body.can_manage_products === "true";
      const can_manage_finance =
        req.body.can_manage_finance === true ||
        req.body.can_manage_finance === "true";

      const updated = await prisma.users.update({
        where: { id },
        data: {
          can_manage_products: can_manage_products,
          can_manage_finance: can_manage_finance,
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// [修改] 更新用戶基本資料 (Email / Notification)
router.put(
  "/users/:id/info",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { email, receive_notifications } = req.body;

      const updated = await prisma.users.update({
        where: { id },
        data: {
          email,
          receive_notifications: Boolean(receive_notifications),
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

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

router.put(
  "/users/:id/password",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "密碼長度至少需 6 碼" });
      }
      const hashedPassword = await hashPassword(password);
      await prisma.users.update({
        where: { id },
        data: { password_hash: hashedPassword },
      });
      res.json({ message: "密碼已重置" });
    } catch (err) {
      next(err);
    }
  }
);

// --- 會員(客戶)管理 ---
router.get("/customers", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const customers = await prisma.customers.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        paopao_id: true,
        email: true,
        phone: true,
        is_vip: true, // [新增] VIP 狀態
        created_at: true,
      },
    });
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/customers/:id",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { email, phone, is_vip } = req.body;

      const dataToUpdate = { email, phone };

      // [修改] 處理 is_vip 更新
      if (
        typeof is_vip === "boolean" ||
        is_vip === "true" ||
        is_vip === "false"
      ) {
        dataToUpdate.is_vip = is_vip === "true" || is_vip === true;
      }

      const updated = await prisma.customers.update({
        where: { id },
        data: dataToUpdate,
      });
      res.json(updated);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: "Email 或手機號碼已被使用" });
      }
      next(err);
    }
  }
);

router.put(
  "/customers/:id/password",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "密碼長度至少需 6 碼" });
      }
      const hashedPassword = await hashPassword(password);
      await prisma.customers.update({
        where: { id },
        data: { password_hash: hashedPassword },
      });
      res.json({ message: "會員密碼已重置" });
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
        pendingVoucherCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
