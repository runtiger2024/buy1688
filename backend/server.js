import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./db.js"; // 【重構】 載入 Prisma Client
import { comparePassword, generateToken, hashPassword } from "./auth.js";
import { authenticateToken, isAdmin, isOperator } from "./middleware.js";
import Joi from "joi";

// 讀取 .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 中間件 (Middleware) ---
app.use(cors());
app.use(express.json()); // 解析傳入的 JSON

// --- 幫助函數 (SendGrid) (不變) ---
async function sendOrderEmail(order) {
  console.log(`(模擬) 正在為訂單 ${order.id} 發送郵件...`);
}

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
  try {
    const { paopaoId, phoneNumber, email } = req.body;

    if (!paopaoId || !phoneNumber || !email) {
      return res
        .status(400)
        .json({ message: "跑跑虎 ID、手機號碼和 Email 均為必填" });
    }
    if (!/^09\d{8}$/.test(phoneNumber)) {
      return res
        .status(400)
        .json({ message: "手機號碼格式錯誤 (應為 09XXXXXXXX)" });
    }

    const hashedPassword = await hashPassword(phoneNumber);

    // 【重構】 使用 Prisma 建立
    const customer = await prisma.customers.create({
      data: {
        paopao_id: paopaoId,
        password_hash: hashedPassword,
        email: email,
      },
    });

    res.status(201).json({ message: "註冊成功！", customer: customer });
  } catch (err) {
    if (err.code === "P2002") {
      // Prisma 的 UNIQUE 衝突代碼
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
    // 【重構】 使用 Prisma 查詢
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

app.get("/api/products", async (req, res) => {
  try {
    // 【重構】 使用 Prisma 查詢
    const products = await prisma.products.findMany({
      where: { is_archived: false },
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
    // 【重構】 使用 Prisma 查詢
    const product = await prisma.products.findFirst({
      where: { id: parseInt(id), is_archived: false },
      select: {
        id: true,
        name: true,
        description: true,
        image_url: true,
        price_twd: true,
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

app.post("/api/orders", async (req, res) => {
  const { paopaoId, items, customerEmail } = req.body;
  if (!paopaoId || !items || items.length === 0) {
    return res.status(400).json({ message: "缺少跑跑虎會員編號或購物車商品" });
  }

  // 【重構】 使用 Prisma 事務 (Transaction)
  try {
    const productIds = items.map((item) => parseInt(item.id));

    // 1. 一次性獲取所有商品資訊
    const products = await prisma.products.findMany({
      where: {
        id: { in: productIds },
        is_archived: false,
      },
    });

    const productsMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});

    let totalAmount_twd = 0;
    let totalCost_cny = 0;
    const orderItemsData = [];

    // 2. 計算總價和產生 snapshot
    for (const item of items) {
      const product = productsMap[item.id];
      if (!product) {
        throw new Error(`找不到 ID 為 ${item.id} 的商品或商品已下架`);
      }
      const quantity = parseInt(item.quantity, 10);
      totalAmount_twd += product.price_twd * quantity;
      totalCost_cny += Number(product.cost_cny) * quantity; // 轉為 Number

      orderItemsData.push({
        product_id: product.id,
        quantity: quantity,
        snapshot_name: product.name,
        snapshot_price_twd: product.price_twd,
        snapshot_cost_cny: product.cost_cny,
      });
    }

    // 3. 在一個事務中建立訂單和訂單項目
    const newOrder = await prisma.orders.create({
      data: {
        paopao_id: paopaoId,
        customer_email: customerEmail,
        total_amount_twd: totalAmount_twd,
        total_cost_cny: totalCost_cny,
        status: "Pending",
        items: {
          create: orderItemsData, // <-- Prisma 的巢狀寫入
        },
      },
    });

    sendOrderEmail(newOrder).catch(console.error);
    res.status(201).json({ message: "訂單已成功建立", order: newOrder });
  } catch (err) {
    console.error("Create Order Error:", err.stack);
    res.status(500).json({ message: "建立訂單時發生錯誤", error: err.message });
  }
});

// ===================================================================
// API 路由 (Operator) - 操作人員 (或管理員)
// ===================================================================
app.get(
  "/api/operator/orders",
  authenticateToken,
  isOperator,
  async (req, res) => {
    try {
      // 【重構】 使用 Prisma 查詢並 "include" 關聯資料
      const orders = await prisma.orders.findMany({
        where: {
          status: { in: ["Pending", "Processing", "Shipped_Internal"] },
        },
        include: {
          operator: {
            // <-- 這取代了 LEFT JOIN
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
      const { status, notes } = req.body;

      if (!status && !notes) {
        return res.status(400).json({ message: "請提供要更新的狀態或備註" });
      }

      // 【重構】 使用 Prisma 更新
      const updatedOrder = await prisma.orders.update({
        where: { id: parseInt(id) },
        data: {
          status: status, // status 必須是 OrderStatus enum 中的值
          notes: notes,
        },
      });
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
app.get("/api/admin/orders", authenticateToken, isAdmin, async (req, res) => {
  try {
    // 【重構】 使用 Prisma 查詢
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
      const { status, notes, operator_id } = req.body;

      // 【重構】 使用 Prisma 更新
      const updatedOrder = await prisma.orders.update({
        where: { id: parseInt(id) },
        data: {
          status: status,
          notes: notes,
          operator_id: operator_id ? parseInt(operator_id) : null,
        },
      });
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
    });

    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
    }

    try {
      // 【重構】 使用 Prisma 建立
      const newProduct = await prisma.products.create({
        data: {
          name: value.name,
          description: value.description,
          price_twd: value.price_twd,
          cost_cny: value.cost_cny,
          image_url: value.image_url || null,
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
      // 【重構】 使用 Prisma 查詢 (回傳完整資料)
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
      const { name, description, price_twd, cost_cny, image_url } = req.body;

      // 【重構】 使用 Prisma 更新
      const updatedProduct = await prisma.products.update({
        where: { id: parseInt(id) },
        data: {
          name: name,
          description: description,
          price_twd: parseInt(price_twd),
          cost_cny: parseFloat(cost_cny),
          image_url: image_url,
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
      // 【重構】 使用 Prisma 軟刪除
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
    // 【重構】 使用 Prisma 查詢
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

    // 【重構】 使用 Prisma 建立
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
      // Prisma UNIQUE 衝突
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

      // 【重構】 使用 Prisma 更新
      const updatedUser = await prisma.users.update({
        where: {
          id: parseInt(id),
          id: { not: req.user.id }, // 確保管理員不能停權自己
        },
        data: { status: status },
      });
      res.json(updatedUser);
    } catch (err) {
      if (err.code === "P2025") {
        // Prisma 找不到紀錄
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
      // 【重構】 使用 Prisma 聚合 (Aggregate)
      const stats = await prisma.orders.aggregate({
        _sum: {
          total_amount_twd: true,
          total_cost_cny: true,
        },
        where: {
          status: { not: "Cancelled" },
        },
      });

      const statusCountsRaw = await prisma.orders.groupBy({
        by: ["status"],
        _count: {
          status: true,
        },
      });

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
      });
    } catch (err) {
      console.error("Get Dashboard Stats Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// --- (管理倉庫 API - 已重構) ---
app.get(
  "/api/admin/warehouses",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      // 【重構】 使用 Prisma 查詢
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

      // 【重構】 使用 Prisma 更新
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

// ===================================================================
// 啟動伺服器
// ===================================================================
app.listen(PORT, () => {
  console.log(
    `伺服器正在 http://localhost:${PORT} 上運行 (已連接 DB - Prisma)`
  );
});
