import { API_URL } from "./config.js";

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

  // 4. 載入此頁面元件
  loadComponent("../html/_header.html", "notice-placeholder");

  // 5. 載入訂單
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
    container.innerHTML = `<p style="color:red;">${error.message}。 <a href="../html/login.html">點此重新登入</a></p>`;
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

    // --- 【第九批優化：使用翻譯字典】 ---
    // 2. 處理狀態 (CSS class 不變, 顯示文字改變)
    const paymentStatusClass = `status-${order.payment_status}`; // e.g., "status-PAID"
    const orderStatusClass = `status-${order.status}`; // e.g., "status-Pending"

    // 翻譯文字
    const paymentStatusText =
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
    const orderStatusText = ORDER_STATUS_MAP[order.status] || order.status;
    // --- 【優化結束】 ---

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
                <span class="tag ${orderStatusClass}">${orderStatusText}</span>
                <span class="tag ${paymentStatusClass}">${paymentStatusText}</span>
            </div>
            <ul class="order-item-list">
                ${itemsHtml}
            </ul>
        </div>
    `;
    container.appendChild(orderCard);
  });
}
