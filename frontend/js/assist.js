import { API_URL } from "./config.js";

// --- 全域變數 ---
let currentSettings = {
  exchange_rate: 4.5, // 預設值
  service_fee: 0,
};
let assistList = []; // 暫存代購商品

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

  loadSettings();

  document
    .getElementById("assist-add-form")
    .addEventListener("submit", handleAddItem);
  document
    .getElementById("assist-submit-form")
    .addEventListener("submit", handleSubmitOrder);
});

/**
 * 載入後台設定
 */
async function loadSettings() {
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
      document.getElementById("display-rate").textContent =
        currentSettings.exchange_rate;
      const feePercent = (currentSettings.service_fee * 100).toFixed(0);
      document.getElementById("display-fee").textContent = `${feePercent}%`;
    }
  } catch (error) {
    console.error("載入設定失敗:", error);
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
            <td><a href="${
              item.item_url
            }" target="_blank" style="font-size:0.8rem;">連結</a></td>
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

  const submitBtn = document.getElementById("submit-order-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  try {
    // 【第十六批優化：過濾掉前端專用的 id 和 estimated_twd 欄位】
    // 這解決了 "items[0].id is not allowed" 錯誤
    const itemsToSend = assistList.map((item) => ({
      item_url: item.item_url,
      item_name: item.item_name,
      item_spec: item.item_spec,
      price_cny: item.price_cny,
      quantity: item.quantity,
    }));
    // 【優化結束】

    const orderData = {
      paopaoId: paopaoId,
      customerEmail: email,
      payment_method: paymentMethod,
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

    alert(
      `訂單提交成功！\n訂單編號：${result.order.id}\n請查看您的 Email 獲取匯款資訊。`
    );

    assistList = [];
    renderAssistList();
  } catch (error) {
    console.error("Error:", error);
    alert(`錯誤: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "確認提交代購單";
  }
}
