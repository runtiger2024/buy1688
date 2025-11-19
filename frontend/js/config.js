// frontend/js/config.js

// 自動判斷環境：如果是 localhost 或 127.0.0.1，則使用本地後端
const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// 設定後端 API 基礎網址
// 如果您已經部署上線，請將 "https://api.your-domain.com/api" 替換為真實網址
export const API_URL = isLocal
  ? "http://localhost:5000/api"
  : "https://buy1688.onrender.com";
