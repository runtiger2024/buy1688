// frontend/js/product.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadCart,
  addToCart,
} from "./sharedUtils.js"; // <-- 導入共用函式

// --- 全域變數 ---
let shoppingCart = {};

// --- 幫助函式 ---

// [修改] loadCart, addToCart 使用共用函式
function initCart() {
  loadCart(shoppingCart);
}

function handleAddToCart(id, name, price) {
  addToCart(shoppingCart, id, name, price);
  alert(`${name} 已加入購物車！`);
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

  initCart(); // [修改] 使用新的 initCart

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
      handleAddToCart(product.id, product.name, product.price_twd);
    });
}

function displayError(message) {
  const container = document.getElementById("product-detail-container");
  container.innerHTML = `<p style="color:red; text-align:center;">${message}</p>`;
}
