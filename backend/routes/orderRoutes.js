// backend/routes/orderRoutes.js
import express from "express";
import Joi from "joi";
import prisma from "../db.js";
import { randomUUID } from "crypto";
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
  sendNewOrderNotificationToStaff,
  sendAssistOrderReceivedEmail, // [新增]
} from "../emailService.js";

const router = express.Router();

// --- 共通函式 ---
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

// --- 輔助函式：通知工作人員 ---
async function notifyStaff(order) {
  try {
    const staffToNotify = await prisma.users.findMany({
      where: {
        status: "active",
        receive_notifications: true,
        email: { not: null },
      },
      select: { email: true },
    });

    const emails = staffToNotify
      .map((u) => u.email)
      .filter((e) => e && e.trim() !== "");

    if (emails.length > 0) {
      await sendNewOrderNotificationToStaff(order, emails);
    }
  } catch (error) {
    console.error("通知工作人員失敗:", error);
  }
}

// --- 建立一般訂單 ---
router.post("/", authenticateToken, isCustomer, async (req, res, next) => {
  const schema = Joi.object({
    paopaoId: Joi.string().allow("").optional(),
    customerEmail: Joi.string().email().required(),
    payment_method: Joi.string().required(),
    warehouse_id: Joi.number().integer().allow(null).optional(),
    recipient_name: Joi.string().allow("").optional(),
    recipient_phone: Joi.string().allow("").optional(),
    recipient_address: Joi.string().allow("").optional(),
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
          spec: Joi.string().allow("").allow(null).optional(),
        })
      )
      .min(1)
      .required(),
  });

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
    let hasDirectBuyItem = false;
    const orderItemsData = [];

    for (const item of value.items) {
      const product = productsMap[item.id];
      if (!product) throw new Error(`商品 ID ${item.id} 不存在或已下架`);

      if (product.is_direct_buy) {
        hasDirectBuyItem = true;
      }

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
        item_spec: item.spec || null,
      });
    }

    if (hasDirectBuyItem) {
      if (
        !value.recipient_name ||
        !value.recipient_phone ||
        !value.recipient_address
      ) {
        throw new Error(
          "此訂單包含直購商品，請填寫完整的台灣收件資訊 (姓名/電話/地址)"
        );
      }
    } else {
      if (!value.warehouse_id) {
        throw new Error("此訂單需選擇集運倉");
      }
      const warehouse = await prisma.warehouses.findUnique({
        where: { id: value.warehouse_id, is_active: true },
      });
      if (!warehouse) throw new Error("無效的集運倉 ID");
    }

    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: userPaopaoId,
        customer_email: value.customerEmail,
        total_amount_twd: totalTwd,
        total_cost_cny: totalCny,
        status: "Pending",
        type: "Standard",
        payment_method: value.payment_method,
        warehouse_id: hasDirectBuyItem ? null : value.warehouse_id,
        recipient_name: hasDirectBuyItem ? value.recipient_name : null,
        recipient_phone: hasDirectBuyItem ? value.recipient_phone : null,
        recipient_address: hasDirectBuyItem ? value.recipient_address : null,
        share_token: randomUUID(),
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
    notifyStaff(newOrder).catch(console.error);

    res.status(201).json({
      message: "訂單建立成功",
      order: newOrder,
      payment_details: paymentDetails,
    });
  } catch (err) {
    next(err);
  }
});

// --- 憑證上傳路由 ---
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

      if (order.payment_voucher_url) {
        return res.status(400).json({
          message: "您已上傳過憑證，請勿重複上傳。如需修改請聯繫客服。",
        });
      }

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

// --- 建立代購訂單 (修改：支援新欄位與審核狀態) ---
router.post(
  "/assist",
  authenticateToken,
  isCustomer,
  async (req, res, next) => {
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
            // [新增] 接收新欄位
            item_image_url: Joi.string().uri().allow("").optional(),
            client_remarks: Joi.string().allow("").optional(),
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
          // [新增] 存入新欄位
          item_image_url: item.item_image_url || null,
          client_remarks: item.client_remarks || null,
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
          share_token: randomUUID(),
          // [修改] 預設為審核中
          payment_status: "PENDING_REVIEW",
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      // [修改] 寄送「已收到申請」信件，而非付款信
      sendAssistOrderReceivedEmail(newOrder).catch(console.error);
      notifyStaff(newOrder).catch(console.error);

      res.status(201).json({
        message: "代購申請已提交，請等待管理員審核。",
        order: newOrder,
        payment_details: null, // 暫不回傳付款資訊
      });
    } catch (err) {
      next(err);
    }
  }
);

// --- 公開/客戶/管理員查詢路由 ---

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
            item_image_url: true, // [新增]
            client_remarks: true, // [新增]
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
      recipient_name: order.recipient_name,
      recipient_address: order.recipient_address,
      domestic_tracking_number: order.domestic_tracking_number,
    };
    res.json(safeOrder);
  } catch (err) {
    next(err);
  }
});

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
            item_url: true,
            item_spec: true,
            snapshot_cost_cny: true,
            item_image_url: true, // [新增]
            client_remarks: true, // [新增]
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

router.get(
  "/operator",
  authenticateToken,
  isOperator,
  async (req, res, next) => {
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
        if (!isNaN(searchInt)) OR.push({ id: searchInt });
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
              snapshot_name: true,
              snapshot_price_twd: true,
              item_spec: true,
              item_url: true,
              item_image_url: true, // [新增]
              client_remarks: true, // [新增]
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
          recipient_name: o.recipient_name,
          recipient_phone: o.recipient_phone,
          recipient_address: o.recipient_address,
        };
      });
      res.json(ordersWithCost);
    } catch (err) {
      next(err);
    }
  }
);

router.get("/admin", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    // Admin logic is identical to Operator but guarded by isAdmin
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
      if (!isNaN(searchInt)) OR.push({ id: searchInt });
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
            snapshot_name: true,
            snapshot_price_twd: true,
            item_spec: true,
            item_url: true,
            item_image_url: true, // [新增]
            client_remarks: true, // [新增]
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
        recipient_name: o.recipient_name,
        recipient_phone: o.recipient_phone,
        recipient_address: o.recipient_address,
      };
    });
    res.json(ordersWithCost);
  } catch (err) {
    next(err);
  }
});

// --- 更新訂單 (管理員審核與操作) ---
router.put("/:id", authenticateToken, isOperator, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const {
      status,
      notes,
      payment_status,
      operator_id,
      domestic_tracking_number,
    } = req.body;

    // 先撈出舊資料以比對狀態
    const oldOrder = await prisma.orders.findUnique({ where: { id } });
    if (!oldOrder) return res.status(404).json({ message: "訂單不存在" });

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
      where: { id },
      data,
      include: { items: true }, // 需要 items 來寄信
    });

    // [新增] 審核通過邏輯：如果從 PENDING_REVIEW 變成 UNPAID，寄送付款通知
    if (
      oldOrder.payment_status === "PENDING_REVIEW" &&
      payment_status === "UNPAID"
    ) {
      const { bankInfo } = await getSettingsAndBankInfo();
      const paymentDetails = {
        ...bankInfo,
        note: `銀行：${bankInfo.bank_name}\n帳號：${bankInfo.bank_account}\n戶名：${bankInfo.bank_account_name}\n\n代購訂單 #${updated.id} 已審核通過！金額 TWD ${updated.total_amount_twd}。\n請匯款後上傳憑證。`,
      };
      sendOrderConfirmationEmail(updated, paymentDetails).catch(console.error);
    }
    // 原有的付款確認邏輯
    else if (payment_status === "PAID" && oldOrder.payment_status !== "PAID") {
      sendPaymentReceivedEmail(updated).catch(console.error);
    }
    // 原有的狀態更新邏輯
    else if (status && status !== updated.status) {
      sendOrderStatusUpdateEmail(updated).catch(console.error);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
