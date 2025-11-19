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
  setupCustomerAuth(); // 處理登入狀態顯示
  setupBottomNav(); // [新增] 設置底部導航狀態

  // 3. 載入資料
  loadCart(shoppingCart);
  updateCartCount();

  availableWarehouses = await loadAvailableWarehouses();
  populateWarehouseSelect("warehouse-select", availableWarehouses);

  loadCategories();

  // 4. 處理 URL 參數
  const params = new URLSearchParams(window.location.search);
  const categoryFromUrl = params.get("category");
  if (categoryFromUrl) {
    currentCategoryId = categoryFromUrl;
  }
  fetchProducts();

  // 5. 綁定搜尋事件
  setupSearchEvents();

  // 6. 設置購物車 Modal
  setupCartModal();
  setupCheckoutForm();
});

// [新增] 設置底部導航的 Active 狀態與購物車點擊
function setupBottomNav() {
  // 根據當前頁面點亮圖標
  const path = window.location.pathname;
  if (path.includes("index.html") || path === "/") {
    document.getElementById("tab-home")?.classList.add("active");
  } else if (path.includes("assist.html")) {
    document.getElementById("tab-assist")?.classList.add("active");
  } else if (path.includes("my-account.html")) {
    document.getElementById("tab-account")?.classList.add("active");
  }

  // 綁定底部購物車按鈕 -> 打開 Modal
  const bottomCartBtn = document.getElementById("tab-cart");
  if (bottomCartBtn) {
    bottomCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("cart-button").click(); // 觸發既有的 Modal 邏輯
    });
  }

  // 綁定桌面版購物車按鈕
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

    // 設置 Active 狀態
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
    filterBar.innerHTML = '<p style="color: red; margin: 0;">無法載入分類</p>';
  }
}

function handleCategoryClick(categoryId, clickedButton) {
  document.querySelectorAll(".category-filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  clickedButton.classList.add("active");
  currentCategoryId = categoryId;
  fetchProducts();

  // 更新 URL 但不刷新
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

    const url = `${API_URL}/products?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("載入商品失敗");
    const products = await response.json();

    productListDiv.innerHTML = "";

    if (products.length === 0) {
      productListDiv.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 40px;">
            <i class="fas fa-box-open" style="font-size: 40px; color: #ccc;"></i>
            <p style="color: #999; margin-top: 10px;">暫無符合的商品</p>
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

      // 假銷量 (模擬熱鬧感)
      const fakeSold = Math.floor(Math.random() * 500) + 10;

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
                        data-price="${product.price_twd}">
                    <i class="fas fa-cart-plus"></i>
                </button>
            </div>
        </div>
      `;
      productListDiv.appendChild(card);
    });

    // 綁定加入購物車
    document.querySelectorAll(".btn-add-cart-icon").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation(); // 防止點擊跳轉詳情頁
        const id = button.dataset.id;
        const name = button.dataset.name;
        const price = parseInt(button.dataset.price, 10);

        addToCart(shoppingCart, id, name, price);

        // 簡單動畫反饋
        button.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(
          () => (button.innerHTML = '<i class="fas fa-cart-plus"></i>'),
          1000
        );

        updateCartCount();
      });
    });
  } catch (error) {
    console.error("獲取商品失敗:", error);
    productListDiv.innerHTML =
      '<p style="color: red; text-align:center;">載入失敗，請稍後再試。</p>';
  }
}

// --- 購物車 Modal 相關邏輯 (保留大部分原有邏輯，僅微調 UI) ---
const modal = document.getElementById("cart-modal");
const openBtn = document.getElementById("cart-button");
const closeBtn = document.getElementById("close-modal");
const checkoutFormContainer = document.getElementById(
  "checkout-form-container"
);
const checkoutSuccessMessage = document.getElementById(
  "checkout-success-message"
);

function setupCartModal() {
  openBtn.addEventListener("click", () => {
    if (!checkAuth(false)) {
      if (
        confirm(
          "請先登入或註冊會員才能查看購物車與結帳。\n\n是否前往登入頁面？"
        )
      ) {
        window.location.href = "../html/login.html";
      }
      return;
    }

    autofillCheckoutForm();
    renderCart();
    checkoutFormContainer.style.display = "block";
    checkoutSuccessMessage.style.display = "none";
    modal.style.display = "block";
  });

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  });

  // 購物車項目操作 (加減/刪除)
  document
    .getElementById("cart-items-list")
    .addEventListener("click", (event) => {
      const target = event.target;
      const id = target.dataset.id;
      const action = target.dataset.action;

      if (target.classList.contains("qty-btn") && id) {
        if (!shoppingCart[id]) return;
        let newQuantity = shoppingCart[id].quantity;

        if (action === "plus") newQuantity++;
        else if (action === "minus") newQuantity--;

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

function renderCart() {
  const cartItemsList = document.getElementById("cart-items-list");
  let totalAmount = 0;

  if (Object.keys(shoppingCart).length === 0) {
    cartItemsList.innerHTML = `
        <div style="text-align:center; padding:20px; color:#999;">
            <i class="fas fa-shopping-cart" style="font-size:40px; margin-bottom:10px;"></i>
            <p>您的購物車是空的</p>
            <button onclick="document.getElementById('close-modal').click()" style="margin-top:10px; padding:5px 15px; background:#fff; border:1px solid #ccc; border-radius:15px;">去逛逛</button>
        </div>`;
  } else {
    cartItemsList.innerHTML = "";
    for (const id in shoppingCart) {
      const item = shoppingCart[id];
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      cartItemsList.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <p style="margin:0 0 5px 0; font-size:0.95rem;">${item.name}</p>
                        <span style="color:var(--taobao-orange); font-weight:bold;">TWD ${item.price}</span>
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-control" data-id="${id}">
                            <button class="qty-btn qty-minus" data-action="minus" data-id="${id}">-</button>
                            <input type="number" class="cart-item-quantity" data-id="${id}" value="${item.quantity}" min="1" readonly>
                            <button class="qty-btn qty-plus" data-action="plus" data-id="${id}">+</button>
                        </div>
                        <button class="remove-item" data-id="${id}" style="background:none; color:#999; font-size:1.2rem; padding:0 10px;">&times;</button>
                    </div>
                </div>
            `;
    }
  }
  document.getElementById("cart-total-amount").textContent =
    totalAmount.toLocaleString();
  updateCartCount();
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error(e);
  }
}

function updateCartCount() {
  let count = 0;
  for (const id in shoppingCart) {
    count += shoppingCart[id].quantity;
  }
  document.getElementById("cart-count").textContent = count;

  // 更新底部導航的 Badge
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

    const items = Object.keys(shoppingCart).map((id) => ({
      id: id,
      quantity: shoppingCart[id].quantity,
    }));

    if (items.length === 0) {
      alert("您的購物車是空的！");
      return;
    }

    checkoutButton.disabled = true;
    checkoutButton.textContent = "處理中...";

    const orderData = {
      paopaoId: document.getElementById("checkout-paopao-id").value,
      customerEmail: document.getElementById("checkout-customer-email").value,
      payment_method: document.querySelector(
        'input[name="payment-method"]:checked'
      ).value,
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
      document.getElementById("cart-modal").style.display = "none";
      window.location.href = "./my-account.html"; // 跳轉至訂單頁
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = "確認訂購";
    }
  });
}
