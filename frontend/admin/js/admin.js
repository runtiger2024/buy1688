// frontend/admin/js/admin.js

// [輔助函式] 複製到剪貼簿
window.copyToClipboard = (text, message) => {
  navigator.clipboard
    .writeText(text.trim())
    .then(() => {
      alert(message || "已複製到剪貼簿！");
    })
    .catch((err) => {
      console.error("複製失敗:", err);
      alert("複製失敗，請手動複製內容。");
    });
};

// [輔助函式] 複製集運資訊
window.copyShippingInfo = (paopaoId, warehouseId) => {
  const warehouse = allWarehouses.get(parseInt(warehouseId, 10));

  if (!warehouse) {
    alert(
      "錯誤: 找不到集運倉資料 (ID: " +
        warehouseId +
        ")。請先到『管理倉庫』頁面確認資料是否完整。"
    );
    return;
  }

  const receiver = warehouse.receiver.replace("(會員編號)", paopaoId);
  const address = warehouse.address.includes("(會員編號)")
    ? warehouse.address.replace("(會員編號)", paopaoId)
    : warehouse.address;

  const copyText = `
收件人: ${receiver}
電話: ${warehouse.phone}
地址: ${address}
`.trim();

  window.copyToClipboard(copyText, "✅ 集運資訊已複製，可直接貼給廠商。");
};

import { API_URL } from "../../js/config.js";

let availableOperators = [];
let allWarehouses = new Map();
let allCategories = [];
let allOrders = [];

let currentStatusFilter = "";
let currentPaymentStatusFilter = "";

const ORDER_STATUS_MAP = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨 (往集運倉)",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

const PAYMENT_STATUS_MAP = {
  UNPAID: "待付款",
  PAID: "已付款",
};

const ORDER_TYPE_MAP = {
  Standard: "一般商城",
  Assist: "代客採購",
};

function getToken() {
  return localStorage.getItem("adminToken");
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("adminUser"));
  } catch (e) {
    return null;
  }
}
function checkAuth() {
  if (!getToken()) {
    alert("請先登入");
    window.location.href = "../html/login.html";
    return false;
  }
  return true;
}
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
function logout() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.location.href = "../html/login.html";
}

// --- DOM ---
let refreshButton;
let logoutButton;
let userInfoSpan;
let ordersTbody;
let statusFilterSelect;
let paymentStatusFilterSelect;
let productsTbody;
let productForm;
let formTitle;
let productIdInput;
let productNameInput;
let productPriceInput;
let productCostInput;
let productDescInput;
let productImgInput1,
  productImgInput2,
  productImgInput3,
  productImgInput4,
  productImgInput5;
let productCategorySelect;
let cancelEditBtn;
let statsContent;
let exchangeRateInput;
let serviceFeeInput;
let bankNameInput;
let bankAccountInput;
let bankAccountNameInput;
let saveSettingsBtn;
let userSection;
let createUserForm;
let usersTbody;
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
let categoriesTbody;
let categoryForm;
let categoryFormTitle;
let categoryIdInput;
let categoryNameInput;
let categoryDescInput;
let cancelCategoryEditBtn;

// --- 載入資料 ---

async function loadAllData() {
  const headers = getAuthHeaders();
  if (!headers) {
    checkAuth();
    return;
  }

  const user = getUser();
  if (user) {
    userInfoSpan.textContent = `歡迎, ${user.username} (${user.role})`;
  }

  await loadSettings(headers);
  await loadWarehouses(headers);

  await Promise.all([
    loadStats(headers),
    loadOrders(headers),
    loadProducts(),
    loadUsers(headers),
    loadCategories(headers),
  ]);

  populateCategoryDropdown();
}

async function loadSettings(headers) {
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      const settings = await response.json();
      if (settings.exchange_rate)
        exchangeRateInput.value = settings.exchange_rate;
      if (settings.service_fee !== undefined)
        serviceFeeInput.value = settings.service_fee;
      if (settings.bank_name) bankNameInput.value = settings.bank_name;
      if (settings.bank_account) bankAccountInput.value = settings.bank_account;
      if (settings.bank_account_name)
        bankAccountNameInput.value = settings.bank_account_name;
    }
  } catch (error) {
    console.error("載入設定失敗:", error);
  }
}

async function saveSettings(headers) {
  const exchangeRate = parseFloat(exchangeRateInput.value);
  const serviceFee = parseFloat(serviceFeeInput.value);
  const bankName = bankNameInput.value.trim();
  const bankAccount = bankAccountInput.value.trim();
  const bankAccountName = bankAccountNameInput.value.trim();

  if (isNaN(exchangeRate) || isNaN(serviceFee)) {
    alert("請輸入有效的匯率與服務費數字");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/settings`, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify({
        exchange_rate: exchangeRate,
        service_fee: serviceFee,
        bank_name: bankName,
        bank_account: bankAccount,
        bank_account_name: bankAccountName,
      }),
    });

    if (!response.ok) throw new Error("儲存失敗");

    alert("系統設定已儲存！");
    loadStats(headers);
    renderOrders(allOrders);
  } catch (error) {
    console.error("儲存設定失敗:", error);
    alert("儲存設定失敗");
  }
}

async function loadStats(headers) {
  try {
    statsContent.innerHTML = "<p>正在載入績效...</p>";

    const response = await fetch(`${API_URL}/admin/dashboard/stats`, {
      headers,
    });
    if (!response.ok) throw new Error((await response.json()).message);

    const stats = await response.json();

    const exchangeRate = parseFloat(exchangeRateInput.value) || 4.5;
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
                <hr style="margin: 10px 0;">
                <li><strong>目前計算匯率:</strong> ${exchangeRate.toFixed(
                  2
                )}</li>
                <li><strong>預估利潤 (TWD):</strong> <strong style="font-size: 1.2em; color: ${
                  totalProfitTWD > 0 ? "green" : "red"
                };">${totalProfitTWD.toFixed(0)}</strong></li>
                <hr style="margin: 10px 0;">
                <li><strong>待付款訂單:</strong> ${
                  stats.paymentStatusCounts.UNPAID
                }</li>
                <li><strong>${ORDER_STATUS_MAP.Pending}訂單:</strong> ${
      stats.statusCounts.Pending
    }</li>
                <li><strong>${ORDER_STATUS_MAP.Processing}訂單:</strong> ${
      stats.statusCounts.Processing
    }</li>
                <li><strong>${
                  ORDER_STATUS_MAP.Warehouse_Received
                }訂單:</strong> ${stats.statusCounts.Warehouse_Received}</li>
            </ul>
        `;
  } catch (error) {
    console.error("載入績效失敗:", error);
    statsContent.innerHTML = `<p style="color:red;">${error.message}</p>`;
  }
}

async function loadOrders(headers) {
  try {
    ordersTbody.innerHTML = '<tr><td colspan="12">正在載入訂單...</td></tr>';

    const params = new URLSearchParams();
    if (currentStatusFilter) params.append("status", currentStatusFilter);
    if (currentPaymentStatusFilter)
      params.append("paymentStatus", currentPaymentStatusFilter);

    let url = `${API_URL}/orders/operator`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, { headers });
    if (response.status === 403) throw new Error("權限不足");
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

    allOrders = await response.json();
    renderOrders(allOrders);
  } catch (error) {
    alert(`載入訂單失敗: ${error.message}`);
    ordersTbody.innerHTML =
      '<tr><td colspan="12" style="color: red;">載入訂單失敗。</td></tr>';
  }
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
    const products = await response.json();
    renderProducts(products);
  } catch (error) {
    console.error("載入商品失敗:", error);
    productsTbody.innerHTML =
      '<tr><td colspan="6" style="color: red;">載入商品失敗。</td></tr>';
  }
}

async function loadUsers(headers) {
  const user = getUser();
  if (user.role !== "admin") return;

  try {
    const response = await fetch(`${API_URL}/admin/users`, { headers });
    if (!response.ok) throw new Error("無法載入用戶");
    const users = await response.json();
    availableOperators = users.filter(
      (user) => user.role === "operator" && user.status === "active"
    );
    renderUsers(users);
  } catch (error) {
    console.error("載入用戶失敗:", error);
    usersTbody.innerHTML =
      '<tr><td colspan="5" style="color:red;">載入用戶失敗</td></tr>';
  }
}

async function loadWarehouses(headers) {
  try {
    const response = await fetch(`${API_URL}/warehouses`);
    if (!response.ok) throw new Error("無法載入倉庫");
    const warehousesArray = await response.json();

    allWarehouses.clear();
    warehousesArray.forEach((wh) => allWarehouses.set(wh.id, wh));

    if (getUser().role === "admin") {
      renderWarehouses(warehousesArray);
    }
  } catch (error) {
    console.error("載入倉庫失敗:", error);
    if (warehousesTbody && getUser().role === "admin") {
      warehousesTbody.innerHTML =
        '<tr><td colspan="5" style="color:red;">載入倉庫失敗</td></tr>';
    }
  }
}

async function loadCategories(headers) {
  const user = getUser();
  if (user.role !== "admin") return;

  try {
    const response = await fetch(`${API_URL}/admin/categories`, { headers });
    if (!response.ok) throw new Error("無法載入分類");
    allCategories = await response.json();
    renderCategories(allCategories);
  } catch (error) {
    console.error("載入分類失敗:", error);
    categoriesTbody.innerHTML =
      '<tr><td colspan="4" style="color:red;">載入分類失敗</td></tr>';
  }
}

// --- 渲染 (Render) 函式 ---

function renderOrders(orders) {
  ordersTbody.innerHTML = "";
  if (orders.length === 0) {
    ordersTbody.innerHTML = '<tr><td colspan="12">沒有待處理的訂單。</td></tr>';
    return;
  }

  const exchangeRate = parseFloat(exchangeRateInput.value) || 4.5;

  const operatorOptions = availableOperators
    .map((op) => `<option value="${op.id}">${op.username}</option>`)
    .join("");

  orders.forEach((order) => {
    const tr = document.createElement("tr");

    const costCny = Number(order.total_cost_cny);
    const profitTwd = order.total_amount_twd - costCny * exchangeRate;
    const profitClass = profitTwd >= 0 ? "profit-positive" : "profit-negative";

    const assignedTo = order.operator_name
      ? ` (指派給: ${order.operator_name})`
      : " (未指派)";

    const markPaidButton =
      order.payment_status === "UNPAID"
        ? `<button class="btn btn-update btn-mark-paid" data-id="${order.id}">標記為已付款</button>`
        : "";

    const paymentStatusText =
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
    const orderStatusText = ORDER_STATUS_MAP[order.status] || order.status;
    const typeText = ORDER_TYPE_MAP[order.type] || "一般商城";
    const typeColor = order.type === "Assist" ? "blue" : "gray";

    const warehouseName =
      order.warehouse?.name ||
      '<span style="color:#dc3545">未選擇集運倉</span>';
    const warehouseCopyBtn = order.warehouse_id
      ? `<button class="btn btn-primary btn-copy-shipping" 
                   data-paopao-id="${order.paopao_id}" 
                   data-warehouse-id="${order.warehouse_id}"
                   style="margin-top: 5px;">
             📋 複製寄送資訊
           </button>`
      : "";

    // [修改] 憑證顯示邏輯 (使用按鈕觸發查看 Base64)
    let voucherContent = "";
    if (order.payment_voucher_url) {
      voucherContent = `<button class="btn-link btn-view-voucher" data-id="${order.id}" style="color: #28a745; font-weight: bold; border: none; background: none; cursor: pointer; text-decoration: underline;">查看憑證</button>`;
    } else if (order.payment_status === "UNPAID") {
      voucherContent = '<span style="color:#dc3545;">待上傳</span>';
    } else {
      voucherContent = "無";
    }

    // [新增] 物流單號輸入欄位 (僅在已付款且處理中/已發貨時顯示)
    let trackingInputHtml = order.domestic_tracking_number
      ? `<a href="https://www.baidu.com/s?wd=${order.domestic_tracking_number}" target="_blank">${order.domestic_tracking_number}</a>`
      : "無";

    if (
      order.payment_status === "PAID" &&
      (order.status === "Processing" || order.status === "Shipped_Internal")
    ) {
      trackingInputHtml = `
            <div style="display:flex; align-items:center; gap:5px;">
                <input type="text" class="tracking-input" value="${
                  order.domestic_tracking_number || ""
                }" placeholder="輸入單號" style="width:100px; padding:4px;">
                <button class="btn btn-primary btn-save-tracking" data-id="${
                  order.id
                }" style="padding:4px 8px; font-size:0.8rem;">存</button>
            </div>
        `;
    }

    const totalAmount = Number(order.total_amount_twd).toLocaleString("en-US");

    tr.innerHTML = `
            <td>${order.id}</td>
            <td><span style="color: ${typeColor}; font-weight: bold;">${typeText}</span></td>
            <td>${new Date(order.created_at).toLocaleString()}</td>
            <td>${order.paopao_id}</td>
            <td>${totalAmount}</td>
            <td class="${profitClass}">${profitTwd.toFixed(0)}</td>
            <td>
                <strong>${warehouseName}</strong><br>
                ${warehouseCopyBtn}
            </td>
            <td>${voucherContent}</td>
            <td>${trackingInputHtml}</td>
            <td>
                <span class="status-${order.status}">${orderStatusText}</span>
                <br><small>${assignedTo}</small>
            </td>
            <td>
                <span class="status-${
                  order.payment_status
                }">${paymentStatusText}</span>
                <br><small>(${order.payment_method || "N/A"})</small>
            </td>
            <td>
                ${markPaidButton}
                <select class="order-status-select" data-id="${order.id}">
                    <option value="Pending" ${
                      order.status === "Pending" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Pending}</option>
                    <option value="Processing" ${
                      order.status === "Processing" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Processing}</option>
                    <option value="Shipped_Internal" ${
                      order.status === "Shipped_Internal" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Shipped_Internal}</option>
                    <option value="Warehouse_Received" ${
                      order.status === "Warehouse_Received" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Warehouse_Received}</option>
                    <option value="Completed" ${
                      order.status === "Completed" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Completed}</option>
                    <option value="Cancelled" ${
                      order.status === "Cancelled" ? "selected" : ""
                    }>${ORDER_STATUS_MAP.Cancelled}</option>
                </select>

                <select class="order-operator-select" data-id="${
                  order.id
                }" data-role="admin">
                    <option value="">-- 指派給 --</option>
                    ${operatorOptions}
                </select>
            </td>
        `;

    if (order.operator_id) {
      const operatorSelect = tr.querySelector(".order-operator-select");
      operatorSelect.value = order.operator_id;
    }

    if (getUser().role !== "admin") {
      const operatorSelect = tr.querySelector(".order-operator-select");
      if (operatorSelect) operatorSelect.style.display = "none";
    }

    ordersTbody.appendChild(tr);
  });
}

function renderProducts(products) {
  productsTbody.innerHTML = "";
  if (products.length === 0) {
    productsTbody.innerHTML = '<tr><td colspan="6">目前沒有商品。</td></tr>';
    return;
  }

  products.forEach((product) => {
    const tr = document.createElement("tr");
    const imgUrl =
      product.images && product.images.length > 0 ? product.images[0] : "";
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover;">`
      : "無圖片";

    tr.innerHTML = `
            <td>${product.id}</td>
            <td>${imgHtml}</td>
            <td>${product.name}</td>
            <td>${product.price_twd}</td>
            <td>${product.cost_cny}</td>
            <td>
                <button class="btn btn-edit" data-id="${product.id}">編輯</button>
                <button class="btn btn-delete" data-id="${product.id}">封存</button>
            </td>
        `;
    productsTbody.appendChild(tr);
  });
}

function renderUsers(users) {
  usersTbody.innerHTML = "";
  if (users.length === 0) {
    usersTbody.innerHTML = '<tr><td colspan="5">目前沒有其他用戶。</td></tr>';
    return;
  }

  users.forEach((user) => {
    const tr = document.createElement("tr");

    const isUserActive = user.status === "active";
    const statusClass = isUserActive ? "status-active" : "status-inactive";
    const statusText = isUserActive ? "啟用中" : "已停權";

    const toggleActionText = isUserActive ? "停權" : "啟用";
    const toggleActionValue = isUserActive ? "inactive" : "active";
    const toggleBtnClass = isUserActive ? "btn-delete" : "btn-update";

    tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.role === "admin" ? "管理員" : "操作員"}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn ${toggleBtnClass} btn-toggle-status" 
                        data-id="${user.id}" 
                        data-new-status="${toggleActionValue}">
                    ${toggleActionText}
                </button>
            </td>
        `;
    usersTbody.appendChild(tr);
  });
}

function renderWarehouses(warehousesArray) {
  if (!warehousesTbody) return;
  warehousesTbody.innerHTML = "";
  if (warehousesArray.length === 0) {
    warehousesTbody.innerHTML =
      '<tr><td colspan="5">目前沒有倉庫資料。</td></tr>';
    return;
  }

  warehousesArray.forEach((wh) => {
    const tr = document.createElement("tr");
    const statusText = wh.is_active
      ? '<span class="status-active">啟用</span>'
      : '<span class="status-inactive">停用</span>';

    tr.innerHTML = `
            <td>${wh.id}</td>
            <td>${wh.name}</td>
            <td><small>${wh.address}</small></td>
            <td>${statusText}</td>
            <td>
                <button class="btn btn-edit btn-edit-warehouse" data-id="${wh.id}">編輯</button>
            </td>
        `;
    warehousesTbody.appendChild(tr);
  });
}

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

function populateCategoryDropdown() {
  if (!productCategorySelect) return;

  productCategorySelect.innerHTML =
    '<option value="">-- 請選擇分類 --</option>';

  allCategories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    productCategorySelect.appendChild(option);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  refreshButton = document.getElementById("refresh-data");
  logoutButton = document.getElementById("logout-button");
  userInfoSpan = document.getElementById("user-info");
  ordersTbody = document.getElementById("orders-tbody");

  statusFilterSelect = document.getElementById("order-status-filter");
  paymentStatusFilterSelect = document.getElementById(
    "order-payment-status-filter"
  );

  productsTbody = document.getElementById("products-tbody");
  productForm = document.getElementById("product-form");
  formTitle = document.getElementById("form-title");
  productIdInput = document.getElementById("product-id");
  productNameInput = document.getElementById("product-name");
  productPriceInput = document.getElementById("product-price");
  productCostInput = document.getElementById("product-cost");
  productDescInput = document.getElementById("product-description");
  productImgInput1 = document.getElementById("product-img-1");
  productImgInput2 = document.getElementById("product-img-2");
  productImgInput3 = document.getElementById("product-img-3");
  productImgInput4 = document.getElementById("product-img-4");
  productImgInput5 = document.getElementById("product-img-5");

  productCategorySelect = document.getElementById("product-category");
  cancelEditBtn = document.getElementById("cancel-edit-btn");
  statsContent = document.getElementById("stats-content");

  exchangeRateInput = document.getElementById("exchange-rate-input");
  serviceFeeInput = document.getElementById("service-fee-input");
  bankNameInput = document.getElementById("bank-name-input");
  bankAccountInput = document.getElementById("bank-account-input");
  bankAccountNameInput = document.getElementById("bank-account-name-input");

  saveSettingsBtn = document.getElementById("save-settings-btn");

  userSection = document.getElementById("users-section");
  createUserForm = document.getElementById("create-user-form");
  usersTbody = document.getElementById("users-tbody");
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
  categoriesTbody = document.getElementById("categories-tbody");
  categoryForm = document.getElementById("category-form");
  categoryFormTitle = document.getElementById("category-form-title");
  categoryIdInput = document.getElementById("category-id");
  categoryNameInput = document.getElementById("category-name");
  categoryDescInput = document.getElementById("category-description");
  cancelCategoryEditBtn = document.getElementById("cancel-category-edit-btn");

  if (!checkAuth()) return;

  applyRolePermissions();
  loadAllData();
  setupNavigation();
  setupOrderFilters();

  logoutButton.addEventListener("click", logout);

  refreshButton.addEventListener("click", () => {
    loadOrders(getAuthHeaders());
  });

  saveSettingsBtn.addEventListener("click", () => {
    saveSettings(getAuthHeaders());
  });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const headers = getAuthHeaders();
    if (!headers) return;

    const images = [
      productImgInput1.value.trim(),
      productImgInput2.value.trim(),
      productImgInput3.value.trim(),
      productImgInput4.value.trim(),
      productImgInput5.value.trim(),
    ].filter((url) => url !== "");

    const id = productIdInput.value;
    const productData = {
      name: productNameInput.value,
      price_twd: parseInt(productPriceInput.value, 10),
      cost_cny: parseFloat(productCostInput.value),
      description: productDescInput.value,
      images: images,
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
      await loadProducts();
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  cancelEditBtn.addEventListener("click", resetProductForm);

  productsTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    if (!id) return;

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

    if (target.classList.contains("btn-edit")) {
      const headers = getAuthHeaders();
      if (!headers) {
        alert("Token 遺失，請重新登入");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/admin/products/${id}`, {
          headers,
        });
        if (!response.ok) throw new Error("無法獲取商品資料");

        const product = await response.json();

        formTitle.textContent = `編輯商品 (ID: ${id})`;
        productIdInput.value = product.id;
        productNameInput.value = product.name;
        productPriceInput.value = product.price_twd;
        productCostInput.value = product.cost_cny;
        productDescInput.value = product.description;
        productCategorySelect.value = product.category_id || "";

        const imgs = product.images || [];
        productImgInput1.value = imgs[0] || "";
        productImgInput2.value = imgs[1] || "";
        productImgInput3.value = imgs[2] || "";
        productImgInput4.value = imgs[3] || "";
        productImgInput5.value = imgs[4] || "";

        cancelEditBtn.style.display = "inline-block";
        document
          .querySelector('.nav-link[data-target="products-section"]')
          .click();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

  ordersTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const button = target.closest(".btn-copy-shipping");

    if (button) {
      const paopaoId = button.dataset.paopaoId;
      const warehouseId = button.dataset.warehouseId;

      if (paopaoId && warehouseId) {
        window.copyShippingInfo(paopaoId, warehouseId);
      } else {
        alert("錯誤: 缺少跑跑虎ID或集運倉ID。");
      }
      return;
    }

    // [新增] 查看憑證邏輯 (支援 Base64)
    if (target.classList.contains("btn-view-voucher")) {
      const id = target.dataset.id;
      const order = allOrders.find((o) => o.id == id);

      if (order && order.payment_voucher_url) {
        const url = order.payment_voucher_url;
        if (url.startsWith("data:image")) {
          const w = window.open("");
          w.document.write(
            `<img src="${url}" style="max-width: 100%; display: block; margin: 0 auto;" />`
          );
        } else {
          window.open(url, "_blank");
        }
      } else {
        alert("查無憑證資料");
      }
      return;
    }

    // [新增] 儲存物流單號按鈕
    if (target.classList.contains("btn-save-tracking")) {
      const id = target.dataset.id;
      const headers = getAuthHeaders();
      const input = target.previousElementSibling;
      const trackingNumber = input.value.trim();

      if (!id || !headers) return;

      if (!trackingNumber) {
        alert("請輸入單號再儲存");
        return;
      }

      target.disabled = true;
      target.textContent = "...";

      try {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ domestic_tracking_number: trackingNumber }),
        });
        if (!response.ok) throw new Error("更新物流單號失敗");
        alert("✅ 物流單號已儲存！");
        await loadOrders(headers);
      } catch (error) {
        alert(`錯誤: ${error.message}`);
        target.disabled = false;
        target.textContent = "存";
      }
      return;
    }

    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;

    if (target.classList.contains("btn-mark-paid")) {
      if (!confirm(`確定要將訂單 ${id} 標記為 "PAID" (已付款) 嗎？`)) return;
      try {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ payment_status: "PAID" }),
        });
        if (!response.ok) throw new Error("更新付款狀態失敗");
        alert("訂單付款狀態已更新！");
        await loadOrders(headers);
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

  ordersTbody.addEventListener("change", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;

    if (target.classList.contains("order-status-select")) {
      const status = target.value;
      if (
        !confirm(
          `確定要將訂單 ${id} 的狀態改為 "${
            ORDER_STATUS_MAP[status] || status
          }" 嗎？`
        )
      ) {
        loadOrders(headers);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ status: status }),
        });
        if (!response.ok) throw new Error("更新狀態失敗");
        alert("訂單狀態已更新！");
        await loadOrders(headers);
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }

    if (target.classList.contains("order-operator-select")) {
      const operatorId = target.value;
      if (
        !confirm(
          `確定要將訂單 ${id} 指派給操作員 ID: ${operatorId || "無"} 嗎？`
        )
      ) {
        loadOrders(headers);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({ operator_id: operatorId || null }),
        });
        if (!response.ok) throw new Error("指派失敗");
        alert("訂單指派已更新！");
        await loadOrders(headers);
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

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
      if (!response.ok) throw new Error(data.message || "建立失敗");
      alert("用戶建立成功！");
      createUserForm.reset();
      await loadUsers(headers);
    } catch (error) {
      if (error.message.includes("409")) {
        alert("錯誤: 帳號已存在");
      } else {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

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
        await loadUsers(headers);
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });

  warehousesTbody.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-edit-warehouse")) {
      const id = e.target.dataset.id;
      const warehouse = allWarehouses.get(parseInt(id, 10));
      if (warehouse) {
        warehouseFormTitle.textContent = `編輯倉庫 (ID: ${id})`;
        warehouseIdInput.value = warehouse.id;
        warehouseNameInput.value = warehouse.name;
        warehouseReceiverInput.value = warehouse.receiver;
        warehousePhoneInput.value = warehouse.phone;
        warehouseAddressInput.value = warehouse.address;
        warehouseIsActiveInput.value = warehouse.is_active;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

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
      is_active: warehouseIsActiveInput.value === "true",
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
      await loadWarehouses(headers);
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  cancelWarehouseEditBtn.addEventListener("click", resetWarehouseForm);

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
      if (!response.ok) throw new Error(data.message || "操作失敗");
      alert(id ? "分類已更新！" : "分類已新增！");
      resetCategoryForm();
      await loadCategories(headers);
      populateCategoryDropdown();
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  });

  cancelCategoryEditBtn.addEventListener("click", resetCategoryForm);

  categoriesTbody.addEventListener("click", async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    const headers = getAuthHeaders();
    if (!id || !headers) return;
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
        if (!response.ok) throw new Error(data.message || "刪除失敗");
        alert("分類已刪除！");
        await loadCategories(headers);
        populateCategoryDropdown();
      } catch (error) {
        alert(`錯誤: ${error.message}`);
      }
    }
  });
});

function resetProductForm() {
  formTitle.textContent = "新增商品";
  productForm.reset();
  productIdInput.value = "";
  cancelEditBtn.style.display = "none";
}

function resetWarehouseForm() {
  warehouseFormTitle.textContent = "編輯倉庫";
  warehouseForm.reset();
  warehouseIdInput.value = "";
}

function resetCategoryForm() {
  categoryFormTitle.textContent = "新增分類";
  categoryForm.reset();
  categoryIdInput.value = "";
}

function setupOrderFilters() {
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener("change", (e) => {
      currentStatusFilter = e.target.value;
      loadOrders(getAuthHeaders());
    });
  }

  if (paymentStatusFilterSelect) {
    paymentStatusFilterSelect.addEventListener("change", (e) => {
      currentPaymentStatusFilter = e.target.value;
      loadOrders(getAuthHeaders());
    });
  }
}

function applyRolePermissions() {
  const user = getUser();
  if (user.role === "admin") return;
  document.querySelectorAll('[data-role="admin"]').forEach((el) => {
    el.style.display = "none";
  });
}

function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".dashboard-section");
  const defaultLink =
    document.querySelector('.nav-link[data-default="true"]') ||
    document.querySelector('.nav-link:not([style*="display: none"])');
  const defaultTargetId = defaultLink ? defaultLink.dataset.target : null;

  function showTabFromHash() {
    const hash = window.location.hash.substring(1);
    let targetId = hash ? `${hash}-section` : defaultTargetId;
    const targetSection = document.getElementById(targetId);
    if (!targetSection || targetSection.style.display === "none") {
      targetId = defaultTargetId;
    }
    updateActiveTabs(targetId);
  }

  function updateActiveTabs(targetId) {
    sections.forEach((section) => {
      section.classList.toggle("active", section.id === targetId);
    });
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.target === targetId);
    });
  }

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

  window.addEventListener("popstate", showTabFromHash);
  showTabFromHash();
}
