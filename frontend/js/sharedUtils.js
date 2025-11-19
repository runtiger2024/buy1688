// frontend/js/sharedUtils.js
import { API_URL } from "./config.js";

/**
 * 異步載入共用組件 (例如頁首、頁尾)
 */
export async function loadComponent(componentPath, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) {
    console.warn(`警告: 找不到 ID 為 "${placeholderId}" 的佔位符。`);
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
 * [新增] 檢查是否已登入，若無則跳轉
 */
export function checkAuth(redirect = true) {
  const token = localStorage.getItem("customerToken");
  if (!token) {
    if (redirect) {
      alert("請先登入會員才能進行此操作。");
      window.location.href = "./login.html"; // 假設相對路徑是正確的
    }
    return false;
  }
  return true;
}

/**
 * [新增] 獲取 Token (供 API 呼叫使用)
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
  // 假設登出後都導回首頁
  window.location.href = "./index.html";
}

/**
 * 設置導覽列上的客戶認證狀態和連結
 */
export function setupCustomerAuth() {
  const customer = getCustomer();
  const desktopLinks = document.getElementById("nav-auth-links-desktop");
  const mobileLinks = document.getElementById("nav-auth-links-mobile");
  const footerLinks = document.getElementById("footer-auth-links");

  // 1. Navbar 連結處理
  if (desktopLinks && mobileLinks) {
    if (customer) {
      const commonLinks = `
        <a href="../html/my-account.html" class="nav-link">我的訂單</a>
        <button id="logout-btn" class="btn-small-delete">登出</button>
      `;
      desktopLinks.innerHTML = commonLinks;
      mobileLinks.innerHTML = commonLinks;

      // 綁定所有登出按鈕
      document.querySelectorAll("#logout-btn").forEach((btn) => {
        btn.addEventListener("click", customerLogout);
      });
    } else {
      desktopLinks.innerHTML = `
        <a href="../html/login.html" class="nav-link-button">會員登入</a>
      `;
      mobileLinks.innerHTML = `
        <a href="../html/login.html" class="nav-link-button">會員登入</a>
        <a href="../html/register.html" class="nav-link">免費註冊</a>
      `;
    }
  }

  // 2. Footer 連結處理
  if (footerLinks) {
    footerLinks.style.display = customer ? "none" : "block";
  }
}

/**
 * 設置漢堡選單邏輯
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
 * 從 localStorage 載入購物車
 * @param {object} shoppingCart - 傳入當前的購物車物件 (會被修改)
 * @returns {object} - 更新後的購物車物件
 */
export function loadCart(shoppingCart) {
  const savedCart = localStorage.getItem("shoppingCart");
  // 清空舊的購物車物件並複製新資料
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

/**
 * 將商品加入購物車
 * @param {object} shoppingCart - 傳入當前的購物車物件 (會被修改)
 * @param {string} id - 商品 ID
 * @param {string} name - 商品名稱
 * @param {number} price - 商品價格
 */
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

/**
 * [新增] 載入已啟用的倉庫資料
 * @returns {Promise<Array>} - 已啟用的倉庫陣列
 */
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

/**
 * [新增] 填充倉庫下拉選單
 * @param {string} selectId - 下拉選單的 ID
 * @param {Array} warehouses - 倉庫資料陣列
 */
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
    // [修改] 這裡改為只顯示倉庫名稱
    option.textContent = wh.name;
    selectEl.appendChild(option);
  });
}
