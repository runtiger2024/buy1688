// backend/server.js
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
    "https://buy1688-frontend.onrender.com",
    // "https://您的正式網域.com"
  ],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// [修改] 增加 Payload 大小限制以支援 Base64 圖片上傳
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

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
app.use("/api/products", productRoutes);
app.use("/api/admin/products", productRoutes);

// 3. 訂單相關
app.use("/api/orders", orderRoutes);

app.use("/api/orders/assist", (req, res, next) => {
  req.url = "/assist";
  orderRoutes(req, res, next);
});
app.use("/api/orders/my", (req, res, next) => {
  req.url = "/my";
  orderRoutes(req, res, next);
});
app.use("/api/orders/operator", (req, res, next) => {
  req.url = "/operator";
  orderRoutes(req, res, next);
});
app.use("/api/orders/admin", (req, res, next) => {
  req.url = "/admin";
  orderRoutes(req, res, next);
});

// 4. 系統管理相關
app.use("/api", managementRoutes);
app.use("/api/admin", managementRoutes);

// --- 全域錯誤處理 ---
app.use((err, req, res, next) => {
  console.error("System Error:", err.stack);
  // 如果是 PayloadTooLargeError，回傳更友善的訊息
  if (err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ message: "上傳的檔案太大，請選擇較小的圖片 (建議 < 5MB)。" });
  }
  res.status(500).json({
    message: "伺服器內部錯誤",
    error: process.env.NODE_ENV === "production" ? null : err.message,
  });
});

// --- 啟動 ---
app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
