import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// 引入路由模組
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import managementRoutes from "./routes/managementRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 安全性設定 (CORS) ---
const corsOptions = {
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    // "https://您的正式網域.com"
  ],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// --- 測試路由 ---
app.get("/", (req, res) => {
  res.send("Runtiger API v2 (Modularized) is running.");
});

// ==========================================
// 掛載路由模組
// ==========================================

// 1. 認證相關
app.use("/api/auth", authRoutes);

// 2. 商品相關
// 一般公開查詢路徑
app.use("/api/products", productRoutes);
// [修復] Admin 管理路徑相容層 (讓前端 /api/admin/products 能通)
app.use("/api/admin/products", productRoutes);

// 3. 訂單相關
// 主要路徑: /api/orders, /api/orders/:id/voucher, /api/orders/share/:token
app.use("/api/orders", orderRoutes);

// [優化] 新增對應 orderRoutes 內部的路由相容層
app.use("/api/orders/assist", (req, res, next) => {
  req.url = "/assist"; // 導向 orderRoutes 內的 /assist
  orderRoutes(req, res, next);
});
app.use("/api/orders/my", (req, res, next) => {
  req.url = "/my"; // 導向 orderRoutes 內的 /my
  orderRoutes(req, res, next);
});
app.use("/api/orders/operator", (req, res, next) => {
  req.url = "/operator"; // 導向 orderRoutes 內的 /operator
  orderRoutes(req, res, next);
});
app.use("/api/orders/admin", (req, res, next) => {
  req.url = "/admin"; // 導向 orderRoutes 內的 /admin
  orderRoutes(req, res, next);
});

// 4. 系統管理相關 (分類/倉庫/人員/設定/績效)
app.use("/api", managementRoutes);
app.use("/api/admin", managementRoutes);

// --- 全域錯誤處理 ---
app.use((err, req, res, next) => {
  console.error("System Error:", err.stack);
  res.status(500).json({
    message: "伺服器內部錯誤",
    error: process.env.NODE_ENV === "production" ? null : err.message,
  });
});

// --- 啟動 ---
app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
