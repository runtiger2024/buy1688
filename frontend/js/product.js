// frontend/js/product.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadCart,
  addToCart,
} from "./sharedUtils.js";

let shoppingCart = {};
let currentProduct = null;
let selectedSpec = null; // 儲存當前選擇的規格

document.addEventListener("DOMContentLoaded", async () => {
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();

  // [修正] 使用正確的 ID 'nav-cart-link-desktop'
  const navCartLink = document.getElementById("nav-cart-link-desktop");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      // 商品頁沒有購物車 Modal，所以導向回首頁並開啟購物車
      window.location.href = "./index.html#cart-modal";
    });
  }

  loadCart(shoppingCart);

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
    if (!response.ok) throw new Error("找不到商品");
    currentProduct = await response.json();
    renderProduct(currentProduct);
  } catch (error) {
    console.error(error);
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

  const images =
    product.images && product.images.length > 0
      ? product.images
      : ["https://via.placeholder.com/500"];
  const mainImageSrc = images[0];
  let thumbnailsHtml = "";
  if (images.length > 1) {
    thumbnailsHtml = `<div class="thumbnail-list">`;
    images.forEach((img, index) => {
      const activeClass = index === 0 ? "active" : "";
      thumbnailsHtml += `<img src="${img}" class="thumbnail ${activeClass}" onclick="changeMainImage('${img}', this)">`;
    });
    thumbnailsHtml += `</div>`;
  }

  // [新增] 規格 HTML 生成
  let specsHtml = "";
  if (product.specs && product.specs.length > 0) {
    specsHtml = `
        <div class="specs-container" style="margin-bottom:20px;">
            <div class="specs-title">規格選項：</div>
            <div class="specs-list" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">
                ${product.specs
                  .map(
                    (s) =>
                      `<div class="spec-btn" onclick="selectSpec(this, '${s}')">${s}</div>`
                  )
                  .join("")}
            </div>
        </div>
      `;
  }

  // [新增] 直購提示
  const directBuyHtml = product.is_direct_buy
    ? `<div style="color:#ff5000; margin-bottom:10px; font-weight:bold;"><i class="fas fa-plane"></i> 此為台灣直購商品 (不經集運倉)</div>`
    : "";

  container.innerHTML = `
    <div class="product-detail-layout">
        <div class="product-detail-image">
            <div class="main-image-container"><img id="main-image" src="${mainImageSrc}" alt="${
    product.name
  }"></div>
            ${thumbnailsHtml}
        </div>
        <div class="product-detail-info">
            <div class="product-price-large"><small>TWD</small> ${
              product.price_twd
            }</div>
            <div class="product-title-section">
                <h1>${product.name}</h1>
                ${directBuyHtml}
                <span style="color:#999; font-size:0.9rem;">庫存充足</span>
            </div>
            ${specsHtml} <div class="product-detail-description"><strong>商品描述：</strong><br>${
    product.description || "無描述"
  }</div>
            <div class="desktop-actions">
                <button class="btn-add-cart-lg" id="desktop-add-cart">加入購物車</button>
                <button class="btn-buy-now-lg" id="desktop-buy-now">立即購買</button>
            </div>
        </div>
    </div>
  `;

  document
    .getElementById("desktop-add-cart")
    .addEventListener("click", () => handleAddToCart());
  document.getElementById("desktop-buy-now").addEventListener("click", () => {
    if (handleAddToCart()) window.location.href = "./index.html#cart-modal";
  });
  document
    .getElementById("mobile-add-cart")
    .addEventListener("click", () => handleAddToCart());
  document.getElementById("mobile-buy-now").addEventListener("click", () => {
    if (handleAddToCart()) window.location.href = "./index.html#cart-modal";
  });
}

// [新增] 規格選擇函式 (掛載到 window)
window.selectSpec = function (el, spec) {
  document
    .querySelectorAll(".spec-btn")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  selectedSpec = spec;
};

function handleAddToCart() {
  if (!currentProduct) return false;

  if (
    currentProduct.specs &&
    currentProduct.specs.length > 0 &&
    !selectedSpec
  ) {
    alert("請先選擇規格！");
    return false;
  }

  // 呼叫 addToCart 並接收結果
  const result = addToCart(
    shoppingCart,
    currentProduct.id,
    currentProduct.name,
    currentProduct.price_twd,
    selectedSpec,
    currentProduct.is_direct_buy // [新增] 傳入直購屬性
  );

  // 如果加入失敗 (因為混用)，顯示錯誤訊息並中止
  if (!result.success) {
    alert(result.message);
    return false;
  }

  const typeMsg = currentProduct.is_direct_buy ? "(直購商品)" : "";
  alert(
    `已將 ${currentProduct.name} ${selectedSpec || ""} ${typeMsg} 加入購物車！`
  );
  return true;
}

function displayError(message) {
  const container = document.getElementById("product-detail-container");
  container.innerHTML = `<p style="color:red; text-align:center; padding:50px;">${message}</p>`;
}

window.changeMainImage = function (src, thumbnailElement) {
  const mainImg = document.getElementById("main-image");
  mainImg.src = src;
  document
    .querySelectorAll(".thumbnail")
    .forEach((el) => el.classList.remove("active"));
  thumbnailElement.classList.add("active");
};
