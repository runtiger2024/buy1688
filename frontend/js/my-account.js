import { API_URL } from "./config.js";

// --- 幫助函式 ---

/**
 * 獲取儲存的 客戶 Token
 */
function getToken() {
  return localStorage.getItem("customerToken");
}

/**
 * 頁面載入時的守衛
 * 檢查 Token，若無則踢回登入頁
 */
function checkAuth() {
  if (!getToken()) {
    alert("請先登入");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/**
 * 獲取 API 請求的標頭 (包含客戶 Token)
 */
function getAuthHeaders() {
  const token = getToken();
  if (!token) {
    console.error("Token not found");
    checkAuth(); // 觸發踢回登入
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * 載入共用組件 (頁首)
 */
async function loadComponent(componentPath, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) return;
  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error("Component load failed");
    placeholder.innerHTML = await response.text();
  } catch (error) {
    console.error(`載入組件失敗: ${error.message}`);
  }
}

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", () => {
  // 1. 執行守衛
  if (!checkAuth()) {
    return;
  }

  // 2. 載入共用組件
  loadComponent("./_header.html", "header-placeholder");

  // 3. 載入訂單
  loadOrders();
});

/**
 * 呼叫後端 API 載入訂單
 */
async function loadOrders() {
  const container = document.getElementById("order-history-container");
  const headers = getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${API_URL}/customer/orders`, { headers });

    if (response.status === 401 || response.status === 403) {
      // Token 失效或權限不足
      throw new Error("驗證失敗，請重新登入");
    }
    if (!response.ok) {
      throw new Error("載入訂單失敗");
    }

    const orders = await response.json();
    renderOrders(orders);
  } catch (error) {
    console.error("載入訂單失敗:", error);
    container.innerHTML = `<p style="color:red;">${error.message}。 <a href="login.html">點此重新登入</a></p>`;
  }
}

/**
 * 將訂單資料渲染為 HTML
 */
function renderOrders(orders) {
  const container = document.getElementById("order-history-container");
  if (!orders || orders.length === 0) {
    container.innerHTML = "<p>您目前沒有任何訂單。</p>";
    return;
  }

  container.innerHTML = ""; // 清空 "正在載入..."

  orders.forEach((order) => {
    // 1. 處理訂單商品列表
    const itemsHtml = order.items
      .map(
        (item) => `
        <li class="order-item">
            <span class="item-name">${item.snapshot_name}</span>
            <span class="item-details">
                TWD ${item.snapshot_price_twd} x ${item.quantity}
            </span>
        </li>
    `
      )
      .join("");

    // 2. 處理狀態顏色 (對應 admin.css 的樣式)
    const paymentStatusClass =
      order.payment_status === "PAID" ? "status-PAID" : "status-UNPAID";
    const orderStatusClass = `status-${order.status}`;

    // 3. 組合 HTML
    const orderCard = document.createElement("div");
    orderCard.className = "order-card";
    orderCard.innerHTML = `
        <div class="order-card-header">
            <div>
                <strong>訂單編號: ${order.id}</strong>
                <small>${new Date(order.created_at).toLocaleString()}</small>
            </div>
            <div class="order-total">
                TWD ${order.total_amount_twd}
            </div>
        </div>
        <div class="order-card-body">
            <div class="order-status-tags">
                <span class="tag ${orderStatusClass}">${order.status}</span>
                <span class="tag ${paymentStatusClass}">${
      order.payment_status
    }</span>
            </div>
            <ul class="order-item-list">
                ${itemsHtml}
            </ul>
        </div>
    `;
    container.appendChild(orderCard);
  });
}
