import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./db.js"; // 【重構】 載入 Prisma Client
import { comparePassword, generateToken, hashPassword } from "./auth.js";
// --- 【第三批優化：匯入 isCustomer】 ---
import {
  authenticateToken,
  isAdmin,
  isOperator,
  isCustomer, // <-- 匯入
} from "./middleware.js";
// --- 【優化結束】 ---
import Joi from "joi";

// --- 【第六批優化：匯入 Email 服務】 ---
import {
  sendRegistrationSuccessEmail,
  sendOrderConfirmationEmail,
  sendPaymentReceivedEmail,
  sendOrderStatusUpdateEmail,
} from "./emailService.js";
// --- 【優化結束】 ---

// 讀取 .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 中間件 (Middleware) ---
app.use(cors());
app.use(express.json()); // 解析傳入的 JSON

// ===================================================================
// API 路由 (Auth) - (管理員/操作員)
// ===================================================================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "請輸入帳號和密碼" });
    }

    // 【重構】 使用 Prisma 查詢
    const user = await prisma.users.findUnique({
      where: { username: username },
    });

    if (!user) {
      return res.status(404).json({ message: "帳號不存在" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "帳號已被停權" });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "密碼錯誤" });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error("Login Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json(req.user);
});

// ===================================================================
// API 路由 (Auth) - (客戶)
// ===================================================================

app.post("/api/auth/customer-register", async (req, res) => {
  // 1. 定義驗證規則
  const registerSchema = Joi.object({
    paopaoId: Joi.string().min(1).required().messages({
      "string.empty": "跑跑虎 ID 為必填",
    }),
    phoneNumber: Joi.string()
      .pattern(/^09\d{8}$/)
      .required()
      .messages({
        "string.pattern.base": "手機號碼格式錯誤 (應為 09XXXXXXXX)",
        "string.empty": "手機號碼為必填",
      }),
    email: Joi.string().email().required().messages({
      "string.email": "Email 格式錯誤",
      "string.empty": "Email 為必填",
    }),
  });

  // 2. 驗證 req.body
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
  }

  try {
    const { paopaoId, phoneNumber, email } = value;

    const hashedPassword = await hashPassword(phoneNumber);

    // 【重構】 使用 Prisma 建立
    const customer = await prisma.customers.create({
      data: {
        paopao_id: paopaoId,
        password_hash: hashedPassword,
        email: email,
      },
    });

    // 寄送註冊成功 Email
    sendRegistrationSuccessEmail(customer).catch(console.error);

    res.status(201).json({ message: "註冊成功！", customer: customer });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "此跑跑虎 ID 或 Email 已被註冊" });
    }
    console.error("Customer Register Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.post("/api/auth/customer-login", async (req, res) => {
  try {
    const { paopaoId, phoneNumber } = req.body;
    if (!paopaoId || !phoneNumber) {
      return res.status(400).json({ message: "請輸入跑跑虎 ID 和手機號碼" });
    }

    // 【重構】 使用 Prisma 查詢
    const customer = await prisma.customers.findUnique({
      where: { paopao_id: paopaoId },
    });

    if (!customer) {
      return res.status(404).json({ message: "帳號不存在 (跑跑虎 ID 錯誤)" });
    }

    const isMatch = await comparePassword(phoneNumber, customer.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "密碼錯誤 (手機號碼錯誤)" });
    }

    const customerPayload = {
      id: customer.id,
      paopao_id: customer.paopao_id,
      email: customer.email,
      role: "customer",
    };

    const token = generateToken(customerPayload);
    res.json({
      token,
      customer: {
        id: customer.id,
        paopao_id: customer.paopao_id,
        email: customer.email,
      },
    });
  } catch (err) {
    console.error("Customer Login Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

// ===================================================================
// API 路由 (Public) - 公開
// ===================================================================

app.get("/", (req, res) => {
  res.send("代採購平台後端 API 運行中... (已連接 DB - Prisma)");
});

app.get("/api/warehouses", async (req, res) => {
  try {
    const warehouses = await prisma.warehouses.findMany({
      where: { is_active: true },
      orderBy: { id: "asc" },
    });
    res.json(warehouses);
  } catch (err) {
    console.error("Get Warehouses Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

// --- 【第十四批優化：新增 GET /api/settings (公開)】 ---
// 讓前台可以獲取匯率和服務費
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await prisma.systemSettings.findMany();
    const settingsObj = {};
    settings.forEach((s) => {
      settingsObj[s.key] = parseFloat(s.value);
    });
    res.json(settingsObj);
  } catch (err) {
    console.error("Get Settings Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});
// --- 【優化結束】 ---

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await prisma.categories.findMany({
      orderBy: { id: "asc" },
    });
    res.json(categories);
  } catch (err) {
    console.error("Get Categories Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const { category, search } = req.query;

    const whereClause = {
      is_archived: false,
    };

    if (category) {
      const categoryId = parseInt(category, 10);
      if (!isNaN(categoryId)) {
        whereClause.category_id = categoryId;
      }
    }

    if (search) {
      whereClause.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    const products = await prisma.products.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        image_url: true,
        price_twd: true,
      },
    });
    res.json(products);
  } catch (err) {
    console.error("Get Products Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.products.findFirst({
      where: { id: parseInt(id), is_archived: false },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: "找不到商品" });
    }
    res.json(product);
  } catch (err) {
    console.error("Get Product Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

// --- 修改建立訂單 API (一般訂單) ---
app.post("/api/orders", async (req, res) => {
  const orderSchema = Joi.object({
    paopaoId: Joi.string().min(1).required(),
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

  const { error, value } = orderSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
  }

  const { paopaoId, items, customerEmail, payment_method } = value;

  try {
    const productIds = items.map((item) => parseInt(item.id));
    const products = await prisma.products.findMany({
      where: { id: { in: productIds }, is_archived: false },
    });
    const productsMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});

    let totalAmount_twd = 0;
    let totalCost_cny = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = productsMap[item.id];
      if (!product) throw new Error(`找不到 ID 為 ${item.id} 的商品`);

      const quantity = parseInt(item.quantity, 10);
      totalAmount_twd += product.price_twd * quantity;
      totalCost_cny += Number(product.cost_cny) * quantity;

      orderItemsData.push({
        product_id: product.id,
        quantity: quantity,
        snapshot_name: product.name,
        snapshot_price_twd: product.price_twd,
        snapshot_cost_cny: product.cost_cny,
      });
    }

    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: paopaoId,
        customer_email: customerEmail,
        total_amount_twd: totalAmount_twd,
        total_cost_cny: totalCost_cny,
        status: "Pending",
        type: "Standard",
        payment_method: payment_method,
        payment_status: "UNPAID",
        items: {
          create: orderItemsData,
        },
      },
      include: { items: true },
    });

    let payment_details = null;
    if (payment_method === "OFFLINE_TRANSFER") {
      payment_details = {
        bank_name: "範例銀行 (822)",
        account_number: "12345678901234",
        account_name: "跑得快國際貿易有限公司",
        note: `請匯款 TWD ${totalAmount_twd} 元，並告知客服人員您的訂單編號 (${newOrder.id}) 以便對帳。`,
      };
    }

    sendOrderConfirmationEmail(newOrder, payment_details).catch(console.error);

    res.status(201).json({
      message: "訂單已成功建立",
      order: newOrder,
      payment_details: payment_details,
    });
  } catch (err) {
    console.error("Create Order Error:", err.stack);
    res.status(500).json({ message: "建立訂單時發生錯誤", error: err.message });
  }
});

// --- 建立代購訂單 API ---
app.post("/api/assist-orders", async (req, res) => {
  const assistOrderSchema = Joi.object({
    paopaoId: Joi.string().min(1).required(),
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

  const { error, value } = assistOrderSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
  }

  const { paopaoId, items, customerEmail, payment_method } = value;

  try {
    // 1. 獲取當前系統設定
    const settings = await prisma.systemSettings.findMany();
    const config = {};
    settings.forEach((s) => (config[s.key] = parseFloat(s.value)));

    const exchangeRate = config.exchange_rate || 4.5;
    const serviceFeePercent = config.service_fee || 0;

    let totalAmount_twd = 0;
    let totalCost_cny = 0;
    const orderItemsData = [];

    // 2. 計算預估金額
    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      const priceCny = parseFloat(item.price_cny);

      const itemTotalCny = priceCny * quantity;
      totalCost_cny += itemTotalCny;

      const itemPriceTwdRaw = priceCny * exchangeRate * (1 + serviceFeePercent);
      const itemPriceTwd = Math.ceil(itemPriceTwdRaw);

      totalAmount_twd += itemPriceTwd * quantity;

      orderItemsData.push({
        product_id: null, // 代購商品沒有 ID
        item_url: item.item_url,
        item_spec: item.item_spec,
        quantity: quantity,
        snapshot_name: item.item_name,
        snapshot_cost_cny: priceCny,
        snapshot_price_twd: itemPriceTwd,
      });
    }

    // 3. 建立代購訂單
    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: paopaoId,
        customer_email: customerEmail,
        total_amount_twd: totalAmount_twd,
        total_cost_cny: totalCost_cny,
        status: "Pending",
        type: "Assist",
        payment_method: payment_method,
        payment_status: "UNPAID",
        items: {
          create: orderItemsData,
        },
      },
      include: { items: true },
    });

    let payment_details = null;
    if (payment_method === "OFFLINE_TRANSFER") {
      payment_details = {
        bank_name: "範例銀行 (822)",
        account_number: "12345678901234",
        account_name: "跑得快國際貿易有限公司",
        note: `代購訂單已提交！系統預估金額為 TWD ${totalAmount_twd}。\n請等待客服人員確認最終金額後再行匯款，或先匯此金額，多退少補。`,
      };
    }

    sendOrderConfirmationEmail(newOrder, payment_details).catch(console.error);

    res.status(201).json({
      message: "代購申請已提交",
      order: newOrder,
      payment_details: payment_details,
    });
  } catch (err) {
    console.error("Create Assist Order Error:", err.stack);
    res.status(500).json({ message: "提交代購時發生錯誤", error: err.message });
  }
});

// ===================================================================
// API 路由 (Customer) - 僅限客戶 (需登入)
// ===================================================================
app.get(
  "/api/customer/orders",
  authenticateToken,
  isCustomer,
  async (req, res) => {
    try {
      const customerPaopaoId = req.user.paopao_id;

      const orders = await prisma.orders.findMany({
        where: {
          paopao_id: customerPaopaoId,
        },
        include: {
          items: {
            select: {
              quantity: true,
              snapshot_name: true,
              snapshot_price_twd: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      if (!orders) {
        return res.json([]);
      }

      res.json(orders);
    } catch (err) {
      console.error("Get Customer Orders Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// ===================================================================
// API 路由 (Operator) - 操作人員 (或管理員)
// ===================================================================
// 【重要修復】：這是您報錯 404 的路由，現在確保它存在！
app.get(
  "/api/operator/orders",
  authenticateToken,
  isOperator,
  async (req, res) => {
    try {
      // 【重構】 使用 Prisma 查詢並 "include" 關聯資料
      const orders = await prisma.orders.findMany({
        // Operator 可以看到所有狀態的訂單
        include: {
          operator: {
            select: { username: true },
          },
        },
        orderBy: { created_at: "asc" },
      });

      // 格式化以匹配舊的 operator_name 欄位
      const formattedOrders = orders.map((order) => ({
        ...order,
        operator_name: order.operator ? order.operator.username : null,
      }));

      res.json(formattedOrders);
    } catch (err) {
      console.error("Get Operator Orders Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.put(
  "/api/operator/orders/:id",
  authenticateToken,
  isOperator,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, payment_status } = req.body;

      if (!status && !notes && !payment_status) {
        return res
          .status(400)
          .json({ message: "請提供要更新的狀態、備註或付款狀態" });
      }

      const dataToUpdate = {};
      if (status) dataToUpdate.status = status;
      if (notes) dataToUpdate.notes = notes;
      if (payment_status) dataToUpdate.payment_status = payment_status;

      const updatedOrder = await prisma.orders.update({
        where: { id: parseInt(id) },
        data: dataToUpdate,
      });

      if (payment_status === "PAID") {
        sendPaymentReceivedEmail(updatedOrder).catch(console.error);
      } else if (status) {
        sendOrderStatusUpdateEmail(updatedOrder).catch(console.error);
      }

      res.json(updatedOrder);
    } catch (err) {
      console.error("Update Operator Order Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// ===================================================================
// API 路由 (Admin) - 僅限管理員
// ===================================================================

// --- 【第十四批優化：新增 Admin 設定 API】 ---
// 讓後台可以更新匯率和服務費
app.put("/api/admin/settings", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { exchange_rate, service_fee } = req.body;

    // 更新匯率
    if (exchange_rate !== undefined) {
      await prisma.systemSettings.upsert({
        where: { key: "exchange_rate" },
        update: { value: exchange_rate.toString() },
        create: { key: "exchange_rate", value: exchange_rate.toString() },
      });
    }

    // 更新服務費
    if (service_fee !== undefined) {
      await prisma.systemSettings.upsert({
        where: { key: "service_fee" },
        update: { value: service_fee.toString() },
        create: { key: "service_fee", value: service_fee.toString() },
      });
    }

    res.json({ message: "系統設定已更新" });
  } catch (err) {
    console.error("Update Settings Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});
// --- 【優化結束】 ---

app.get("/api/admin/orders", authenticateToken, isAdmin, async (req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(orders);
  } catch (err) {
    console.error("Get Admin Orders Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.put(
  "/api/admin/orders/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, operator_id, payment_status } = req.body;

      const dataToUpdate = {};
      if (status) dataToUpdate.status = status;
      if (notes) dataToUpdate.notes = notes;
      if (payment_status) dataToUpdate.payment_status = payment_status;
      if (operator_id)
        dataToUpdate.operator_id = operator_id ? parseInt(operator_id) : null;

      const updatedOrder = await prisma.orders.update({
        where: { id: parseInt(id) },
        data: dataToUpdate,
      });

      if (payment_status === "PAID") {
        sendPaymentReceivedEmail(updatedOrder).catch(console.error);
      } else if (status) {
        sendOrderStatusUpdateEmail(updatedOrder).catch(console.error);
      }

      res.json(updatedOrder);
    } catch (err) {
      console.error("Update Admin Order Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.post(
  "/api/admin/products",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    const productSchema = Joi.object({
      name: Joi.string().min(1).max(255).required(),
      description: Joi.string().allow(null, ""),
      price_twd: Joi.number().integer().min(0).required(),
      cost_cny: Joi.number().min(0).required(),
      image_url: Joi.string().uri().allow(null, ""),
      category_id: Joi.number().integer().allow(null),
    });

    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
    }

    try {
      const newProduct = await prisma.products.create({
        data: {
          name: value.name,
          description: value.description,
          price_twd: value.price_twd,
          cost_cny: value.cost_cny,
          image_url: value.image_url || null,
          category_id: value.category_id ? parseInt(value.category_id) : null,
        },
      });
      res.status(201).json(newProduct);
    } catch (err) {
      console.error("Create Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.get(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const product = await prisma.products.findUnique({
        where: { id: parseInt(id) },
      });
      if (!product) {
        return res.status(404).json({ message: "找不到商品" });
      }
      res.json(product);
    } catch (err) {
      console.error("Get Admin Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.put(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, price_twd, cost_cny, image_url, category_id } =
        req.body;

      const updatedProduct = await prisma.products.update({
        where: { id: parseInt(id) },
        data: {
          name: name,
          description: description,
          price_twd: parseInt(price_twd),
          cost_cny: parseFloat(cost_cny),
          image_url: image_url,
          category_id: category_id ? parseInt(category_id) : null,
        },
      });
      res.json(updatedProduct);
    } catch (err) {
      console.error("Update Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.delete(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const archivedProduct = await prisma.products.update({
        where: { id: parseInt(id) },
        data: { is_archived: true },
      });
      res.json({ message: "商品已封存", product: archivedProduct });
    } catch (err) {
      console.error("Archive Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.get("/api/admin/users", authenticateToken, isAdmin, async (req, res) => {
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
    console.error("Get Users Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.post("/api/admin/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: "缺少帳號、密碼或角色" });
    }
    if (role !== "admin" && role !== "operator") {
      return res.status(400).json({ message: "無效的角色" });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.users.create({
      data: {
        username: username,
        password_hash: hashedPassword,
        role: role, // 'admin' 或 'operator'
        status: "active",
      },
    });

    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "帳號已存在" });
    }
    console.error("Create User Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.put(
  "/api/admin/users/:id/status",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || (status !== "active" && status !== "inactive")) {
        return res.status(400).json({ message: "無效的狀態" });
      }

      const updatedUser = await prisma.users.update({
        where: {
          id: parseInt(id),
          id: { not: req.user.id },
        },
        data: { status: status },
      });
      res.json(updatedUser);
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "找不到用戶或你試圖停權自己" });
      }
      console.error("Update User Status Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.get(
  "/api/admin/dashboard/stats",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const stats = await prisma.orders.aggregate({
        _sum: {
          total_amount_twd: true,
          total_cost_cny: true,
        },
        where: {
          status: { not: "Cancelled" },
          payment_status: "PAID",
        },
      });

      const statusCountsRaw = await prisma.orders.groupBy({
        by: ["status"],
        _count: {
          status: true,
        },
      });

      const paymentStatusCountsRaw = await prisma.orders.groupBy({
        by: ["payment_status"],
        _count: {
          _all: true,
        },
      });
      const paymentStatusCounts = paymentStatusCountsRaw.reduce((acc, row) => {
        acc[row.payment_status] = row._count._all;
        return acc;
      }, {});

      const statusCounts = statusCountsRaw.reduce((acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      }, {});

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
      });
    } catch (err) {
      console.error("Get Dashboard Stats Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.get(
  "/api/admin/warehouses",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const warehouses = await prisma.warehouses.findMany({
        orderBy: { id: "asc" },
      });
      res.json(warehouses);
    } catch (err) {
      console.error("Get Admin Warehouses Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.put(
  "/api/admin/warehouses/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, receiver, phone, address, is_active } = req.body;

      const updatedWarehouse = await prisma.warehouses.update({
        where: { id: parseInt(id) },
        data: {
          name,
          receiver,
          phone,
          address,
          is_active,
        },
      });
      res.json(updatedWarehouse);
    } catch (err) {
      console.error("Update Warehouse Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.get(
  "/api/admin/categories",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const categories = await prisma.categories.findMany({
        orderBy: { id: "asc" },
      });
      res.json(categories);
    } catch (err) {
      console.error("Get Admin Categories Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.post(
  "/api/admin/categories",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: "分類名稱為必填" });
    }
    try {
      const newCategory = await prisma.categories.create({
        data: { name, description },
      });
      res.status(201).json(newCategory);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: "分類名稱已存在" });
      }
      console.error("Create Category Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ message: "分類名稱為必填" });
      }

      const updatedCategory = await prisma.categories.update({
        where: { id: parseInt(id) },
        data: { name, description },
      });
      res.json(updatedCategory);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: "分類名稱已存在" });
      }
      console.error("Update Category Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

app.delete(
  "/api/admin/categories/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.categories.delete({
        where: { id: parseInt(id) },
      });
      res.json({ message: "分類已刪除" });
    } catch (err) {
      if (err.code === "P2003") {
        return res.status(400).json({
          message: "刪除失敗：此分類下仍有商品。請先將商品移至其他分類。",
        });
      }
      console.error("Delete Category Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// ===================================================================
// 啟動伺服器
// ===================================================================
app.listen(PORT, () => {
  console.log(
    `伺服器正在 http://localhost:${PORT} 上運行 (已連接 DB - Prisma)`
  );
});
