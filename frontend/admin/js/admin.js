// frontend/admin/js/admin.js
import { checkAuth, getUser, logout, copyToClipboard } from "./utils.js";
import { api } from "./api.js";
// 雖然引入了 constants，但為了強制顯示中文，我們將在下方定義本地對照表覆蓋
import {
  renderOrders,
  renderProducts,
  renderUsers,
  renderWarehouses,
  renderCategories,
  renderCustomers,
} from "./render.js";

// --- 1. 全域變數與中文對照表 ---
let availableOperators = [];
let allWarehouses = new Map();
let allCategories = [];
let allOrders = [];
let allUsers = [];
let allCustomers = [];
let currentOrder = null;

let currentStatusFilter = "";
let currentPaymentStatusFilter = "";
let currentSearchTerm = "";
let currentHasVoucherFilter = false;
let userSearchTerm = "";
let customerSearchTerm = "";

// [關鍵修改] 強制定義本地中文對照表，確保顯示中文
const LOCAL_ORDER_STATUS_MAP = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨 (往集運倉)",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

const LOCAL_PAYMENT_STATUS_MAP = {
  UNPAID: "待付款",
  PAID: "已付款",
  PENDING_REVIEW: "審核中", // 確保這個狀態有中文
};

// --- 2. 暴露給全局的工具函式 (供 HTML onclick 使用) ---

// [新增] 模擬客戶登入 (By DB ID)
window.impersonateUser = async function (customerId) {
  try {
    const data = await api.impersonateCustomer(customerId);
    localStorage.setItem("customerToken", data.token);
    localStorage.setItem("customerUser", JSON.stringify(data.customer));
    // 開啟前台首頁 (假設相對路徑)
    window.open("../../html/index.html", "_blank");
  } catch (e) {
    alert("模擬登入失敗: " + e.message);
  }
};

// [新增] 模擬客戶登入 (By Paopao ID - 供訂單頁面使用)
window.impersonateUserByPaopaoId = async function (paopaoId) {
  if (
    !confirm(
      `確定要登入會員 [${paopaoId}] 的前台帳號嗎？\n這將會開啟一個新的視窗。`
    )
  )
    return;
  try {
    const data = await api.impersonateCustomerByPaopaoId(paopaoId);
    localStorage.setItem("customerToken", data.token);
    localStorage.setItem("customerUser", JSON.stringify(data.customer));
    window.open("../../html/index.html", "_blank");
  } catch (e) {
    alert("模擬登入失敗: " + e.message);
  }
};

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
  const warehouseName = warehouse ? warehouse.name : "未指定/直寄";

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
狀態: ${LOCAL_ORDER_STATUS_MAP[currentOrder.status] || currentOrder.status}
----------------
${itemsText}
----------------
總金額: TWD ${currentOrder.total_amount_twd.toLocaleString()}
集運倉: ${warehouseName}
`.trim();

  copyToClipboard(text, "📋 訂單摘要已複製！");
};

// 標記訂單為已付款
window.markOrderPaid = async function (id) {
  if (!confirm("確定標記為已付款？系統將發信通知客戶。")) return;
  try {
    await api.updateOrder(id, { payment_status: "PAID" });
    loadOrders();
    if (currentOrder && currentOrder.id == id) {
      openOrderModal(id);
    }
    loadStats();
  } catch (e) {
    alert(e.message);
  }
};

// 代購訂單審核通過
window.approveOrder = async function (id) {
  if (!confirm("確定通過審核？系統將發送「付款通知信」給客戶。")) return;
  try {
    await api.updateOrder(id, { payment_status: "UNPAID" });
    alert("✅ 訂單已審核通過，等待客戶付款。");
    loadOrders();
    loadStats();
    if (currentOrder && currentOrder.id == id) {
      openOrderModal(id);
    }
  } catch (e) {
    alert(e.message);
  }
};

// 篩選待核銷憑證
window.filterPendingVouchers = function () {
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

  currentHasVoucherFilter = true;
  document.getElementById("order-status-filter").value = "";
  document.getElementById("order-payment-status-filter").value = "UNPAID";
  loadOrders();
};

// [新增] 動態新增商品列 (Modal 內)
window.addNewItemRow = function () {
  const tbody = document.getElementById("modal-items-tbody");
  const tr = document.createElement("tr");
  tr.className = "order-item-row";
  tr.innerHTML = `
        <td>
            <div style="display:flex; flex-direction:column; gap:5px;">
                <input type="text" class="item-name-input" placeholder="新商品名稱" style="width:100%; font-weight:bold;">
                <input type="text" class="item-spec-input" placeholder="規格" style="width:100%;">
                <textarea class="item-url-input" rows="2" placeholder="商品連結"></textarea>
                <input type="text" class="item-img-input" placeholder="圖片連結 (選填)" style="width:100%; font-size:0.8rem;">
                <input type="text" class="item-remark-input" placeholder="備註 (選填)" style="width:100%; font-size:0.8rem;">
            </div>
        </td>
        <td style="vertical-align:top;">
             <div style="display:flex; align-items:center;">
                <span style="margin-right:5px;">¥</span>
                <input type="number" class="item-cost-input" value="0" step="0.01" min="0" style="width:80px;">
            </div>
        </td>
        <td style="vertical-align:top;">
            <input type="number" class="item-qty-input" value="1" min="1" style="width:60px;">
        </td>
        <td style="vertical-align:top;">
            <button class="btn btn-small btn-danger" onclick="removeRow(this)">&times;</button>
        </td>
    `;
  tbody.appendChild(tr);
};

// [新增] 移除商品列
window.removeRow = function (btn) {
  if (confirm("確定移除此商品嗎？")) {
    btn.closest("tr").remove();
  }
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

    // 根據彈性權限隱藏 Admin Only 區塊 (如果不是 Admin)
    if (user.role !== "admin") {
      document.querySelectorAll('[data-role="admin"]').forEach((el) => {
        // 只有在沒有對應權限時才隱藏
        const target = el.dataset.target;
        if (target === "products-section" && !user.can_manage_products) {
          el.style.display = "none";
        } else if (target === "settings-section" && !user.can_manage_finance) {
          el.style.display = "none";
        } else if (
          [
            "customers-section",
            "categories-section",
            "warehouses-section",
            "users-section",
          ].includes(target)
        ) {
          el.style.display = "none"; // 這些區塊仍只對 Admin 開放
        }
      });
    }
  }

  document.getElementById("logout-button").addEventListener("click", logout);

  await Promise.all([loadSettings(), loadWarehouses(), loadUsers()]);
  loadStats();

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

      // 載入對應區塊的資料
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
    const exchangeRate = parseFloat(rateInput?.value) || 4.5;
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
  tbody.innerHTML =
    '<tr><td colspan="12" class="text-center">載入中...</td></tr>';

  try {
    const params = {};
    if (currentStatusFilter) params.status = currentStatusFilter;
    if (currentPaymentStatusFilter)
      params.paymentStatus = currentPaymentStatusFilter;
    if (currentSearchTerm) params.search = currentSearchTerm;
    if (currentHasVoucherFilter) params.hasVoucher = "true";

    allOrders = await api.getOrders(params);

    const rateInput = document.getElementById("exchange-rate-input");
    const exchangeRate = parseFloat(rateInput?.value) || 4.5;
    const userRole = getUser().role;

    // 使用 render.js 的函式渲染列表
    renderOrders(allOrders, tbody, availableOperators, exchangeRate, userRole);

    // 綁定「管理」按鈕事件 (對應 render.js 生成的按鈕)
    tbody.querySelectorAll(".btn-view-order").forEach((btn) => {
      btn.addEventListener("click", () => {
        openOrderModal(btn.dataset.id);
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger">${e.message}</td></tr>`;
  }
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

// [核心修改] 開啟訂單詳情 Modal (支援商品編輯 與 模擬登入)
async function openOrderModal(orderId) {
  const order = allOrders.find((o) => o.id == orderId);
  if (!order) return;
  currentOrder = order;

  const modal = document.getElementById("order-modal");
  const content = document.getElementById("order-modal-content");
  const userRole = getUser().role;
  const warehouse = allWarehouses.get(order.warehouse_id);
  const warehouseName = warehouse ? warehouse.name : "未指定";

  const operatorOptions = availableOperators
    .map(
      (op) =>
        `<option value="${op.id}" ${
          order.operator_id === op.id ? "selected" : ""
        }>${op.username}</option>`
    )
    .join("");

  // 付款憑證
  let voucherHtml = '<span class="text-muted">尚未上傳</span>';
  if (order.payment_voucher_url) {
    if (order.payment_voucher_url.startsWith("data:image")) {
      voucherHtml = `<img src="${order.payment_voucher_url}" class="img-thumb" style="width:150px; height:auto;" onclick="window.open().document.write('<img src=\\'${order.payment_voucher_url}\\' style=\\'width:100%\\'>')"> <br><small>(點擊放大)</small>`;
    } else {
      voucherHtml = `<a href="${order.payment_voucher_url}" target="_blank">查看連結</a>`;
    }
  }

  // 寄送資訊
  let shippingHtml = "";
  let trackingLabel = "大陸物流單號";
  if (order.recipient_address) {
    trackingLabel = "台灣物流單號";
    shippingHtml = `<div style="background:#fff3cd; padding:10px; border-radius:5px;">
            <strong>直寄資訊:</strong><br>
            ${order.recipient_name} / ${order.recipient_phone}<br>${order.recipient_address}
        </div>`;
  } else {
    shippingHtml = `<p><strong>集運倉:</strong> ${warehouseName} 
           ${
             order.warehouse_id
               ? `<button class="btn btn-small btn-light" onclick="copyShippingInfo('${order.paopao_id}', ${order.warehouse_id})">複製地址</button>`
               : ""
           }
        </p>`;
  }

  // [核心修改] 生成可編輯的商品列表
  const itemsHtml = order.items
    .map((item, index) => {
      return `
        <tr class="order-item-row" data-index="${index}">
            <td>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <input type="text" class="item-name-input" value="${
                      item.snapshot_name || ""
                    }" placeholder="商品名稱" style="width:100%; font-weight:bold;">
                    <input type="text" class="item-spec-input" value="${
                      item.item_spec || ""
                    }" placeholder="規格 (顏色/尺寸)" style="width:100%; color:#666;">
                    <textarea class="item-url-input" rows="2" placeholder="商品連結" style="font-size:0.8rem;">${
                      item.item_url || ""
                    }</textarea>
                    <input type="text" class="item-img-input" value="${
                      item.item_image_url || ""
                    }" placeholder="圖片連結" style="width:100%; font-size:0.8rem;">
                    <input type="text" class="item-remark-input" value="${
                      item.client_remarks || ""
                    }" placeholder="客戶備註" style="width:100%; font-size:0.8rem; color:#d63384;">
                    ${
                      item.item_image_url
                        ? `<a href="${item.item_image_url}" target="_blank" style="font-size:0.8rem; text-decoration:underline;">[查看原圖]</a>`
                        : ""
                    }
                </div>
            </td>
            <td style="vertical-align:top;">
                <div style="display:flex; align-items:center;">
                    <span style="margin-right:5px;">¥</span>
                    <input type="number" class="item-cost-input" value="${Number(
                      item.snapshot_cost_cny
                    )}" step="0.01" min="0" style="width:80px;">
                </div>
            </td>
            <td style="vertical-align:top;">
                <input type="number" class="item-qty-input" value="${
                  item.quantity
                }" min="1" style="width:60px;">
            </td>
            <td style="vertical-align:top; text-align:right;">
               <button class="btn btn-small btn-danger" onclick="removeRow(this)" style="margin-top:5px;">&times;</button>
            </td>
        </tr>
    `;
    })
    .join("");

  const addItemBtn = `<button type="button" class="btn btn-small btn-secondary" onclick="addNewItemRow()">+ 新增商品行</button>`;

  // [核心修改] 插入「模擬登入」按鈕到會員資訊旁
  content.innerHTML = `
        <div class="form-row-2">
            <div>
                <p>
                    <strong>訂單編號:</strong> #${order.id}
                    <button class="btn btn-small btn-light" onclick="copyOrderSummary()" style="margin-left:10px;">📋 複製摘要</button>
                </p>
                <p>
                    <strong>會員:</strong> ${order.paopao_id}
                    <button class="btn btn-small btn-warning" style="margin-left:5px; padding:2px 8px; font-size:0.7rem;" 
                            onclick="impersonateUserByPaopaoId('${
                              order.paopao_id
                            }')" 
                            title="登入此會員的前台">
                            <i class="fas fa-user-secret"></i> 登入
                    </button>
                </p>
                <p><strong>Email:</strong> ${order.customer_email || "-"}</p>
                ${shippingHtml}
            </div>
            <div>
                <div class="form-group">
                    <label>訂單狀態</label>
                    <select id="modal-order-status">
                        ${Object.keys(LOCAL_ORDER_STATUS_MAP)
                          .map(
                            (k) =>
                              `<option value="${k}" ${
                                order.status === k ? "selected" : ""
                              }>${LOCAL_ORDER_STATUS_MAP[k]}</option>`
                          )
                          .join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>付款狀態</label>
                    <p>${
                      LOCAL_PAYMENT_STATUS_MAP[order.payment_status] ||
                      order.payment_status
                    } 
                       ${
                         order.payment_status === "UNPAID"
                           ? `<button class="btn btn-small btn-success" onclick="markOrderPaid(${order.id})">標記已付</button>`
                           : ""
                       }
                       ${
                         order.payment_status === "PENDING_REVIEW"
                           ? `<button class="btn btn-small btn-success" onclick="approveOrder(${order.id})">✅ 通過審核</button>`
                           : ""
                       }
                    </p>
                </div>
            </div>
        </div>
        
        <hr>
        
        <div class="form-row-2">
            <div class="form-group">
                <label>指派操作員</label>
                <select id="modal-order-operator" ${
                  userRole !== "admin" ? "disabled" : ""
                }>
                    <option value="">-- 未指派 --</option>
                    ${operatorOptions}
                </select>
            </div>
            <div class="form-group">
                <label>${trackingLabel}</label>
                <input type="text" id="modal-order-tracking" value="${
                  order.domestic_tracking_number || ""
                }" placeholder="輸入單號">
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

        <div style="border: 2px solid #dc3545; padding: 10px; border-radius: 8px; margin-top: 20px;">
            <h4 style="margin-top:0; color:#dc3545;">🛠️ 訂單內容修正 (修改後請按儲存)</h4>
            <p style="font-size:0.8rem; color:#666;">注意：修改價格或數量後，系統將自動依當前匯率重新計算總金額。</p>
            <table class="data-table" style="font-size: 0.9rem;">
                <thead>
                    <tr><th width="50%">商品資訊 (名稱/規格/連結)</th><th>單價(CNY)</th><th>數量</th><th>操作</th></tr>
                </thead>
                <tbody id="modal-items-tbody">${itemsHtml}</tbody>
            </table>
            <div style="margin-top:10px;">${addItemBtn}</div>
        </div>
    `;

  modal.style.display = "block";
}

// [修改] 儲存訂單變更 (包含商品內容)
async function saveOrderChanges() {
  if (!currentOrder) return;
  const status = document.getElementById("modal-order-status").value;
  const operatorId = document.getElementById("modal-order-operator").value;
  const tracking = document.getElementById("modal-order-tracking").value;
  const notes = document.getElementById("modal-order-notes").value;

  // 收集商品資料
  const itemRows = document.querySelectorAll(".order-item-row");
  const items = [];

  let isValid = true;
  itemRows.forEach((row) => {
    const name = row.querySelector(".item-name-input").value.trim();
    const spec = row.querySelector(".item-spec-input").value.trim();
    const url = row.querySelector(".item-url-input").value.trim();
    const img = row.querySelector(".item-img-input").value.trim();
    const remark = row.querySelector(".item-remark-input").value.trim();
    const cost = row.querySelector(".item-cost-input").value;
    const qty = row.querySelector(".item-qty-input").value;

    if (!name) {
      isValid = false;
      return;
    }

    items.push({
      snapshot_name: name,
      item_spec: spec,
      item_url: url,
      item_image_url: img,
      client_remarks: remark,
      snapshot_cost_cny: parseFloat(cost) || 0,
      quantity: parseInt(qty) || 1,
    });
  });

  if (!isValid) {
    alert("商品名稱不能為空！");
    return;
  }
  if (items.length === 0) {
    alert("訂單至少需要一項商品！");
    return;
  }

  try {
    const data = {
      status: status,
      notes: notes,
      domestic_tracking_number: tracking,
      operator_id: operatorId || null,
      items: items, // 傳送新的商品清單
    };

    await api.updateOrder(currentOrder.id, data);
    alert("訂單已更新，金額已自動重新計算。");

    await loadOrders();
    document.getElementById("order-modal").style.display = "none";
    loadStats();
  } catch (e) {
    alert("更新失敗: " + e.message);
  }
}

// --- 7. 商品管理 (Products) ---
async function loadProducts() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML =
    '<tr><td colspan="7" class="text-center">載入中...</td></tr>';
  try {
    const products = await api.getProducts();
    renderProducts(products, tbody);

    // 綁定編輯與封存按鈕
    tbody.querySelectorAll(".btn-edit-product").forEach((btn) => {
      btn.addEventListener("click", () => openProductModal(btn.dataset.id));
    });
    tbody.querySelectorAll(".btn-delete-product").forEach((btn) => {
      btn.addEventListener("click", () => archiveProduct(btn.dataset.id));
    });
  } catch (e) {
    console.error(e);
  }
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
        specs: specs,
        is_direct_buy: document.getElementById("product-is-direct").checked,
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
  document.getElementById("product-is-direct").checked = false;
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
      document.getElementById("product-specs").value = p.specs
        ? p.specs.join(", ")
        : "";
      document.getElementById("product-is-direct").checked =
        p.is_direct_buy || false;

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
  if (confirm("確定要封存此商品嗎？")) {
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
    renderCategories(allCategories, tbody);

    tbody.querySelectorAll(".btn-edit-category").forEach((btn) => {
      btn.addEventListener("click", () => openCategoryModal(btn.dataset.id));
    });
    tbody.querySelectorAll(".btn-delete-category").forEach((btn) => {
      btn.addEventListener("click", () => deleteCategory(btn.dataset.id));
    });
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
    renderWarehouses(warehouses, tbody);

    tbody.querySelectorAll(".btn-edit-warehouse").forEach((btn) => {
      btn.addEventListener("click", () => openWarehouseModal(btn.dataset.id));
    });
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
    const currentUser = getUser();
    renderUsers(users, tbody, currentUser);

    // [修改] 篩選指派操作員：必須是 active 且是 admin 或擁有商品管理權限
    availableOperators = users.filter(
      (u) =>
        u.status === "active" && (u.role === "admin" || u.can_manage_products)
    );

    tbody.querySelectorAll(".btn-toggle-status").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newStatus = btn.dataset.newStatus;
        if (
          confirm(
            `確定要變更狀態為 ${newStatus === "active" ? "正常" : "停權"} 嗎?`
          )
        ) {
          await api.updateUserStatus(btn.dataset.id, newStatus);
          loadUsers();
        }
      });
    });
    tbody.querySelectorAll(".btn-edit-user").forEach((btn) => {
      btn.addEventListener("click", () => openUserModal(btn.dataset.id));
    });
    tbody.querySelectorAll(".user-role-select").forEach((sel) => {
      sel.addEventListener("change", async (e) => {
        if (confirm("確定修改權限？")) {
          await api.updateUserRole(sel.dataset.id, e.target.value);
          loadUsers();
        } else {
          loadUsers();
        }
      });
    });
  } catch (e) {
    console.error(e);
  }
}

function setupUserEvents() {
  const btn = document.getElementById("btn-add-user");
  if (btn) btn.addEventListener("click", () => openUserModal(null));

  const searchInput = document.getElementById("user-search-input");
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      userSearchTerm = e.target.value.trim();
      const filtered = allUsers.filter((u) =>
        u.username.toLowerCase().includes(userSearchTerm.toLowerCase())
      );
      const tbody = document.getElementById("users-tbody");
      renderUsers(filtered, tbody, getUser());
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
      const email = document.getElementById("user-email").value;
      const receiveNotifications =
        document.getElementById("user-notify").checked;

      // [新增] 取得彈性權限狀態
      const canManageProducts = document.getElementById(
        "user-can-manage-products"
      ).checked;
      const canManageFinance = document.getElementById(
        "user-can-manage-finance"
      ).checked;

      try {
        if (id) {
          // 1. 更新基本資訊 (Email/Notification)
          await api.updateUserInfo(id, {
            email,
            receive_notifications: receiveNotifications,
          });

          // 2. 更新彈性權限
          if (role !== "admin") {
            // Admin 的權限由後端自動處理，這裡只更新 Operator
            await api.updateUserPermissions(id, {
              can_manage_products: canManageProducts,
              can_manage_finance: canManageFinance,
            });
          }

          // 3. 更新角色 (如果變更了)
          const originalUser = allUsers.find((u) => u.id == id);
          if (originalUser.role !== role) await api.updateUserRole(id, role);
          if (password) await api.updateUserPassword(id, password);

          alert("更新成功");
        } else {
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
            // [新增] 傳遞彈性權限
            can_manage_products: canManageProducts,
            can_manage_finance: canManageFinance,
          });
          alert("建立成功");
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
  const passwordInput = document.getElementById("user-password");

  // [新增] 彈性權限勾選框
  const productCheck = document.getElementById("user-can-manage-products");
  const financeCheck = document.getElementById("user-can-manage-finance");
  const roleSelect = document.getElementById("user-role");

  // 重設所有欄位/狀態
  document.getElementById("user-email").value = "";
  document.getElementById("user-notify").checked = false;
  productCheck.checked = false;
  financeCheck.checked = false;

  const permissionChecks = [productCheck, financeCheck];

  if (id) {
    const user = allUsers.find((u) => u.id == id);
    if (!user) return;

    title.textContent = "編輯用戶";
    document.getElementById("user-id").value = user.id;
    usernameInput.value = user.username;
    usernameInput.disabled = true;
    roleSelect.value = user.role;
    document.getElementById("user-email").value = user.email || "";
    document.getElementById("user-notify").checked = user.receive_notifications;

    // [新增] 載入彈性權限狀態
    productCheck.checked = user.can_manage_products;
    financeCheck.checked = user.can_manage_finance;

    passwordInput.required = false;
    passwordInput.type = "password";
    passwordInput.placeholder = "不修改請留空";
    passHint.textContent = "重置密碼";

    // [新增] 權限鎖定邏輯：Admin 無需設置彈性權限
    const isDisabled = user.role === "admin";
    permissionChecks.forEach((input) => (input.disabled = isDisabled));
  } else {
    title.textContent = "建立新用戶";
    usernameInput.disabled = false;
    passwordInput.required = true;
    passwordInput.type = "text"; // 建立新用戶時先用 text 方便輸入
    passwordInput.placeholder = "密碼";
    passHint.textContent = "";
    roleSelect.value = "operator";
    permissionChecks.forEach((input) => (input.disabled = false));
  }

  document.getElementById("user-modal").style.display = "block";

  // [新增] 監聽角色選擇器，如果選了 Admin，鎖定所有權限勾選 (防止 Operator 誤選)
  if (roleSelect) {
    roleSelect.onchange = function () {
      const isDisabled = this.value === "admin";
      permissionChecks.forEach((input) => {
        input.disabled = isDisabled;
        // 如果切換到 Admin，也將勾選狀態設為 true (Admin 預設擁有所有權限)
        if (isDisabled) input.checked = true;
        else input.checked = false; // 切回 Operator 清空，讓用戶重新勾選
      });
    };
  }
}

// --- 11. 會員管理 (Customers) ---
async function loadCustomers() {
  const tbody = document.getElementById("customers-tbody");
  tbody.innerHTML =
    "<tr><td colspan='6' class='text-center'>載入中...</td></tr>";
  try {
    const customers = await api.getCustomers();
    allCustomers = customers;
    renderCustomers(customers, tbody);

    tbody.querySelectorAll(".btn-edit-customer").forEach((btn) => {
      btn.addEventListener("click", () => openCustomerModal(btn.dataset.id));
    });
    // 模擬登入按鈕在 render.js 已綁定到 window.impersonateUser，不需額外處理
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan='6' class='text-center text-danger'>${e.message}</td></tr>`;
  }
}

function setupCustomerEvents() {
  const searchInput = document.getElementById("customer-search-input");
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      customerSearchTerm = e.target.value.trim().toLowerCase();
      const filtered = allCustomers.filter(
        (c) =>
          c.paopao_id.toLowerCase().includes(customerSearchTerm) ||
          c.email.toLowerCase().includes(customerSearchTerm)
      );
      const tbody = document.getElementById("customers-tbody");
      renderCustomers(filtered, tbody);
      tbody.querySelectorAll(".btn-edit-customer").forEach((btn) => {
        btn.addEventListener("click", () => openCustomerModal(btn.dataset.id));
      });
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
      const isVipStr = document.getElementById("customer-is-vip").value;
      const is_vip = isVipStr === "true";

      try {
        await api.updateCustomer(id, { email, phone, is_vip });
        if (password) {
          await api.updateCustomerPassword(id, password);
        }
        alert("更新成功");
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
  document.getElementById("customer-is-vip").value = customer.is_vip
    ? "true"
    : "false";
  document.getElementById("customer-password").value = "";
  document.getElementById("customer-modal").style.display = "block";
}

// --- 12. 系統設置 ---
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
    document.getElementById("enable-email-register").checked =
      settings.enable_email_register === "true";
    document.getElementById("enable-email-order").checked =
      settings.enable_email_order === "true";
    document.getElementById("enable-email-payment").checked =
      settings.enable_email_payment === "true";
    document.getElementById("enable-email-status").checked =
      settings.enable_email_status === "true";
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
          enable_email_register: document.getElementById(
            "enable-email-register"
          ).checked,
          enable_email_order:
            document.getElementById("enable-email-order").checked,
          enable_email_payment: document.getElementById("enable-email-payment")
            .checked,
          enable_email_status: document.getElementById("enable-email-status")
            .checked,
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
