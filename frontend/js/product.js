// frontend/js/product.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadCart,
  addToCart,
} from "./sharedUtils.js";

// --- 全域變數 ---
let shoppingCart = {};

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", async () => {
  // 1. 載入 Navbar
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();

  // 2. 處理 Navbar 購物車連結 (導回首頁)
  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html#cart-modal";
    });
  }

  // 3. 載入購物車狀態
  loadCart(shoppingCart);

  // 4. 獲取商品資料
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  if (!productId) {
    displayError("錯誤：找不到商品 ID。");
    return;
  }

  fetchProductDetails(productId);
});

async function fetchProductDetails(id) {
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

  // 設定麵包屑
  if (product.category) {
    document.getElementById("breadcrumb-separator").style.display = "inline";
    const categoryLink = document.getElementById("breadcrumb-category");
    categoryLink.textContent = product.category.name;
    categoryLink.href = `./index.html?category=${product.category_id}`;
  }

  // 處理圖片
  const images =
    product.images && product.images.length > 0
      ? product.images
      : ["https://via.placeholder.com/500"];
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

  // 渲染主體 HTML (Phase 2 Layout)
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
            <div class="product-price-large">
                <small>TWD</small> ${product.price_twd}
            </div>

            <div class="product-title-section">
                <h1>${product.name}</h1>
                <span style="color:#999; font-size:0.9rem;">月銷 ${Math.floor(
                  Math.random() * 200
                )} | 庫存充足</span>
            </div>

            <div class="product-detail-description">
                <strong>商品描述：</strong><br>
                ${product.description || "此商品沒有額外描述。"}
            </div>

            <div class="desktop-actions">
                <button class="btn-add-cart-lg" id="desktop-add-cart">加入購物車</button>
                <button class="btn-buy-now-lg" id="desktop-buy-now">立即購買</button>
            </div>
        </div>
    </div>
  `;

  // 綁定桌面版按鈕事件
  document.getElementById("desktop-add-cart").addEventListener("click", () => {
    handleAddToCart(product.id, product.name, product.price_twd);
  });
  document.getElementById("desktop-buy-now").addEventListener("click", () => {
    handleAddToCart(product.id, product.name, product.price_twd);
    // 導向首頁並開啟購物車
    window.location.href = "./index.html";
  });

  // 綁定手機版底部按鈕事件
  document.getElementById("mobile-add-cart").addEventListener("click", () => {
    handleAddToCart(product.id, product.name, product.price_twd);
  });
  document.getElementById("mobile-buy-now").addEventListener("click", () => {
    handleAddToCart(product.id, product.name, product.price_twd);
    window.location.href = "./index.html";
  });
}

function handleAddToCart(id, name, price) {
  addToCart(shoppingCart, id, name, price);
  alert(`已將 ${name} 加入購物車！`);
}

function displayError(message) {
  const container = document.getElementById("product-detail-container");
  container.innerHTML = `<p style="color:red; text-align:center; padding:50px;">${message}</p>`;
}

// 全域圖片切換函式
window.changeMainImage = function (src, thumbnailElement) {
  const mainImg = document.getElementById("main-image");
  mainImg.src = src;

  document
    .querySelectorAll(".thumbnail")
    .forEach((el) => el.classList.remove("active"));
  thumbnailElement.classList.add("active");
};
