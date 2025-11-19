import { API_URL } from "./config.js";

/**
 * 異步載入共用組件 (例如頁首、頁尾)
 */
async function loadComponent(componentPath, placeholderId) {
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

let shoppingCart = {};
let currentCategoryId = null;
let currentSearchTerm = "";

document.addEventListener("DOMContentLoaded", async () => {
  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();
  loadComponent("../html/_header.html", "notice-placeholder");

  const savedCart = localStorage.getItem("shoppingCart");
  if (savedCart) {
    try {
      shoppingCart = JSON.parse(savedCart);
    } catch (e) {
      console.error("解析購物車失敗:", e);
      shoppingCart = {};
    }
  }

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
        addToCart(id, name, price);
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
  alert(`${name} 已加入購物車！`);
  updateCartCount();
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
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
        paymentDetailsContent.textContent = result.payment_details.note;
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
    } catch (error) {
      console.error("提交訂單時出錯:", error);
      alert(`錯誤: ${error.message}`);
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = "確認送出訂單";
    }
  });
}
