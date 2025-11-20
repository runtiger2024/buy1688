// frontend/admin/js/admin.js
import { checkAuth, getUser, logout, copyToClipboard } from "./utils.js";
import { api } from "./api.js";

// --- 1. 常數與全域變數 ---
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

let availableOperators = [];
let allWarehouses = new Map();
let allCategories = [];
let allOrders = [];
let allUsers = [];
let allCustomers = [];
let currentOrder = null; // 當前 Modal 編輯的訂單

let currentStatusFilter = "";
let currentPaymentStatusFilter = "";
let currentSearchTerm = "";
let currentHasVoucherFilter = false;
let userSearchTerm = "";
let customerSearchTerm = "";

// --- 2. 暴露給全局的工具函式 (供 HTML onclick 使用) ---

// 複製集運倉資訊
window.copyShippingInfo = (paopaoId, warehouseId) => {
  const warehouse = allWarehouses.get(parseInt(warehouseId, 10));
  if (!warehouse) {
    alert("錯誤: 找不到集運倉資料");
    return;
  }
  const receiver = warehouse.receiver.replace(
    /[\(（]會員編號[\)）]/g,
    paopaoId
  );
  const address = warehouse.address.replace(/[\(（]會員編號[\)）]/g, paopaoId);

  const text = `收件人: ${receiver}\n電話: ${warehouse.phone}\n地址: ${address}`;
  copyToClipboard(text, "✅ 寄送資訊已複製！");
};

// 複製訂單摘要
window.copyOrderSummary = () => {
  if (!currentOrder) return;

  const warehouse = allWarehouses.get(currentOrder.warehouse_id);
  const warehouseName = warehouse ? warehouse.name : "未指定";

  let itemsText = currentOrder.items
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.snapshot_name} ${
          item.item_spec ? `(${item.item_spec})` : ""
        } (x${item.quantity})`
    )
    .join("\n");

  const text = `
【訂單確認】 #${currentOrder.id}
會員: ${currentOrder.paopao_id}
狀態: ${ORDER_STATUS_MAP[currentOrder.status]}
----------------
${itemsText}
----------------
總金額: TWD ${currentOrder.total_amount_twd.toLocaleString()}
集運倉: ${warehouseName}
`.trim();

  copyToClipboard(text, "📋 訂單摘要已複製！");
};

// 標記訂單為已付款 (原地更新，不關閉視窗)
window.markOrderPaid = async function (id) {
  if (!confirm("確定標記為已付款？系統將發信通知客戶。")) return;
  try {
    await api.updateOrder(id, { payment_status: "PAID" });
    // 不跳 alert，直接刷新體驗更好
    await loadOrders(); // 重新拉取資料
    openOrderModal(id); // 重新渲染 Modal 內容
    loadStats(); // 更新背景統計
  } catch (e) {
    alert(e.message);
  }
};

// 篩選待核銷憑證 (從儀表板跳轉)
window.filterPendingVouchers = function () {
  // 切換 UI 到訂單頁
  document
    .querySelectorAll(".sidebar-nav .nav-link")
    .forEach((l) => l.classList.remove("active"));
  document
    .querySelectorAll(".dashboard-section")
    .forEach((s) => s.classList.remove("active"));

  const orderLink = document.querySelector(
    '.nav-link[data-target="orders-section"]'
  );
  if (orderLink) orderLink.classList.add("active");
  document.getElementById("orders-section").classList.add("active");

  // 設定篩選條件
  currentHasVoucherFilter = true;
  document.getElementById("order-status-filter").value = "";
  document.getElementById("order-payment-status-filter").value = "UNPAID";
  loadOrders();
};

// --- 3. 初始化 ---
document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) return;

  setupNavigation();

  const user = getUser();
  if (user) {
    document.getElementById("user-info").innerHTML = `
        <i class="fas fa-user-circle"></i> ${user.username} <br>
        <small>${user.role === "admin" ? "管理員" : "操作員"}</small>
    `;

    if (user.role !== "admin") {
      document
        .querySelectorAll('[data-role="admin"]')
        .forEach((el) => (el.style.display = "none"));
    }
  }

  document.getElementById("logout-button").addEventListener("click", logout);

  // 預載資料
  await Promise.all([loadSettings(), loadWarehouses(), loadUsers()]);

  loadStats();

  // 綁定事件
  setupDashboardEvents();
  setupOrderEvents();
  setupProductEvents();
  setupCategoryEvents();
  setupWarehouseEvents();
  setupUserEvents();
  setupCustomerEvents();
  setupSettingsEvents();
  setupModalClosers();
});

// --- 4. 導航邏輯 ---
function setupNavigation() {
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const sections = document.querySelectorAll(".dashboard-section");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      links.forEach((l) => l.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      link.classList.add("active");
      const targetId = link.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add("active");

      if (targetId === "orders-section") {
        currentHasVoucherFilter = false;
        loadOrders();
      }
      if (targetId === "products-section") loadProducts();
      if (targetId === "categories-section") loadCategories();
      if (targetId === "warehouses-section") loadWarehouses();
      if (targetId === "users-section") loadUsers();
      if (targetId === "customers-section") loadCustomers();
      if (targetId === "stats-section") loadStats();
    });
  });
}

// --- 5. 儀表板 (Stats) ---
async function loadStats() {
  const container = document.getElementById("stats-cards-container");
  const refreshBtn = document.getElementById("refresh-stats");

  try {
    refreshBtn.innerHTML = '<i class="fas fa-spin fa-spinner"></i>';
    const stats = await api.getStats();

    const rateInput = document.getElementById("exchange-rate-input");
    const exchangeRate = parseFloat(rateInput.value) || 4.5;
    const totalCostTWD = stats.totalCostCNY * exchangeRate;
    const totalProfitTWD = stats.totalRevenueTWD - totalCostTWD;

    container.innerHTML = `
            <div class="stat-card danger" style="cursor: pointer;" onclick="filterPendingVouchers()">
                <h4>🔔 待核銷憑證</h4>
                <div class="value">${stats.pendingVoucherCount || 0}</div>
            </div>
            <div class="stat-card success">
                <h4>總營收 (TWD)</h4>
                <div class="value">NT$ ${stats.totalRevenueTWD.toLocaleString()}</div>
            </div>
            <div class="stat-card ${
              totalProfitTWD >= 0 ? "success" : "danger"
            }">
                <h4>預估利潤 (TWD)</h4>
                <div class="value">NT$ ${totalProfitTWD.toLocaleString()}</div>
            </div>
            <div class="stat-card info">
                <h4>總成本 (CNY)</h4>
                <div class="value">¥ ${stats.totalCostCNY.toLocaleString()}</div>
            </div>
            <div class="stat-card warning">
                <h4>待處理訂單</h4>
                <div class="value">${stats.statusCounts.Pending || 0}</div>
            </div>
            <div class="stat-card danger">
                <h4>總待付款</h4>
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

// --- 6. 訂單管理 (Orders) ---
async function loadOrders() {
  const tbody = document.getElementById("orders-tbody");
  if (tbody.innerHTML.trim() === "") {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center">載入中...</td></tr>';
  }

  try {
    const params = {};
    if (currentStatusFilter) params.status = currentStatusFilter;
    if (currentPaymentStatusFilter)
      params.paymentStatus = currentPaymentStatusFilter;
    if (currentSearchTerm) params.search = currentSearchTerm;
    if (currentHasVoucherFilter) params.hasVoucher = "true";

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
    const costCny = Number(order.total_cost_cny);
    const profitTwd = order.total_amount_twd - costCny * exchangeRate;
    const profitClass = profitTwd >= 0 ? "text-success" : "text-danger";

    let statusBadge = "badge-secondary";
    if (order.status === "Pending") statusBadge = "badge-warning";
    if (order.status === "Processing" || order.status === "Shipped_Internal")
      statusBadge = "badge-info";
    if (order.status === "Completed" || order.status === "Warehouse_Received")
      statusBadge = "badge-success";
    if (order.status === "Cancelled") statusBadge = "badge-danger";

    let paymentBadge =
      order.payment_status === "PAID" ? "badge-success" : "badge-danger";

    let voucherAlert = "";
    if (order.payment_status === "UNPAID" && order.payment_voucher_url) {
      voucherAlert = `<span class="badge badge-warning" style="margin-left:5px; background-color:#ffc107; color:#000;"><i class="fas fa-bell"></i></span>`;
    }

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
            <td>
                <span class="badge ${paymentBadge}">${
      PAYMENT_STATUS_MAP[order.payment_status]
    }</span>
                ${voucherAlert}
            </td>
            <td>
                <button class="btn btn-small btn-primary btn-view-order" data-id="${
                  order.id
                }">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".btn-view-order").forEach((btn) => {
    btn.addEventListener("click", () => openOrderModal(btn.dataset.id));
  });
}

function setupOrderEvents() {
  document.getElementById("order-search-btn").addEventListener("click", () => {
    currentSearchTerm = document
      .getElementById("order-search-input")
      .value.trim();
    currentHasVoucherFilter = false;
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
    currentHasVoucherFilter = false;
    loadOrders();
  });

  document
    .getElementById("btn-save-order")
    .addEventListener("click", saveOrderChanges);
}

function openOrderModal(orderId) {
  const order = allOrders.find((o) => o.id == orderId);
  if (!order) return;
  currentOrder = order;

  const modal = document.getElementById("order-modal");
  const content = document.getElementById("order-modal-content");

  const userRole = getUser().role;
  const warehouse = allWarehouses.get(order.warehouse_id);
  const warehouseName = warehouse ? warehouse.name : "未知倉庫";

  const operatorOptions = availableOperators
    .map(
      (op) =>
        `<option value="${op.id}" ${
          order.operator_id === op.id ? "selected" : ""
        }>${op.username}</option>`
    )
    .join("");

  let voucherHtml = '<span class="text-muted">尚未上傳</span>';
  if (order.payment_voucher_url) {
    if (order.payment_voucher_url.startsWith("data:image")) {
      voucherHtml = `<img src="${order.payment_voucher_url}" class="img-thumb" style="width:150px; height:auto;" onclick="window.open().document.write('<img src=\\'${order.payment_voucher_url}\\' style=\\'width:100%\\'>')"> <br><small>(點擊放大)</small>`;
    } else {
      voucherHtml = `<a href="${order.payment_voucher_url}" target="_blank">查看連結</a>`;
    }
  }

  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
            <td>
                ${item.snapshot_name || item.product?.name || "商品"} 
                <br> 
                <small class="text-muted">${item.item_spec || "無規格"}</small>
            </td>
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
                <p>
                    <strong>訂單編號:</strong> #${order.id}
                    <button class="btn btn-small btn-light" onclick="copyOrderSummary()" style="margin-left:10px;">📋 複製摘要</button>
                </p>
                <p><strong>會員:</strong> ${order.paopao_id}</p>
                <p><strong>Email:</strong> ${order.customer_email || "-"}</p>
                <p><strong>集運倉:</strong> ${warehouseName} 
                   ${
                     order.warehouse_id
                       ? `<button class="btn btn-small btn-light" onclick="copyShippingInfo('${order.paopao_id}', ${order.warehouse_id})">複製地址</button>`
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
                <label>大陸物流單號</label>
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
            <label style="color: #d35400;">🔔 付款憑證區</label>
            <div>${voucherHtml}</div>
        </div>

        <h4 class="mt-5">商品清單</h4>
        <table class="data-table" style="font-size: 0.85rem;">
            <thead>
                <tr><th>商品/規格</th><th>連結</th><th>成本(CNY)</th><th>數量</th></tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>
    `;

  modal.style.display = "block";
}

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

    // 原地更新
    await loadOrders();
    openOrderModal(currentOrder.id);
    loadStats();
  } catch (e) {
    alert("更新失敗: " + e.message);
  }
}

// --- 7. 商品管理 (Products) - 包含規格 ---
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
    const imgUrl =
      p.images && p.images.length > 0
        ? p.images[0]
        : "https://via.placeholder.com/50?text=No+Img";
    const categoryName = p.category ? p.category.name : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${p.id}</td>
            <td><img src="${imgUrl}" class="img-thumb" onclick="window.open('${imgUrl}')"></td>
            <td>${p.name}</td>
            <td>${categoryName}</td>
            <td>${p.price_twd}</td>
            <td>${p.cost_cny}</td>
            <td>
                <button class="btn btn-small btn-primary btn-edit-product" data-id="${p.id}"><i class="fas fa-edit"></i> 編輯</button>
                <button class="btn btn-small btn-danger btn-delete-product" data-id="${p.id}"><i class="fas fa-trash"></i> 封存</button>
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
      const images = Array.from(document.querySelectorAll(".product-img-input"))
        .map((i) => i.value.trim())
        .filter((v) => v);

      // [規格處理] 將逗號分隔字串轉為陣列
      const specsStr = document.getElementById("product-specs").value;
      const specs = specsStr
        ? specsStr
            .split(/,|，/)
            .map((s) => s.trim())
            .filter((s) => s)
        : [];

      const data = {
        name: document.getElementById("product-name").value,
        category_id: document.getElementById("product-category").value,
        price_twd: document.getElementById("product-price").value,
        cost_cny: document.getElementById("product-cost").value,
        description: document.getElementById("product-description").value,
        images: images,
        specs: specs, // 傳送規格
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
  const select = document.getElementById("product-category");
  select.innerHTML = '<option value="">請選擇分類</option>';
  if (allCategories.length === 0) allCategories = await api.getCategories();
  allCategories.forEach((c) => {
    select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  document.getElementById("product-form").reset();
  document.getElementById("product-images-container").innerHTML =
    '<input type="text" class="product-img-input" placeholder="主圖 URL" required>';
  document.getElementById("product-id").value = "";
  document.getElementById("product-specs").value = "";
  document.getElementById("product-modal-title").textContent = "新增商品";

  if (id) {
    const products = await api.getProducts();
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

      // [規格回填] 陣列轉字串
      document.getElementById("product-specs").value = p.specs
        ? p.specs.join(", ")
        : "";

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

// --- 8. 分類管理 (Categories) ---
async function loadCategories() {
  const tbody = document.getElementById("categories-tbody");
  tbody.innerHTML =
    '<tr><td colspan="4" class="text-center">載入中...</td></tr>';
  try {
    allCategories = await api.getCategories();
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
  if (confirm("確定刪除？")) {
    try {
      await api.deleteCategory(id);
      loadCategories();
    } catch (e) {
      alert(e.message);
    }
  }
}

// --- 9. 倉庫管理 (Warehouses) ---
async function loadWarehouses() {
  try {
    const warehouses = await api.getWarehouses();
    allWarehouses.clear();
    warehouses.forEach((w) => allWarehouses.set(w.id, w));

    const tbody = document.getElementById("warehouses-tbody");
    if (!tbody) return;
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

// --- 10. 人員管理 (Users) ---
async function loadUsers() {
  if (getUser().role !== "admin") return;
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = "<tr><td>載入中...</td></tr>";
  try {
    const users = await api.getUsers();
    allUsers = users;
    renderUsersTable(allUsers);
    availableOperators = users.filter(
      (u) => u.role === "operator" && u.status === "active"
    );
  } catch (e) {
    console.error(e);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-tbody");

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">找不到符合條件的用戶</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach((u) => {
    const tr = document.createElement("tr");
    const isSelf = getUser().id === u.id;
    const isUserActive = u.status === "active";

    // [新增] 通知圖示
    const notifyIcon = u.receive_notifications
      ? '<i class="fas fa-bell text-success" title="接收通知"></i>'
      : '<i class="fas fa-bell-slash text-muted" title="不接收"></i>';

    const roleCellContent = isSelf
      ? u.role === "admin"
        ? "管理員 (自己)"
        : "操作員 (自己)"
      : `<select class="user-role-select" data-id="${u.id}">
            <option value="operator" ${
              u.role === "operator" ? "selected" : ""
            }>操作員</option>
            <option value="admin" ${
              u.role === "admin" ? "selected" : ""
            }>管理員</option>
         </select>`;

    tr.innerHTML = `
            <td>${u.id}</td>
            <td>
                ${u.username} <br>
                <small class="text-muted">${u.email || "無 Email"}</small>
            </td>
            <td>${roleCellContent}</td>
            <td class="text-center">${notifyIcon}</td>
            <td><span class="${
              isUserActive ? "status-active" : "status-inactive"
            }">${isUserActive ? "啟用中" : "已停權"}</span></td>
            <td>
                ${
                  !isSelf
                    ? `
                    <button class="btn btn-small btn-primary btn-edit-user" data-id="${
                      u.id
                    }">
                        <i class="fas fa-edit"></i> 編輯
                    </button>
                    <button class="btn btn-small ${
                      u.status === "active" ? "btn-danger" : "btn-success"
                    } btn-toggle-user" data-id="${u.id}" data-status="${
                        u.status
                      }">
                        ${u.status === "active" ? "停權" : "啟用"}
                    </button>`
                    : `<button class="btn btn-small btn-primary btn-edit-user" data-id="${u.id}"><i class="fas fa-edit"></i> 設定</button>`
                }
            </td>
        `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".btn-toggle-user").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const newStatus = btn.dataset.status === "active" ? "inactive" : "active";
      if (confirm(`確定要變更狀態為 ${newStatus} 嗎?`)) {
        await api.updateUserStatus(btn.dataset.id, newStatus);
        loadUsers();
      }
    })
  );

  document
    .querySelectorAll(".btn-edit-user")
    .forEach((btn) =>
      btn.addEventListener("click", () => openUserModal(btn.dataset.id))
    );
}

function setupUserEvents() {
  const btn = document.getElementById("btn-add-user");
  if (btn) btn.addEventListener("click", () => openUserModal(null));

  const searchInput = document.getElementById("user-search-input");
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      userSearchTerm = e.target.value.trim();
      renderUsersTable(allUsers);
    });
  }

  const form = document.getElementById("create-user-form");
  if (form)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("user-id").value;
      const username = document.getElementById("user-username").value;
      const password = document.getElementById("user-password").value;
      const role = document.getElementById("user-role").value;

      // [新增] 獲取新欄位
      const email = document.getElementById("user-email").value;
      const receiveNotifications =
        document.getElementById("user-notify").checked;

      try {
        if (id) {
          // 編輯模式
          // 1. 更新 Email 和 通知設定
          await api.updateUserInfo(id, {
            email,
            receive_notifications: receiveNotifications,
          });

          const originalUser = allUsers.find((u) => u.id == id);
          if (getUser().id !== parseInt(id) && originalUser.role !== role) {
            await api.updateUserRole(id, role);
          }
          if (password) {
            await api.updateUserPassword(id, password);
          }
          alert("用戶資料已更新");
        } else {
          // 新增模式
          if (!password) {
            alert("建立用戶需填寫密碼");
            return;
          }
          await api.createUser({
            username,
            password,
            role,
            email,
            receive_notifications: receiveNotifications,
          });
          alert("用戶建立成功");
        }

        document.getElementById("user-modal").style.display = "none";
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
}

function openUserModal(id) {
  const form = document.getElementById("create-user-form");
  form.reset();
  document.getElementById("user-id").value = "";
  const title = document.getElementById("user-modal-title");
  const passHint = document.getElementById("user-password-hint");
  const usernameInput = document.getElementById("user-username");

  // [新增] 清空新欄位
  document.getElementById("user-email").value = "";
  document.getElementById("user-notify").checked = false;

  if (id) {
    const user = allUsers.find((u) => u.id == id);
    if (!user) return;

    title.textContent = "編輯用戶";
    document.getElementById("user-id").value = user.id;
    usernameInput.value = user.username;
    usernameInput.disabled = true;
    document.getElementById("user-role").value = user.role;

    // [新增] 回填新欄位
    document.getElementById("user-email").value = user.email || "";
    document.getElementById("user-notify").checked = user.receive_notifications;

    document.getElementById("user-password").required = false;
    document.getElementById("user-password").placeholder = "若不修改請留空";
    passHint.textContent = "輸入新密碼以重置，否則請留空";
  } else {
    title.textContent = "建立新用戶";
    usernameInput.disabled = false;
    document.getElementById("user-password").required = true;
    document.getElementById("user-password").placeholder = "請輸入密碼";
    passHint.textContent = "";
  }

  document.getElementById("user-modal").style.display = "block";
}

// --- 11. 會員管理 (Customers) ---
async function loadCustomers() {
  const tbody = document.getElementById("customers-tbody");
  tbody.innerHTML =
    "<tr><td colspan='6' class='text-center'>載入中...</td></tr>";
  try {
    const customers = await api.getCustomers();
    allCustomers = customers;
    renderCustomersTable(allCustomers);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan='6' class='text-center text-danger'>${e.message}</td></tr>`;
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById("customers-tbody");
  const filtered = customers.filter(
    (c) =>
      c.paopao_id.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearchTerm))
  );

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">找不到符合條件的會員</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach((c) => {
    // [新增] 判斷 VIP 樣式
    const vipBadge = c.is_vip
      ? '<span class="badge" style="background:gold; color:#333; margin-top: 4px; display: inline-block;">👑 VIP</span>'
      : '<span class="badge badge-secondary" style="margin-top: 4px; display: inline-block;">一般</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${c.id}</td>
            <td>${c.paopao_id} <br> ${vipBadge}</td>
            <td>${c.email}</td>
            <td>${c.phone || "-"}</td>
            <td>${new Date(c.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-small btn-primary btn-edit-customer" data-id="${
                  c.id
                }"><i class="fas fa-edit"></i> 編輯</button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  document
    .querySelectorAll(".btn-edit-customer")
    .forEach((btn) =>
      btn.addEventListener("click", () => openCustomerModal(btn.dataset.id))
    );
}

function setupCustomerEvents() {
  const searchInput = document.getElementById("customer-search-input");
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      customerSearchTerm = e.target.value.trim();
      renderCustomersTable(allCustomers);
    });
  }

  const form = document.getElementById("customer-form");
  if (form)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("customer-id").value;
      const email = document.getElementById("customer-email").value;
      const phone = document.getElementById("customer-phone").value;
      const password = document.getElementById("customer-password").value;

      // [新增] 獲取 VIP 狀態
      const isVipStr = document.getElementById("customer-is-vip").value;
      const is_vip = isVipStr === "true";

      try {
        // [修改] 傳送 is_vip
        await api.updateCustomer(id, { email, phone, is_vip });

        if (password) {
          await api.updateCustomerPassword(id, password);
        }
        alert("會員資料已更新");
        document.getElementById("customer-modal").style.display = "none";
        loadCustomers();
      } catch (err) {
        alert(err.message);
      }
    });
}

function openCustomerModal(id) {
  const customer = allCustomers.find((c) => c.id == id);
  if (!customer) return;

  document.getElementById("customer-form").reset();
  document.getElementById("customer-id").value = customer.id;
  document.getElementById("customer-paopao-id").value = customer.paopao_id;
  document.getElementById("customer-email").value = customer.email;
  document.getElementById("customer-phone").value = customer.phone || "";

  // [新增] 回填 VIP 選單
  const vipSelect = document.getElementById("customer-is-vip");
  if (vipSelect) {
    vipSelect.value = customer.is_vip ? "true" : "false";
  }

  document.getElementById("customer-password").value = "";

  document.getElementById("customer-modal").style.display = "block";
}

// --- 12. 系統設置 ---
async function loadSettings() {
  try {
    const settings = await api.getSettings();
    // 基礎設定
    document.getElementById("exchange-rate-input").value =
      settings.exchange_rate || 4.5;
    document.getElementById("service-fee-input").value =
      settings.service_fee || 0;
    document.getElementById("bank-name-input").value = settings.bank_name || "";
    document.getElementById("bank-account-input").value =
      settings.bank_account || "";
    document.getElementById("bank-account-name-input").value =
      settings.bank_account_name || "";

    // 新設定欄位回填
    document.getElementById("email-api-key-input").value =
      settings.email_api_key || "";
    document.getElementById("email-from-input").value =
      settings.email_from_email || "";
    document.getElementById("invoice-merchant-id-input").value =
      settings.invoice_merchant_id || "";
    document.getElementById("invoice-api-key-input").value =
      settings.invoice_api_key || "";
    document.getElementById("payment-merchant-id-input").value =
      settings.payment_merchant_id || "";
    document.getElementById("payment-api-key-input").value =
      settings.payment_api_key || "";
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
          email_api_key: document.getElementById("email-api-key-input").value,
          email_from_email: document.getElementById("email-from-input").value,
          invoice_merchant_id: document.getElementById(
            "invoice-merchant-id-input"
          ).value,
          invoice_api_key: document.getElementById("invoice-api-key-input")
            .value,
          payment_merchant_id: document.getElementById(
            "payment-merchant-id-input"
          ).value,
          payment_api_key: document.getElementById("payment-api-key-input")
            .value,
        });
        alert("設定已儲存");
      } catch (e) {
        alert(e.message);
      }
    });
}

// --- Modal 通用關閉 ---
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
