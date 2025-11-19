// frontend/admin/js/admin.js
import {
  checkAuth,
  getUser,
  logout,
  getAuthHeaders,
  copyToClipboard,
} from "./utils.js";
import { api } from "./api.js";
import {
  renderOrders,
  renderProducts,
  renderUsers,
  renderWarehouses,
  renderCategories,
} from "./render.js";
import { ORDER_STATUS_MAP } from "./constants.js";

// --- 全局狀態 ---
let availableOperators = [];
let allWarehouses = new Map();
let allCategories = [];
let allOrders = [];

let currentStatusFilter = "";
let currentPaymentStatusFilter = "";
let currentSearchTerm = "";

// --- DOM 元素 (在 DOMContentLoaded 中賦值) ---
// (為節省篇幅，這部分保持不變，只要確保所有變數都有宣告即可)
let refreshButton,
  logoutButton,
  userInfoSpan,
  ordersTbody,
  statusFilterSelect,
  paymentStatusFilterSelect;
let orderSearchInput, orderSearchBtn, productsTbody, productForm, formTitle;
let productIdInput,
  productNameInput,
  productPriceInput,
  productCostInput,
  productDescInput;
let productImgInput1,
  productImgInput2,
  productImgInput3,
  productImgInput4,
  productImgInput5;
let productCategorySelect, cancelEditBtn, statsContent, exchangeRateInput;
let serviceFeeInput, bankNameInput, bankAccountInput, bankAccountNameInput;
let saveSettingsBtn, userSection, createUserForm, usersTbody, warehousesTbody;
let warehouseForm,
  warehouseFormTitle,
  warehouseIdInput,
  warehouseNameInput,
  warehouseReceiverInput;
let warehousePhoneInput,
  warehouseAddressInput,
  warehouseIsActiveInput,
  cancelWarehouseEditBtn;
let categoriesTbody,
  categoryForm,
  categoryFormTitle,
  categoryIdInput,
  categoryNameInput;
let categoryDescInput, cancelCategoryEditBtn;

// --- 核心邏輯 ---

// [優化] 暴露給全局使用的函式 (供 HTML onclick 使用)
window.copyShippingInfo = (paopaoId, warehouseId) => {
  const warehouse = allWarehouses.get(parseInt(warehouseId, 10));
  if (!warehouse) {
    alert("錯誤: 找不到集運倉資料");
    return;
  }
  const receiver = warehouse.receiver.replace("(會員編號)", paopaoId);
  const address = warehouse.address.includes("(會員編號)")
    ? warehouse.address.replace("(會員編號)", paopaoId)
    : warehouse.address;
  copyToClipboard(
    `收件人: ${receiver}\n電話: ${warehouse.phone}\n地址: ${address}`,
    "✅ 集運資訊已複製"
  );
};

async function loadAllData() {
  if (!checkAuth()) return;

  const user = getUser();
  if (user) userInfoSpan.textContent = `歡迎, ${user.username} (${user.role})`;

  await Promise.all([loadSettings(), loadWarehouses()]);
  await Promise.all([
    loadStats(),
    loadOrders(),
    loadProducts(),
    loadUsers(),
    loadCategories(),
  ]);
  populateCategoryDropdown();
}

// --- 資料載入與 API 呼叫 ---

async function loadSettings() {
  try {
    const settings = await api.getSettings();
    if (settings.exchange_rate)
      exchangeRateInput.value = settings.exchange_rate;
    if (settings.service_fee !== undefined)
      serviceFeeInput.value = settings.service_fee;
    if (settings.bank_name) bankNameInput.value = settings.bank_name;
    if (settings.bank_account) bankAccountInput.value = settings.bank_account;
    if (settings.bank_account_name)
      bankAccountNameInput.value = settings.bank_account_name;
  } catch (e) {
    console.error("載入設定失敗", e);
  }
}

async function loadStats() {
  try {
    statsContent.innerHTML = "<p>正在載入績效...</p>";
    const stats = await api.getStats();
    const exchangeRate = parseFloat(exchangeRateInput.value) || 4.5;
    const totalCostTWD = stats.totalCostCNY * exchangeRate;
    const totalProfitTWD = stats.totalRevenueTWD - totalCostTWD;

    statsContent.innerHTML = `
      <ul>
          <li><strong>總營收 (TWD):</strong> ${stats.totalRevenueTWD}</li>
          <li><strong>總成本 (CNY):</strong> ${stats.totalCostCNY.toFixed(
            2
          )}</li>
          <hr style="margin: 10px 0;">
          <li><strong>預估利潤 (TWD):</strong> <strong style="color:${
            totalProfitTWD > 0 ? "green" : "red"
          }">${totalProfitTWD.toFixed(0)}</strong></li>
          <hr style="margin: 10px 0;">
          <li><strong>待付款:</strong> ${
            stats.paymentStatusCounts.UNPAID
          } / <strong>已付款:</strong> ${stats.paymentStatusCounts.PAID}</li>
          <li><strong>待處理:</strong> ${
            stats.statusCounts.Pending
          } / <strong>採購中:</strong> ${
      stats.statusCounts.Processing
    } / <strong>已發貨:</strong> ${
      stats.statusCounts.Shipped_Internal
    } / <strong>已入倉:</strong> ${stats.statusCounts.Warehouse_Received}</li>
      </ul>`;
  } catch (e) {
    statsContent.innerHTML = `<p style="color:red;">${e.message}</p>`;
  }
}

async function loadOrders() {
  try {
    ordersTbody.innerHTML = '<tr><td colspan="12">載入中...</td></tr>';
    const params = {};
    if (currentStatusFilter) params.status = currentStatusFilter;
    if (currentPaymentStatusFilter)
      params.paymentStatus = currentPaymentStatusFilter;
    if (currentSearchTerm) params.search = currentSearchTerm;

    allOrders = await api.getOrders(params);
    const exchangeRate = parseFloat(exchangeRateInput.value) || 4.5;
    renderOrders(
      allOrders,
      ordersTbody,
      availableOperators,
      exchangeRate,
      getUser().role
    );
  } catch (e) {
    alert(e.message);
    ordersTbody.innerHTML = '<tr><td colspan="12">載入失敗</td></tr>';
  }
}

async function loadProducts() {
  try {
    const products = await api.getProducts();
    renderProducts(products, productsTbody);
  } catch (e) {
    console.error(e);
  }
}

async function loadUsers() {
  if (getUser().role !== "admin") return;
  try {
    const users = await api.getUsers();
    availableOperators = users.filter(
      (u) => u.role === "operator" && u.status === "active"
    );
    renderUsers(users, usersTbody, getUser());
  } catch (e) {
    console.error(e);
  }
}

async function loadWarehouses() {
  try {
    const warehouses = await api.getWarehouses();
    allWarehouses.clear();
    warehouses.forEach((wh) => allWarehouses.set(wh.id, wh));
    if (getUser().role === "admin")
      renderWarehouses(warehouses, warehousesTbody);
  } catch (e) {
    console.error(e);
  }
}

async function loadCategories() {
  if (getUser().role !== "admin") return;
  try {
    allCategories = await api.getCategories();
    renderCategories(allCategories, categoriesTbody);
  } catch (e) {
    console.error(e);
  }
}

// --- 輔助函式 ---
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

function resetProductForm() {
  formTitle.textContent = "新增商品";
  productForm.reset();
  productIdInput.value = "";
  cancelEditBtn.style.display = "none";
}
function resetWarehouseForm() {
  warehouseFormTitle.textContent = "新增倉庫";
  warehouseForm.reset();
  warehouseIdInput.value = "";
}
function resetCategoryForm() {
  categoryFormTitle.textContent = "新增分類";
  categoryForm.reset();
  categoryIdInput.value = "";
}

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  // 綁定 DOM 元素 (這部分很長，但就是單純的 document.getElementById)
  refreshButton = document.getElementById("refresh-data");
  logoutButton = document.getElementById("logout-button");
  userInfoSpan = document.getElementById("user-info");
  ordersTbody = document.getElementById("orders-tbody");
  statusFilterSelect = document.getElementById("order-status-filter");
  paymentStatusFilterSelect = document.getElementById(
    "order-payment-status-filter"
  );
  orderSearchInput = document.getElementById("order-search-input");
  orderSearchBtn = document.getElementById("order-search-btn");
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
  loadAllData();

  // --- 事件監聽 ---

  // 登出
  logoutButton.addEventListener("click", logout);

  // 訂單過濾
  refreshButton.addEventListener("click", () => {
    orderSearchInput.value = "";
    currentSearchTerm = "";
    loadOrders();
  });
  statusFilterSelect.addEventListener("change", (e) => {
    currentStatusFilter = e.target.value;
    loadOrders();
  });
  paymentStatusFilterSelect.addEventListener("change", (e) => {
    currentPaymentStatusFilter = e.target.value;
    loadOrders();
  });
  if (orderSearchBtn) {
    orderSearchBtn.addEventListener("click", () => {
      currentSearchTerm = orderSearchInput.value.trim();
      loadOrders();
    });
    orderSearchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        currentSearchTerm = orderSearchInput.value.trim();
        loadOrders();
      }
    });
  }

  // 設定儲存
  saveSettingsBtn.addEventListener("click", async () => {
    try {
      await api.updateSettings({
        exchange_rate: parseFloat(exchangeRateInput.value),
        service_fee: parseFloat(serviceFeeInput.value),
        bank_name: bankNameInput.value,
        bank_account: bankAccountInput.value,
        bank_account_name: bankAccountNameInput.value,
      });
      alert("設定已儲存");
      loadStats();
      loadOrders();
    } catch (e) {
      alert(e.message);
    }
  });

  // 商品
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const images = [
      productImgInput1.value,
      productImgInput2.value,
      productImgInput3.value,
      productImgInput4.value,
      productImgInput5.value,
    ].filter((u) => u.trim());
    const data = {
      name: productNameInput.value,
      price_twd: parseInt(productPriceInput.value),
      cost_cny: parseFloat(productCostInput.value),
      description: productDescInput.value,
      images,
      category_id: parseInt(productCategorySelect.value),
    };
    try {
      if (productIdInput.value)
        await api.updateProduct(productIdInput.value, data);
      else await api.createProduct(data);
      alert("商品已儲存");
      resetProductForm();
      loadProducts();
    } catch (e) {
      alert(e.message);
    }
  });
  cancelEditBtn.addEventListener("click", resetProductForm);
  productsTbody.addEventListener("click", async (e) => {
    const id = e.target.dataset.id;
    if (e.target.classList.contains("btn-delete")) {
      if (confirm("確定封存?")) {
        await api.archiveProduct(id);
        loadProducts();
      }
    }
    if (e.target.classList.contains("btn-edit")) {
      const p = (await api.getProducts()).find((x) => x.id == id);
      if (p) {
        formTitle.textContent = `編輯商品 ${id}`;
        productIdInput.value = p.id;
        productNameInput.value = p.name;
        productPriceInput.value = p.price_twd;
        productCostInput.value = p.cost_cny;
        productDescInput.value = p.description;
        productCategorySelect.value = p.category_id;
        [
          productImgInput1,
          productImgInput2,
          productImgInput3,
          productImgInput4,
          productImgInput5,
        ].forEach((inp, i) => (inp.value = p.images[i] || ""));
        cancelEditBtn.style.display = "inline-block";
        document
          .querySelector('.nav-link[data-target="products-section"]')
          .click();
        window.scrollTo({ top: 0 });
      }
    }
  });

  // 訂單列表按鈕 (狀態變更, 複製, 憑證, 物流)
  ordersTbody.addEventListener("change", async (e) => {
    const id = e.target.dataset.id;
    if (e.target.classList.contains("order-status-select")) {
      if (confirm("確定修改狀態?")) {
        await api.updateOrder(id, { status: e.target.value });
        alert("狀態已更新");
      } else {
        loadOrders();
      }
    }
    if (e.target.classList.contains("order-operator-select")) {
      if (confirm("確定指派?")) {
        await api.updateOrder(id, { operator_id: e.target.value });
        alert("已指派");
      } else {
        loadOrders();
      }
    }
  });
  ordersTbody.addEventListener("click", async (e) => {
    const id = e.target.dataset.id;
    if (e.target.classList.contains("btn-save-tracking")) {
      const val = e.target.previousElementSibling.value;
      await api.updateOrder(id, { domestic_tracking_number: val });
      alert("單號已儲存");
      loadOrders();
    }
    if (e.target.classList.contains("btn-mark-paid")) {
      if (confirm("確定標記為已付款?")) {
        await api.updateOrder(id, { payment_status: "PAID" });
        alert("已更新付款狀態");
        loadOrders();
      }
    }
    if (e.target.classList.contains("btn-view-voucher")) {
      const order = allOrders.find((o) => o.id == id);
      const url = order.payment_voucher_url;
      if (url.startsWith("data:image")) {
        const w = window.open("");
        w.document.write(`<img src="${url}" style="width:100%">`);
      } else {
        window.open(url);
      }
    }
  });

  // 倉庫
  warehouseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: warehouseNameInput.value,
      receiver: warehouseReceiverInput.value,
      phone: warehousePhoneInput.value,
      address: warehouseAddressInput.value,
      is_active: warehouseIsActiveInput.value === "true",
    };
    try {
      if (warehouseIdInput.value)
        await api.updateWarehouse(warehouseIdInput.value, data);
      else await api.createWarehouse(data);
      alert("倉庫已儲存");
      resetWarehouseForm();
      loadWarehouses();
    } catch (e) {
      alert(e.message);
    }
  });
  warehousesTbody.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-edit-warehouse")) {
      const w = allWarehouses.get(parseInt(e.target.dataset.id));
      warehouseFormTitle.textContent = "編輯倉庫";
      warehouseIdInput.value = w.id;
      warehouseNameInput.value = w.name;
      warehouseReceiverInput.value = w.receiver;
      warehousePhoneInput.value = w.phone;
      warehouseAddressInput.value = w.address;
      warehouseIsActiveInput.value = w.is_active;
      window.scrollTo({ top: 0 });
    }
  });
  cancelWarehouseEditBtn.addEventListener("click", resetWarehouseForm);

  // 用戶
  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.createUser({
        username: document.getElementById("user-username").value,
        password: document.getElementById("user-password").value,
        role: document.getElementById("user-role").value,
      });
      alert("用戶已建立");
      createUserForm.reset();
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  });
  usersTbody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-toggle-status")) {
      const id = e.target.dataset.id;
      if (confirm("確定切換狀態?")) {
        await api.updateUserStatus(id, e.target.dataset.newStatus);
        loadUsers();
      }
    }
  });
  usersTbody.addEventListener("change", async (e) => {
    if (e.target.classList.contains("user-role-select")) {
      if (confirm("確定修改權限?")) {
        await api.updateUserRole(e.target.dataset.id, e.target.value);
        loadUsers();
      } else {
        loadUsers();
      }
    }
  });

  // 分類
  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: categoryNameInput.value,
      description: categoryDescInput.value,
    };
    try {
      if (categoryIdInput.value)
        await api.updateCategory(categoryIdInput.value, data);
      else await api.createCategory(data);
      alert("分類已儲存");
      resetCategoryForm();
      loadCategories();
      populateCategoryDropdown();
    } catch (e) {
      alert(e.message);
    }
  });
  categoriesTbody.addEventListener("click", async (e) => {
    const id = e.target.dataset.id;
    if (e.target.classList.contains("btn-delete-category")) {
      if (confirm("確定刪除?")) {
        await api.deleteCategory(id);
        loadCategories();
        populateCategoryDropdown();
      }
    }
    if (e.target.classList.contains("btn-edit-category")) {
      const c = allCategories.find((x) => x.id == id);
      categoryFormTitle.textContent = "編輯分類";
      categoryIdInput.value = c.id;
      categoryNameInput.value = c.name;
      categoryDescInput.value = c.description || "";
      window.scrollTo({ top: 0 });
    }
  });
  cancelCategoryEditBtn.addEventListener("click", resetCategoryForm);

  // 角色權限控制
  if (getUser().role !== "admin") {
    document
      .querySelectorAll('[data-role="admin"]')
      .forEach((el) => (el.style.display = "none"));
  }

  // Tab 切換
  const sections = document.querySelectorAll(".dashboard-section");
  const navLinks = document.querySelectorAll(".nav-link");
  function showTab(id) {
    sections.forEach((s) => (s.style.display = s.id === id ? "block" : "none"));
    navLinks.forEach((l) =>
      l.classList.toggle("active", l.dataset.target === id)
    );
  }
  navLinks.forEach((l) =>
    l.addEventListener("click", (e) => {
      e.preventDefault();
      showTab(l.dataset.target);
    })
  );
  // 預設顯示第一個 Tab
  showTab("stats-section");
});
