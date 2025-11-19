// frontend/js/my-account.js
import { API_URL } from "./config.js";

// --- 全域變數 ---
let allOrdersData = []; // 儲存所有訂單資料
let bankInfo = null; // 儲存銀行資訊

// --- 【第九批優化：新增狀態翻譯字典】 ---
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
// --- 【優化結束】 ---

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
    window.location.href = "../html/login.html";
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

// --- 【第十批優化：重構 setupCustomerAuth】 ---
function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem("customerUser"));
  } catch (e) {
    return null;
  }
}
function customerLogout() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customerUser");
  alert("您已成功登出。");
  window.location.href = "./index.html";
}

function setupCustomerAuth() {
  const customer = getCustomer();
  const desktopLinks = document.getElementById("nav-auth-links-desktop");
  const mobileLinks = document.getElementById("nav-auth-links-mobile");
  const footerLinks = document.getElementById("footer-auth-links");

  if (!desktopLinks || !mobileLinks || !footerLinks) {
    console.error("Auth UI 佔位符 (nav-auth-links) 載入失敗。");
    return;
  }

  if (customer) {
    const commonLinks = `
      <a href="../html/my-account.html" class="nav-link">我的訂單</a>
      <button id="logout-btn" class="btn-small-delete">登出</button>
    `;
    desktopLinks.innerHTML = commonLinks;
    mobileLinks.innerHTML = commonLinks;

    document.querySelectorAll("#logout-btn").forEach((btn) => {
      btn.addEventListener("click", customerLogout);
    });

    footerLinks.style.display = "none";
  } else {
    // (理論上 checkAuth 已經擋住，但還是做個防呆)
    desktopLinks.innerHTML = `
      <a href="../html/login.html" class="nav-link-button">會員登入</a>
    `;
    mobileLinks.innerHTML = `
      <a href="../html/login.html" class="nav-link-button">會員登入</a>
      <a href="../html/register.html" class="nav-link">免費註冊</a>
    `;
    footerLinks.style.display = "block";
  }
}
// --- 【優化結束】 ---

// --- 【第十批優化：新增漢堡選單邏輯】 ---
function setupHamburgerMenu() {
  const toggleButton = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("nav-menu");

  if (toggleButton && menu) {
    toggleButton.addEventListener("click", () => {
      menu.classList.toggle("active");
    });
  }
}
// --- 【優化結束】 ---

/**
 * [新增] 獲取系統設定中的銀行資訊
 */
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
    } else {
      console.error("無法載入銀行設定");
    }
  } catch (error) {
    console.error("載入銀行資訊失敗:", error);
  }
}

/**
 * [新增] 一鍵複製銀行資訊
 */
window.copyBankInfo = function (orderId, totalAmount) {
  if (
    !bankInfo ||
    !bankInfo.bank_account ||
    bankInfo.bank_account === "未設定"
  ) {
    alert("無法複製：銀行資訊尚未設定。");
    return;
  }

  const textToCopy = `
【匯款資訊】
訂單編號: #${orderId}
應付金額: TWD ${totalAmount}
銀行: ${bankInfo.bank_name}
帳號: ${bankInfo.bank_account}
戶名: ${bankInfo.bank_account_name}

請完成匯款後聯繫客服，謝謝！
`.trim();

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      alert("✅ 銀行及訂單資訊已複製到剪貼簿！");
    })
    .catch((err) => {
      console.error("複製失敗:", err);
      alert("複製失敗，請手動複製內容。");
    });
};

/**
 * [修改] 處理憑證上傳 (使用檔案輸入，並生成模擬 URL)
 */
window.handleVoucherUpload = async function (e, orderId) {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const form = e.target.closest("form");
  const voucherFileInput = form.querySelector(`#voucher-file-${orderId}`);
  const uploadButton = form.querySelector('button[type="submit"]');
  const statusDiv = form.querySelector(".voucher-status");

  const file = voucherFileInput.files[0];

  if (!file) {
    alert("請選擇一個檔案。");
    return;
  }

  // [核心修正] 確保模擬 URL 是有效的 URI，加上協議頭 (https://)
  const mockVoucherUrl = `https://mock-storage.com/order_${orderId}/${Date.now()}_${
    file.name
  }`;

  uploadButton.disabled = true;
  uploadButton.textContent = "上傳中...";
  statusDiv.textContent = `正在提交憑證資訊 (${file.name})...`;

  try {
    // 使用原有的 /orders/:id/voucher JSON endpoint，傳送模擬 URL
    const response = await fetch(`${API_URL}/orders/${orderId}/voucher`, {
      method: "POST",
      // 注意：這裡必須是 application/json，因為後端 /voucher 路由只處理 JSON payload
      headers: {
        "Content-Type": "application/json",
        Authorization: headers.Authorization,
      },
      body: JSON.stringify({ voucherUrl: mockVoucherUrl }),
    });

    const result = await response.json();

    if (!response.ok) {
      // 修正後的錯誤處理: 如果後端返回 400，顯示其錯誤信息
      const errorMsg = result.message || "憑證提交失敗";
      throw new Error(errorMsg);
    }

    alert("上傳成功！管理員將盡快為您對帳。");
    // 重新載入訂單列表以更新狀態
    loadOrders();
  } catch (error) {
    statusDiv.textContent = `憑證提交失敗: ${error.message}`;
    console.error("憑證提交失敗:", error);
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "確認上傳憑證";
  }
};

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", async () => {
  // 1. 執行守衛
  if (!checkAuth()) {
    return;
  }

  // 2. 載入共用組件
  await loadComponent("../html/_navbar.html", "navbar-placeholder");

  // 3. 綁定 Navbar 上的功能
  setupHamburgerMenu();
  setupCustomerAuth();

  // [新增] 處理導覽列上的 "我的購物車" 連結
  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html";
    });
  }

  // 4. 載入此頁面元件
  loadComponent("../html/_header.html", "notice-placeholder");

  // 5. 載入銀行資訊
  await loadBankInfo();

  // 6. 載入訂單
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

    allOrdersData = await response.json(); // 儲存至全域變數
    renderOrders(allOrdersData);
    setupOrderDetailsToggle(); // [新增] 綁定詳情切換事件
  } catch (error) {
    console.error("載入訂單失敗:", error);
    container.innerHTML = `<p style="color:red;">${error.message}。 <a href="../html/login.html">點此重新登入</a></p>`;
  }
}

/**
 * [新增] 綁定訂單詳情切換事件
 */
function setupOrderDetailsToggle() {
  // 必須使用 Event Delegation，因為 orderCard 是動態生成的
  const container = document.getElementById("order-history-container");

  container.addEventListener("click", (e) => {
    const button = e.target.closest(".btn-detail");
    if (!button) return;

    const orderId = button.dataset.id;
    const detailContent = document.getElementById(`detail-${orderId}`);

    if (detailContent.style.display === "block") {
      detailContent.style.display = "none";
      button.textContent = "訂單詳情";
    } else {
      // 如果是第一次點擊，確保內容已經渲染
      if (!detailContent.querySelector(".order-detail-expanded")) {
        const order = allOrdersData.find((o) => o.id == orderId);
        if (order) {
          detailContent.innerHTML = renderOrderDetailContent(order);
          // 由於上傳表單是動態生成的，需要額外綁定提交事件
          const form = detailContent.querySelector(`#voucher-form-${orderId}`);
          if (form) {
            // 使用 window.handleVoucherUpload 綁定
            form.addEventListener("submit", (e) =>
              window.handleVoucherUpload(e, orderId)
            );
          }
        }
      }
      detailContent.style.display = "block";
      button.textContent = "隱藏詳情";
    }
  });
}

/**
 * [修改] 渲染訂單詳情內容 (物品清單 + 銀行資訊 + 憑證上傳)
 */
function renderOrderDetailContent(order) {
  // 1. 渲染商品清單
  const itemsHtml = order.items
    .map(
      (item) => `
            <tr>
                <td>${item.snapshot_name}</td>
                <td>TWD ${item.snapshot_price_twd}</td>
                <td>${item.quantity}</td>
                <td>TWD ${item.snapshot_price_twd * item.quantity}</td>
            </tr>
        `
    )
    .join("");

  const itemTable = `
        <h3>商品清單</h3>
        <table class="detail-item-table">
            <thead>
                <tr>
                    <th>名稱</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th>小計</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
    `;

  // 2. 渲染匯款資訊與上傳區塊
  let bankInfoHtml = "";
  let uploadSection = "";
  const hasVoucher = order.payment_voucher_url;

  if (order.payment_status === "UNPAID") {
    // 顯示匯款資訊
    if (bankInfo && bankInfo.bank_account !== "未設定") {
      bankInfoHtml = `
                <div class="bank-info-box">
                    <h4>💵 待付款項資訊 (請複製匯款)</h4>
                    <div class="bank-row">
                        <span>應付總額:</span>
                        <span style="font-weight: bold; color: var(--taobao-orange);">TWD ${order.total_amount_twd}</span>
                    </div>
                    <div class="bank-row">
                        <span>收款銀行/代碼:</span>
                        <span style="font-weight: bold;">${bankInfo.bank_name}</span>
                    </div>
                    <div class="bank-row">
                        <span>銀行帳號:</span>
                        <span class="bank-value">
                            <span id="bank-acc-${order.id}">${bankInfo.bank_account}</span>
                            <button onclick="copyBankInfo(${order.id}, ${order.total_amount_twd})">一鍵複製</button>
                        </span>
                    </div>
                    <div class="bank-row" style="border-bottom: none;">
                        <span>戶名:</span>
                        <span style="font-weight: bold;">${bankInfo.bank_account_name}</span>
                    </div>
                </div>
            `;
    } else {
      bankInfoHtml = `<p style="margin-top: 10px; color: #dc3545; font-weight: bold;">後台尚未設定收款銀行資訊，請聯繫客服確認匯款。</p>`;
    }

    // 顯示上傳憑證區塊 (改為檔案輸入)
    if (hasVoucher) {
      uploadSection = `
                <div style="margin-bottom: 20px;">
                    <h4>已上傳憑證狀態</h4>
                    <div class="voucher-status uploaded">✅ 憑證已上傳，等待管理員對帳中。</div>
                    <a href="${order.payment_voucher_url}" target="_blank" style="font-size: 0.9rem;">查看憑證連結</a>
                </div>
            `;
    } else {
      uploadSection = `
                <div id="voucher-upload-form" style="margin-bottom: 20px;">
                    <h4>上傳匯款憑證 (限圖片)</h4>
                    <form id="voucher-form-${order.id}">
                        <input type="file" id="voucher-file-${order.id}" accept="image/*" required />
                        <button type="submit" style="margin-top: 10px;">確認上傳憑證</button>
                        <div class="voucher-status" style="margin-top: 5px;"></div>
                    </form>
                </div>
            `;
    }
  } else if (order.payment_status === "PAID") {
    uploadSection = `<p style="margin-top: 10px; color: #28a745; font-weight: bold;">✅ 訂單已付款，感謝您的支持。</p>`;
    if (hasVoucher) {
      uploadSection += `<p><a href="${order.payment_voucher_url}" target="_blank" style="font-size: 0.9rem;">(查看憑證)</a></p>`;
    }
  }

  return `
        <div class="order-detail-expanded">
            ${bankInfoHtml}
            ${uploadSection}
            ${itemTable}
        </div>
    `;
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
    // --- 【第九批優化：使用翻譯字典】 ---
    // 1. 處理狀態 (CSS class 不變, 顯示文字改變)
    const paymentStatusClass = `status-${order.payment_status}`; // e.g., "status-PAID"
    const orderStatusClass = `status-${order.status}`; // e.g., "status-Pending"

    // 翻譯文字
    const paymentStatusText =
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
    const orderStatusText = ORDER_STATUS_MAP[order.status] || order.status;
    // --- 【優化結束】 ---

    // 2. 組合 HTML
    const orderCard = document.createElement("div");
    orderCard.className = "order-card";
    orderCard.innerHTML = `
        <div class="order-card-header">
            <div style="flex-grow: 1;">
                <strong>訂單編號: ${order.id}</strong>
                <small>${new Date(order.created_at).toLocaleString()}</small>
            </div>
            <div class="order-total">
                TWD ${order.total_amount_twd}
            </div>
            <button class="btn-action btn-detail" data-id="${
              order.id
            }">訂單詳情</button>
        </div>
        <div class="order-card-body">
            <div class="order-status-tags">
                <span class="tag ${orderStatusClass}">${orderStatusText}</span>
                <span class="tag ${paymentStatusClass}">${paymentStatusText}</span>
            </div>
            <ul class="order-item-list">
                ${order.items
                  .slice(0, 2)
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
                  .join("")}
                ${
                  order.items.length > 2
                    ? `<li class="order-item" style="color:var(--text-light); border-bottom: none;">... 還有 ${
                        order.items.length - 2
                      } 項商品</li>`
                    : ""
                }
                ${
                  order.items.length === 0
                    ? `<li class="order-item" style="color:var(--text-light); border-bottom: none;">無商品資料</li>`
                    : ""
                }
            </ul>
        </div>
        <div id="detail-${order.id}" style="display:none;">
            </div>
    `;
    container.appendChild(orderCard);
  });
}
