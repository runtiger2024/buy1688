// frontend/admin/js/admin.js
import { checkAuth, getUser, logout, copyToClipboard } from "./utils.js";
import { api } from "./api.js";
import {
  renderOrders,
  renderProducts,
  renderUsers,
  renderWarehouses,
  renderCategories,
  renderCustomersTable,
} from "./render.js";

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
  PENDING_REVIEW: "審核中", // [新增] 代購審核狀態
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
    if (currentOrder && currentOrder.id == id) openOrderModal(id); // 重新渲染 Modal 內容
    loadStats(); // 更新背景統計
  } catch (e) {
    alert(e.message);
  }
};

// [新功能] 代購訂單審核通過
window.approveOrder = async function (id) {
  if (!confirm("確定通過審核？系統將發送「付款通知信」給客戶。")) return;
  try {
    // 將狀態從 PENDING_REVIEW 改為 UNPAID，觸發後端寄信
    await api.updateOrder(id, { payment_status: "UNPAID" });
    alert("✅ 訂單已審核通過，等待客戶付款。");
    await loadOrders();
    if (currentOrder && currentOrder.id == id) openOrderModal(id);
    loadStats();
  } catch (e) {
    alert(e.message);
  }
};

// [新功能] 模擬客戶登入
window.impersonate = async function (customerId) {
  if (!confirm("確定要模擬此客戶登入嗎？這將會開啟新視窗進入前台。")) return;
  try {
    const res = await api.impersonateCustomer(customerId);
    // 設置 localStorage (注意：這裡假設前台與後台同源)
    localStorage.setItem("customerToken", res.token);
    localStorage.setItem("customerUser", JSON.stringify(res.customer));

    // 開啟前台
    window.open("../../html/index.html", "_blank");
  } catch (e) {
    alert("模擬登入失敗: " + e.message);
  }
};

// [新功能] 動態新增代購商品欄位 (Modal 內)
window.addAssistItemRow = function () {
  const tbody = document.getElementById("modal-items-tbody");
  const tr = document.createElement("tr");
  tr.className = "assist-item-row";
  tr.innerHTML = `
        <td>
            <input type="text" class="item-name" placeholder="商品名稱" style="width:100%; margin-bottom:2px;">
            <input type="text" class="item-spec" placeholder="規格" style="width:100%; margin-bottom:2px;">
            <input type="text" class="item-remark" placeholder="備註" style="width:100%; color:blue;">
        </td>
        <td>
            <input type="text" class="item-url" placeholder="連結" style="width:100%; margin-bottom:2px;">
            <input type="text" class="item-img" placeholder="圖片連結" style="width:100%;">
        </td>
        <td><input type="number" class="item-price" placeholder="台幣單價" style="width:70px"></td>
        <td><input type="number" class="item-cost" placeholder="人民幣成本" style="width:70px"></td>
        <td><input type="number" class="item-qty" value="1" style="width:50px"></td>
        <td><button class="btn btn-small btn-danger" onclick="this.closest('tr').remove()">刪除</button></td>
    `;
  tbody.appendChild(tr);
};

// [新功能] 開啟客戶編輯視窗 (掛載到 window 供 render.js 呼叫)
window.openCustomerModal = function (id) {
  const customer = allCustomers.find((c) => c.id == id);
  if (!customer) return;

  document.getElementById("customer-form").reset();
  document.getElementById("customer-id").value = customer.id;
  document.getElementById("customer-paopao-id").value = customer.paopao_id;
  document.getElementById("customer-email").value = customer.email;
  document.getElementById("customer-phone").value = customer.phone || "";

  // 回填 VIP 選單
  const vipSelect = document.getElementById("customer-is-vip");
  if (vipSelect) {
    vipSelect.value = customer.is_vip ? "true" : "false";
  }

  document.getElementById("customer-password").value = "";
  document.getElementById("customer-modal").style.display = "block";
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
      '<tr><td colspan="12" class="text-center">載入中...</td></tr>';
  }

  try {
    const params = {};
    if (currentStatusFilter) params.status = currentStatusFilter;
    if (currentPaymentStatusFilter)
      params.paymentStatus = currentPaymentStatusFilter;
    if (currentSearchTerm) params.search = currentSearchTerm;
    if (currentHasVoucherFilter) params.hasVoucher = "true";

    allOrders = await api.getOrders(params);
    const exchangeRate =
      parseFloat(document.getElementById("exchange-rate-input").value) || 4.5;
    const userRole = getUser().role;

    // 使用 render.js 匯出的函式
    renderOrders(allOrders, tbody, availableOperators, exchangeRate, userRole);
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

// 訂單彈窗邏輯：支援代購編輯介面
window.openOrderModal = function (orderId) {
  const order = allOrders.find((o) => o.id == orderId);
  if (!order) return;
  currentOrder = order;

  const modal = document.getElementById("order-modal");
  const content = document.getElementById("order-modal-content");
  const userRole = getUser().role;

  const operatorOptions = availableOperators
    .map(
      (op) =>
        `<option value="${op.id}" ${
          order.operator_id === op.id ? "selected" : ""
        }>${op.username}</option>`
    )
    .join("");

  const isAssist = order.type === "Assist";

  let itemsHtml = "";
  if (isAssist) {
    // 可編輯模式
    itemsHtml = `
        <div style="margin-bottom:10px; padding:10px; background:#f0f8ff; border-radius:4px;">
            <h4 style="margin:0 0 5px 0;">✏️ 代購商品編輯區</h4>
            <button class="btn btn-small btn-primary" onclick="addAssistItemRow()">+ 新增商品</button>
            <small class="text-muted"> (可修正價格、數量或新增項目，完成後請按下方「儲存變更」)</small>
        </div>
        <div class="table-responsive">
        <table class="data-table" style="font-size: 0.85rem;">
            <thead>
                <tr>
                    <th width="25%">商品/規格/備註</th>
                    <th width="25%">連結/圖片</th>
                    <th width="15%">台幣單價</th>
                    <th width="15%">人民幣成本</th>
                    <th width="10%">數量</th>
                    <th width="10%">操作</th>
                </tr>
            </thead>
            <tbody id="modal-items-tbody">
                ${order.items
                  .map(
                    (item) => `
                    <tr class="assist-item-row">
                        <td>
                            <input type="text" class="item-name" value="${
                              item.snapshot_name
                            }" placeholder="商品名稱" style="width:100%; margin-bottom:2px;">
                            <input type="text" class="item-spec" value="${
                              item.item_spec || ""
                            }" placeholder="規格" style="width:100%; margin-bottom:2px;">
                            <input type="text" class="item-remark" value="${
                              item.client_remarks || ""
                            }" placeholder="備註" style="width:100%; color:blue;">
                        </td>
                        <td>
                            <input type="text" class="item-url" value="${
                              item.item_url
                            }" placeholder="商品連結" style="width:100%; margin-bottom:2px;">
                            <input type="text" class="item-img" value="${
                              item.item_image_url || ""
                            }" placeholder="圖片連結" style="width:100%;">
                            ${
                              item.item_image_url
                                ? `<a href="${item.item_image_url}" target="_blank" style="font-size:0.8rem;">[預覽]</a>`
                                : ""
                            }
                        </td>
                        <td><input type="number" class="item-price" value="${
                          item.snapshot_price_twd
                        }" style="width:70px"></td>
                        <td><input type="number" class="item-cost" value="${
                          item.snapshot_cost_cny
                        }" style="width:70px"></td>
                        <td><input type="number" class="item-qty" value="${
                          item.quantity
                        }" style="width:50px"></td>
                        <td><button class="btn btn-small btn-danger" onclick="this.closest('tr').remove()">刪除</button></td>
                    </tr>
                `
                  )
                  .join("")}
            </tbody>
        </table>
        </div>
      `;
  } else {
    // 一般訂單 (唯讀)
    itemsHtml = `
        <table class="data-table" style="font-size: 0.85rem;">
            <thead><tr><th>商品</th><th>規格</th><th>數量</th><th>單價</th></tr></thead>
            <tbody>
                ${order.items
                  .map(
                    (item) => `
                    <tr>
                        <td>${item.snapshot_name}</td>
                        <td>${item.item_spec || "-"}</td>
                        <td>${item.quantity}</td>
                        <td>${item.snapshot_price_twd}</td>
                    </tr>
                `
                  )
                  .join("")}
            </tbody>
        </table>`;
  }

  // 寄送資訊
  let shippingHtml = "";
  let trackingLabel = "大陸物流單號";
  if (order.recipient_address) {
    trackingLabel = "台灣物流單號";
    shippingHtml = `
        <div style="background:#fff3cd; padding:10px; border-radius:5px; border:1px solid #ffeeba; margin-bottom:10px;">
            <strong><i class="fas fa-shipping-fast"></i> 直寄台灣資訊</strong><br>
            姓名: ${order.recipient_name}<br>
            電話: ${order.recipient_phone}<br>
            地址: ${order.recipient_address}
        </div>`;
  } else {
    const warehouseName = order.warehouse_name || "未指定";
    shippingHtml = `
        <p><strong>集運倉:</strong> ${warehouseName} 
           ${
             order.warehouse_id
               ? `<button class="btn btn-small btn-light" onclick="copyShippingInfo('${order.paopao_id}', ${order.warehouse_id})">複製地址</button>`
               : ""
           }
        </p>`;
  }

  let voucherHtml = '<span class="text-muted">尚未上傳</span>';
  if (order.payment_voucher_url) {
    voucherHtml = `<a href="${order.payment_voucher_url}" target="_blank">查看憑證連結</a>`;
    if (order.payment_voucher_url.startsWith("data:image")) {
      voucherHtml = `<img src="${order.payment_voucher_url}" class="img-thumb" style="width:150px; height:auto;" onclick="window.open().document.write('<img src=\\'${order.payment_voucher_url}\\' style=\\'width:100%\\'>')">`;
    }
  }

  content.innerHTML = `
      <div class="form-row-2">
          <div>
             <p><strong>訂單編號: #${order.id}</strong> (${order.type})</p>
             <p>會員: ${order.paopao_id} (${order.customer_email || "-"})</p>
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
                 <select id="modal-order-payment-status">
                     ${Object.keys(PAYMENT_STATUS_MAP)
                       .map(
                         (k) =>
                           `<option value="${k}" ${
                             order.payment_status === k ? "selected" : ""
                           }>${PAYMENT_STATUS_MAP[k]}</option>`
                       )
                       .join("")}
                 </select>
                 ${
                   order.payment_status === "PENDING_REVIEW"
                     ? `<button class="btn btn-small btn-success w-100 mt-5" onclick="approveOrder(${order.id})">✅ 通過審核</button>`
                     : ""
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
      
      <h4 class="mt-5">商品清單</h4>
      ${itemsHtml}
  `;

  modal.style.display = "block";
};

// 儲存訂單變更 (包含代購商品編輯)
async function saveOrderChanges() {
  if (!currentOrder) return;

  const status = document.getElementById("modal-order-status").value;
  const payment_status = document.getElementById(
    "modal-order-payment-status"
  ).value;
  const operatorId = document.getElementById("modal-order-operator").value;
  const tracking = document.getElementById("modal-order-tracking").value;
  const notes = document.getElementById("modal-order-notes").value;

  const data = {
    status: status,
    payment_status: payment_status,
    domestic_tracking_number: tracking,
    notes: notes,
    operator_id: operatorId || null,
  };

  // 如果是代購訂單，收集商品資料
  if (currentOrder.type === "Assist") {
    const rows = document.querySelectorAll(".assist-item-row");
    const newItems = [];
    rows.forEach((row) => {
      newItems.push({
        snapshot_name: row.querySelector(".item-name").value,
        item_spec: row.querySelector(".item-spec").value,
        client_remarks: row.querySelector(".item-remark").value,
        item_url: row.querySelector(".item-url").value,
        item_image_url: row.querySelector(".item-img").value,
        snapshot_price_twd: row.querySelector(".item-price").value,
        snapshot_cost_cny: row.querySelector(".item-cost").value,
        quantity: row.querySelector(".item-qty").value,
      });
    });

    if (newItems.length === 0) {
      alert("錯誤：商品清單不能為空");
      return;
    }

    data.items = newItems; // 送出新陣列
  }

  try {
    await api.updateOrder(currentOrder.id, data);
    alert("訂單已更新");
    await loadOrders();
    // 刷新 modal 內容
    openOrderModal(currentOrder.id);
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

    document.querySelectorAll(".btn-edit-product").forEach((btn) => {
      btn.addEventListener("click", () => openProductModal(btn.dataset.id));
    });
    document.querySelectorAll(".btn-delete-product").forEach((btn) => {
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
        if (id) await api.updateProduct(id, data);
        else await api.createProduct(data);
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
    renderCategories(allCategories, tbody);

    document.querySelectorAll(".btn-edit-category").forEach((btn) => {
      btn.addEventListener("click", () => openCategoryModal(btn.dataset.id));
    });
    document.querySelectorAll(".btn-delete-category").forEach((btn) => {
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

    document.querySelectorAll(".btn-edit-warehouse").forEach((btn) => {
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

  renderUsers(filtered, tbody, getUser());

  document.querySelectorAll(".btn-toggle-status").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const newStatus = btn.dataset.newStatus;
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
      const email = document.getElementById("user-email").value;
      const receiveNotifications =
        document.getElementById("user-notify").checked;

      try {
        if (id) {
          await api.updateUserInfo(id, {
            email,
            receive_notifications: receiveNotifications,
          });
          const originalUser = allUsers.find((u) => u.id == id);
          if (originalUser.role !== role) {
            await api.updateUserRole(id, role);
          }
          if (password) {
            await api.updateUserPassword(id, password);
          }
          alert("用戶資料已更新");
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
    handleRenderCustomers();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan='6' class='text-center text-danger'>${e.message}</td></tr>`;
  }
}

function handleRenderCustomers() {
  const tbody = document.getElementById("customers-tbody");
  const filtered = allCustomers.filter(
    (c) =>
      c.paopao_id.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearchTerm))
  );

  renderCustomersTable(filtered, tbody);

  // 綁定事件
  tbody
    .querySelectorAll(".btn-edit-customer")
    .forEach((btn) =>
      btn.addEventListener("click", () => openCustomerModal(btn.dataset.id))
    );
  tbody
    .querySelectorAll(".btn-impersonate")
    .forEach((btn) =>
      btn.addEventListener("click", () => impersonate(btn.dataset.id))
    );
}

function setupCustomerEvents() {
  document
    .getElementById("customer-search-input")
    .addEventListener("keyup", (e) => {
      customerSearchTerm = e.target.value.trim();
      handleRenderCustomers();
    });

  document
    .getElementById("customer-form")
    .addEventListener("submit", async (e) => {
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
