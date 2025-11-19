// frontend/js/app.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  getCustomer,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadCart,
  addToCart,
  loadAvailableWarehouses,
  populateWarehouseSelect,
  checkAuth,
  getAuthToken,
} from "./sharedUtils.js";

let shoppingCart = {};
let currentCategoryId = null;
let currentSearchTerm = "";
let availableWarehouses = [];

document.addEventListener("DOMContentLoaded", async () => {
  // 1. 載入導航與組件
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  loadComponent("../html/_header.html", "notice-placeholder");

  // 2. 初始化功能
  setupHamburgerMenu();
  setupCustomerAuth();
  setupBottomNav();

  // 3. 載入資料
  loadCart(shoppingCart);
  updateCartCount();

  availableWarehouses = await loadAvailableWarehouses();
  populateWarehouseSelect("warehouse-select", availableWarehouses);

  loadCategories();

  // 4. 處理 URL 參數
  const params = new URLSearchParams(window.location.search);
  const categoryFromUrl = params.get("category");
  if (categoryFromUrl) currentCategoryId = categoryFromUrl;

  fetchProducts();

  // 5. 綁定搜尋事件
  setupSearchEvents();

  // 6. 設置購物車 Modal
  setupCartModal();
  setupCheckoutForm();
});

// --- 導航與 UI 邏輯 ---

function setupBottomNav() {
  const path = window.location.pathname;
  // 簡單判斷首頁 HighLight
  if (path.includes("index.html") || path === "/" || path.endsWith("/")) {
    document.getElementById("tab-home")?.classList.add("active");
  }

  // 綁定底部購物車按鈕 -> 觸發 Modal
  const bottomCartBtn = document.getElementById("tab-cart");
  if (bottomCartBtn) {
    bottomCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("cart-button").click();
    });
  }

  // 綁定桌面版購物車按鈕 (Navbar 裡的)
  const desktopCartLink = document.getElementById("nav-cart-link-desktop");
  if (desktopCartLink) {
    desktopCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("cart-button").click();
    });
  }
}

function setupSearchEvents() {
  const searchInput = document.getElementById("product-search-input");
  const searchButton = document.getElementById("product-search-button");

  if (searchButton) {
    searchButton.addEventListener("click", () => {
      currentSearchTerm = searchInput.value;
      fetchProducts();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        currentSearchTerm = searchInput.value;
        fetchProducts();
      }
    });
  }
}

// --- 分類與商品載入邏輯 ---

async function loadCategories() {
  const filterBar = document.getElementById("category-filter-bar");
  try {
    const response = await fetch(`${API_URL}/categories`);
    if (!response.ok) throw new Error("載入分類失敗");
    const categories = await response.json();

    filterBar.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "category-filter-btn";
    allBtn.textContent = "全部";
    allBtn.dataset.id = "all";
    allBtn.addEventListener("click", () => handleCategoryClick(null, allBtn));
    filterBar.appendChild(allBtn);

    categories.forEach((category) => {
      const btn = document.createElement("button");
      btn.className = "category-filter-btn";
      btn.textContent = category.name;
      btn.dataset.id = category.id;
      btn.addEventListener("click", () =>
        handleCategoryClick(category.id, btn)
      );
      filterBar.appendChild(btn);
    });

    if (currentCategoryId) {
      const activeButton = document.querySelector(
        `.category-filter-btn[data-id="${currentCategoryId}"]`
      );
      if (activeButton) activeButton.classList.add("active");
    } else {
      allBtn.classList.add("active");
    }
  } catch (error) {
    console.error("獲取分類失敗:", error);
    filterBar.innerHTML = '<p style="color: red; margin: 0;">載入失敗</p>';
  }
}

function handleCategoryClick(categoryId, clickedButton) {
  document.querySelectorAll(".category-filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  clickedButton.classList.add("active");
  currentCategoryId = categoryId;
  fetchProducts();

  const url = new URL(window.location);
  if (currentCategoryId) {
    url.searchParams.set("category", currentCategoryId);
  } else {
    url.searchParams.delete("category");
  }
  history.pushState({}, "", url);
}

async function fetchProducts() {
  const productListDiv = document.getElementById("product-list");
  productListDiv.innerHTML =
    '<p style="text-align:center; width:100%;">商品載入中...</p>';

  try {
    const params = new URLSearchParams();
    if (currentCategoryId) params.append("category", currentCategoryId);
    if (currentSearchTerm) params.append("search", currentSearchTerm);

    const response = await fetch(`${API_URL}/products?${params.toString()}`);
    if (!response.ok) throw new Error("載入商品失敗");
    const products = await response.json();

    productListDiv.innerHTML = "";

    if (products.length === 0) {
      productListDiv.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 40px;">
            <p style="color: #999;">暫無符合的商品</p>
        </div>`;
      return;
    }

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-card";

      const imageUrl =
        product.images && product.images.length > 0
          ? product.images[0]
          : "https://via.placeholder.com/300x300?text=No+Image";
      const fakeSold = Math.floor(Math.random() * 500) + 10;

      // 判斷是否有規格
      const hasSpecs = product.specs && product.specs.length > 0;

      card.innerHTML = `
        <a href="../html/product.html?id=${product.id}" class="product-card-link">
            <img src="${imageUrl}" alt="${product.name}" loading="lazy">
        </a>
        <div class="product-info">
            <h3>${product.name}</h3>
            <div class="product-meta">
                <div class="price-wrapper">
                    <span class="price-currency">TWD</span>
                    <span class="product-price">${product.price_twd}</span>
                    <span class="product-sales">已售 ${fakeSold} 件</span>
                </div>
                <button class="btn-add-cart-icon" 
                        data-id="${product.id}" 
                        data-name="${product.name}" 
                        data-price="${product.price_twd}"
                        data-has-specs="${hasSpecs}">
                    <i class="fas fa-cart-plus"></i>
                </button>
            </div>
        </div>
      `;
      productListDiv.appendChild(card);
    });

    // 綁定「加入購物車」按鈕事件
    document.querySelectorAll(".btn-add-cart-icon").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation(); // 防止點擊跳轉詳情頁

        // [重要] 如果有規格，必須強制跳轉詳情頁
        if (button.dataset.hasSpecs === "true") {
          window.location.href = `../html/product.html?id=${button.dataset.id}`;
          return;
        }

        // 無規格商品直接加入
        const id = button.dataset.id;
        const name = button.dataset.name;
        const price = parseInt(button.dataset.price, 10);

        addToCart(shoppingCart, id, name, price);

        // 按鈕動畫
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => (button.innerHTML = originalContent), 1000);

        updateCartCount();
      });
    });
  } catch (error) {
    console.error("獲取商品失敗:", error);
    productListDiv.innerHTML =
      '<p style="color: red; text-align:center;">載入失敗</p>';
  }
}

// --- 購物車 Modal 與 結帳邏輯 ---

const modal = document.getElementById("cart-modal");
const openBtn = document.getElementById("cart-button"); // 桌面版懸浮按鈕
const closeBtn = document.getElementById("close-modal");

function setupCartModal() {
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (!checkAuth(false)) {
        if (
          confirm("請先登入或註冊會員才能查看購物車。\n\n是否前往登入頁面？")
        ) {
          window.location.href = "../html/login.html";
        }
        return;
      }

      autofillCheckoutForm();
      renderCart();

      // 顯示結帳表單
      const formContainer = document.getElementById("checkout-form-container");
      if (formContainer) formContainer.style.display = "block";

      modal.style.display = "flex"; // 使用 flex 支援 RWD 居中/底部
      modal.classList.add("active");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
      modal.classList.remove("active");
    });
  }

  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
      modal.classList.remove("active");
    }
  });

  // 購物車項目操作 (加減/刪除)
  const cartList = document.getElementById("cart-items-list");
  if (cartList) {
    cartList.addEventListener("click", (event) => {
      const target = event.target;
      const id = target.dataset.id; // 這裡的 id 是 cartKey

      if (target.classList.contains("qty-btn") && id) {
        if (!shoppingCart[id]) return;
        let newQuantity = shoppingCart[id].quantity;

        if (target.dataset.action === "plus") newQuantity++;
        else if (target.dataset.action === "minus") newQuantity--;

        if (newQuantity <= 0) delete shoppingCart[id];
        else shoppingCart[id].quantity = newQuantity;

        renderCart();
        return;
      }

      if (target.classList.contains("remove-item")) {
        delete shoppingCart[id];
        renderCart();
      }
    });
  }
}

function renderCart() {
  const cartItemsList = document.getElementById("cart-items-list");
  let totalAmount = 0;

  if (Object.keys(shoppingCart).length === 0) {
    cartItemsList.innerHTML = `
        <div style="text-align:center; padding:30px; color:#999;">
            <i class="fas fa-shopping-cart" style="font-size:40px; margin-bottom:10px;"></i>
            <p>購物車是空的</p>
        </div>`;
  } else {
    cartItemsList.innerHTML = "";
    // 遍歷購物車 (key 可能包含規格後綴)
    for (const key in shoppingCart) {
      const item = shoppingCart[key];
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      cartItemsList.innerHTML += `
        <div class="cart-item">
            <div class="cart-item-info">
                <p>${item.name} ${
        item.spec
          ? `<span style="font-weight:normal; color:#666; font-size:0.85rem;">(${item.spec})</span>`
          : ""
      }</p>
                <span>TWD ${item.price}</span>
            </div>
            <div class="cart-item-actions">
                <div class="quantity-control" data-id="${key}">
                    <button class="qty-btn" data-action="minus" data-id="${key}">-</button>
                    <input type="number" class="cart-item-quantity" value="${
                      item.quantity
                    }" readonly>
                    <button class="qty-btn" data-action="plus" data-id="${key}">+</button>
                </div>
                <button class="remove-item" data-id="${key}" style="border:none; background:none; font-size:1.2rem; color:#999; cursor:pointer;">&times;</button>
            </div>
        </div>`;
    }
  }

  const totalEl = document.getElementById("cart-total-amount");
  if (totalEl) totalEl.textContent = totalAmount.toLocaleString();

  updateCartCount();
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error(e);
  }
}

function updateCartCount() {
  let count = 0;
  for (const key in shoppingCart) {
    count += shoppingCart[key].quantity;
  }

  const deskCount = document.getElementById("cart-count");
  if (deskCount) deskCount.textContent = count;

  const mobileBadge = document.getElementById("mobile-cart-count");
  if (mobileBadge) {
    mobileBadge.textContent = count;
    mobileBadge.style.display = count > 0 ? "block" : "none";
  }
}

function autofillCheckoutForm() {
  const customer = getCustomer();
  const paopaoIdInput = document.getElementById("checkout-paopao-id");
  const emailInput = document.getElementById("checkout-customer-email");

  if (customer && paopaoIdInput && emailInput) {
    paopaoIdInput.value = customer.paopao_id;
    emailInput.value = customer.email;
  }
}

function setupCheckoutForm() {
  const checkoutForm = document.getElementById("checkout-form");
  if (!checkoutForm) return;

  const checkoutButton = document.getElementById("checkout-button");
  const warehouseSelect = document.getElementById("warehouse-select");

  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;
    const token = getAuthToken();

    const warehouseId = warehouseSelect.value;
    if (!warehouseId) {
      alert("請選擇一個集運倉！");
      return;
    }

    if (Object.keys(shoppingCart).length === 0) {
      alert("購物車是空的！");
      return;
    }

    checkoutButton.disabled = true;
    checkoutButton.textContent = "處理中...";

    // [重要] 轉換購物車資料為後端格式，包含規格
    const items = Object.values(shoppingCart).map((item) => ({
      id: item.id, // 商品原始 ID
      quantity: item.quantity,
      spec: item.spec, // 商品規格
    }));

    const orderData = {
      paopaoId: document.getElementById("checkout-paopao-id").value,
      customerEmail: document.getElementById("checkout-customer-email").value,
      payment_method: "OFFLINE_TRANSFER",
      warehouse_id: parseInt(warehouseId, 10),
      items: items,
    };

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "訂單提交失敗");

      alert("訂單提交成功！\n請至「我的訂單」查看匯款資訊。");

      shoppingCart = {};
      localStorage.removeItem("shoppingCart");
      renderCart();

      modal.style.display = "none";
      modal.classList.remove("active");
      window.location.href = "./my-account.html";
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = "確認訂購";
    }
  });
}
