import { API_URL } from "../config.js";
let availableOperators = [];
let allWarehouses = []; // (【全新】) 儲存所有倉庫資料
let allCategories = []; // (【第四批優化】) 儲存所有分類資料

// -------------------------------------------------
// 1. 核心：認證與守衛
// -------------------------------------------------

/**
 * 獲取儲存的 Token
 */
function getToken() {
  return localStorage.getItem("adminToken");
}

/**
 * 獲取儲存的用戶資訊
 */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("adminUser"));
  } catch (e) {
    return null;
  }
}

/**
 * 頁面載入時的第一道防線
 * 檢查 Token，若無則踢回登入頁
 */
function checkAuth() {
  if (!getToken()) {
    alert("請先登入");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/**
 * (重構) 獲取 API 請求的標頭
 * 現在改用 Bearer Token
 */
function getAuthHeaders() {
  const token = getToken();
  if (!token) {
    console.error("Token not found");
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * 登出功能
 */
function logout() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.location.href = "login.html";
}

// -------------------------------------------------
// 2. DOM 元素 (【修正】只宣告，不賦值)
// -------------------------------------------------
let refreshButton;
let logoutButton;
let userInfoSpan;
// 訂單
let ordersTbody;
// 商品
let productsTbody;
let productForm;
let formTitle;
let productIdInput;
let productNameInput;
let productPriceInput;
let productCostInput;
let productDescInput;
let productImgUrlInput;
let productCategorySelect; // 【第四批優化】
let cancelEditBtn;
// 績效
let statsContent;
// 人員管理
let userSection;
let createUserForm;
let usersTbody;
// (【全新】) 倉庫管理
let warehousesTbody;
let warehouseForm;
let warehouseFormTitle;
let warehouseIdInput;
let warehouseNameInput;
let warehouseReceiverInput;
let warehousePhoneInput;
let warehouseAddressInput;
let warehouseIsActiveInput;
let cancelWarehouseEditBtn;
// 【第四批優化】分類管理
let categoriesTbody;
let categoryForm;
let categoryFormTitle;
let categoryIdInput;
let categoryNameInput;
let categoryDescInput;
let cancelCategoryEditBtn;

// -------------------------------------------------
// 3. 載入資料 (API 呼叫)
// -------------------------------------------------

async function loadAllData() {
  // 檢查權限
  const headers = getAuthHeaders();
  if (!headers) {
    checkAuth(); // 觸發登入檢查
    return;
  }

  // 顯示用戶資訊
  const user = getUser();
  if (user) {
    userInfoSpan.textContent = `歡迎, ${user.username} (${user.role})`;
  }

  // 同時載入所有資料
  await Promise.all([
    loadStats(headers),
    loadOrders(headers),
    loadProducts(), // 載入商品不需要 Token (公開 API)
    loadUsers(headers), // 載入用戶列表
    loadWarehouses(headers), // (【全新】) 載入倉庫
    loadCategories(headers), // (【第四批優化】) 載入分類
  ]);

  // 【第四批優化】所有資料載入後，才填充商品表單的分類下拉選單
  populateCategoryDropdown();
}

// --- 【第二批優化：修改績效儀表板】 ---
// 載入績效
async function loadStats(headers) {
  try {
    const response = await fetch(`${API_URL}/admin/dashboard/stats`, {
      headers,
    });
    if (!response.ok) throw new Error(await response.json().message);

    const stats = await response.json();

    // 假設匯率 4.5
    const exchangeRate = 4.5;
    const totalCostTWD = stats.totalCostCNY * exchangeRate;
    const totalProfitTWD = stats.totalRevenueTWD - totalCostTWD;

    statsContent.innerHTML = `
            <ul>
                <li><strong>總營收 (TWD) (僅計已付款):</strong> ${
                  stats.totalRevenueTWD
                }</li>
                <li><strong>總成本 (CNY) (僅計已付款):</strong> ${stats.totalCostCNY.toFixed(
                  2
                )}</li>
                <li><strong>預估利潤 (TWD):</strong> ${totalProfitTWD.toFixed(
                  0
                )}</li>
                <hr>
                <li><strong>【優化】待付款訂單:</strong> ${
                  stats.paymentStatusCounts.UNPAID
                }</li>
                <li><strong>待處理訂單:</strong> ${
                  stats.statusCounts.Pending
                }</li>
                <li><strong>採購中訂單:</strong> ${
                  stats.statusCounts.Processing
                }</li>
                <li><strong>已入倉訂單:</strong> ${
                  stats.statusCounts.Warehouse_Received
                }</li>
            </ul>
        `;
  } catch (error) {
    console.error("載入績效失敗:", error);
    statsContent.innerHTML = `<p style="color:red;">${error.message}</p>`;
  }
}
// --- 【優化結束】 ---

// 載入訂單 (改用 Operator API)
async function loadOrders(headers) {
  try {
    // 我們預設只載入 "操作人員" 需要的訂單 (待處理/採購中)
    const response = await fetch(`${API_URL}/operator/orders`, { headers });
    if (response.status === 403) throw new Error("權限不足");
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

    const orders = await response.json();
    renderOrders(orders);
  } catch (error) {
    alert(`載入訂單失敗: ${error.message}`);
    ordersTbody.innerHTML =
      '<tr><td colspan="7" style="color: red;">載入訂單失敗。</td></tr>'; // <-- Colspan 改為 7
  }
}

// 載入商品 (公開 API)
async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
    const products = await response.json();
    renderProducts(products); // 渲染商品
  } catch (error) {
    console.error("載入商品失敗:", error);
    productsTbody.innerHTML =
      '<tr><td colspan="6" style="color: red;">載入商品失敗。</td></tr>';
  }
}

// (重構) 載入用戶
async function loadUsers(headers) {
  // 只有 Admin 能載入用戶
  const user = getUser();
  if (user.role !== "admin") {
    return; // 直接返回，權限控制由 applyRolePermissions 處理
  }

  try {
    const response = await fetch(`${API_URL}/admin/users`, { headers });
    if (!response.ok) throw new Error("無法載入用戶");
    const users = await response.json();
    // (--- ↓↓↓ 新增 ↓↓↓ ---)
    // 儲存可用的操作人員列表，供「指派訂單」使用
    availableOperators = users.filter(
      (user) => user.role === "operator" && user.status === "active"
    );
    // (--- ↑↑↑ 新增 ↑↑↑ ---)
    renderUsers(users);
  } catch (error) {
    console.error("載入用戶失敗:", error);
    usersTbody.innerHTML =
      '<tr><td colspan="5" style="color:red;">載入用戶失敗</td></tr>';
  }
}

// (【全新】) 載入倉庫
async function loadWarehouses(headers) {
  // 只有 Admin 能載入倉庫
  const user = getUser();
  if (user.role !== "admin") {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/warehouses`, { headers });
    if (!response.ok) throw new Error("無法載入倉庫");
    allWarehouses = await response.json(); // 存到全域變數
    renderWarehouses(allWarehouses);
  } catch (error) {
    console.error("載入倉庫失敗:", error);
    warehousesTbody.innerHTML =
      '<tr><td colspan="5" style="color:red;">載入倉庫失敗</td></tr>';
  }
}

// --- 【第四批優化：新增載入分類】 ---
async function loadCategories(headers) {
  // 只有 Admin 能載入分類
  const user = getUser();
  if (user.role !== "admin") {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/categories`, { headers });
    if (!response.ok) throw new Error("無法載入分類");
    allCategories = await response.json(); // 存到全域變數
    renderCategories(allCategories);
  } catch (error) {
    console.error("載入分類失敗:", error);
    categoriesTbody.innerHTML =
      '<tr><td colspan="4" style="color:red;">載入分類失敗</td></tr>';
  }
}
// --- 【優化結束】 ---

// -------------------------------------------------
// 4. 渲染 (Render) 函式
// -------------------------------------------------

// --- 【第二批優化：修改訂單渲染】 ---
// (重構) 渲染訂單表格
function renderOrders(orders) {
  ordersTbody.innerHTML = "";
  if (orders.length === 0) {
    ordersTbody.innerHTML = '<tr><td colspan="7">沒有待處理的訂單。</td></tr>'; // <-- Colspan 改為 7
    return;
  }

  // 1. 產生 "操作人員" 的 HTML 選項
  const operatorOptions = availableOperators
    .map((op) => `<option value="${op.id}">${op.username}</option>`)
    .join("");

  orders.forEach((order) => {
    const tr = document.createElement("tr");

    // 2. 顯示當前指派的人 (如果有的話)
    const assignedTo = order.operator_name
      ? ` (指派給: ${order.operator_name})`
      : " (未指派)";

    // 【優化】根據付款狀態決定是否顯示「標記付款」按鈕
    const markPaidButton =
      order.payment_status === "UNPAID"
        ? `<button class="btn btn-update btn-mark-paid" data-id="${order.id}">標記為已付款</button>`
        : "";

    tr.innerHTML = `
            <td>${order.id}</td>
            <td>${new Date(order.created_at).toLocaleString()}</td>
            <td>${order.paopao_id}</td>
            <td>${order.total_amount_twd}</td>
            <td>
                <span class="status-${order.status}">${order.status}</span>
                <br>
                <small>${assignedTo}</small>
            </td>
            
            <td>
                <span class="status-${order.payment_status}">${
      order.payment_status
    }</span>
                <br>
                <small>(${order.payment_method || "N/A"})</small>
            </td>
            
            <td>
                ${markPaidButton} <select class="order-status-select" data-id="${
      order.id
    }">
                    <option value="Pending" ${
                      order.status === "Pending" ? "selected" : ""
                    }>待處理</option>
                    <option value="Processing" ${
                      order.status === "Processing" ? "selected" : ""
                    }>採購中</option>
                    <option value="Shipped_Internal" ${
                      order.status === "Shipped_Internal" ? "selected" : ""
                    }>已發貨 (往集運倉)</option>
                    <option value="Warehouse_Received" ${
                      order.status === "Warehouse_Received" ? "selected" : ""
                    }>已入倉</option>
                    <option value="Cancelled" ${
                      order.status === "Cancelled" ? "selected" : ""
                    }>取消訂單</option>
                </select>

                <select class="order-operator-select" data-id="${
                  order.id
                }" data-role="admin">
                    <option value="">-- 指派給 --</option>
                    ${operatorOptions}
                </select>
            </td>
        `;

    // 3. (重要) 自動選中當前被指派的人
    if (order.operator_id) {
      const operatorSelect = tr.querySelector(".order-operator-select");
      // 我們在 <select> 標籤後設定 .value 比較安全
      operatorSelect.value = order.operator_id;
    }

    // 4. (全新) 如果不是 Admin，隱藏指派選單
    if (getUser().role !== "admin") {
      const operatorSelect = tr.querySelector(".order-operator-select");
      if (operatorSelect) {
        operatorSelect.style.display = "none";
      }
    }

    ordersTbody.appendChild(tr);
  });
}
// --- 【優化結束】 ---

// 渲染商品表格
function renderProducts(products) {
  productsTbody.innerHTML = "";
  if (products.length === 0) {
    productsTbody.innerHTML = '<tr><td colspan="6">目前沒有商品。</td></tr>';
    return;
  }
  products.forEach((product) => {
    const tr = document.createElement("tr");
    // (【修正】) 檢查 product.image_url 是否為 null
    const imageUrl = product.image_url || ""; // 如果是 null，改用空字串

    tr.innerHTML = `
            <td>${product.id}</td>
            <td><img src="${imageUrl}" alt="${product.name}"></td>
            <td>${product.name}</td>
            <td>${product.price_twd}</td>
            <td>N/A</td> <td>
                <button class="btn btn-edit" data-id="${product.id}">編輯</button>
                <button class="btn btn-delete" data-id="${product.id}">封存</button>
            </td>
        `;
    productsTbody.appendChild(tr);
  });
}

// (全新) 渲染用戶表格
function renderUsers(users) {
  usersTbody.innerHTML = "";
  if (users.length === 0) {
    usersTbody.innerHTML = '<tr><td colspan="5">沒有用戶。</td></tr>';
    return;
  }
  const currentUserId = getUser().id;

  users.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>
                <span class="status-${user.status}">${user.status}</span>
            </td>
            <td>
                <button class="btn btn-delete btn-toggle-status" 
                        data-id="${user.id}" 
                        data-new-status="${
                          user.status === "active" ? "inactive" : "active"
                        }"
                        ${user.id === currentUserId ? "disabled" : ""}>
                    ${user.status === "active" ? "停權" : "啟用"}
                </button>
            </td>
        `;
    usersTbody.appendChild(tr);
  });
}

// (【全新】) 渲染倉庫表格
function renderWarehouses(warehouses) {
  warehousesTbody.innerHTML = "";
  if (warehouses.length === 0) {
    warehousesTbody.innerHTML = '<tr><td colspan="5">沒有倉庫資料。</td></tr>';
    return;
  }

  warehouses.forEach((wh) => {
    const tr = document.createElement("tr");
    const statusClass = wh.is_active ? "status-active" : "status-inactive";
    const statusText = wh.is_active ? "已啟用" : "已停用";

    tr.innerHTML = `
            <td>${wh.id}</td>
            <td>${wh.name}</td>
            <td>${wh.address}</td>
            <td>
                <span class="${statusClass}">${statusText}</span>
            </td>
            <td>
                <button class="btn btn-edit btn-edit-warehouse" data-id="${wh.id}">編輯</button>
            </td>
        `;
    warehousesTbody.appendChild(tr);
  });
}

// --- 【第四批優化：新增渲染分類】 ---
function renderCategories(categories) {
  categoriesTbody.innerHTML = "";
  if (categories.length === 0) {
    categoriesTbody.innerHTML = '<tr><td colspan="4">目前沒有分類。</td></tr>';
    return;
  }

  categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${cat.id}</td>
            <td>${cat.name}</td>
            <td>${cat.description || ""}</td>
            <td>
                <button class="btn btn-edit btn-edit-category" data-id="${
                  cat.id
                }">編輯</button>
                <button class="btn btn-delete btn-delete-category" data-id="${
                  cat.id
                }">刪除</button>
            </td>
        `;
    categoriesTbody.appendChild(tr);
  });
}

/**
 * 【優化】填充商品表單的分類下拉選單
 */
function populateCategoryDropdown() {
  productCategorySelect.innerHTML =
    '<option value="">-- 請選擇分類 --</option>'; // 重設
  if (allCategories.length > 0) {
    allCategories.forEach((cat) => {
      productCategorySelect.innerHTML += `
        <option value="${cat.id}">${cat.name}</option>
      `;
    });
  }
}
// --- 【優化結束】 ---

// -------------------------------------------------
// 5. 事件監聽 (Event Listeners)
// -------------------------------------------------

// (重構) 頁面載入時
document.addEventListener("DOMContentLoaded", () => {
  // 0. (【修正】) 在這裡才抓取 DOM 元素
  refreshButton = document.getElementById("refresh-data");
  logoutButton = document.getElementById("logout-button");
  userInfoSpan = document.getElementById("user-info");
  ordersTbody = document.getElementById("orders-tbody");
  productsTbody = document.getElementById("products-tbody");
  productForm = document.getElementById("product-form");
  formTitle = document.getElementById("form-title");
  productIdInput = document.getElementById("product-id");
  productNameInput = document.getElementById("product-name");
  productPriceInput = document.getElementById("product-price");
  productCostInput = document.getElementById("product-cost");
  productDescInput = document.getElementById("product-description");
  productImgUrlInput = document.getElementById("product-image-url");
  productCategorySelect = document.getElementById("product-category"); // 【第四批優化】
  cancelEditBtn = document.getElementById("cancel-edit-btn");
  statsContent = document.getElementById("stats-content");
  userSection = document.getElementById("users-section");
  createUserForm = document.getElementById("create-user-form");
  usersTbody = document.getElementById("users-tbody");
  // (【全新】) 抓取倉庫 DOM
  warehousesTbody = document.getElementById("warehouses-tbody");
  warehouseForm = document.getElementById("warehouse-form");
  warehouseFormTitle = document.getElementById("warehouse-form-title");
  warehouseIdInput = document.getElementById("warehouse-id");
  warehouseNameInput = document.getElementById("warehouse-name");
  warehouseReceiverInput = document.getElementById("warehouse-receiver");
  warehousePhoneInput = document.getElementById("warehouse-phone");
  warehouseAddressInput = document.getElementById("warehouse-address");
  warehouseIsActiveInput = document.getElementById("warehouse-is-active");
  cancelWarehouseEditBtn = document.getElementById("cancel-warehouse-edit-btn");
  // 【第四批優化】抓取分類 DOM
  categoriesTbody = document.getElementById("categories-tbody");
  categoryForm = document.getElementById("category-form");
  categoryFormTitle = document.getElementById("category-form-title");
  categoryIdInput = document.getElementById("category-id");
  categoryNameInput = document.getElementById("category-name");
  categoryDescInput = document.getElementById("category-description");
  cancelCategoryEditBtn = document.getElementById("cancel-category-edit-btn");

  // 1. 執行守衛
  if (!checkAuth()) {
    return;
  }

  // 2. (全新) 立即套用權限，隱藏不該看的按鈕和區塊
  applyRolePermissions();

  // 3. 載入所有資料 (loadUsers 會因為權限而自動跳過)
  loadAllData(); // <-- loadAllData 內部已包含 loadCategories 和 populateCategoryDropdown

  // 4. 綁定按鈕 (【修正】現在 logoutButton 不會是 null)
  logoutButton.addEventListener("click", logout);
  refreshButton.addEventListener("click", () => {
    loadOrders(getAuthHeaders());
    loadStats(getAuthHeaders());
  });

  // 5. 啟動導覽列 (它會自動跳過被隱藏的頁籤)
  setupNavigation();

  // 6. (【修正】) 將所有其他的 addEventListener 移到這裡

  // --- 【第四批優化：修改商品表單提交】 ---
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const headers = getAuthHeaders();
    if (!headers) return;

    const id = productIdInput.value;
    const productData = {
      name: productNameInput.value,
      price_twd: parseInt(productPriceInput.value, 10),
      cost_cny: parseFloat(productCostInput.value),
      description: productDescInput.value,
      image_url: productImgUrlInput.value,
      // 【優化】獲取分類 ID
      category_id: productCategorySelect.value
        ? parseInt(productCategorySelect.value)
        : null,
    };

    if (!productData.category_id) {
      alert("請選擇一個商品分類");
      return;
    }

    try {
      let url = `${API_URL}/admin/products`;
      let method = "POST";
      if (id) {
        url = `${API_URL}/admin/products/${id}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(productData),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "操作失敗");
      }

      alert(id ? "商品已更新！" : "商品已新增！");
      resetProductForm();
      await loadProducts(); // 重新載入商品列表
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });
  // --- 【優化結束】 ---

  // 取消編輯按鈕
  cancelEditBtn.addEventListener("click", resetProductForm);

  // 商品列表的按鈕事件 (編輯 / 封存)
  productsTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    if (!id) return;

    // 點擊 "封存" (DELETE)
    if (target.classList.contains("btn-delete")) {
      if (!confirm(`確定要 "封存" ID 為 ${id} 的商品嗎？(不會真的刪除)`))
        return;

      try {
        const response = await fetch(`${API_URL}/admin/products/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error("封存失敗");
        alert("商品已封存！");
        await loadProducts();
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }

    // --- 【第四批優化：修改 "編輯" 商品按鈕】 ---
    // 點擊 "編輯"
    if (target.classList.contains("btn-edit")) {
      const headers = getAuthHeaders();
      if (!headers) {
        alert("Token 遺失，請重新登入");
        return;
      }

      try {
        // ✅ 修正：呼叫新的 Admin API 來獲取完整資料 (含成本)
        // ✅ 【優化】現在這個 API 會一併回傳 category_id
        const response = await fetch(`${API_URL}/admin/products/${id}`, {
          headers,
        });

        if (!response.ok) {
          throw new Error("無法獲取商品資料");
        }

        const product = await response.json();

        // 將完整資料填入表單
        formTitle.textContent = `編輯商品 (ID: ${id})`;
        productIdInput.value = product.id;
        productNameInput.value = product.name;
        productPriceInput.value = product.price_twd;
        productCostInput.value = product.cost_cny; // ✅ 成功填充成本
        productDescInput.value = product.description;
        productImgUrlInput.value = product.image_url;
        // 【優化】設定分類下拉選單
        productCategorySelect.value = product.category_id || "";

        cancelEditBtn.style.display = "inline-block";

        // (重構) 自動切換到商品頁籤並滾動
        document
          .querySelector('.nav-link[data-target="products-section"]')
          .click();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
    // --- 【優化結束】 ---
  });

  // --- 【第二批優化：新增對「標記付款」按鈕的監聽】 ---
  ordersTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;

    // 邏輯 3：點擊了 "標記為已付款"
    if (target.classList.contains("btn-mark-paid")) {
      if (!confirm(`確定要將訂單 ${id} 標記為 "PAID" (已付款) 嗎？`)) {
        return;
      }

      try {
        // 使用 Operator API 更新 payment_status
        const response = await fetch(`${API_URL}/operator/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ payment_status: "PAID" }),
        });

        if (!response.ok) throw new Error("更新付款狀態失敗");

        alert("訂單付款狀態已更新！");
        await loadOrders(headers); // 重新載入訂單
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });
  // --- 【優化結束】 ---

  // (重構) 訂單表格的 "所有" 下拉選單變更
  ordersTbody.addEventListener("change", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;

    // ------------------------------------
    // 邏輯 1：如果變更的是 "狀態"
    // ------------------------------------
    if (target.classList.contains("order-status-select")) {
      const status = target.value;

      if (!confirm(`確定要將訂單 ${id} 的狀態改為 "${status}" 嗎？`)) {
        loadOrders(headers); // 重置下拉選單
        return;
      }

      try {
        const response = await fetch(`${API_URL}/operator/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ status: status }), // 使用 Operator API
        });

        if (!response.ok) throw new Error("更新狀態失敗");

        alert("訂單狀態已更新！");
        await loadOrders(headers); // 重新載入訂單
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }

    // ------------------------------------
    // 邏輯 2：如果變更的是 "指派" (全新)
    // ------------------------------------
    if (target.classList.contains("order-operator-select")) {
      const operatorId = target.value; // 這會是 " " (空字串) 或 "2", "3"

      if (
        !confirm(
          `確定要將訂單 ${id} 指派給操作員 ID: ${operatorId || "無"} 嗎？`
        )
      ) {
        loadOrders(headers); // 重置下拉選單
        return;
      }

      try {
        // **注意：** 這裡呼叫的是 "Admin" API
        const response = await fetch(`${API_URL}/admin/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ operator_id: operatorId || null }), // 傳送 ID 或 null (取消指派)
        });

        if (!response.ok) throw new Error("指派失敗");

        alert("訂單指派已更新！");
        await loadOrders(headers); // 重新載入訂單 (為了更新 "指派給: xxx")
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

  // (全新) 監聽建立用戶表單
  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const headers = getAuthHeaders();
    if (!headers) return;

    const username = document.getElementById("user-username").value;
    const password = document.getElementById("user-password").value;
    const role = document.getElementById("user-role").value;

    try {
      const response = await fetch(`${API_URL}/admin/users`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ username, password, role }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "建立失敗");
      }

      alert("用戶建立成功！");
      createUserForm.reset();
      await loadUsers(headers); // 重新載入列表
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  // (全新) 監聽用戶列表的按鈕事件 (停權/啟用)
  usersTbody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-toggle-status")) {
      const id = e.target.dataset.id;
      const newStatus = e.target.dataset.newStatus;

      if (!confirm(`確定要將用戶 ${id} 的狀態改為 "${newStatus}" 嗎？`)) return;

      const headers = getAuthHeaders();
      if (!headers) return;

      try {
        const response = await fetch(`${API_URL}/admin/users/${id}/status`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) throw new Error("更新失敗");

        alert("用戶狀態已更新！");
        await loadUsers(headers); // 重新載入
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

  // (【全新】) 監聽倉庫列表的按鈕事件
  warehousesTbody.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-edit-warehouse")) {
      const id = e.target.dataset.id;
      // 從全域變數中尋找該倉庫資料
      const warehouse = allWarehouses.find((w) => w.id == id);
      if (warehouse) {
        // 填入表單
        warehouseFormTitle.textContent = `編輯倉庫 (ID: ${id})`;
        warehouseIdInput.value = warehouse.id;
        warehouseNameInput.value = warehouse.name;
        warehouseReceiverInput.value = warehouse.receiver;
        warehousePhoneInput.value = warehouse.phone;
        warehouseAddressInput.value = warehouse.address;
        warehouseIsActiveInput.value = warehouse.is_active; // true/false

        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

  // (【全新】) 監聽倉庫表單提交
  warehouseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const headers = getAuthHeaders();
    if (!headers) return;

    const id = warehouseIdInput.value;
    if (!id) {
      alert("錯誤：未選中任何倉庫。");
      return;
    }

    const warehouseData = {
      name: warehouseNameInput.value,
      receiver: warehouseReceiverInput.value,
      phone: warehousePhoneInput.value,
      address: warehouseAddressInput.value,
      is_active: warehouseIsActiveInput.value === "true", // 轉為布林值
    };

    try {
      const response = await fetch(`${API_URL}/admin/warehouses/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(warehouseData),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "更新失敗");
      }

      alert("倉庫資訊已更新！");
      resetWarehouseForm();
      await loadWarehouses(headers); // 重新載入列表
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  // (【全新】) 倉庫取消按鈕
  cancelWarehouseEditBtn.addEventListener("click", resetWarehouseForm);

  // --- 【第四批優化：新增分類管理事件監聽】 ---
  // 監聽分類表單提交 (新增/編輯)
  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const headers = getAuthHeaders();
    if (!headers) return;

    const id = categoryIdInput.value;
    const categoryData = {
      name: categoryNameInput.value,
      description: categoryDescInput.value,
    };

    try {
      let url = `${API_URL}/admin/categories`;
      let method = "POST";
      if (id) {
        url = `${API_URL}/admin/categories/${id}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(categoryData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "操作失敗");
      }

      alert(id ? "分類已更新！" : "分類已新增！");
      resetCategoryForm();
      // 重新載入分類並更新商品表單
      await loadCategories(headers);
      populateCategoryDropdown();
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  // 分類取消按鈕
  cancelCategoryEditBtn.addEventListener("click", resetCategoryForm);

  // 監聽分類列表的按鈕 (編輯/刪除)
  categoriesTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;

    // 點擊 "編輯"
    if (target.classList.contains("btn-edit-category")) {
      const category = allCategories.find((c) => c.id == id);
      if (category) {
        categoryFormTitle.textContent = `編輯分類 (ID: ${id})`;
        categoryIdInput.value = category.id;
        categoryNameInput.value = category.name;
        categoryDescInput.value = category.description || "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    // 點擊 "刪除"
    if (target.classList.contains("btn-delete-category")) {
      if (
        !confirm(
          `確定要刪除 ID 為 ${id} 的分類嗎？\n(如果分類下仍有商品，將會刪除失敗)`
        )
      )
        return;

      try {
        const response = await fetch(`${API_URL}/admin/categories/${id}`, {
          method: "DELETE",
          headers: headers,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "刪除失敗");
        }
        alert("分類已刪除！");
        // 重新載入分類並更新商品表單
        await loadCategories(headers);
        populateCategoryDropdown();
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });
  // --- 【優化結束】 ---
});
// (【修正】) 移除所有在 DOMContentLoaded 之外的 addEventListener

// -------------------------------------------------
// 6. 幫助 (Helper) 函式
// -------------------------------------------------

// 重設商品表單
function resetProductForm() {
  formTitle.textContent = "新增商品";
  productForm.reset();
  productIdInput.value = "";
  cancelEditBtn.style.display = "none";
}

// (【全新】) 重設倉庫表單
function resetWarehouseForm() {
  warehouseFormTitle.textContent = "編輯倉庫";
  warehouseForm.reset();
  warehouseIdInput.value = "";
}

// --- 【第四批優化：新增重設分類表單】 ---
function resetCategoryForm() {
  categoryFormTitle.textContent = "新增分類";
  categoryForm.reset();
  categoryIdInput.value = "";
}
// --- 【優化結束】 ---

// -------------------------------------------------
// 7. (全新) 權限控制函式
// -------------------------------------------------
/**
 * 根據用戶角色，自動隱藏需要特定權限的元素
 * (讀取 data-role="admin" 屬性)
 */
function applyRolePermissions() {
  const user = getUser();
  if (user.role === "admin") {
    return; // Admin 可以看到所有東西
  }

  // 尋找所有標記為 "admin" 才能看的元素
  const restrictedElements = document.querySelectorAll('[data-role="admin"]');

  restrictedElements.forEach((el) => {
    el.style.display = "none";
  });
}

// -------------------------------------------------
// 8. (重構) 導覽列頁籤邏輯
// -------------------------------------------------
function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".dashboard-section");

  // 1. 尋找預設頁籤 (從 data-default="true" 或第一個可見的頁籤)
  const defaultLink =
    document.querySelector('.nav-link[data-default="true"]') ||
    document.querySelector('.nav-link:not([style*="display: none"])');

  const defaultTargetId = defaultLink ? defaultLink.dataset.target : null;

  // 2. 根據 URL hash 顯示正確頁面
  function showTabFromHash() {
    const hash = window.location.hash.substring(1);
    let targetId = hash ? `${hash}-section` : defaultTargetId;

    // 檢查目標是否存在且可見
    const targetSection = document.getElementById(targetId);
    if (!targetSection || targetSection.style.display === "none") {
      targetId = defaultTargetId; // 不存在或被隱藏，則退回預設
    }

    updateActiveTabs(targetId);
  }

  // 3. 更新 active 狀態的 helper
  function updateActiveTabs(targetId) {
    sections.forEach((section) => {
      section.classList.toggle("active", section.id === targetId);
    });
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.target === targetId);
    });
  }

  // 4. 綁定點擊事件
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      if (document.getElementById(targetId).style.display !== "none") {
        updateActiveTabs(targetId);
        history.pushState(null, null, `#${targetId.replace("-section", "")}`);
      }
    });
  });

  // 5. 監聽瀏覽器 "上一頁/下一頁"
  window.addEventListener("popstate", showTabFromHash);

  // 6. 初始載入
  showTabFromHash();
}
