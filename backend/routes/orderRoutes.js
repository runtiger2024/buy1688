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

// ... (建立訂單路由保持不變) ...
router.post("/", authenticateToken, isCustomer, async (req, res, next) => {
  // (保持不變，略過以節省篇幅，請保留原檔內容)
  // ...原本的 create order logic...
  const schema = Joi.object({
    paopaoId: Joi.string().allow("").optional(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
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
  // ... (這段與原檔相同，不變動)
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const { bankInfo } = await getSettingsAndBankInfo();
    const userPaopaoId = req.user.paopao_id;

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

    const warehouse = await prisma.warehouses.findUnique({
      where: { id: value.warehouse_id, is_active: true },
    });
    if (!warehouse) throw new Error("無效的集運倉 ID");

    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: userPaopaoId,
        customer_email: value.customerEmail,
        total_amount_twd: totalTwd,
        total_cost_cny: totalCny,
        status: "Pending",
        type: "Standard",
        payment_method: value.payment_method,
        warehouse_id: value.warehouse_id,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    let paymentDetails = null;
    if (value.payment_method === "OFFLINE_TRANSFER") {
      paymentDetails = {
        bank_name: bankInfo.bank_name,
        account_number: bankInfo.bank_account,
        account_name: bankInfo.bank_account_name,
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

// ... (憑證上傳路由保持不變) ...
router.post(
  "/:id/voucher",
  authenticateToken,
  isCustomer,
  async (req, res, next) => {
    const { voucherUrl } = req.body;
    const orderId = parseInt(req.params.id);

    const schema = Joi.object({
      voucherUrl: Joi.string().required().messages({
        "string.empty": "憑證內容不能為空",
      }),
    });
    const { error } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    try {
      const order = await prisma.orders.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ message: "找不到訂單" });

      if (order.paopao_id !== req.user.paopao_id)
        return res.status(403).json({ message: "無權操作此訂單" });

      if (order.payment_status !== "UNPAID")
        return res.status(400).json({ message: "該訂單狀態無法上傳憑證" });

      const updatedOrder = await prisma.orders.update({
        where: { id: orderId },
        data: {
          payment_voucher_url: voucherUrl,
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

// ... (代購訂單路由保持不變) ...
router.post(
  "/assist",
  authenticateToken,
  isCustomer,
  async (req, res, next) => {
    // ... (保留原檔內容)
    const schema = Joi.object({
      paopaoId: Joi.string().allow("").optional(),
      customerEmail: Joi.string().email().required(),
      payment_method: Joi.string().required(),
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
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    try {
      const { rate, fee, bankInfo } = await getSettingsAndBankInfo();
      const userPaopaoId = req.user.paopao_id;

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
          paopao_id: userPaopaoId,
          customer_email: value.customerEmail,
          total_amount_twd: totalTwd,
          total_cost_cny: totalCny,
          status: "Pending",
          type: "Assist",
          payment_method: value.payment_method,
          warehouse_id: value.warehouse_id,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      let paymentDetails = null;
      if (value.payment_method === "OFFLINE_TRANSFER") {
        paymentDetails = {
          ...bankInfo,
          note: `銀行：${bankInfo.bank_name}\n帳號：${bankInfo.bank_account}\n戶名：${bankInfo.bank_account_name}\n\n代購訂單已提交！預估金額 TWD ${totalTwd}。\n請匯款後聯繫客服，並告知訂單編號 (${newOrder.id})。`,
        };
      }

      sendOrderConfirmationEmail(newOrder, paymentDetails).catch(console.error);

      res.status(201).json({
        message: "代購申請已提交",
        order: newOrder,
        payment_details: paymentDetails,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ... (公開/客戶查詢保持不變) ...
router.get("/share/:token", async (req, res, next) => {
  // ... (保留原檔內容)
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

    const { bankInfo } = await getSettingsAndBankInfo();

    const safeOrder = {
      id: order.id,
      paopao_id: order.paopao_id,
      total_amount_twd: order.total_amount_twd,
      status: order.status,
      payment_status: order.payment_status,
      created_at: order.created_at,
      items: order.items,
      bank_info: bankInfo,
    };

    res.json(safeOrder);
  } catch (err) {
    next(err);
  }
});

router.get("/my", authenticateToken, isCustomer, async (req, res, next) => {
  // ... (保留原檔內容)
  try {
    const orders = await prisma.orders.findMany({
      where: { paopao_id: req.user.paopao_id },
      include: {
        items: {
          select: {
            quantity: true,
            snapshot_name: true,
            snapshot_price_twd: true,
            item_url: true,
            item_spec: true,
            snapshot_cost_cny: true,
          },
        },
        warehouse: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
    });

    const sanitizedOrders = orders.map((order) => {
      const items = order.items.map((item) => ({
        ...item,
        snapshot_cost_cny: Number(item.snapshot_cost_cny),
      }));

      return {
        ...order,
        total_cost_cny: Number(order.total_cost_cny),
        items: items,
      };
    });

    res.json(sanitizedOrders);
  } catch (err) {
    next(err);
  }
});

// --- [修改] 操作員查詢 (支援搜尋 + 憑證篩選) ---
router.get(
  "/operator",
  authenticateToken,
  isOperator,
  async (req, res, next) => {
    try {
      // [修改] 增加 hasVoucher 參數
      const { status, paymentStatus, search, hasVoucher } = req.query;
      const whereClause = {};

      if (status) whereClause.status = status;
      if (paymentStatus) whereClause.payment_status = paymentStatus;

      // [修改] 憑證篩選邏輯: 只找「未付款」且「有憑證」的訂單
      if (hasVoucher === "true") {
        whereClause.payment_status = "UNPAID";
        whereClause.payment_voucher_url = { not: null };
      }

      // 搜尋邏輯
      if (search) {
        const searchInt = parseInt(search, 10);
        const OR = [
          { paopao_id: { contains: search, mode: "insensitive" } },
          { customer_email: { contains: search, mode: "insensitive" } },
        ];
        if (!isNaN(searchInt)) {
          OR.push({ id: searchInt });
        }
        whereClause.OR = OR;
      }

      const orders = await prisma.orders.findMany({
        where: whereClause,
        include: {
          operator: { select: { username: true } },
          warehouse: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              snapshot_cost_cny: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });
      const ordersWithCost = orders.map((o) => {
        const totalCostCny = o.items.reduce(
          (sum, item) => sum + Number(item.snapshot_cost_cny) * item.quantity,
          0
        );

        return {
          ...o,
          total_cost_cny: Number(o.total_cost_cny),
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

// --- [修改] 管理員查詢 (支援搜尋 + 憑證篩選) ---
router.get("/admin", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const { status, paymentStatus, search, hasVoucher } = req.query;
    const whereClause = {};

    if (status) whereClause.status = status;
    if (paymentStatus) whereClause.payment_status = paymentStatus;

    if (hasVoucher === "true") {
      whereClause.payment_status = "UNPAID";
      whereClause.payment_voucher_url = { not: null };
    }

    if (search) {
      const searchInt = parseInt(search, 10);
      const OR = [
        { paopao_id: { contains: search, mode: "insensitive" } },
        { customer_email: { contains: search, mode: "insensitive" } },
      ];
      if (!isNaN(searchInt)) {
        OR.push({ id: searchInt });
      }
      whereClause.OR = OR;
    }

    const orders = await prisma.orders.findMany({
      where: whereClause,
      include: {
        warehouse: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            snapshot_cost_cny: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
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

// ... (更新訂單路由保持不變) ...
router.put("/:id", authenticateToken, isOperator, async (req, res, next) => {
  // ... (保留原檔內容)
  try {
    const {
      status,
      notes,
      payment_status,
      operator_id,
      domestic_tracking_number,
    } = req.body;
    const data = {};
    if (status) data.status = status;
    if (notes !== undefined) data.notes = notes;
    if (payment_status) data.payment_status = payment_status;
    if (domestic_tracking_number !== undefined)
      data.domestic_tracking_number = domestic_tracking_number;

    if (operator_id !== undefined && req.user.role === "admin") {
      data.operator_id = operator_id ? parseInt(operator_id) : null;
    }

    const updated = await prisma.orders.update({
      where: { id: parseInt(req.params.id) },
      data,
    });

    if (payment_status === "PAID")
      sendPaymentReceivedEmail(updated).catch(console.error);
    else if (status && status !== updated.status)
      sendOrderStatusUpdateEmail(updated).catch(console.error);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
