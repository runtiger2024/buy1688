// frontend/js/my-account.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  checkAuth,
  getAuthToken,
  loadCart, // 為了更新購物車數字
} from "./sharedUtils.js";

let allOrdersData = [];
let currentTab = "all"; // all, UNPAID, Processing, Shipped, Completed
let bankInfo = null;

const STATUS_LABEL = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) return;

  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();
  setupBottomNav();

  // 更新購物車數字 (雖不顯示購物車內容，但更新 Badge)
  let cart = {};
  loadCart(cart);
  const count = Object.values(cart).reduce((a, b) => a + b.quantity, 0);
  const badge = document.getElementById("mobile-cart-count");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "block" : "none";
  }

  await loadBankInfo();
  loadOrders();

  setupTabs();
});

function setupBottomNav() {
  document.getElementById("tab-account")?.classList.add("active");
  const bottomCartBtn = document.getElementById("tab-cart");
  if (bottomCartBtn) {
    bottomCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html#cart-modal";
    });
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".order-tab-item");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.status;
      renderOrders();
    });
  });
}

async function loadOrders() {
  const container = document.getElementById("order-history-container");
  const headers = getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${API_URL}/orders/my`, { headers });
    if (!response.ok) throw new Error("載入失敗");
    allOrdersData = await response.json();
    renderOrders();
  } catch (error) {
    container.innerHTML = `<p style="text-align:center; color:red;">${error.message}</p>`;
  }
}

function renderOrders() {
  const container = document.getElementById("order-history-container");
  container.innerHTML = "";

  // 篩選訂單
  const filteredOrders = allOrdersData.filter((order) => {
    if (currentTab === "all") return true;
    if (currentTab === "UNPAID") return order.payment_status === "UNPAID";
    if (currentTab === "Processing")
      return (
        ["Pending", "Processing"].includes(order.status) &&
        order.payment_status === "PAID"
      );
    if (currentTab === "Shipped")
      return ["Shipped_Internal", "Warehouse_Received"].includes(order.status);
    if (currentTab === "Completed")
      return order.status === "Completed" || order.status === "Cancelled";
    return true;
  });

  if (filteredOrders.length === 0) {
    container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#999;">
                <i class="fas fa-clipboard-list" style="font-size:40px; margin-bottom:10px;"></i>
                <p>沒有此狀態的訂單</p>
            </div>`;
    return;
  }

  filteredOrders.forEach((order) => {
    const statusText = STATUS_LABEL[order.status] || order.status;
    const isUnpaid = order.payment_status === "UNPAID";

    // 訂單商品摘要 (最多顯示2個)
    const itemsHtml = order.items
      .slice(0, 2)
      .map(
        (item) => `
            <div class="order-item">
                <div class="item-name">${item.snapshot_name}</div>
                <div class="item-qty">x${item.quantity}</div>
            </div>
        `
      )
      .join("");

    const moreItemsHtml =
      order.items.length > 2
        ? `<div style="font-size:0.8rem; color:#999; margin-top:5px;">...還有 ${
            order.items.length - 2
          } 項商品</div>`
        : "";

    // 底部操作按鈕
    let actionsHtml = "";
    if (isUnpaid) {
      actionsHtml = `
                <button class="btn-action" onclick="copyBankInfo('${order.id}', '${order.total_amount_twd}')">複製匯款資訊</button>
                <button class="btn-action solid" onclick="toggleVoucherForm('${order.id}')">上傳憑證</button>
            `;
    } else {
      actionsHtml = `<button class="btn-action" onclick="window.location.href='order-share.html?token=${order.share_token}'">查看詳情</button>`;
    }

    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
            <div class="order-card-header">
                <span class="order-id">訂單號 ${order.id}</span>
                <span class="order-status">${
                  isUnpaid ? "待付款" : statusText
                }</span>
            </div>
            <div class="order-card-body" onclick="window.location.href='order-share.html?token=${
              order.share_token
            }'">
                ${itemsHtml}
                ${moreItemsHtml}
            </div>
            <div class="order-card-footer">
                <div class="order-total-price">
                    <small>總計</small> TWD ${order.total_amount_twd}
                </div>
                <div class="order-actions">
                    ${actionsHtml}
                </div>
            </div>
            <div id="voucher-area-${
              order.id
            }" style="display:none; padding:15px; border-top:1px dashed #eee; background:#fafafa;">
                <form onsubmit="window.handleVoucherUpload(event, '${
                  order.id
                }')">
                    <p style="margin:0 0 5px 0; font-size:0.9rem;">上傳匯款憑證:</p>
                    <input type="file" id="voucher-file-${
                      order.id
                    }" accept="image/*" required style="font-size:0.9rem;">
                    <button type="submit" class="btn-action solid" style="margin-top:5px;">確認上傳</button>
                    <div class="voucher-status" style="font-size:0.8rem; margin-top:5px; color:#666;"></div>
                </form>
            </div>
        `;
    container.appendChild(card);
  });
}

// 顯示/隱藏憑證上傳框
window.toggleVoucherForm = function (id) {
  const area = document.getElementById(`voucher-area-${id}`);
  if (area.style.display === "none") {
    area.style.display = "block";
  } else {
    area.style.display = "none";
  }
};

// 獲取 Header
function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function loadBankInfo() {
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      const settings = await response.json();
      bankInfo = {
        bank_name: settings.bank_name || "未設定",
        bank_account: settings.bank_account || "未設定",
        bank_account_name: settings.bank_account_name || "未設定",
      };
    }
  } catch (error) {
    console.error(error);
  }
}

// 複製匯款資訊
window.copyBankInfo = function (orderId, amount) {
  if (!bankInfo) return alert("讀取銀行資訊失敗");
  const text = `
【匯款資訊】
訂單: #${orderId}
金額: ${amount}
銀行: ${bankInfo.bank_name}
帳號: ${bankInfo.bank_account}
戶名: ${bankInfo.bank_account_name}
    `.trim();
  navigator.clipboard.writeText(text).then(() => alert("匯款資訊已複製！"));
};

// 處理上傳
window.handleVoucherUpload = function (e, orderId) {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const form = e.target;
  const fileInput = form.querySelector('input[type="file"]');
  const statusDiv = form.querySelector(".voucher-status");
  const btn = form.querySelector("button");

  const file = fileInput.files[0];
  if (!file) return alert("請選擇檔案");

  btn.disabled = true;
  btn.textContent = "上傳中...";

  const reader = new FileReader();
  reader.onload = async function (event) {
    const base64String = event.target.result;
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/voucher`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ voucherUrl: base64String }),
      });
      if (!response.ok) throw new Error("上傳失敗");
      alert("憑證上傳成功！");
      loadOrders(); // 重新整理列表
    } catch (error) {
      statusDiv.textContent = `錯誤: ${error.message}`;
      btn.disabled = false;
      btn.textContent = "確認上傳";
    }
  };
  reader.readAsDataURL(file);
};
