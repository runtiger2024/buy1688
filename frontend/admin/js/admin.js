// frontend/admin/js/admin.js
import { checkAuth, getUser, logout, copyToClipboard } from "./utils.js";
import { api } from "./api.js";

// 常數映射 (保持與 constants.js 一致)
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

// --- 全局狀態 ---
let availableOperators = [];
let allWarehouses = new Map();
let allCategories = [];
let allOrders = [];
let currentOrder = null; // 當前 Modal 編輯的訂單

let currentStatusFilter = "";
let currentPaymentStatusFilter = "";
let currentSearchTerm = "";

// --- DOM 元素 ---
// (省略大量 getElementById，直接在邏輯中使用)

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) return;

  // 1. 綁定 Sidebar 導航
  setupNavigation();

  // 2. 顯示用戶資訊
  const user = getUser();
  if (user) {
    document.getElementById("user-info").innerHTML = `
        <i class="fas fa-user-circle"></i> ${user.username} <br>
        <small>${user.role === "admin" ? "管理員" : "操作員"}</small>
    `;

    // 權限控制：非 Admin 隱藏特定選單
    if (user.role !== "admin") {
      document
        .querySelectorAll('[data-role="admin"]')
        .forEach((el) => (el.style.display = "none"));
    }
  }

  // 3. 綁定登出
  document.getElementById("logout-button").addEventListener("click", logout);

  // 4. 載入基礎資料
  await Promise.all([loadSettings(), loadWarehouses(), loadUsers()]);

  // 5. 預設載入 Dashboard
  loadStats();

  // 6. 綁定各區塊事件
  setupDashboardEvents();
  setupOrderEvents();
  setupProductEvents();
  setupCategoryEvents();
  setupWarehouseEvents();
  setupUserEvents();
  setupSettingsEvents();
  setupModalClosers();
});

// ==========================================
// 1. 導航邏輯
// ==========================================
function setupNavigation() {
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const sections = document.querySelectorAll(".dashboard-section");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      // 移除 active
      links.forEach((l) => l.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      // 加入 active
      link.classList.add("active");
      const targetId = link.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add("active");

      // 根據切換到的頁面載入資料
      if (targetId === "orders-section") loadOrders();
      if (targetId === "products-section") loadProducts();
      if (targetId === "categories-section") loadCategories();
      if (targetId === "warehouses-section") loadWarehouses();
      if (targetId === "users-section") loadUsers();
      if (targetId === "stats-section") loadStats();
    });
  });
}

// ==========================================
// 2. 儀表板 (Stats)
// ==========================================
async function loadStats() {
  const container = document.getElementById("stats-cards-container");
  const refreshBtn = document.getElementById("refresh-stats");

  try {
    refreshBtn.innerHTML = '<i class="fas fa-spin fa-spinner"></i>';
    const stats = await api.getStats();

    // 獲取匯率計算利潤
    const rateInput = document.getElementById("exchange-rate-input");
    const exchangeRate = parseFloat(rateInput.value) || 4.5;
    const totalCostTWD = stats.totalCostCNY * exchangeRate;
    const totalProfitTWD = stats.totalRevenueTWD - totalCostTWD;

    // 渲染卡片
    container.innerHTML = `
            <div class="stat-card success">
                <h4>總營收 (TWD)</h4>
                <div class="value">NT$ ${stats.totalRevenueTWD.toLocaleString()}</div>
            </div>
            <div class="stat-card info">
                <h4>總成本 (CNY)</h4>
                <div class="value">¥ ${stats.totalCostCNY.toLocaleString()}</div>
            </div>
            <div class="stat-card ${
              totalProfitTWD >= 0 ? "success" : "danger"
            }">
                <h4>預估利潤 (TWD)</h4>
                <div class="value">NT$ ${totalProfitTWD.toLocaleString()}</div>
            </div>
            <div class="stat-card warning">
                <h4>待處理訂單</h4>
                <div class="value">${stats.statusCounts.Pending || 0}</div>
            </div>
            <div class="stat-card info">
                <h4>採購中/發貨</h4>
                <div class="value">${
                  (stats.statusCounts.Processing || 0) +
                  (stats.statusCounts.Shipped_Internal || 0)
                }</div>
            </div>
            <div class="stat-card danger">
                <h4>待付款</h4>
                <div class="value">${
                  stats.paymentStatusCounts.UNPAID || 0
                }</div>
            </div>
        `;
  } catch (e) {
    container.innerHTML = `<p class="text-danger">載入失敗: ${e.message}</p>`;
  } finally {
    refreshBtn.innerHTML = '<i class="fas fa-sync"></i> 刷新';
  }
}

function setupDashboardEvents() {
  document.getElementById("refresh-stats").addEventListener("click", loadStats);
}

// ==========================================
// 3. 訂單管理 (Orders)
// ==========================================
async function loadOrders() {
  const tbody = document.getElementById("orders-tbody");
  tbody.innerHTML =
    '<tr><td colspan="9" class="text-center">載入中...</td></tr>';

  try {
    const params = {};
    if (currentStatusFilter) params.status = currentStatusFilter;
    if (currentPaymentStatusFilter)
      params.paymentStatus = currentPaymentStatusFilter;
    if (currentSearchTerm) params.search = currentSearchTerm;

    allOrders = await api.getOrders(params);
    renderOrdersTable(allOrders);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${e.message}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById("orders-tbody");
  tbody.innerHTML = "";

  if (orders.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center">沒有符合條件的訂單</td></tr>';
    return;
  }

  const rateInput = document.getElementById("exchange-rate-input");
  const exchangeRate = parseFloat(rateInput.value) || 4.5;

  orders.forEach((order) => {
    // 計算利潤
    const costCny = Number(order.total_cost_cny);
    const profitTwd = order.total_amount_twd - costCny * exchangeRate;
    const profitClass = profitTwd >= 0 ? "text-success" : "text-danger";

    // 狀態 Badge
    let statusBadge = "badge-secondary";
    if (order.status === "Pending") statusBadge = "badge-warning";
    if (order.status === "Processing" || order.status === "Shipped_Internal")
      statusBadge = "badge-info";
    if (order.status === "Completed" || order.status === "Warehouse_Received")
      statusBadge = "badge-success";
    if (order.status === "Cancelled") statusBadge = "badge-danger";

    let paymentBadge =
      order.payment_status === "PAID" ? "badge-success" : "badge-danger";

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>#${order.id}</td>
            <td><small>${ORDER_TYPE_MAP[order.type] || order.type}</small></td>
            <td><small>${new Date(
              order.created_at
            ).toLocaleString()}</small></td>
            <td>${order.paopao_id}</td>
            <td>NT$ ${order.total_amount_twd.toLocaleString()}</td>
            <td class="${profitClass}" style="font-weight:bold;">${profitTwd.toFixed(
      0
    )}</td>
            <td><span class="badge ${statusBadge}">${
      ORDER_STATUS_MAP[order.status] || order.status
    }</span></td>
            <td><span class="badge ${paymentBadge}">${
      PAYMENT_STATUS_MAP[order.payment_status]
    }</span></td>
            <td>
                <button class="btn btn-small btn-primary btn-view-order" data-id="${
                  order.id
                }">
                    <i class="fas fa-eye"></i> 詳情/編輯
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  // 綁定按鈕事件
  document.querySelectorAll(".btn-view-order").forEach((btn) => {
    btn.addEventListener("click", () => openOrderModal(btn.dataset.id));
  });
}

function setupOrderEvents() {
  document.getElementById("order-search-btn").addEventListener("click", () => {
    currentSearchTerm = document
      .getElementById("order-search-input")
      .value.trim();
    loadOrders();
  });
  document
    .getElementById("order-status-filter")
    .addEventListener("change", (e) => {
      currentStatusFilter = e.target.value;
      loadOrders();
    });
  document
    .getElementById("order-payment-status-filter")
    .addEventListener("change", (e) => {
      currentPaymentStatusFilter = e.target.value;
      loadOrders();
    });
  document.getElementById("refresh-orders").addEventListener("click", () => {
    document.getElementById("order-search-input").value = "";
    document.getElementById("order-status-filter").value = "";
    document.getElementById("order-payment-status-filter").value = "";
    currentSearchTerm = "";
    currentStatusFilter = "";
    currentPaymentStatusFilter = "";
    loadOrders();
  });

  // Modal 內的儲存按鈕
  document
    .getElementById("btn-save-order")
    .addEventListener("click", saveOrderChanges);
}

// --- 訂單 Modal 邏輯 ---
function openOrderModal(orderId) {
  const order = allOrders.find((o) => o.id == orderId);
  if (!order) return;
  currentOrder = order;

  const modal = document.getElementById("order-modal");
  const content = document.getElementById("order-modal-content");

  const userRole = getUser().role;
  const warehouse = allWarehouses.get(order.warehouse_id);
  const warehouseName = warehouse ? warehouse.name : "未知倉庫";

  // 構建操作選項
  const operatorOptions = availableOperators
    .map(
      (op) =>
        `<option value="${op.id}" ${
          order.operator_id === op.id ? "selected" : ""
        }>${op.username}</option>`
    )
    .join("");

  // 憑證顯示
  let voucherHtml = '<span class="text-muted">尚未上傳</span>';
  if (order.payment_voucher_url) {
    if (order.payment_voucher_url.startsWith("data:image")) {
      voucherHtml = `<img src="${order.payment_voucher_url}" class="img-thumb" onclick="window.open().document.write('<img src=\\'${order.payment_voucher_url}\\' style=\\'width:100%\\'>')"> (點擊放大)`;
    } else {
      voucherHtml = `<a href="${order.payment_voucher_url}" target="_blank">查看連結</a>`;
    }
  }

  // 商品列表 HTML
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
            <td>${item.snapshot_name} <br> <small class="text-muted">${
        item.item_spec || ""
      }</small></td>
            <td>${
              item.item_url
                ? `<a href="${item.item_url}" target="_blank"><i class="fas fa-link"></i></a>`
                : "-"
            }</td>
            <td>¥ ${item.snapshot_cost_cny}</td>
            <td>${item.quantity}</td>
        </tr>
    `
    )
    .join("");

  content.innerHTML = `
        <div class="form-row-2">
            <div>
                <p><strong>訂單編號:</strong> #${order.id}</p>
                <p><strong>會員:</strong> ${order.paopao_id}</p>
                <p><strong>Email:</strong> ${order.customer_email || "-"}</p>
                <p><strong>集運倉:</strong> ${warehouseName} 
                   ${
                     order.warehouse_id
                       ? `<button class="btn btn-small btn-light" onclick="copyShippingInfo('${order.paopao_id}', ${order.warehouse_id})">複製資訊</button>`
                       : ""
                   }
                </p>
            </div>
            <div>
                <div class="form-group">
                    <label>訂單狀態</label>
                    <select id="modal-order-status">
                        ${Object.keys(ORDER_STATUS_MAP)
                          .map(
                            (k) =>
                              `<option value="${k}" ${
                                order.status === k ? "selected" : ""
                              }>${ORDER_STATUS_MAP[k]}</option>`
                          )
                          .join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>付款狀態 (目前: ${
                      PAYMENT_STATUS_MAP[order.payment_status]
                    })</label>
                    ${
                      order.payment_status === "UNPAID"
                        ? `<button class="btn btn-small btn-success w-100" onclick="markOrderPaid(${order.id})">標記為已付款</button>`
                        : `<span class="badge badge-success">已付款</span>`
                    }
                </div>
            </div>
        </div>
        
        <hr>
        
        <div class="form-row-2">
            <div class="form-group">
                <label>指派操作員 (${
                  userRole === "admin" ? "可選" : "唯讀"
                })</label>
                <select id="modal-order-operator" ${
                  userRole !== "admin" ? "disabled" : ""
                }>
                    <option value="">-- 未指派 --</option>
                    ${operatorOptions}
                </select>
            </div>
            <div class="form-group">
                <label>大陸物流單號 (發往集運倉)</label>
                <input type="text" id="modal-order-tracking" value="${
                  order.domestic_tracking_number || ""
                }" placeholder="輸入快遞單號">
            </div>
        </div>

        <div class="form-group">
            <label>管理員備註</label>
            <textarea id="modal-order-notes" rows="2">${
              order.notes || ""
            }</textarea>
        </div>
        
        <div class="form-group bg-light p-10">
            <label>付款憑證</label>
            <div>${voucherHtml}</div>
        </div>

        <h4 class="mt-5">商品清單</h4>
        <table class="data-table" style="font-size: 0.85rem;">
            <thead>
                <tr><th>商品</th><th>連結</th><th>成本</th><th>數量</th></tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>
    `;

  modal.style.display = "block";
}

// 將 markOrderPaid 暴露給全局
window.markOrderPaid = async function (id) {
  if (!confirm("確定標記為已付款？系統將發信通知客戶。")) return;
  try {
    await api.updateOrder(id, { payment_status: "PAID" });
    alert("更新成功");
    document.getElementById("order-modal").style.display = "none";
    loadOrders();
    loadStats(); // 更新儀表板
  } catch (e) {
    alert(e.message);
  }
};

async function saveOrderChanges() {
  if (!currentOrder) return;
  const status = document.getElementById("modal-order-status").value;
  const operatorId = document.getElementById("modal-order-operator").value;
  const tracking = document.getElementById("modal-order-tracking").value;
  const notes = document.getElementById("modal-order-notes").value;

  try {
    const data = {
      status: status,
      notes: notes,
      domestic_tracking_number: tracking,
      operator_id: operatorId || null,
    };

    await api.updateOrder(currentOrder.id, data);
    alert("訂單已更新");
    document.getElementById("order-modal").style.display = "none";
    loadOrders();
    loadStats();
  } catch (e) {
    alert("更新失敗: " + e.message);
  }
}

// ==========================================
// 4. 商品管理 (Products)
// ==========================================
async function loadProducts() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML =
    '<tr><td colspan="7" class="text-center">載入中...</td></tr>';
  try {
    const products = await api.getProducts();
    renderProductsTable(products);
  } catch (e) {
    console.error(e);
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML = "";

  if (products.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center">無商品</td></tr>';
    return;
  }

  products.forEach((p) => {
    const imgUrl = p.images && p.images.length > 0 ? p.images[0] : "";
    const categoryName = p.category ? p.category.name : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${p.id}</td>
            <td>${
              imgUrl
                ? `<img src="${imgUrl}" class="img-thumb" onclick="window.open('${imgUrl}')">`
                : "無"
            }</td>
            <td>${p.name}</td>
            <td>${categoryName}</td>
            <td>${p.price_twd}</td>
            <td>${p.cost_cny}</td>
            <td>
                <button class="btn btn-small btn-primary btn-edit-product" data-id="${
                  p.id
                }"><i class="fas fa-edit"></i> 編輯</button>
                <button class="btn btn-small btn-danger btn-delete-product" data-id="${
                  p.id
                }"><i class="fas fa-trash"></i> 封存</button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".btn-edit-product").forEach((btn) => {
    btn.addEventListener("click", () => openProductModal(btn.dataset.id));
  });
  document.querySelectorAll(".btn-delete-product").forEach((btn) => {
    btn.addEventListener("click", () => archiveProduct(btn.dataset.id));
  });
}

function setupProductEvents() {
  document
    .getElementById("btn-add-product")
    .addEventListener("click", () => openProductModal(null));

  // 動態增加圖片欄位
  document.getElementById("btn-add-img-field").addEventListener("click", () => {
    const container = document.getElementById("product-images-container");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "product-img-input mt-5";
    input.placeholder = "副圖 URL";
    container.appendChild(input);
  });

  document
    .getElementById("product-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("product-id").value;
      // 收集圖片
      const images = Array.from(document.querySelectorAll(".product-img-input"))
        .map((i) => i.value.trim())
        .filter((v) => v);

      const data = {
        name: document.getElementById("product-name").value,
        category_id: document.getElementById("product-category").value,
        price_twd: document.getElementById("product-price").value,
        cost_cny: document.getElementById("product-cost").value,
        description: document.getElementById("product-description").value,
        images: images,
      };

      try {
        if (id) {
          await api.updateProduct(id, data);
        } else {
          await api.createProduct(data);
        }
        alert("儲存成功");
        document.getElementById("product-modal").style.display = "none";
        loadProducts();
      } catch (err) {
        alert(err.message);
      }
    });
}

async function openProductModal(id) {
  // 1. 填充分類下拉
  const select = document.getElementById("product-category");
  select.innerHTML = '<option value="">請選擇分類</option>';
  if (allCategories.length === 0) allCategories = await api.getCategories();
  allCategories.forEach((c) => {
    select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  // 2. 重置表單
  document.getElementById("product-form").reset();
  document.getElementById("product-images-container").innerHTML =
    '<input type="text" class="product-img-input" placeholder="主圖 URL" required>';
  document.getElementById("product-id").value = "";
  document.getElementById("product-modal-title").textContent = "新增商品";

  // 3. 如果是編輯模式，回填資料
  if (id) {
    const products = await api.getProducts(); // 簡單起見重新抓一次，或是從 DOM 緩存
    const p = products.find((x) => x.id == id);
    if (p) {
      document.getElementById("product-modal-title").textContent = "編輯商品";
      document.getElementById("product-id").value = p.id;
      document.getElementById("product-name").value = p.name;
      document.getElementById("product-category").value = p.category_id || "";
      document.getElementById("product-price").value = p.price_twd;
      document.getElementById("product-cost").value = p.cost_cny;
      document.getElementById("product-description").value =
        p.description || "";

      // 回填圖片
      const container = document.getElementById("product-images-container");
      container.innerHTML = "";
      if (p.images && p.images.length > 0) {
        p.images.forEach((img) => {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "product-img-input mt-5";
          input.value = img;
          container.appendChild(input);
        });
      } else {
        container.innerHTML =
          '<input type="text" class="product-img-input" placeholder="主圖 URL" required>';
      }
    }
  }

  document.getElementById("product-modal").style.display = "block";
}

async function archiveProduct(id) {
  if (confirm("確定要封存此商品嗎？前台將不再顯示。")) {
    try {
      await api.archiveProduct(id);
      loadProducts();
    } catch (e) {
      alert(e.message);
    }
  }
}

// ==========================================
// 5. 分類管理 (Categories)
// ==========================================
async function loadCategories() {
  const tbody = document.getElementById("categories-tbody");
  tbody.innerHTML =
    '<tr><td colspan="4" class="text-center">載入中...</td></tr>';
  try {
    allCategories = await api.getCategories(); // 更新緩存
    tbody.innerHTML = "";
    if (allCategories.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center">無分類</td></tr>';
      return;
    }
    allCategories.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${c.id}</td>
                <td>${c.name}</td>
                <td>${c.description || "-"}</td>
                <td>
                     <button class="btn btn-small btn-primary btn-edit-cat" data-id="${
                       c.id
                     }"><i class="fas fa-edit"></i></button>
                     <button class="btn btn-small btn-danger btn-del-cat" data-id="${
                       c.id
                     }"><i class="fas fa-trash"></i></button>
                </td>
            `;
      tbody.appendChild(tr);
    });

    // 綁定按鈕
    document
      .querySelectorAll(".btn-edit-cat")
      .forEach((btn) =>
        btn.addEventListener("click", () => openCategoryModal(btn.dataset.id))
      );
    document
      .querySelectorAll(".btn-del-cat")
      .forEach((btn) =>
        btn.addEventListener("click", () => deleteCategory(btn.dataset.id))
      );
  } catch (e) {
    console.error(e);
  }
}

function setupCategoryEvents() {
  document
    .getElementById("btn-add-category")
    .addEventListener("click", () => openCategoryModal(null));
  document
    .getElementById("category-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("category-id").value;
      const data = {
        name: document.getElementById("category-name").value,
        description: document.getElementById("category-description").value,
      };
      try {
        if (id) await api.updateCategory(id, data);
        else await api.createCategory(data);
        document.getElementById("category-modal").style.display = "none";
        loadCategories();
      } catch (err) {
        alert(err.message);
      }
    });
}

function openCategoryModal(id) {
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value = "";
  if (id) {
    const c = allCategories.find((x) => x.id == id);
    if (c) {
      document.getElementById("category-id").value = c.id;
      document.getElementById("category-name").value = c.name;
      document.getElementById("category-description").value = c.description;
    }
  }
  document.getElementById("category-modal").style.display = "block";
}

async function deleteCategory(id) {
  if (confirm("確定刪除？若分類下有商品將無法刪除。")) {
    try {
      await api.deleteCategory(id);
      loadCategories();
    } catch (e) {
      alert(e.message);
    }
  }
}

// ==========================================
// 6. 倉庫與其他 (Warehouses / Users / Settings)
// ==========================================
// 倉庫相關 (簡化版，與上述邏輯類似)
async function loadWarehouses() {
  try {
    const warehouses = await api.getWarehouses();
    allWarehouses.clear();
    warehouses.forEach((w) => allWarehouses.set(w.id, w));

    const tbody = document.getElementById("warehouses-tbody");
    if (!tbody) return; // 可能在非 Admin 檢視
    tbody.innerHTML = "";
    warehouses.forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${w.id}</td>
                <td>${w.name}</td>
                <td>${w.receiver}<br>${w.phone}</td>
                <td><small>${w.address}</small></td>
                <td>${
                  w.is_active
                    ? '<span class="badge badge-success">啟用</span>'
                    : '<span class="badge badge-secondary">停用</span>'
                }</td>
                <td><button class="btn btn-small btn-primary btn-edit-wh" data-id="${
                  w.id
                }"><i class="fas fa-edit"></i></button></td>
            `;
      tbody.appendChild(tr);
    });
    document
      .querySelectorAll(".btn-edit-wh")
      .forEach((btn) =>
        btn.addEventListener("click", () => openWarehouseModal(btn.dataset.id))
      );
  } catch (e) {
    console.error(e);
  }
}

function setupWarehouseEvents() {
  const btn = document.getElementById("btn-add-warehouse");
  if (btn) btn.addEventListener("click", () => openWarehouseModal(null));

  const form = document.getElementById("warehouse-form");
  if (form)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("warehouse-id").value;
      const data = {
        name: document.getElementById("warehouse-name").value,
        receiver: document.getElementById("warehouse-receiver").value,
        phone: document.getElementById("warehouse-phone").value,
        address: document.getElementById("warehouse-address").value,
        is_active:
          document.getElementById("warehouse-is-active").value === "true",
      };
      try {
        if (id) await api.updateWarehouse(id, data);
        else await api.createWarehouse(data);
        document.getElementById("warehouse-modal").style.display = "none";
        loadWarehouses();
      } catch (err) {
        alert(err.message);
      }
    });
}

function openWarehouseModal(id) {
  document.getElementById("warehouse-form").reset();
  document.getElementById("warehouse-id").value = "";
  if (id) {
    const w = allWarehouses.get(parseInt(id));
    if (w) {
      document.getElementById("warehouse-id").value = w.id;
      document.getElementById("warehouse-name").value = w.name;
      document.getElementById("warehouse-receiver").value = w.receiver;
      document.getElementById("warehouse-phone").value = w.phone;
      document.getElementById("warehouse-address").value = w.address;
      document.getElementById("warehouse-is-active").value = w.is_active;
    }
  }
  document.getElementById("warehouse-modal").style.display = "block";
}

// 用戶與設定 (簡化)
async function loadUsers() {
  if (getUser().role !== "admin") return;
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = "<tr><td>載入中...</td></tr>";
  try {
    const users = await api.getUsers();
    availableOperators = users.filter(
      (u) => u.role === "operator" && u.status === "active"
    );
    tbody.innerHTML = "";
    users.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${
                  u.status === "active"
                    ? '<span class="badge badge-success">正常</span>'
                    : '<span class="badge badge-danger">停權</span>'
                }</td>
                <td>
                    ${
                      u.id !== getUser().id
                        ? `
                    <button class="btn btn-small ${
                      u.status === "active" ? "btn-danger" : "btn-success"
                    } btn-toggle-user" data-id="${u.id}" data-status="${
                            u.status
                          }">
                        ${u.status === "active" ? "停權" : "啟用"}
                    </button>`
                        : '<span class="text-muted">自己</span>'
                    }
                </td>
            `;
      tbody.appendChild(tr);
    });
    document.querySelectorAll(".btn-toggle-user").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const newStatus =
          btn.dataset.status === "active" ? "inactive" : "active";
        if (confirm(`確定要變更狀態為 ${newStatus} 嗎?`)) {
          await api.updateUserStatus(btn.dataset.id, newStatus);
          loadUsers();
        }
      })
    );
  } catch (e) {
    console.error(e);
  }
}

function setupUserEvents() {
  const btn = document.getElementById("btn-add-user");
  if (btn)
    btn.addEventListener(
      "click",
      () => (document.getElementById("user-modal").style.display = "block")
    );

  const form = document.getElementById("create-user-form");
  if (form)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api.createUser({
          username: document.getElementById("user-username").value,
          password: document.getElementById("user-password").value,
          role: document.getElementById("user-role").value,
        });
        alert("建立成功");
        document.getElementById("user-modal").style.display = "none";
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
}

async function loadSettings() {
  try {
    const settings = await api.getSettings();
    document.getElementById("exchange-rate-input").value =
      settings.exchange_rate || 4.5;
    document.getElementById("service-fee-input").value =
      settings.service_fee || 0;
    document.getElementById("bank-name-input").value = settings.bank_name || "";
    document.getElementById("bank-account-input").value =
      settings.bank_account || "";
    document.getElementById("bank-account-name-input").value =
      settings.bank_account_name || "";
  } catch (e) {
    console.error(e);
  }
}

function setupSettingsEvents() {
  const btn = document.getElementById("save-settings-btn");
  if (btn)
    btn.addEventListener("click", async () => {
      try {
        await api.updateSettings({
          exchange_rate: document.getElementById("exchange-rate-input").value,
          service_fee: document.getElementById("service-fee-input").value,
          bank_name: document.getElementById("bank-name-input").value,
          bank_account: document.getElementById("bank-account-input").value,
          bank_account_name: document.getElementById("bank-account-name-input")
            .value,
        });
        alert("設定已儲存");
      } catch (e) {
        alert(e.message);
      }
    });
}

// Modal 通用關閉
function setupModalClosers() {
  document.querySelectorAll(".close-modal").forEach((span) => {
    span.addEventListener("click", () => {
      document
        .querySelectorAll(".modal")
        .forEach((m) => (m.style.display = "none"));
    });
  });
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none";
    }
  });
}
