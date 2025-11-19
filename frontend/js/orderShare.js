// frontend/js/orderShare.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupHamburgerMenu,
  setupCustomerAuth,
} from "./sharedUtils.js";

// 狀態對照表
const ORDER_STATUS_MAP = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨 (往集運倉)",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

const PAYMENT_STATUS_MAP = {
  UNPAID: "待付款",
  PAID: "已付款",
};

// 當前訂單資料快取 (供複製功能使用)
let currentOrderData = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. 載入共用組件 (Navbar)
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();

  // 2. 獲取 Token
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    document.querySelector("main").innerHTML =
      '<div class="assist-card" style="text-align:center; padding:40px;"><h3>無效的連結</h3><p>請確認網址是否正確。</p><a href="./index.html" class="btn-action primary">回首頁</a></div>';
    return;
  }

  // 3. 載入訂單
  fetchOrderDetails(token);
});

async function fetchOrderDetails(token) {
  try {
    const response = await fetch(`${API_URL}/orders/share/${token}`);
    if (!response.ok) {
      throw new Error("找不到訂單或連結已失效");
    }
    const order = await response.json();
    currentOrderData = order; // 存起來供複製使用
    renderOrder(order);
  } catch (error) {
    console.error(error);
    document.querySelector("main").innerHTML = `
        <div class="assist-card" style="text-align:center; padding:40px; color:var(--taobao-red);">
            <h3><i class="fas fa-exclamation-triangle"></i> 載入錯誤</h3>
            <p>${error.message}</p>
        </div>`;
  }
}

function renderOrder(order) {
  // 1. 填寫基本資訊
  setText("display-id", `#${order.id}`);
  setText("display-date", new Date(order.created_at).toLocaleString());
  setText("display-total", order.total_amount_twd.toLocaleString());

  // 狀態顯示
  const statusText = ORDER_STATUS_MAP[order.status] || order.status;
  const statusEl = document.getElementById("display-status");
  if (statusEl) {
    statusEl.textContent = statusText;
    statusEl.style.color = order.status === "Cancelled" ? "red" : "green";
  }

  // 付款狀態顯示
  const payText =
    PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
  const payEl = document.getElementById("display-payment");
  if (payEl) {
    payEl.textContent = payText;
    payEl.className =
      order.payment_status === "PAID"
        ? "badge badge-success" // 需確保 style.css 有這些 class，或直接用 style
        : "badge badge-warning";

    // 簡單樣式補強
    payEl.style.padding = "2px 8px";
    payEl.style.borderRadius = "10px";
    payEl.style.fontSize = "0.85rem";
    payEl.style.color = "#fff";
    payEl.style.backgroundColor =
      order.payment_status === "PAID" ? "#28a745" : "#ffc107";
    if (order.payment_status !== "PAID") payEl.style.color = "#000";
  }

  // 2. 匯款資訊區塊 (僅在待付款時顯示)
  const bankSection = document.getElementById("bank-section");
  if (
    order.payment_status === "UNPAID" &&
    order.status !== "Cancelled" &&
    order.bank_info
  ) {
    bankSection.style.display = "block";
    setText("bank-name", order.bank_info.bank_name);
    setText("bank-account", order.bank_info.bank_account);
    setText("bank-user", order.bank_info.bank_account_name);
  } else {
    bankSection.style.display = "none";
    // 如果已付款，修改標題文字
    document.getElementById("page-title").textContent = "訂單詳情";
  }

  // 3. 渲染商品列表
  const itemsContainer = document.getElementById("items-container");
  itemsContainer.innerHTML = "";

  order.items.forEach((item) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.marginBottom = "10px";
    row.style.borderBottom = "1px solid #f5f5f5";
    row.style.paddingBottom = "10px";

    const specHtml = item.item_spec
      ? `<br><span style="font-size:0.8rem; color:#888; background:#f0f0f0; padding:1px 5px; border-radius:3px;">${item.item_spec}</span>`
      : "";

    const linkHtml = item.item_url
      ? `<a href="${item.item_url}" target="_blank" style="color:#007bff; margin-left:5px;"><i class="fas fa-link"></i></a>`
      : "";

    row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:0.95rem; color:#333;">
                    ${item.snapshot_name || "商品"} ${linkHtml}
                </div>
                ${specHtml}
            </div>
            <div style="text-align:right; min-width:80px;">
                <div style="font-size:0.9rem;">x${item.quantity}</div>
                <div style="color:var(--taobao-orange); font-weight:bold;">
                    NT$ ${(
                      item.snapshot_price_twd * item.quantity
                    ).toLocaleString()}
                </div>
            </div>
        `;
    itemsContainer.appendChild(row);
  });
}

// 輔助函式：安全設定文字
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// 全局函式：複製文字
window.copyText = function (elementId) {
  const text = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(text).then(() => {
    alert("已複製到剪貼簿！");
  });
};

// 全局函式：複製訂單摘要
window.copyOrderSummary = function () {
  if (!currentOrderData) return;
  const o = currentOrderData;
  const status = ORDER_STATUS_MAP[o.status] || o.status;

  let text = `【訂單詳情】\n單號: ${o.id}\n日期: ${new Date(
    o.created_at
  ).toLocaleDateString()}\n狀態: ${status}\n`;
  text += `----------------\n`;
  o.items.forEach((item, idx) => {
    text += `${idx + 1}. ${item.snapshot_name} x${item.quantity}`;
    if (item.item_spec) text += ` (${item.item_spec})`;
    text += `\n`;
  });
  text += `----------------\n總金額: TWD ${o.total_amount_twd}\n`;

  if (o.bank_info && o.payment_status === "UNPAID") {
    text += `\n【匯款資訊】\n銀行: ${o.bank_info.bank_name}\n帳號: ${o.bank_info.bank_account}\n戶名: ${o.bank_info.bank_account_name}`;
  }

  navigator.clipboard.writeText(text).then(() => {
    alert("訂單摘要已複製！請貼給 LINE 客服。");
  });
};
