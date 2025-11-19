// frontend/js/assist.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  getCustomer,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadAvailableWarehouses,
  populateWarehouseSelect,
  checkAuth, // [新增]
  getAuthToken, // [新增]
} from "./sharedUtils.js"; // <-- 導入共用函式

// --- 全域變數 ---
let currentSettings = {
  exchange_rate: 4.5, // 預設值
  service_fee: 0,
};
let assistList = []; // 暫存代購商品
let availableWarehouses = []; // 存放倉庫資料

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", async () => {
  // [新增] 進入此頁面即檢查登入 (您也可以選擇只在提交時檢查)
  if (!checkAuth()) return;

  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();

  // [新增] 處理導覽列上的 "我的購物車" 連結
  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      // 導回首頁並打開購物車 modal
      window.location.href = "./index.html";
    });
  }

  await loadSettingsAndWarehouses(); // [修改] 結合載入設定與倉庫

  document
    .getElementById("assist-add-form")
    .addEventListener("submit", handleAddItem);
  document
    .getElementById("assist-submit-form")
    .addEventListener("submit", handleSubmitOrder);

  // [新增] 修改按鈕文字
  const submitBtn = document.getElementById("submit-order-btn");
  if (submitBtn) {
    submitBtn.textContent = "確認送出訂單採購到集運倉";
  }

  // [新增] 自動填入登入資訊
  const customer = getCustomer();
  if (customer) {
    const paopaoInput = document.getElementById("paopao-id");
    const emailInput = document.getElementById("customer-email");
    if (paopaoInput) {
      paopaoInput.value = customer.paopao_id;
      paopaoInput.readOnly = true;
    }
    if (emailInput) {
      emailInput.value = customer.email;
      emailInput.readOnly = true;
    }
  }
});

/**
 * [修改] 載入後台設定與倉庫 (使用 sharedUtils)
 */
async function loadSettingsAndWarehouses() {
  const rateEl = document.getElementById("display-rate");
  const feeEl = document.getElementById("display-fee");

  // 1. 載入設定
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      const settings = await response.json();
      // 更新全域變數
      if (settings.exchange_rate)
        currentSettings.exchange_rate = settings.exchange_rate;
      if (settings.service_fee !== undefined)
        currentSettings.service_fee = settings.service_fee;

      // 更新 UI
      rateEl.textContent = currentSettings.exchange_rate;
      const feePercent = (currentSettings.service_fee * 100).toFixed(0);
      feeEl.textContent = `${feePercent}%`;
    }
  } catch (error) {
    console.error("載入設定失敗:", error);
  }

  // 2. 載入倉庫 (使用 sharedUtils)
  availableWarehouses = await loadAvailableWarehouses();
  populateWarehouseSelect("assist-warehouse-select", availableWarehouses);
}

/**
 * 處理「加入清單」
 */
function handleAddItem(e) {
  e.preventDefault();

  const url = document.getElementById("item-url").value;
  const name = document.getElementById("item-name").value;
  const spec = document.getElementById("item-spec").value;
  const priceCny = parseFloat(document.getElementById("item-price-cny").value);
  const quantity = parseInt(document.getElementById("item-quantity").value);

  if (priceCny < 0 || quantity < 1 || isNaN(priceCny) || isNaN(quantity)) {
    alert("價格與數量必須是有效數字，且數量大於 0");
    return;
  }

  // 試算台幣
  const rate = currentSettings.exchange_rate;
  const fee = currentSettings.service_fee;
  const rawTwd = priceCny * rate * (1 + fee);
  const estimatedTwd = Math.ceil(rawTwd);

  const newItem = {
    id: Date.now(), // 前端暫時 ID (不傳給後端)
    item_url: url,
    item_name: name,
    item_spec: spec,
    price_cny: priceCny,
    quantity: quantity,
    estimated_twd: estimatedTwd,
  };

  assistList.push(newItem);
  renderAssistList();

  document.getElementById("assist-add-form").reset();
  document.getElementById("item-quantity").value = "1";
}

/**
 * 渲染代購清單表格
 */
function renderAssistList() {
  const tbody = document.getElementById("assist-tbody");
  const totalEl = document.getElementById("assist-total-twd");
  const submitBtn = document.getElementById("submit-order-btn");

  if (assistList.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; color:#999;">清單目前是空的</td></tr>';
    totalEl.textContent = "TWD 0";
    submitBtn.disabled = true;
    return;
  }

  let totalAmount = 0;
  tbody.innerHTML = "";

  assistList.forEach((item, index) => {
    const itemTotal = item.estimated_twd * item.quantity;
    totalAmount += itemTotal;

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>
                <strong>${item.item_name}</strong><br>
                <small style="color:#666">${item.item_spec || "無規格"}</small>
            </td>
            <td>
                <a href="${
                  item.item_url
                }" target="_blank" style="font-size:0.8rem; word-break: break-all;">
                    ${item.item_url.substring(0, 30)}...
                </a>
            </td>
            <td>¥${item.price_cny}</td>
            <td>${item.quantity}</td>
            <td>NT$${itemTotal} (單價:${item.estimated_twd})</td>
            <td>
                <button class="btn-small-delete remove-item-btn" data-index="${index}">&times;</button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  totalEl.textContent = `TWD ${totalAmount}`;
  submitBtn.disabled = false;

  document.querySelectorAll(".remove-item-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index);
      assistList.splice(idx, 1);
      renderAssistList();
    });
  });
}

/**
 * 提交代購訂單
 */
async function handleSubmitOrder(e) {
  e.preventDefault();

  // [新增] 二次檢查與獲取 Token
  if (!checkAuth()) return;
  const token = getAuthToken();

  if (assistList.length === 0) {
    alert("請先加入商品！");
    return;
  }

  const paopaoId = document.getElementById("paopao-id").value;
  const email = document.getElementById("customer-email").value;
  const paymentMethod = document.querySelector(
    'input[name="payment-method"]:checked'
  ).value;
  const warehouseSelect = document.getElementById("assist-warehouse-select");
  const warehouseId = warehouseSelect.value;

  if (!warehouseId) {
    alert("請選擇一個集運倉！");
    return;
  }

  const submitBtn = document.getElementById("submit-order-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "訂單提交中...";

  try {
    // 過濾掉前端專用的 id 和 estimated_twd 欄位
    const itemsToSend = assistList.map((item) => ({
      item_url: item.item_url,
      item_name: item.item_name,
      item_spec: item.item_spec,
      price_cny: item.price_cny,
      quantity: item.quantity,
    }));

    const orderData = {
      paopaoId: paopaoId,
      customerEmail: email,
      payment_method: paymentMethod,
      warehouse_id: parseInt(warehouseId, 10),
      items: itemsToSend,
    };

    // [優化] 使用 /orders/assist 路徑，帶上 Token
    const response = await fetch(`${API_URL}/orders/assist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // [重要]
      },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        alert("登入已過期，請重新登入");
        window.location.href = "../html/login.html";
        return;
      }
      throw new Error(result.message || "提交失敗");
    }

    // 訂單建立成功，跳轉到分享/匯款頁面
    if (result.order && result.order.share_token) {
      window.location.href = `../html/order-share.html?token=${result.order.share_token}`;
    } else {
      alert(
        `訂單提交成功！但無法跳轉至分享頁面。\n訂單編號：${result.order.id}`
      );
      assistList = [];
      renderAssistList();
      window.location.href = "./my-account.html";
    }
  } catch (error) {
    console.error("Error:", error);
    alert(`錯誤: ${error.message}`);
    submitBtn.disabled = false;
    // [修改] 恢復按鈕文字
    submitBtn.textContent = "確認送出訂單採購到集運倉";
  }
}
