// 【修正】路徑改為 ../../js/config.js
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

// -------------------------------------------------
// (【全新】) 客戶端 Auth 幫助函式
// -------------------------------------------------
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
  // 【修正】登出後應導向首頁
  window.location.href = "./index.html";
}

// --- 【第十批優化：重構 setupCustomerAuth】 ---
/**
 * 檢查客戶登入狀態並更新「導覽列」
 * (!!! 此函數必須在 loadComponent 載入 _navbar.html 之後執行 !!!)
 */
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
    // 狀態：已登入
    const commonLinks = `
      <a href="../html/my-account.html" class="nav-link">我的訂單</a>
      <button id="logout-btn" class="btn-small-delete">登出</button>
    `;
    desktopLinks.innerHTML = commonLinks;
    mobileLinks.innerHTML = commonLinks;

    // 為多個登出按鈕綁定事件 (重要)
    document.querySelectorAll("#logout-btn").forEach((btn) => {
      btn.addEventListener("click", customerLogout);
    });

    footerLinks.style.display = "none";
  } else {
    // 狀態：未登入
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
// --- 【優化結束】 ---

// --- 【第十批優化：新增漢堡選單邏輯】 ---
/**
 * 為漢堡選單圖示綁定點擊事件
 * (!!! 此函數必須在 loadComponent 載入 _navbar.html 之後執行 !!!)
 */
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

// -------------------------------------------------
// 全域變數
// -------------------------------------------------
let shoppingCart = {};
// --- 【第七批優化：新增篩選狀態變數】 ---
let currentCategoryId = null; // null 代表 "全部"
let currentSearchTerm = "";
// --- 【優化結束】 ---

// -------------------------------------------------
// DOM 載入後執行
// --- 【第十批優化：改為 async 函數】 ---
// -------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // --- 【優化】將 Navbar 載入改為 await，確保它最先載入 ---
  await loadComponent("../html/_navbar.html", "navbar-placeholder");

  // --- 【優化】Navbar 載入後，才執行依賴它的 JS ---
  setupHamburgerMenu(); // 綁定漢堡選單
  setupCustomerAuth(); // 檢查登入狀態並填入 Navbar

  // --- 【優化】非同步載入其他元件 ---
  // 【修正】路徑改為 ../html/_header.html，ID 改為 notice-placeholder
  loadComponent("../html/_header.html", "notice-placeholder");

  // --- 【優化】從 localStorage 載入購物車 ---
  const savedCart = localStorage.getItem("shoppingCart");
  if (savedCart) {
    try {
      shoppingCart = JSON.parse(savedCart);
    } catch (e) {
      console.error("解析購物車失敗:", e);
      shoppingCart = {};
    }
  }
  // -------------------------------------

  // 【第五批優化】載入分類
  loadCategories();

  // 【第八批優化】檢查 URL 是否有傳入 category 參數
  const params = new URLSearchParams(window.location.search);
  const categoryFromUrl = params.get("category");
  if (categoryFromUrl) {
    currentCategoryId = categoryFromUrl;
    // (我們稍後會在 loadCategories 完成後更新按鈕狀態)
  }

  // 載入商品 (預設載入全部)
  fetchProducts(); // <-- 【第七批優化】改為不帶參數，它會自動讀取全域變數

  // --- 【第七批優化：綁定搜尋事件】 ---
  const searchInput = document.getElementById("product-search-input");
  const searchButton = document.getElementById("product-search-button");

  // 點擊按鈕時搜尋
  searchButton.addEventListener("click", () => {
    currentSearchTerm = searchInput.value;
    fetchProducts();
  });

  // 按下 Enter 鍵時也搜尋
  searchInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      currentSearchTerm = searchInput.value;
      fetchProducts();
    }
  });
  // --- 【優化結束】 ---

  // 設定購物車 Modal
  setupCartModal();

  // 設定結帳表單 (【修改】)
  setupCheckoutForm();

  // --- 【優化】載入後更新一次圖示 ---
  updateCartCount();
});

// --- 【第五批優化：新增載入分類和修改 fetchProducts】 ---

/**
 * 載入分類篩選按鈕
 */
async function loadCategories() {
  const filterBar = document.getElementById("category-filter-bar");
  try {
    const response = await fetch(`${API_URL}/categories`); // 呼叫公開 API
    if (!response.ok) throw new Error("載入分類失敗");
    const categories = await response.json();

    // 1. 清空 "正在載入..."
    filterBar.innerHTML = "";

    // 2. 建立 "全部" 按鈕
    const allBtn = document.createElement("button");
    allBtn.className = "category-filter-btn";
    allBtn.textContent = "全部商品";
    allBtn.dataset.id = "all";
    allBtn.addEventListener("click", () => {
      handleCategoryClick(null, allBtn);
    });
    filterBar.appendChild(allBtn);

    // 3. 建立每個分類的按鈕
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

    // 4. 【第八批優化】根據 URL 參數設定按鈕的 active 狀態
    if (currentCategoryId) {
      const activeButton = document.querySelector(
        `.category-filter-btn[data-id="${currentCategoryId}"]`
      );
      if (activeButton) {
        activeButton.classList.add("active");
      }
    } else {
      allBtn.classList.add("active"); // 預設 "全部商品" 為 active
    }
  } catch (error) {
    console.error("獲取分類失敗:", error);
    filterBar.innerHTML =
      '<p style="color: red; margin: 0;">載入分類失敗。</p>';
  }
}

/**
 * 處理分類按鈕點擊事件
 */
function handleCategoryClick(categoryId, clickedButton) {
  // 1. 移除所有按鈕的 'active' class
  document.querySelectorAll(".category-filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  // 2. 為被點擊的按鈕加上 'active' class
  clickedButton.classList.add("active");

  // 3. 【第七批優化】更新全域變數並重新載入商品
  currentCategoryId = categoryId;
  fetchProducts(); // <-- 它會自動讀取 currentCategoryId 和 currentSearchTerm

  // 4. 【第八批優化】更新 URL (不重載頁面)
  const url = new URL(window.location);
  if (currentCategoryId) {
    url.searchParams.set("category", currentCategoryId);
  } else {
    url.searchParams.delete("category");
  }
  history.pushState({}, "", url);
}

// -------------------------------------------------
// 1. 載入商品
// -------------------------------------------------
// --- 【第七批優化：修改 fetchProducts 以使用全域變數】 ---
async function fetchProducts() {
  const productListDiv = document.getElementById("product-list");
  productListDiv.innerHTML = "<p>正在載入商品...</p>"; // 顯示載入中

  try {
    // 1. 【優化】使用 URLSearchParams 建立查詢字串
    const params = new URLSearchParams();
    if (currentCategoryId) {
      params.append("category", currentCategoryId);
    }
    if (currentSearchTerm) {
      params.append("search", currentSearchTerm);
    }

    // 2. 組合 API URL
    const queryString = params.toString();
    let url = `${API_URL}/products`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("載入商品失敗");
    const products = await response.json();

    productListDiv.innerHTML = ""; // 清空「正在載入...」

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

      // (【修正】) 檢查 product.image_url 是否為 null
      const imageUrl = product.image_url || ""; // 如果是 null，改用空字串

      // --- 【第八批優化：將 <h3> 改為 <a> 連結】 ---
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
      // --- 【優化結束】 ---

      productListDiv.appendChild(card);
    });

    // 為所有「加入購物車」按鈕綁定事件
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
// --- 【優化結束】 ---

// -------------------------------------------------
// 2. 購物車 Modal (彈窗) 邏輯
// -------------------------------------------------

// 【第二批優化：抓取更多 DOM 元素】
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
  // 打開 Modal
  openBtn.addEventListener("click", () => {
    // (【修改】) 打開 modal 時，再次檢查是否需要自動填入
    autofillCheckoutForm();
    renderCart(); // 打開時

    // 【優化】重置 Modal 狀態，永遠顯示表單、隱藏成功訊息
    checkoutFormContainer.style.display = "block";
    checkoutSuccessMessage.style.display = "none";
    paymentDetailsContent.innerHTML = "";
    // 【優化結束】

    modal.style.display = "block";
  });

  // 關閉 Modal
  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // 點擊 Modal 外部 (灰色遮罩) 關閉
  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  });

  // 綁定購物車內部的事件 (修改數量 / 刪除)
  document
    .getElementById("cart-items-list")
    .addEventListener("click", (event) => {
      const target = event.target;
      const id = target.dataset.id;

      if (target.classList.contains("remove-item")) {
        // 點擊 "刪除"
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
        // "修改數量"
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

// -------------------------------------------------
// 3. 購物車核心邏輯 (新增/渲染)
// -------------------------------------------------

/**
 * 加入商品到購物車
 */
function addToCart(id, name, price) {
  if (shoppingCart[id]) {
    // 如果已存在，數量+1
    shoppingCart[id].quantity++;
  } else {
    // 如果是新商品
    shoppingCart[id] = {
      name: name,
      price: price,
      quantity: 1,
    };
  }

  // 顯示提示
  alert(`${name} 已加入購物車！`);

  // 更新購物車圖示上的數字
  updateCartCount();

  // --- 【優化】保存購物車到 localStorage ---
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
  // -------------------------------------
}

/**
 * 渲染購物車 Modal 內的 HTML
 */
function renderCart() {
  const cartItemsList = document.getElementById("cart-items-list");
  let totalAmount = 0;

  if (Object.keys(shoppingCart).length === 0) {
    cartItemsList.innerHTML = "<p>您的購物車是空的。</p>";
  } else {
    cartItemsList.innerHTML = ""; // 清空

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

  // 更新總金額
  document.getElementById("cart-total-amount").textContent = totalAmount;

  // 更新購物車圖示上的數字
  updateCartCount();

  // --- 【優化】保存購物車到 localStorage ---
  // (每次渲染 = 每次變動，所以都在此保存)
  try {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
  } catch (e) {
    console.error("保存購物車失敗:", e);
  }
  // -------------------------------------
}

/**
 * 更新懸浮圖示的計數
 */
function updateCartCount() {
  let count = 0;
  for (const id in shoppingCart) {
    count += shoppingCart[id].quantity;
  }
  document.getElementById("cart-count").textContent = count;
}

// -------------------------------------------------
// 4. 結帳邏輯
// -------------------------------------------------

/**
 * (【全新】) 幫助函式：自動填入表單
 */
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

// --- 【第二批優化：大幅修改結帳表單邏輯】 ---
function setupCheckoutForm() {
  const checkoutForm = document.getElementById("checkout-form");
  const checkoutButton = document.getElementById("checkout-button");

  // (【修改】) 載入時先執行一次自動填入
  autofillCheckoutForm();

  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // 防止表單跳轉

    // 1. 獲取表單資料
    const paopaoId = document.getElementById("checkout-paopao-id").value;
    const customerEmail = document.getElementById(
      "checkout-customer-email"
    ).value;
    // 【優化】獲取付款方式
    const paymentMethod = document.querySelector(
      'input[name="payment-method"]:checked'
    ).value;

    // 2. 轉換購物車格式
    // 後端 API 需要的格式: [{ "id": "p1", "quantity": 2 }, ...]
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
      payment_method: paymentMethod, // 【優化】傳送付款方式
      items: items,
    };

    // 3. UI 處理
    checkoutButton.disabled = true;
    checkoutButton.textContent = "訂單提交中...";

    try {
      // 4. 發送 API
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

      // 5. 成功
      // 【優化】檢查是否有匯款資訊
      if (result.payment_details) {
        // 顯示匯款資訊
        paymentDetailsContent.textContent = result.payment_details.note;
        checkoutFormContainer.style.display = "none";
        checkoutSuccessMessage.style.display = "block";
      } else {
        // (適用於未來串接的信用卡等)
        alert("訂單提交成功！\n感謝您的訂購，我們將盡快處理。");
        // 關閉 Modal
        document.getElementById("cart-modal").style.display = "none";
      }

      // 6. 清空購物車
      shoppingCart = {};

      // --- 【優化】清空 localStorage ---
      localStorage.removeItem("shoppingCart");
      // ---------------------------------

      // 7. 渲染購物車 (這會呼叫並保存空的 shoppingCart)
      renderCart();
      checkoutForm.reset();

      // (【修改】) 重設表單後，再次自動填入
      autofillCheckoutForm();
    } catch (error) {
      console.error("提交訂單時出錯:", error);
      alert(`錯誤: ${error.message}`);
    } finally {
      // 8. 重置按鈕
      checkoutButton.disabled = false;
      checkoutButton.textContent = "確認送出訂單";
    }
  });
}
