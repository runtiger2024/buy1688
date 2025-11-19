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
} from "./sharedUtils.js"; // <-- 導入共用函式

let shoppingCart = {};
let currentCategoryId = null;
let currentSearchTerm = "";
let availableWarehouses = []; // [新增] 存放倉庫資料

document.addEventListener("DOMContentLoaded", async () => {
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();
  loadComponent("../html/_header.html", "notice-placeholder");

  // 載入購物車
  loadCart(shoppingCart);

  // [修改] 載入倉庫
  availableWarehouses = await loadAvailableWarehouses();
  populateWarehouseSelect("warehouse-select", availableWarehouses);

  loadCategories();

  const params = new URLSearchParams(window.location.search);
  const categoryFromUrl = params.get("category");
  if (categoryFromUrl) {
    currentCategoryId = categoryFromUrl;
  }

  fetchProducts();

  const searchInput = document.getElementById("product-search-input");
  const searchButton = document.getElementById("product-search-button");

  searchButton.addEventListener("click", () => {
    currentSearchTerm = searchInput.value;
    fetchProducts();
  });

  searchInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      currentSearchTerm = searchInput.value;
      fetchProducts();
    }
  });

  setupCartModal();
  setupCheckoutForm();
  updateCartCount();

  // [新增] 處理導覽列上的 "我的購物車" 連結
  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      // 觸發懸浮按鈕的點擊事件，打開 Modal
      document.getElementById("cart-button").click();
    });
  }
});

async function loadCategories() {
  const filterBar = document.getElementById("category-filter-bar");
  try {
    const response = await fetch(`${API_URL}/categories`);
    if (!response.ok) throw new Error("載入分類失敗");
    const categories = await response.json();

    filterBar.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "category-filter-btn";
    allBtn.textContent = "全部商品";
    allBtn.dataset.id = "all";
    allBtn.addEventListener("click", () => {
      handleCategoryClick(null, allBtn);
    });
    filterBar.appendChild(allBtn);

    categories.forEach((category) => {
      const btn = document.createElement("button");
      btn.className = "category-filter-btn";
      btn.textContent = category.name;
      btn.dataset.id = category.id;
      btn.addEventListener("click", () => {
        handleCategoryClick(category.id, btn);
      });
      filterBar.appendChild(btn);
    });

    if (currentCategoryId) {
      const activeButton = document.querySelector(
        `.category-filter-btn[data-id="${currentCategoryId}"]`
      );
      if (activeButton) {
        activeButton.classList.add("active");
      }
    } else {
      allBtn.classList.add("active");
    }
  } catch (error) {
    console.error("獲取分類失敗:", error);
    filterBar.innerHTML =
      '<p style="color: red; margin: 0;">載入分類失敗。</p>';
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
  productListDiv.innerHTML = "<p>正在載入商品...</p>";

  try {
    const params = new URLSearchParams();
    if (currentCategoryId) {
      params.append("category", currentCategoryId);
    }
    if (currentSearchTerm) {
      params.append("search", currentSearchTerm);
    }

    const queryString = params.toString();
    let url = `${API_URL}/products`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("載入商品失敗");
    const products = await response.json();

    productListDiv.innerHTML = "";

    if (products.length === 0) {
      if (currentSearchTerm) {
        productListDiv.innerHTML = `<p>找不到符合「${currentSearchTerm}」的商品。</p>`;
      } else {
        productListDiv.innerHTML = "<p>此分類下目前沒有商品。</p>";
      }
    }

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-card";

      // [修改] 讀取第一張圖片
      const imageUrl =
        product.images && product.images.length > 0 ? product.images[0] : "";

      card.innerHTML = `
                <a href="../html/product.html?id=${
                  product.id
                }" class="product-card-link">
                    <img src="${imageUrl}" alt="${product.name}">
                    <h3>${product.name}</h3>
                </a>
                <p>${product.description || ""}</p>
                <div class="price">TWD ${product.price_twd}</div>
                <button class="add-to-cart-btn" 
                        data-id="${product.id}" 
                        data-name="${product.name}" 
                        data-price="${product.price_twd}">
                    加入購物車
                </button> 
            `;

      productListDiv.appendChild(card);
    });

    document.querySelectorAll(".add-to-cart-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const name = button.dataset.name;
        const price = parseInt(button.dataset.price, 10);

        // [修改] 使用共用函式
        addToCart(shoppingCart, id, name, price);
        alert(`${name} 已加入購物車！`);
        updateCartCount();
      });
    });
  } catch (error) {
    console.error("獲取商品失敗:", error);
    productListDiv.innerHTML =
      '<p style="color: red;">載入商品失敗，請稍後再試。</p>';
  }
}

const modal = document.getElementById("cart-modal");
const openBtn = document.getElementById("cart-button");
const closeBtn = document.getElementById("close-modal");
const checkoutFormContainer = document.getElementById(
  "checkout-form-container"
);
const checkoutSuccessMessage = document.getElementById(
  "checkout-success-message"
);
const paymentDetailsContent = document.getElementById(
  "payment-details-content"
);

function setupCartModal() {
  openBtn.addEventListener("click", () => {
    autofillCheckoutForm();
    renderCart();
    checkoutFormContainer.style.display = "block";
    checkoutSuccessMessage.style.display = "none";
    paymentDetailsContent.innerHTML = "";
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

  document
    .getElementById("cart-items-list")
    .addEventListener("click", (event) => {
      const target = event.target;
      const id = target.dataset.id;
      if (target.classList.contains("remove-item")) {
        delete shoppingCart[id];
        renderCart();
      }
    });

  document
    .getElementById("cart-items-list")
    .addEventListener("change", (event) => {
      const target = event.target;
      const id = target.dataset.id;
      if (target.classList.contains("cart-item-quantity")) {
        const newQuantity = parseInt(target.value, 10);
        if (newQuantity <= 0) {
          delete shoppingCart[id];
        } else {
          shoppingCart[id].quantity = newQuantity;
        }
        renderCart();
      }
    });
}

function renderCart() {
  const cartItemsList = document.getElementById("cart-items-list");
  let totalAmount = 0;

  if (Object.keys(shoppingCart).length === 0) {
    cartItemsList.innerHTML = "<p>您的購物車是空的。</p>";
  } else {
    cartItemsList.innerHTML = "";
    for (const id in shoppingCart) {
      const item = shoppingCart[id];
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      cartItemsList.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <p>${item.name}</p>
                        <span>TWD ${item.price}</span>
                    </div>
                    <div class="cart-item-actions">
                        <input type="number" class="cart-item-quantity" data-id="${id}" value="${item.quantity}" min="1">
                        <button class="remove-item" data-id="${id}">&times;</button>
                    </div>
                </div>
            `;
    }
  }
  document.getElementById("cart-total-amount").textContent = totalAmount;
  updateCartCount();
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
}

function updateCartCount() {
  let count = 0;
  for (const id in shoppingCart) {
    count += shoppingCart[id].quantity;
  }
  document.getElementById("cart-count").textContent = count;
}

function autofillCheckoutForm() {
  const customer = getCustomer();
  const paopaoIdInput = document.getElementById("checkout-paopao-id");
  const emailInput = document.getElementById("checkout-customer-email");

  if (customer && paopaoIdInput && emailInput) {
    paopaoIdInput.value = customer.paopao_id;
    paopaoIdInput.readOnly = true;
    emailInput.value = customer.email;
    emailInput.readOnly = true;
  }
}

function setupCheckoutForm() {
  const checkoutForm = document.getElementById("checkout-form");
  const checkoutButton = document.getElementById("checkout-button");
  const warehouseSelect = document.getElementById("warehouse-select"); // [新增] 獲取倉庫下拉選單

  // [修改] 更新按鈕文字
  checkoutButton.textContent = "確認送出訂單採購到集運倉";

  autofillCheckoutForm();

  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const paopaoId = document.getElementById("checkout-paopao-id").value;
    const customerEmail = document.getElementById(
      "checkout-customer-email"
    ).value;
    const paymentMethod = document.querySelector(
      'input[name="payment-method"]:checked'
    ).value;
    const warehouseId = warehouseSelect.value; // [新增] 獲取選定的倉庫 ID

    if (!warehouseId) {
      // [新增] 檢查倉庫是否選定
      alert("請選擇一個集運倉！");
      return;
    }

    const items = Object.keys(shoppingCart).map((id) => {
      return {
        id: id,
        quantity: shoppingCart[id].quantity,
      };
    });

    if (items.length === 0) {
      alert("您的購物車是空的！");
      return;
    }

    const orderData = {
      paopaoId: paopaoId,
      customerEmail: customerEmail,
      payment_method: paymentMethod,
      // [新增] 加入 warehouse_id
      warehouse_id: parseInt(warehouseId, 10),
      items: items,
    };

    checkoutButton.disabled = true;
    checkoutButton.textContent = "訂單提交中...";

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "訂單提交失敗");
      }

      if (result.payment_details) {
        // [優化] 顯示訂單編號
        paymentDetailsContent.textContent =
          `訂單編號: #${result.order.id}\n\n` + result.payment_details.note;

        checkoutFormContainer.style.display = "none";
        checkoutSuccessMessage.style.display = "block";
      } else {
        alert("訂單提交成功！\n感謝您的訂購，我們將盡快處理。");
        document.getElementById("cart-modal").style.display = "none";
      }

      shoppingCart = {};
      localStorage.removeItem("shoppingCart");
      renderCart();
      checkoutForm.reset();
      autofillCheckoutForm();
      warehouseSelect.value = ""; // 重設倉庫選單
    } catch (error) {
      console.error("提交訂單時出錯:", error);
      alert(`錯誤: ${error.message}`);
    } finally {
      checkoutButton.disabled = false;
      // [修改] 恢復按鈕文字
      checkoutButton.textContent = "確認送出訂單採購到集運倉";
    }
  });
}
