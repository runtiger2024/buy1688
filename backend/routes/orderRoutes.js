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

// ... (保留 POST /api/orders 一般訂單路由，若需要也可更新 share_token 邏輯，暫時略過以節省篇幅) ...
// --- 建立一般訂單 ---
router.post("/", async (req, res, next) => {
  const schema = Joi.object({
    paopaoId: Joi.string().required(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
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
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // 匯款資訊
    let paymentDetails = null;
    if (value.payment_method === "OFFLINE_TRANSFER") {
      paymentDetails = {
        bank_name: "範例銀行 (822)",
        account_number: "12345678901234",
        account_name: "跑得快國際貿易有限公司",
        note: `請匯款 TWD ${totalTwd} 元，並告知客服訂單編號 (${newOrder.id})。`,
      };
    }

    sendOrderConfirmationEmail(newOrder, paymentDetails).catch(console.error);
    res
      .status(201)
      .json({
        message: "訂單建立成功",
        order: newOrder,
        payment_details: paymentDetails,
      });
  } catch (err) {
    next(err);
  }
});

// --- [修改] 建立代購訂單 (回傳 Share Token 與 動態銀行資訊) ---
router.post("/assist", async (req, res, next) => {
  const schema = Joi.object({
    paopaoId: Joi.string().required(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
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
    // 1. 讀取設定 (匯率 + 銀行資訊)
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
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // 生成動態付款說明
    let paymentDetails = null;
    if (value.payment_method === "OFFLINE_TRANSFER") {
      paymentDetails = {
        ...bankInfo,
        note: `代購訂單已提交！預估金額 TWD ${totalTwd}。\n銀行：${bankInfo.bank_name}\n帳號：${bankInfo.bank_account}\n戶名：${bankInfo.bank_account_name}`,
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

    // 讀取銀行資訊以回傳給分享頁
    const settings = await prisma.systemSettings.findMany();
    const config = {};
    settings.forEach((s) => (config[s.key] = s.value));
    const bankInfo = {
      bank_name: config.bank_name || "未設定",
      bank_account: config.bank_account || "未設定",
      bank_account_name: config.bank_account_name || "未設定",
    };

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

// ... (其餘路由保持不變: /my, /operator, /admin, /:id) ...
// --- 客戶查詢訂單 ---
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
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// --- 操作員查詢 ---
router.get(
  "/operator",
  authenticateToken,
  isOperator,
  async (req, res, next) => {
    try {
      const orders = await prisma.orders.findMany({
        include: { operator: { select: { username: true } } },
        orderBy: { created_at: "asc" },
      });
      res.json(
        orders.map((o) => ({ ...o, operator_name: o.operator?.username }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// --- 管理員查詢 ---
router.get("/admin", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(orders);
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
    if (operator_id !== undefined && req.user.role === "admin") {
      data.operator_id = operator_id ? parseInt(operator_id) : null;
    }

    const updated = await prisma.orders.update({
      where: { id: parseInt(req.params.id) },
      data,
    });

    if (payment_status === "PAID")
      sendPaymentReceivedEmail(updated).catch(console.error);
    else if (status) sendOrderStatusUpdateEmail(updated).catch(console.error);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
