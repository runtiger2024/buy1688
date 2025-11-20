// frontend/js/assist.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  getCustomer,
  setupCustomerAuth,
  setupHamburgerMenu,
  loadAvailableWarehouses,
  populateWarehouseSelect,
  checkAuth,
  getAuthToken,
  setupFooter, // [新增] 引入頁尾
} from "./sharedUtils.js";

// --- 全局變數 ---
let currentSettings = { exchange_rate: 4.5, service_fee: 0 };
let assistList = [];
let availableWarehouses = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) return;

  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();
  setupBottomNav(); // 設置底部導航
  setupFooter(); // [新增] 載入頁尾

  await loadSettingsAndWarehouses();

  document
    .getElementById("assist-add-form")
    .addEventListener("submit", handleAddItem);

  // 綁定浮動按鈕到提交表單
  document
    .getElementById("submit-order-btn")
    .addEventListener("click", handleSubmitOrder);

  // 自動填入用戶資訊
  const customer = getCustomer();
  if (customer) {
    const paopaoInput = document.getElementById("paopao-id");
    const emailInput = document.getElementById("customer-email");
    if (paopaoInput) {
      paopaoInput.value = customer.paopao_id;
    }
    if (emailInput) {
      emailInput.value = customer.email;
    }
  }
});

// 設置底部導航
function setupBottomNav() {
  document.getElementById("tab-assist")?.classList.add("active");
  const bottomCartBtn = document.getElementById("tab-cart");
  if (bottomCartBtn) {
    bottomCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html#cart-modal";
    });
  }
}

async function loadSettingsAndWarehouses() {
  const rateEl = document.getElementById("display-rate");
  const feeEl = document.getElementById("display-fee");

  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      const settings = await response.json();
      if (settings.exchange_rate)
        currentSettings.exchange_rate = settings.exchange_rate;
      if (settings.service_fee !== undefined)
        currentSettings.service_fee = settings.service_fee;

      rateEl.textContent = currentSettings.exchange_rate;
      feeEl.textContent = `${(currentSettings.service_fee * 100).toFixed(0)}%`;
    }
  } catch (error) {
    console.error("設定載入失敗", error);
  }

  availableWarehouses = await loadAvailableWarehouses();
  populateWarehouseSelect("assist-warehouse-select", availableWarehouses);
}

function handleAddItem(e) {
  e.preventDefault();

  const url = document.getElementById("item-url").value;
  const name = document.getElementById("item-name").value;
  const spec = document.getElementById("item-spec").value;
  const priceCny = parseFloat(document.getElementById("item-price-cny").value);
  const quantity = parseInt(document.getElementById("item-quantity").value);

  // [新增] 讀取圖片與備註
  const imgUrl = document.getElementById("item-image-url").value;
  const remark = document.getElementById("item-remark").value;

  if (priceCny < 0 || quantity < 1 || isNaN(priceCny) || isNaN(quantity)) {
    alert("請輸入有效的價格與數量");
    return;
  }

  const rate = currentSettings.exchange_rate;
  const fee = currentSettings.service_fee;
  const rawTwd = priceCny * rate * (1 + fee);
  const estimatedTwd = Math.ceil(rawTwd);

  const newItem = {
    id: Date.now(),
    item_url: url,
    item_name: name,
    item_spec: spec,
    price_cny: priceCny,
    quantity: quantity,
    estimated_twd: estimatedTwd,
    // [新增] 儲存欄位
    item_image_url: imgUrl,
    client_remarks: remark,
  };

  assistList.push(newItem);
  renderAssistList();

  document.getElementById("assist-add-form").reset();
  document.getElementById("item-quantity").value = "1";

  // 滾動到清單區域
  document
    .getElementById("assist-list-section")
    .scrollIntoView({ behavior: "smooth" });
}

function renderAssistList() {
  const listSection = document.getElementById("assist-list-section");
  const container = document.getElementById("assist-list-container");
  const totalDisplay = document.getElementById("assist-total-display");
  const floatTotal = document.getElementById("float-total-twd");
  const submitBtn = document.getElementById("submit-order-btn");

  if (assistList.length === 0) {
    listSection.style.display = "none";
    submitBtn.disabled = true;
    floatTotal.textContent = "TWD 0";
    return;
  }

  listSection.style.display = "block";
  submitBtn.disabled = false;
  container.innerHTML = "";
  let totalAmount = 0;

  assistList.forEach((item, index) => {
    const itemTotal = item.estimated_twd * item.quantity;
    totalAmount += itemTotal;

    // [新增] 顯示圖片預覽
    const imgDisplay = item.item_image_url
      ? `<img src="${item.item_image_url}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; margin-right:10px;">`
      : `<div style="width:50px; height:50px; background:#eee; border-radius:4px; margin-right:10px; display:flex; align-items:center; justify-content:center; color:#999;"><i class="fas fa-image"></i></div>`;

    // [新增] 顯示備註
    const remarkDisplay = item.client_remarks
      ? `<div style="color:#d63384; font-size:0.85rem; margin-top:2px;"><i class="fas fa-comment-alt"></i> ${item.client_remarks}</div>`
      : "";

    const card = document.createElement("div");
    card.style.borderBottom = "1px solid #eee";
    card.style.padding = "10px 0";
    card.innerHTML = `
        <div style="display:flex;">
            ${imgDisplay}
            <div style="flex:1;">
                <div style="display:flex; justify-content:space-between;">
                    <strong style="font-size:1rem;">${item.item_name}</strong>
                    <button class="btn-remove" data-index="${index}" style="background:none; border:none; color:#999;">&times;</button>
                </div>
                <div style="font-size:0.85rem; color:#666; margin:5px 0;">
                    ${item.item_spec ? `規格: ${item.item_spec} | ` : ""} 
                    <a href="${
                      item.item_url
                    }" target="_blank" style="color:#007bff;">連結</a>
                </div>
                ${remarkDisplay}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                    <span>¥${item.price_cny} x ${item.quantity}</span>
                    <span style="color:var(--taobao-orange); font-weight:bold;">NT$ ${itemTotal}</span>
                </div>
            </div>
        </div>
    `;
    container.appendChild(card);
  });

  totalDisplay.textContent = `TWD ${totalAmount.toLocaleString()}`;
  floatTotal.textContent = `TWD ${totalAmount.toLocaleString()}`;

  // 綁定刪除按鈕
  document.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index);
      assistList.splice(idx, 1);
      renderAssistList();
    });
  });
}

async function handleSubmitOrder(e) {
  e.preventDefault();
  if (!checkAuth()) return;
  const token = getAuthToken();

  if (assistList.length === 0) {
    alert("請先加入商品！");
    return;
  }

  const warehouseId = document.getElementById("assist-warehouse-select").value;
  if (!warehouseId) {
    alert("請選擇一個集運倉！");
    return;
  }

  const submitBtn = document.getElementById("submit-order-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  try {
    const itemsToSend = assistList.map((item) => ({
      item_url: item.item_url,
      item_name: item.item_name,
      item_spec: item.item_spec,
      price_cny: item.price_cny,
      quantity: item.quantity,
      // [新增] 傳送詳細資訊
      item_image_url: item.item_image_url,
      client_remarks: item.client_remarks,
    }));

    const orderData = {
      paopaoId: document.getElementById("paopao-id").value,
      customerEmail: document.getElementById("customer-email").value,
      payment_method: "OFFLINE_TRANSFER",
      warehouse_id: parseInt(warehouseId, 10),
      items: itemsToSend,
    };

    const response = await fetch(`${API_URL}/orders/assist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "提交失敗");

    // [修改] 成功提示文字
    alert("代購申請已提交！\n請等待管理員審核，審核通過後將通知您付款。");
    window.location.href = "./my-account.html";
  } catch (error) {
    alert(`錯誤: ${error.message}`);
    submitBtn.disabled = false;
    submitBtn.textContent = "提交訂單";
  }
}
