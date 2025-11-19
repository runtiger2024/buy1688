// frontend/js/orderShare.js
import { API_URL } from "./config.js";

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

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    document.body.innerHTML =
      '<h2 style="text-align:center; margin-top:50px;">無效的訂單連結</h2>';
    return;
  }

  fetchOrderDetails(token);
});

async function fetchOrderDetails(token) {
  try {
    const response = await fetch(`${API_URL}/orders/share/${token}`);
    if (!response.ok) {
      throw new Error("找不到訂單或連結已失效");
    }
    const order = await response.json();
    renderOrder(order);
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<h2 style="text-align:center; margin-top:50px; color:red;">${error.message}</h2>`;
  }
}

function renderOrder(order) {
  // 1. 基本資訊
  document.getElementById("order-id").textContent = order.id;
  document.getElementById("order-date").textContent = new Date(
    order.created_at
  ).toLocaleString();

  const statusText = ORDER_STATUS_MAP[order.status] || order.status;
  const statusEl = document.getElementById("order-status");
  statusEl.textContent = statusText;

  // 簡單的狀態顏色標示
  if (order.status === "Cancelled") {
    statusEl.className = "badge badge-danger";
  } else if (order.status === "Completed") {
    statusEl.className = "badge badge-success";
  } else {
    statusEl.className = "badge badge-info";
  }

  // 付款狀態
  const payText =
    PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
  const payEl = document.getElementById("payment-status");
  payEl.textContent = payText;
  payEl.className =
    order.payment_status === "PAID"
      ? "badge badge-success"
      : "badge badge-warning";

  // 2. 銀行匯款資訊 (僅在待付款時顯示較為合理，但此頁面為公開查詢，一律顯示方便查看)
  const bankInfoDiv = document.getElementById("bank-info");
  if (order.bank_info) {
    bankInfoDiv.innerHTML = `
            <p><strong>銀行：</strong> ${order.bank_info.bank_name}</p>
            <p><strong>帳號：</strong> ${order.bank_info.bank_account}</p>
            <p><strong>戶名：</strong> ${order.bank_info.bank_account_name}</p>
            <p style="color:#d32f2f; font-size:0.9rem; margin-top:5px;">
               * 請務必於匯款備註填寫訂單編號 #${order.id} 以利對帳
            </p>
        `;
  } else {
    bankInfoDiv.innerHTML = "<p>無匯款資訊</p>";
  }

  // 3. 商品列表 (包含規格顯示)
  const tbody = document.getElementById("order-items-body");
  tbody.innerHTML = "";
  let totalAmount = 0;

  order.items.forEach((item) => {
    const tr = document.createElement("tr");
    const subtotal = item.snapshot_price_twd * item.quantity;
    totalAmount += subtotal;

    // 商品連結處理
    const linkHtml = item.item_url
      ? `<a href="${item.item_url}" target="_blank" style="color:#007bff; text-decoration:none;">
           <i class="fas fa-external-link-alt"></i> 連結
         </a>`
      : "-";

    // [優化] 規格標籤顯示
    const specHtml = item.item_spec
      ? `<span style="display:inline-block; background:#f0f0f0; color:#666; padding:2px 6px; border-radius:4px; font-size:0.85rem; margin-top:4px;">${item.item_spec}</span>`
      : `<span style="color:#ccc; font-size:0.85rem;">無規格</span>`;

    tr.innerHTML = `
            <td>
                <div style="font-weight:500; color:#333;">${
                  item.snapshot_name || "商品"
                }</div>
                ${specHtml}
            </td>
            <td class="text-center">${linkHtml}</td>
            <td class="text-right">NT$ ${item.snapshot_price_twd.toLocaleString()}</td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-right" style="font-weight:bold;">NT$ ${subtotal.toLocaleString()}</td>
        `;
    tbody.appendChild(tr);
  });

  // 總金額更新
  document.getElementById("total-amount").textContent =
    totalAmount.toLocaleString();
}
