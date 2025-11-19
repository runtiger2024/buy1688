// frontend/js/sharedUtils.js
import { API_URL } from "./config.js";

/**
 * 異步載入共用組件 (例如頁首、頁尾)
 */
export async function loadComponent(componentPath, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) {
    // console.warn(`警告: 找不到 ID 為 "${placeholderId}" 的佔位符。`);
    return;
  }
  try {
    const response = await fetch(componentPath);
    if (!response.ok) {
      throw new Error(`無法載入 ${componentPath} - 狀態: ${response.status}`);
    }
    const html = await response.text();
    placeholder.innerHTML = html;
  } catch (error) {
    console.error(`載入組件失敗: ${error.message}`);
    placeholder.innerHTML = `<p style="color:red; text-align:center;">${componentPath} 載入失敗。</p>`;
  }
}

/**
 * 獲取儲存的 客戶資訊
 */
export function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem("customerUser"));
  } catch (e) {
    return null;
  }
}

/**
 * 檢查是否已登入，若無則跳轉
 */
export function checkAuth(redirect = true) {
  const token = localStorage.getItem("customerToken");
  if (!token) {
    if (redirect) {
      alert("請先登入會員才能進行此操作。");
      window.location.href = "../html/login.html";
    }
    return false;
  }
  return true;
}

/**
 * 獲取 Token (供 API 呼叫使用)
 */
export function getAuthToken() {
  return localStorage.getItem("customerToken");
}

/**
 * 客戶登出
 */
export function customerLogout() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customerUser");
  alert("您已成功登出。");
  window.location.href = "../html/index.html";
}

/**
 * [修正] 設置導覽列上的客戶認證狀態 (包含桌面版與手機版)
 */
export function setupCustomerAuth() {
  const customer = getCustomer();

  // 1. 桌面版頂部導航處理
  const desktopLinks = document.getElementById("nav-auth-links-desktop");
  if (desktopLinks) {
    if (customer) {
      // 已登入狀態
      desktopLinks.innerHTML = `
        <span style="font-size:0.9rem; color:#666; margin-right:10px;">Hi, ${customer.paopao_id}</span>
        <a href="../html/my-account.html" class="nav-link">我的訂單</a>
        <span style="color:#ddd; margin:0 5px;">|</span>
        <a href="#" id="logout-btn-desktop" class="nav-link">登出</a>
      `;
      // 綁定登出
      document
        .getElementById("logout-btn-desktop")
        .addEventListener("click", (e) => {
          e.preventDefault();
          customerLogout();
        });
    } else {
      // 未登入狀態
      desktopLinks.innerHTML = `
        <a href="../html/login.html" class="nav-link">登入</a>
        <span style="color:#ddd; margin:0 5px;">|</span>
        <a href="../html/register.html" class="nav-link" style="color:var(--taobao-orange); font-weight:bold;">免費註冊</a>
      `;
    }
  }

  // 2. 手機版底部導航處理
  const tabAccount = document.getElementById("tab-account");
  if (tabAccount) {
    const icon = tabAccount.querySelector("i");
    const text = tabAccount.querySelector("span");

    if (customer) {
      // 已登入
      tabAccount.href = "./my-account.html";
      if (text) text.textContent = "我的";
    } else {
      // 未登入 (引導去登入)
      tabAccount.href = "./login.html";
      if (text) text.textContent = "登入";
      // 可選：改變圖示提示用戶
      // if(icon) icon.className = "fas fa-sign-in-alt";
    }
  }

  // 3. 頁尾連結 (如果有)
  const footerLinks = document.getElementById("footer-auth-links");
  if (footerLinks) {
    footerLinks.style.display = customer ? "none" : "block";
  }
}

/**
 * 設置漢堡選單邏輯 (目前樣式已隱藏漢堡，但保留邏輯以免報錯)
 */
export function setupHamburgerMenu() {
  const toggleButton = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("nav-menu");

  if (toggleButton && menu) {
    toggleButton.addEventListener("click", () => {
      menu.classList.toggle("active");
    });
  }
}

/**
 * 購物車與倉庫相關函式 (保持不變)
 */
export function loadCart(shoppingCart) {
  const savedCart = localStorage.getItem("shoppingCart");
  Object.keys(shoppingCart).forEach((key) => delete shoppingCart[key]);
  if (savedCart) {
    try {
      Object.assign(shoppingCart, JSON.parse(savedCart));
    } catch (e) {
      console.error("解析購物車失敗:", e);
    }
  }
  return shoppingCart;
}

export function addToCart(shoppingCart, id, name, price) {
  if (shoppingCart[id]) {
    shoppingCart[id].quantity++;
  } else {
    shoppingCart[id] = {
      name: name,
      price: price,
      quantity: 1,
    };
  }
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
}

export async function loadAvailableWarehouses() {
  try {
    const response = await fetch(`${API_URL}/warehouses`);
    if (!response.ok) throw new Error("載入集運倉失敗");
    const allWarehouses = await response.json();
    return allWarehouses.filter((wh) => wh.is_active);
  } catch (error) {
    console.error("獲取集運倉失敗:", error);
    return [];
  }
}

export function populateWarehouseSelect(selectId, warehouses) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">-- 請選擇集運倉 --</option>';

  if (warehouses.length === 0) {
    selectEl.innerHTML = '<option value="">無可用集運倉</option>';
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;
  warehouses.forEach((wh) => {
    const option = document.createElement("option");
    option.value = wh.id;
    option.textContent = `${wh.name} - ${wh.address.substring(0, 15)}...`;
    selectEl.appendChild(option);
  });
}
