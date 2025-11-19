import { API_URL } from "./config.js";

// --- 全域變數 ---
let currentSettings = {
  exchange_rate: 4.5, // 預設值
  service_fee: 0,
};
let assistList = []; // 暫存代購商品
let availableWarehouses = []; // [新增] 存放倉庫資料

// --- 幫助函式 ---

async function loadComponent(componentPath, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) return;
  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error("Component load failed");
    placeholder.innerHTML = await response.text();
  } catch (error) {
    console.error(`載入組件失敗: ${error.message}`);
  }
}

function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem("customerUser"));
  } catch (e) {
    return null;
  }
}

function customerLogout() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customerUser");
  alert("您已成功登出。");
  window.location.href = "./index.html";
}

function setupCustomerAuth() {
  const customer = getCustomer();
  const desktopLinks = document.getElementById("nav-auth-links-desktop");
  const mobileLinks = document.getElementById("nav-auth-links-mobile");
  const footerLinks = document.getElementById("footer-auth-links");

  // 自動填入表單
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

  if (!desktopLinks || !mobileLinks || !footerLinks) return;

  if (customer) {
    const commonLinks = `
      <a href="../html/my-account.html" class="nav-link">我的訂單</a>
      <button id="logout-btn" class="btn-small-delete">登出</button>
    `;
    desktopLinks.innerHTML = commonLinks;
    mobileLinks.innerHTML = commonLinks;

    document.querySelectorAll("#logout-btn").forEach((btn) => {
      btn.addEventListener("click", customerLogout);
    });
    footerLinks.style.display = "none";
  } else {
    desktopLinks.innerHTML = `<a href="../html/login.html" class="nav-link-button">會員登入</a>`;
    mobileLinks.innerHTML = `<a href="../html/login.html" class="nav-link-button">會員登入</a>`;
    footerLinks.style.display = "block";
  }
}

function setupHamburgerMenu() {
  const toggleButton = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("nav-menu");
  if (toggleButton && menu) {
    toggleButton.addEventListener("click", () =>
      menu.classList.toggle("active")
    );
  }
}

// --- 核心邏輯 ---

document.addEventListener("DOMContentLoaded", async () => {
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
});

/**
 * [修改] 載入後台設定與倉庫
 */
async function loadSettingsAndWarehouses() {
  const rateEl = document.getElementById("display-rate");
  const feeEl = document.getElementById("display-fee");
  const selectEl = document.getElementById("assist-warehouse-select");

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

  // 2. 載入倉庫
  if (!selectEl) return;
  try {
    const response = await fetch(`${API_URL}/warehouses`);
    if (!response.ok) throw new Error("載入集運倉失敗");
    // 只保留已啟用的倉庫
    availableWarehouses = (await response.json()).filter((wh) => wh.is_active);

    selectEl.innerHTML = '<option value="">-- 請選擇集運倉 --</option>';
    if (availableWarehouses.length === 0) {
      selectEl.innerHTML = '<option value="">無可用集運倉</option>';
      selectEl.disabled = true;
      return;
    }

    availableWarehouses.forEach((wh) => {
      const option = document.createElement("option");
      option.value = wh.id;
      // 顯示倉庫名稱和地址前段
      option.textContent = `${wh.name} - ${wh.address.substring(0, 15)}...`;
      selectEl.appendChild(option);
    });
  } catch (error) {
    console.error("獲取集運倉失敗:", error);
    selectEl.innerHTML = '<option value="">載入失敗</option>';
    selectEl.disabled = true;
  }
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

  if (priceCny < 0 || quantity < 1) {
    alert("價格與數量必須大於 0");
    return;
  }

  // 試算台幣
  const rawTwd =
    priceCny *
    currentSettings.exchange_rate *
    (1 + currentSettings.service_fee);
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

  document.getElementById("item-url").value = "";
  document.getElementById("item-name").value = "";
  document.getElementById("item-spec").value = "";
  document.getElementById("item-price-cny").value = "";
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
                    ${item.item_url}
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

  if (assistList.length === 0) {
    alert("請先加入商品！");
    return;
  }

  const paopaoId = document.getElementById("paopao-id").value;
  const email = document.getElementById("customer-email").value;
  const paymentMethod = document.querySelector(
    'input[name="payment-method"]:checked'
  ).value;
  const warehouseSelect = document.getElementById("assist-warehouse-select"); // [新增] 獲取倉庫下拉選單
  const warehouseId = warehouseSelect.value; // [新增] 獲取選定的倉庫 ID

  if (!warehouseId) {
    // [新增] 檢查倉庫是否選定
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
      // [新增] 加入 warehouse_id
      warehouse_id: parseInt(warehouseId, 10),
      items: itemsToSend,
    };

    const response = await fetch(`${API_URL}/assist-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();

    if (!response.ok) {
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
