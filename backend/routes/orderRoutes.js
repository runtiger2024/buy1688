// backend/routes/orderRoutes.js
import express from "express";
import Joi from "joi";
import prisma from "../db.js";
import {
  authenticateToken,
  isCustomer,
  isOperator,
  isAdmin,
} from "../middleware.js";
import {
  sendOrderConfirmationEmail,
  sendPaymentReceivedEmail,
  sendOrderStatusUpdateEmail,
} from "../emailService.js";

const router = express.Router();

// --- [優化] 共通函式：載入系統設定與銀行資訊 ---
async function getSettingsAndBankInfo() {
  const settings = await prisma.systemSettings.findMany();
  const config = {};
  settings.forEach((s) => (config[s.key] = s.value));

  const rate = parseFloat(config.exchange_rate) || 4.5;
  const fee = parseFloat(config.service_fee) || 0;
  const bankInfo = {
    bank_name: config.bank_name || "未設定銀行",
    bank_account: config.bank_account || "未設定帳號",
    bank_account_name: config.bank_account_name || "未設定戶名",
  };

  return { rate, fee, bankInfo };
}
// --- 共通函式結束 ---

// --- 建立一般訂單 ---
router.post("/", async (req, res, next) => {
  const schema = Joi.object({
    paopaoId: Joi.string().required(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
    // [新增] 驗證 warehouse_id
    warehouse_id: Joi.number().integer().min(1).required(),
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
        })
      )
      .min(1)
      .required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    // 1. 讀取設定 (用於匯款資訊)
    const { bankInfo } = await getSettingsAndBankInfo();

    const productIds = value.items.map((item) => parseInt(item.id));
    const products = await prisma.products.findMany({
      where: { id: { in: productIds }, is_archived: false },
    });
    const productsMap = products.reduce(
      (acc, p) => ({ ...acc, [p.id]: p }),
      {}
    );

    let totalTwd = 0;
    let totalCny = 0;
    const orderItemsData = [];

    for (const item of value.items) {
      const product = productsMap[item.id];
      if (!product) throw new Error(`商品 ID ${item.id} 不存在或已下架`);

      const qty = parseInt(item.quantity);
      totalTwd += product.price_twd * qty;

      // 浮點數修正
      totalCny =
        Math.round((totalCny + Number(product.cost_cny) * qty) * 100) / 100;

      orderItemsData.push({
        product_id: product.id,
        quantity: qty,
        snapshot_name: product.name,
        snapshot_price_twd: product.price_twd,
        snapshot_cost_cny: product.cost_cny,
      });
    }

    // [新增] 檢查倉庫 ID 是否有效
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: value.warehouse_id, is_active: true },
    });
    if (!warehouse) throw new Error("無效的集運倉 ID");

    // share_token 會由 DB 自動生成 (@default(uuid))
    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: value.paopaoId,
        customer_email: value.customerEmail,
        total_amount_twd: totalTwd,
        total_cost_cny: totalCny,
        status: "Pending",
        type: "Standard",
        payment_method: value.payment_method,
        // [新增] 儲存 warehouse_id
        warehouse_id: value.warehouse_id,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // 匯款資訊 (使用動態讀取的銀行資訊)
    let paymentDetails = null;
    if (value.payment_method === "OFFLINE_TRANSFER") {
      paymentDetails = {
        bank_name: bankInfo.bank_name,
        account_number: bankInfo.bank_account,
        account_name: bankInfo.bank_account_name,
        // [優化] 備註文字更清晰
        note: `銀行：${bankInfo.bank_name}\n帳號：${bankInfo.bank_account}\n戶名：${bankInfo.bank_account_name}\n\n請匯款 TWD ${totalTwd} 元，並告知客服訂單編號 (${newOrder.id})。`,
      };
    }

    sendOrderConfirmationEmail(newOrder, paymentDetails).catch(console.error);
    res.status(201).json({
      message: "訂單建立成功",
      order: newOrder,
      payment_details: paymentDetails,
    });
  } catch (err) {
    next(err);
  }
});

// --- [新增] 憑證上傳路由 (客戶端使用) ---
router.post(
  "/:id/voucher",
  authenticateToken,
  isCustomer,
  async (req, res, next) => {
    const { voucherUrl } = req.body;
    const orderId = parseInt(req.params.id);

    const schema = Joi.object({
      voucherUrl: Joi.string().uri().required(),
    });
    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: "無效的憑證 URL" });

    try {
      const order = await prisma.orders.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ message: "找不到訂單" });

      // 驗證客戶身份 (透過 paopao_id)
      if (order.paopao_id !== req.user.paopao_id)
        return res.status(403).json({ message: "無權操作此訂單" });

      // 只能對待付款訂單上傳憑證
      if (order.payment_status !== "UNPAID")
        return res.status(400).json({ message: "該訂單狀態無法上傳憑證" });

      const updatedOrder = await prisma.orders.update({
        where: { id: orderId },
        data: {
          payment_voucher_url: voucherUrl,
          // 註記：上傳憑證不自動改為 PAID，仍需管理員手動確認
          notes:
            (order.notes || "") +
            `\n[系統自動註記] 客戶已於 ${new Date().toLocaleString(
              "zh-TW"
            )} 上傳匯款憑證。`,
        },
      });

      res.json({
        message: "匯款憑證已上傳，待管理員確認。",
        order: updatedOrder,
      });
    } catch (err) {
      next(err);
    }
  }
);

// --- [修改] 建立代購訂單 (回傳 Share Token 與 動態銀行資訊) ---
router.post("/assist", async (req, res, next) => {
  const schema = Joi.object({
    paopaoId: Joi.string().required(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
    // [新增] 驗證 warehouse_id
    warehouse_id: Joi.number().integer().min(1).required(),
    items: Joi.array()
      .items(
        Joi.object({
          item_url: Joi.string().uri().required(),
          item_name: Joi.string().required(),
          item_spec: Joi.string().allow("").optional(),
          price_cny: Joi.number().min(0).required(),
          quantity: Joi.number().integer().min(1).required(),
        })
      )
      .min(1)
      .required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    // 1. 讀取設定 (匯率 + 銀行資訊) (使用共通函式)
    const { rate, fee, bankInfo } = await getSettingsAndBankInfo();

    // [新增] 檢查倉庫 ID 是否有效
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: value.warehouse_id, is_active: true },
    });
    if (!warehouse) throw new Error("無效的集運倉 ID");

    let totalTwd = 0;
    let totalCny = 0;
    const orderItemsData = [];

    for (const item of value.items) {
      const qty = parseInt(item.quantity);
      const cny = parseFloat(item.price_cny);

      totalCny = Math.round((totalCny + cny * qty) * 100) / 100;
      const itemTwd = Math.ceil(cny * rate * (1 + fee));
      totalTwd += itemTwd * qty;

      orderItemsData.push({
        item_url: item.item_url,
        item_spec: item.item_spec,
        quantity: qty,
        snapshot_name: item.item_name,
        snapshot_cost_cny: cny,
        snapshot_price_twd: itemTwd,
      });
    }

    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: value.paopaoId,
        customer_email: value.customerEmail,
        total_amount_twd: totalTwd,
        total_cost_cny: totalCny,
        status: "Pending",
        type: "Assist",
        payment_method: value.payment_method,
        // [新增] 儲存 warehouse_id
        warehouse_id: value.warehouse_id,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // 生成動態付款說明
    let paymentDetails = null;
    if (value.payment_method === "OFFLINE_TRANSFER") {
      paymentDetails = {
        ...bankInfo,
        // [優化] 備註文字更清晰
        note: `銀行：${bankInfo.bank_name}\n帳號：${bankInfo.bank_account}\n戶名：${bankInfo.bank_account_name}\n\n代購訂單已提交！預估金額 TWD ${totalTwd}。\n請匯款後聯繫客服，並告知訂單編號 (${newOrder.id})。`,
      };
    }

    sendOrderConfirmationEmail(newOrder, paymentDetails).catch(console.error);

    res.status(201).json({
      message: "代購申請已提交",
      order: newOrder, // 這裡面現在包含了 share_token
      payment_details: paymentDetails,
    });
  } catch (err) {
    next(err);
  }
});

// --- [新增] 公開查詢訂單 (透過 Share Token) ---
router.get("/share/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const order = await prisma.orders.findUnique({
      where: { share_token: token },
      include: {
        items: {
          select: {
            snapshot_name: true,
            item_url: true,
            item_spec: true,
            quantity: true,
            snapshot_price_twd: true,
          },
        },
      },
    });

    if (!order) return res.status(404).json({ message: "找不到訂單" });

    // 讀取銀行資訊以回傳給分享頁 (使用共通函式)
    const { bankInfo } = await getSettingsAndBankInfo();

    // 為了隱私，只回傳必要欄位
    const safeOrder = {
      id: order.id,
      paopao_id: order.paopao_id,
      total_amount_twd: order.total_amount_twd,
      status: order.status,
      payment_status: order.payment_status,
      created_at: order.created_at,
      items: order.items,
      bank_info: bankInfo, // 附帶銀行資訊
    };

    res.json(safeOrder);
  } catch (err) {
    next(err);
  }
});

// --- 客戶查詢訂單 ---
// [優化] 路由變更為 /my，並在 server.js 中設定 /orders/my 的路由
router.get("/my", authenticateToken, isCustomer, async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { paopao_id: req.user.paopao_id },
      include: {
        items: {
          select: {
            quantity: true,
            snapshot_name: true,
            snapshot_price_twd: true,
            // [新增] 包含 assist order 必要的資訊
            item_url: true,
            item_spec: true,
          },
        },
        warehouse: { select: { name: true } }, // 加入 warehouse info
      },
      orderBy: { created_at: "desc" },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// --- 操作員查詢 ---
// [優化] 路由變更為 /operator，並在 server.js 中設定 /orders/operator 的路由
router.get(
  "/operator",
  authenticateToken,
  isOperator,
  async (req, res, next) => {
    try {
      const orders = await prisma.orders.findMany({
        include: {
          operator: { select: { username: true } },
          warehouse: { select: { name: true } }, // [修改] Include warehouse info
          items: {
            select: {
              quantity: true,
              snapshot_cost_cny: true,
            },
          },
        },
        orderBy: { created_at: "asc" },
      });
      // [優化] 計算預估成本總和
      const ordersWithCost = orders.map((o) => {
        const totalCostCny = o.items.reduce(
          (sum, item) => sum + Number(item.snapshot_cost_cny) * item.quantity,
          0
        );

        // 確保精確度
        return {
          ...o,
          total_cost_cny: Number(o.total_cost_cny), // 轉為 Number 方便前端計算
          operator_name: o.operator?.username,
          warehouse_name: o.warehouse?.name,
        };
      });

      res.json(ordersWithCost);
    } catch (err) {
      next(err);
    }
  }
);

// --- 管理員查詢 ---
// [優化] 路由變更為 /admin，並在 server.js 中設定 /orders/admin 的路由
router.get("/admin", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      include: {
        warehouse: { select: { name: true } }, // [修改] Include warehouse info
        items: {
          select: {
            quantity: true,
            snapshot_cost_cny: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    // [優化] 計算預估成本總和 (與 operator 路由邏輯相似，但資料可能更多)
    const ordersWithCost = orders.map((o) => {
      const totalCostCny = o.items.reduce(
        (sum, item) => sum + Number(item.snapshot_cost_cny) * item.quantity,
        0
      );

      return {
        ...o,
        total_cost_cny: Number(o.total_cost_cny),
        warehouse_name: o.warehouse?.name,
      };
    });

    res.json(ordersWithCost);
  } catch (err) {
    next(err);
  }
});

// --- 操作員/管理員 更新訂單 ---
router.put("/:id", authenticateToken, isOperator, async (req, res, next) => {
  try {
    const { status, notes, payment_status, operator_id } = req.body;
    const data = {};
    if (status) data.status = status;
    if (notes) data.notes = notes;
    if (payment_status) data.payment_status = payment_status;

    // 只有 admin 可以指派 operator_id
    if (operator_id !== undefined && req.user.role === "admin") {
      // 如果傳入空字串或 0，則設為 null
      data.operator_id = operator_id ? parseInt(operator_id) : null;
    }
    // [修正] 如果是 operator 且嘗試指派，應該擋掉，但 middleware.js 已經用 isOperator 驗證了。
    // 這裡只需要確保非 admin 無法修改 operator_id

    const updated = await prisma.orders.update({
      where: { id: parseInt(req.params.id) },
      data,
    });

    // 發送 Email
    if (payment_status === "PAID")
      sendPaymentReceivedEmail(updated).catch(console.error);
    // [優化] 只有狀態改變才發送狀態更新郵件
    else if (status && status !== updated.status)
      sendOrderStatusUpdateEmail(updated).catch(console.error);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
