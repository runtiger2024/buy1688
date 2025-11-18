import { API_URL } from "./config.js"; // <--- 【優化】從 config 導入

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
  window.location.reload();
}

// --- 【第三批優化：修改客戶登入 UI】 ---
/**
 * (【全新】) 檢查客戶登入狀態並更新 UI
 */
function setupCustomerAuth() {
  const customer = getCustomer();
  const infoDiv = document.getElementById("customer-info");
  const footerLinks = document.getElementById("footer-auth-links");

  if (customer && infoDiv) {
    // 狀態：已登入
    infoDiv.innerHTML = `
      <span style="margin-right: 10px;">歡迎, ${customer.paopao_id}</span>
      <a href="my-account.html" class="customer-nav-link">我的訂單</a>
      <span class="customer-nav-separator">|</span>
      <button id="customer-logout-btn" class="btn-small-delete">登出</button>
    `;
    document
      .getElementById("customer-logout-btn")
      .addEventListener("click", customerLogout);

    if (footerLinks) footerLinks.style.display = "none"; // 隱藏 "會員登入/註冊"
  } else {
    // 狀態：未登入
    if (infoDiv) infoDiv.innerHTML = "";
    if (footerLinks) footerLinks.style.display = "block"; // 顯示 "會員登入/註冊"
  }
}
// --- 【優化結束】 ---

// -------------------------------------------------
// 全域變數
// -------------------------------------------------
let shoppingCart = {};

// -------------------------------------------------
// DOM 載入後執行
// -------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // 載入共用頁首
  loadComponent("./_header.html", "header-placeholder");

  // (【全新】) 檢查客戶登入狀態
  setupCustomerAuth();

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

  // 載入商品 (預設載入全部)
  fetchProducts(null); // <-- 傳入 null 代表 "全部商品"

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

    // 2. 建立 "全部" 按鈕 (預設選中)
    const allBtn = document.createElement("button");
    allBtn.className = "category-filter-btn active"; // 預設為 active
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

  // 3. 根據分類 ID 重新載入商品
  fetchProducts(categoryId);
}

// -------------------------------------------------
// 1. 載入商品
// -------------------------------------------------
/**
 * @param {number | null} categoryId - 要篩選的分類 ID，null 代表 "全部"
 */
async function fetchProducts(categoryId) {
  const productListDiv = document.getElementById("product-list");
  productListDiv.innerHTML = "<p>正在載入商品...</p>"; // 顯示載入中

  try {
    // 【優化】根據 categoryId 組合 API URL
    let url = `${API_URL}/products`;
    if (categoryId) {
      url += `?category=${categoryId}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("載入商品失敗");
    const products = await response.json();

    productListDiv.innerHTML = ""; // 清空「正在載入...」

    if (products.length === 0) {
      productListDiv.innerHTML = "<p>此分類下目前沒有商品。</p>";
    }

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-card";

      // (【修正】) 檢查 product.image_url 是否為 null
      const imageUrl = product.image_url || ""; // 如果是 null，改用空字串

      card.innerHTML = `
                <img src="${imageUrl}" alt="${product.name}">
                <h3>${product.name}</h3>
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
