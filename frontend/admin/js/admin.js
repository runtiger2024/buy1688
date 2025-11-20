// frontend/admin/js/admin.js
import { checkAuth, getUser, logout, copyToClipboard } from "./utils.js";
import { api } from "./api.js";
import { ORDER_STATUS_MAP, PAYMENT_STATUS_MAP } from "./constants.js";
import {
  renderOrders,
  renderProducts,
  renderUsers,
  renderWarehouses,
  renderCategories,
  renderCustomers,
} from "./render.js";

// --- 1. 全域變數 ---
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

// --- 2. 暴露給全局的工具函式 (供 HTML onclick 使用) ---

// [新增] 模擬客戶登入
window.impersonateUser = async function (customerId) {
  try {
    const data = await api.impersonateCustomer(customerId);

    // 將 Token 寫入 localStorage (注意：這是寫入前台用的 key)
    localStorage.setItem("customerToken", data.token);
    localStorage.setItem("customerUser", JSON.stringify(data.customer));

    // 開啟前台首頁
    // 注意：路徑需根據實際部署結構調整，這裡是假設 admin/html 相對於前台 html 的位置
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
狀態: ${ORDER_STATUS_MAP[currentOrder.status] || currentOrder.status}
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
    // 如果 Modal 是開著的，重新整理它
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

    if (user.role !== "admin") {
      document
        .querySelectorAll('[data-role="admin"]')
        .forEach((el) => (el.style.display = "none"));
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
    const exchangeRate = parseFloat(rateInput.value) || 4.5;
    const userRole = getUser().role;

    // 使用 render.js 的函式渲染
    renderOrders(allOrders, tbody, availableOperators, exchangeRate, userRole);

    // 綁定「查看訂單」按鈕事件 (因為這是 admin.js 特有的 Modal 邏輯，需在此綁定)
    // 注意：render.js 可能只產生了 DOM，這裡我們要確保能觸發 Modal
    // 我們可以在 render.js 產生按鈕時加上 class 或 onclick，這裡選擇用事件委派
    // 由於 render.js 中的按鈕沒有加 onclick="openOrderModal"，我們手動綁定

    // 修正：render.js 裡面沒有 View 按鈕?
    // 檢視 render.js: renderOrders 生成的 HTML 沒有 "查看/編輯" 按鈕，而是依賴點擊整行或特定欄位？
    // 不，render.js 裡面通常沒有 "View" button，它依賴 admin.js 來做更多事。
    // 讓我們在 renderOrders 完成後，手動加入 "編輯/查看" 按鈕到最後一欄 "操作"
    // 或者更簡單的方法：修改 render.js 讓它包含按鈕 (已在之前的步驟完成)
    // 假設 render.js 已經包含了相關按鈕。如果沒有，我們在這裡補強。

    // 為了確保 openOrderModal 能被呼叫，我們在表格上使用事件委派
    tbody.querySelectorAll("tr").forEach((tr) => {
      // 可以在這裡加雙擊事件，或者在 render.js 裡加按鈕
      // 這裡假設 render.js 生成了 <button class="btn-view-order">
      const viewBtn = document.createElement("button");
      viewBtn.className = "btn btn-small btn-info";
      viewBtn.innerHTML = '<i class="fas fa-edit"></i>';
      viewBtn.title = "查看/編輯詳情";
      viewBtn.style.marginLeft = "5px";

      // 找到 orderId (假設在第一個 td)
      const orderId = tr.querySelector("td").textContent;
      viewBtn.onclick = () => openOrderModal(orderId);

      // 插入到操作欄 (最後一個 td)
      const actionTd = tr.querySelector("td:last-child");
      if (actionTd) actionTd.prepend(viewBtn);
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

// [修改] 開啟訂單詳情 Modal (支援商品編輯)
async function openOrderModal(orderId) {
  // 重新抓取最新訂單資料 (避免操作過時數據)
  // 這裡簡單起見，我們從 allOrders 找，但最好是 fetch single order
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

  content.innerHTML = `
        <div class="form-row-2">
            <div>
                <p>
                    <strong>訂單編號:</strong> #${order.id}
                    <button class="btn btn-small btn-light" onclick="copyOrderSummary()" style="margin-left:10px;">📋 複製摘要</button>
                </p>
                <p><strong>會員:</strong> ${order.paopao_id}</p>
                <p><strong>Email:</strong> ${order.customer_email || "-"}</p>
                ${shippingHtml}
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
                    <label>付款狀態</label>
                    <p>${PAYMENT_STATUS_MAP[order.payment_status]} 
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
// 將 archiveProduct 綁定到 window，因為 render.js 沒有處理刪除，需在這裡處理
// 或者修改 render.js 裡面的 button click
// 這裡我們依賴 render.js 產生的 .btn-delete-product，並在 loadProducts 後綁定事件
// 為簡化，我們修改 loadProducts 內的邏輯 (已在上面 render.js 處理? 不，renderProducts 是純渲染)
// 讓我們在 loadProducts 內綁定按鈕事件
// 修改 loadProducts 函式：
// (已在 api.js 中有 archiveProduct，需在此綁定)
// 修正 loadProducts:
async function loadProducts() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML =
    '<tr><td colspan="7" class="text-center">載入中...</td></tr>';
  try {
    const products = await api.getProducts();
    renderProducts(products, tbody);

    // 綁定編輯與封存按鈕
    tbody.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => openProductModal(btn.dataset.id));
    });
    tbody.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => archiveProduct(btn.dataset.id));
    });
  } catch (e) {
    console.error(e);
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
    availableOperators = users.filter(
      (u) => u.role === "operator" && u.status === "active"
    );

    // 綁定按鈕事件
    tbody.querySelectorAll(".btn-edit-user").forEach((btn) => {
      // 如果有的話，目前 renderUsers 沒生編輯按鈕
      // 根據 render.js，只有狀態切換按鈕
    });
    tbody.querySelectorAll(".btn-toggle-status").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newStatus = btn.dataset.newStatus;
        if (confirm(`確定要變更狀態為 ${newStatus} 嗎?`)) {
          await api.updateUserStatus(btn.dataset.id, newStatus);
          loadUsers();
        }
      });
    });
    tbody.querySelectorAll(".user-role-select").forEach((sel) => {
      sel.addEventListener("change", async (e) => {
        if (confirm("確定修改權限？")) {
          await api.updateUserRole(sel.dataset.id, e.target.value);
          loadUsers();
        } else {
          loadUsers(); // reset
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
      // 簡單前端過濾
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
      // 這裡只處理建立新用戶
      const username = document.getElementById("user-username").value;
      const password = document.getElementById("user-password").value;
      const role = document.getElementById("user-role").value;
      const email = document.getElementById("user-email").value;
      const receiveNotifications =
        document.getElementById("user-notify").checked;

      if (!password) {
        alert("建立用戶需填寫密碼");
        return;
      }

      try {
        await api.createUser({
          username,
          password,
          role,
          email,
          receive_notifications: receiveNotifications,
        });
        alert("用戶建立成功");
        document.getElementById("user-modal").style.display = "none";
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
}

function openUserModal(id) {
  // 僅支援建立，不支援編輯 (簡化)
  const form = document.getElementById("create-user-form");
  form.reset();
  document.getElementById("user-id").value = "";
  document.getElementById("user-modal-title").textContent = "建立新用戶";
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
    renderCustomers(customers, tbody);

    // 綁定編輯按鈕
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
      // 重新綁定事件
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
