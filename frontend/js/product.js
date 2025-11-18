import { API_URL } from "./config.js";

// --- 全域變數 ---
let shoppingCart = {};

// --- 幫助函式 ---

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

/**
 * 從 localStorage 載入購物車
 */
function loadCart() {
  const savedCart = localStorage.getItem("shoppingCart");
  if (savedCart) {
    try {
      shoppingCart = JSON.parse(savedCart);
    } catch (e) {
      console.error("解析購物車失敗:", e);
      shoppingCart = {};
    }
  }
}

/**
 * 加入商品到購物車
 */
function addToCart(id, name, price) {
  if (shoppingCart[id]) {
    shoppingCart[id].quantity++;
  } else {
    shoppingCart[id] = {
      name: name,
      price: price,
      quantity: 1,
    };
  }

  // 保存購物車
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
    alert(`${name} 已加入購物車！`);
    // 注意：這個頁面沒有購物車圖示，所以我們不更新計數
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
}

// --- 【第十批優化：重構 Navbar 相關邏輯】 ---
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
  // 1. 載入共用組件 (Navbar)
  await loadComponent("../html/_navbar.html", "navbar-placeholder");

  // 2. 綁定 Navbar 功能
  setupHamburgerMenu();
  setupCustomerAuth();

  // (此頁面不需要 _header.html 公告欄)

  // 3. 載入本地購物車
  loadCart();

  // 4. 從 URL 獲取商品 ID
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  if (!productId) {
    displayError("錯誤：找不到商品 ID。");
    return;
  }

  // 5. 根據 ID 載入商品
  fetchProductDetails(productId);
});

/**
 * 呼叫後端 API 載入單一商品
 */
async function fetchProductDetails(id) {
  const container = document.getElementById("product-detail-container");
  try {
    // 【修正】確保 API_URL 正確
    const response = await fetch(`${API_URL}/products/${id}`);
    if (!response.ok) {
      throw new Error("找不到商品或載入失敗");
    }
    const product = await response.json();
    renderProduct(product);
  } catch (error) {
    console.error("獲取商品詳情失敗:", error);
    displayError(error.message);
  }
}

/**
 * 將商品資料渲染為 HTML
 */
function renderProduct(product) {
  const container = document.getElementById("product-detail-container");

  // 1. 更新頁面標題
  document.title = `${product.name} - 代採購平台`;

  // 2. 更新麵包屑導覽
  // (後端 server.js 在第八批次中已更新，會回傳 product.category)
  if (product.category) {
    document.getElementById("breadcrumb-separator").style.display = "inline";
    const categoryLink = document.getElementById("breadcrumb-category");
    categoryLink.textContent = product.category.name;
    // 讓分類連結可以點擊返回首頁並篩選
    // 【修正】路徑必須是 ./index.html
    categoryLink.href = `./index.html?category=${product.category_id}`;
  }

  // 3. 渲染商品詳情
  const imageUrl = product.image_url || ""; // 預設圖片

  container.innerHTML = `
    <div class="product-detail-layout">
        <div class="product-detail-image">
            <img src="${imageUrl}" alt="${product.name}">
        </div>
        <div class="product-detail-info">
            <h1>${product.name}</h1>
            <p class="product-detail-description">${
              product.description || "此商品沒有額外描述。"
            }</p>
            <div class="product-detail-price">TWD ${product.price_twd}</div>
            <button class="add-to-cart-btn" id="detail-add-to-cart">
                加入購物車
            </button>
        </div>
    </div>
  `;

  // 4. 為新的「加入購物車」按鈕綁定事件
  document
    .getElementById("detail-add-to-cart")
    .addEventListener("click", () => {
      addToCart(product.id, product.name, product.price_twd);
    });
}

/**
 * 顯示錯誤訊息
 */
function displayError(message) {
  const container = document.getElementById("product-detail-container");
  container.innerHTML = `<p style="color:red; text-align:center;">${message}</p>`;
}
