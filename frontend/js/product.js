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

  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
    alert(`${name} 已加入購物車！`);
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
}

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

// [新增] 全域切換圖片函式 (掛載到 window 以便 HTML onclick 呼叫)
window.changeMainImage = function (src, thumbnailElement) {
  const mainImg = document.getElementById("main-image");
  mainImg.src = src;

  // 更新縮圖選中狀態
  document
    .querySelectorAll(".thumbnail")
    .forEach((el) => el.classList.remove("active"));
  thumbnailElement.classList.add("active");
};

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", async () => {
  await loadComponent("../html/_navbar.html", "navbar-placeholder");

  setupHamburgerMenu();
  setupCustomerAuth();

  // [新增] 處理導覽列上的 "我的購物車" 連結
  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      // 由於商品詳情頁沒有購物車 Modal，這裡導回首頁
      window.location.href = "./index.html";
    });
  }

  loadCart();

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  if (!productId) {
    displayError("錯誤：找不到商品 ID。");
    return;
  }

  fetchProductDetails(productId);
});

async function fetchProductDetails(id) {
  const container = document.getElementById("product-detail-container");
  try {
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

function renderProduct(product) {
  const container = document.getElementById("product-detail-container");

  document.title = `${product.name} - 代採購平台`;

  if (product.category) {
    document.getElementById("breadcrumb-separator").style.display = "inline";
    const categoryLink = document.getElementById("breadcrumb-category");
    categoryLink.textContent = product.category.name;
    categoryLink.href = `./index.html?category=${product.category_id}`;
  }

  // [修改] 處理圖片陣列
  const images =
    product.images && product.images.length > 0 ? product.images : [""];
  const mainImageSrc = images[0];

  // 生成縮圖 HTML
  let thumbnailsHtml = "";
  if (images.length > 1) {
    thumbnailsHtml = `<div class="thumbnail-list">`;
    images.forEach((img, index) => {
      const activeClass = index === 0 ? "active" : "";
      thumbnailsHtml += `<img src="${img}" class="thumbnail ${activeClass}" onclick="changeMainImage('${img}', this)">`;
    });
    thumbnailsHtml += `</div>`;
  }

  container.innerHTML = `
    <div class="product-detail-layout">
        <div class="product-detail-image">
            <div class="main-image-container">
                <img id="main-image" src="${mainImageSrc}" alt="${
    product.name
  }">
            </div>
            ${thumbnailsHtml}
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

  document
    .getElementById("detail-add-to-cart")
    .addEventListener("click", () => {
      addToCart(product.id, product.name, product.price_twd);
    });
}

function displayError(message) {
  const container = document.getElementById("product-detail-container");
  container.innerHTML = `<p style="color:red; text-align:center;">${message}</p>`;
}
