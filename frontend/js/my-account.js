// frontend/js/my-account.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  getCustomer,
  checkAuth,
  getAuthToken,
} from "./sharedUtils.js";

let allOrdersData = [];
let bankInfo = null;

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

// 獲取 API 請求的標頭 (包含客戶 Token)
function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) {
    console.error("Token not found");
    checkAuth();
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function loadBankInfo() {
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      const settings = await response.json();
      bankInfo = {
        bank_name: settings.bank_name || "未設定",
        bank_account: settings.bank_account || "未設定",
        bank_account_name: settings.bank_account_name || "未設定",
      };
    } else {
      console.error("無法載入銀行設定");
    }
  } catch (error) {
    console.error("載入銀行資訊失敗:", error);
  }
}

window.copyBankInfo = function (orderId, totalAmount) {
  if (
    !bankInfo ||
    !bankInfo.bank_account ||
    bankInfo.bank_account === "未設定"
  ) {
    alert("無法複製：銀行資訊尚未設定。");
    return;
  }

  const textToCopy = `
【匯款資訊】
訂單編號: #${orderId}
應付金額: TWD ${totalAmount}
銀行: ${bankInfo.bank_name}
帳號: ${bankInfo.bank_account}
戶名: ${bankInfo.bank_account_name}

請完成匯款後聯繫客服，謝謝！
`.trim();

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      alert("✅ 銀行及訂單資訊已複製到剪貼簿！");
    })
    .catch((err) => {
      console.error("複製失敗:", err);
      alert("複製失敗，請手動複製內容。");
    });
};

// [憑證上傳邏輯] 轉 Base64 並上傳
window.handleVoucherUpload = function (e, orderId) {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const form = e.target.closest("form");
  const voucherFileInput = form.querySelector(`#voucher-file-${orderId}`);
  const uploadButton = form.querySelector('button[type="submit"]');
  const statusDiv = form.querySelector(".voucher-status");

  const file = voucherFileInput.files[0];

  if (!file) {
    alert("請選擇一個檔案。");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("檔案過大！請上傳小於 5MB 的圖片。");
    return;
  }

  uploadButton.disabled = true;
  uploadButton.textContent = "處理中...";
  statusDiv.textContent = "正在讀取圖片...";

  const reader = new FileReader();

  reader.onload = async function (event) {
    const base64String = event.target.result;

    statusDiv.textContent = "正在上傳...";

    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/voucher`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ voucherUrl: base64String }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "憑證提交失敗");
      }

      alert("上傳成功！管理員將盡快為您對帳。");
      loadOrders();
    } catch (error) {
      statusDiv.textContent = `錯誤: ${error.message}`;
      console.error("上傳失敗:", error);
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = "確認上傳憑證";
    }
  };

  reader.onerror = function () {
    alert("讀取檔案失敗，請重試。");
    uploadButton.disabled = false;
    uploadButton.textContent = "確認上傳憑證";
  };

  reader.readAsDataURL(file);
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) {
    return;
  }

  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();

  const navCartLink = document.getElementById("nav-cart-link");
  if (navCartLink) {
    navCartLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html";
    });
  }

  loadComponent("../html/_header.html", "notice-placeholder");
  await loadBankInfo();
  loadOrders();
});

async function loadOrders() {
  const container = document.getElementById("order-history-container");
  const headers = getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${API_URL}/orders/my`, { headers });

    if (response.status === 401 || response.status === 403) {
      throw new Error("驗證失敗，請重新登入");
    }
    if (!response.ok) {
      throw new Error("載入訂單失敗");
    }

    allOrdersData = await response.json();
    renderOrders(allOrdersData);
    setupOrderDetailsToggle();
  } catch (error) {
    console.error("載入訂單失敗:", error);
    container.innerHTML = `<p style="color:red;">${error.message}。 <a href="../html/login.html">點此重新登入</a></p>`;
  }
}

function setupOrderDetailsToggle() {
  const container = document.getElementById("order-history-container");

  container.addEventListener("click", (e) => {
    const button = e.target.closest(".btn-detail");
    if (!button) return;

    const orderId = button.dataset.id;
    const detailContent = document.getElementById(`detail-${orderId}`);

    if (detailContent.style.display === "block") {
      detailContent.style.display = "none";
      button.textContent = "訂單詳情";
    } else {
      if (!detailContent.querySelector(".order-detail-expanded")) {
        const order = allOrdersData.find((o) => o.id == orderId);
        if (order) {
          detailContent.innerHTML = renderOrderDetailContent(order);
          const form = detailContent.querySelector(`#voucher-form-${orderId}`);
          if (form) {
            form.addEventListener("submit", (e) =>
              window.handleVoucherUpload(e, orderId)
            );
          }
        }
      }
      detailContent.style.display = "block";
      button.textContent = "隱藏詳情";
    }
  });
}

function renderOrderDetailContent(order) {
  const itemsHtml = order.items
    .map(
      (item) => `
            <tr>
                <td>${item.snapshot_name}</td>
                <td>TWD ${item.snapshot_price_twd}</td>
                <td>${item.quantity}</td>
                <td>TWD ${item.snapshot_price_twd * item.quantity}</td>
            </tr>
        `
    )
    .join("");

  const itemTable = `
        <h3>商品清單</h3>
        <table class="detail-item-table">
            <thead>
                <tr>
                    <th>名稱</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th>小計</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
    `;

  // [修改] 顯示物流資訊區塊
  let trackingInfoHtml = "";
  if (order.domestic_tracking_number) {
    trackingInfoHtml = `
            <div class="bank-info-box" style="border-left: 5px solid #17a2b8; background-color: #e3f2fd;">
                <h4 style="color: #17a2b8; margin-top:0;">🚚 大陸境內物流資訊</h4>
                <div class="bank-row">
                    <span class="bank-label">物流單號:</span>
                    <span class="bank-value" style="font-size: 1.2em; font-weight: bold;">
                        ${order.domestic_tracking_number}
                    </span>
                </div>
                <p style="font-size: 0.9em; color: #666; margin-bottom: 0;">
                    * 此單號為發往「跑跑虎集運倉」的大陸境內快遞單號。<br>
                    * 請您複製此單號，登入「跑跑虎集運 APP」進行包裹預報。
                </p>
                <button onclick="navigator.clipboard.writeText('${order.domestic_tracking_number}').then(()=>alert('單號已複製！'))" style="margin-top:10px; padding:5px 10px; cursor:pointer;">
                    複製單號
                </button>
            </div>
        `;
  }

  let bankInfoHtml = "";
  let uploadSection = "";
  const hasVoucher = order.payment_voucher_url;

  if (order.payment_status === "UNPAID") {
    if (bankInfo && bankInfo.bank_account !== "未設定") {
      bankInfoHtml = `
                <div class="bank-info-box">
                    <h4>💵 待付款項資訊 (請複製匯款)</h4>
                    <div class="bank-row">
                        <span>應付總額:</span>
                        <span style="font-weight: bold; color: var(--taobao-orange);">TWD ${order.total_amount_twd}</span>
                    </div>
                    <div class="bank-row">
                        <span>收款銀行/代碼:</span>
                        <span style="font-weight: bold;">${bankInfo.bank_name}</span>
                    </div>
                    <div class="bank-row">
                        <span>銀行帳號:</span>
                        <span class="bank-value">
                            <span id="bank-acc-${order.id}">${bankInfo.bank_account}</span>
                            <button onclick="copyBankInfo(${order.id}, ${order.total_amount_twd})">一鍵複製</button>
                        </span>
                    </div>
                    <div class="bank-row" style="border-bottom: none;">
                        <span>戶名:</span>
                        <span style="font-weight: bold;">${bankInfo.bank_account_name}</span>
                    </div>
                </div>
            `;
    } else {
      bankInfoHtml = `<p style="margin-top: 10px; color: #dc3545; font-weight: bold;">後台尚未設定收款銀行資訊，請聯繫客服確認匯款。</p>`;
    }

    if (hasVoucher) {
      const isBase64 = hasVoucher.startsWith("data:image");
      const linkContent = isBase64
        ? `<img src="${hasVoucher}" style="max-width: 200px; border: 1px solid #ddd; border-radius: 4px;" alt="憑證預覽">`
        : `<a href="${hasVoucher}" target="_blank">查看憑證連結</a>`;

      uploadSection = `
                <div style="margin-bottom: 20px;">
                    <h4>已上傳憑證狀態</h4>
                    <div class="voucher-status uploaded">✅ 憑證已上傳，等待管理員對帳中。</div>
                    <div style="margin-top: 10px;">${linkContent}</div>
                </div>
            `;
    } else {
      uploadSection = `
                <div id="voucher-upload-form" style="margin-bottom: 20px;">
                    <h4>上傳匯款憑證 (從裝置選擇檔案)</h4>
                    <form id="voucher-form-${order.id}">
                        <input type="file" id="voucher-file-${order.id}" accept="image/*" required />
                        <button type="submit" style="margin-top: 10px;">確認上傳憑證</button>
                        <div class="voucher-status" style="margin-top: 5px;"></div>
                    </form>
                </div>
            `;
    }
  } else if (order.payment_status === "PAID") {
    uploadSection = `<p style="margin-top: 10px; color: #28a745; font-weight: bold;">✅ 訂單已付款，感謝您的支持。</p>`;
    if (hasVoucher) {
      const isBase64 = hasVoucher.startsWith("data:image");
      const linkContent = isBase64
        ? `<button onclick="const w=window.open();w.document.write('<img src=\\'${hasVoucher}\\' style=\\'width:100%\\'>');">查看憑證</button>`
        : `<a href="${hasVoucher}" target="_blank">(查看憑證)</a>`;
      uploadSection += `<p>${linkContent}</p>`;
    }
  }

  return `
        <div class="order-detail-expanded">
            ${trackingInfoHtml}
            ${bankInfoHtml}
            ${uploadSection}
            ${itemTable}
        </div>
    `;
}

function renderOrders(orders) {
  const container = document.getElementById("order-history-container");
  if (!orders || orders.length === 0) {
    container.innerHTML = "<p>您目前沒有任何訂單。</p>";
    return;
  }

  container.innerHTML = "";

  orders.forEach((order) => {
    const paymentStatusClass = `status-${order.payment_status}`;
    const orderStatusClass = `status-${order.status}`;

    const paymentStatusText =
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status;
    const orderStatusText = ORDER_STATUS_MAP[order.status] || order.status;

    const orderCard = document.createElement("div");
    orderCard.className = "order-card";
    orderCard.innerHTML = `
        <div class="order-card-header">
            <div style="flex-grow: 1;">
                <strong>訂單編號: ${order.id}</strong>
                <small>${new Date(order.created_at).toLocaleString()}</small>
            </div>
            <div class="order-total">
                TWD ${order.total_amount_twd}
            </div>
            <button class="btn-action btn-detail" data-id="${
              order.id
            }">訂單詳情</button>
        </div>
        <div class="order-card-body">
            <div class="order-status-tags">
                <span class="tag ${orderStatusClass}">${orderStatusText}</span>
                <span class="tag ${paymentStatusClass}">${paymentStatusText}</span>
            </div>
            <ul class="order-item-list">
                ${order.items
                  .slice(0, 2)
                  .map(
                    (item) => `
                    <li class="order-item">
                        <span class="item-name">${item.snapshot_name}</span>
                        <span class="item-details">
                            TWD ${item.snapshot_price_twd} x ${item.quantity}
                        </span>
                    </li>
                `
                  )
                  .join("")}
                ${
                  order.items.length > 2
                    ? `<li class="order-item" style="color:var(--text-light); border-bottom: none;">... 還有 ${
                        order.items.length - 2
                      } 項商品</li>`
                    : ""
                }
                ${
                  order.items.length === 0
                    ? `<li class="order-item" style="color:var(--text-light); border-bottom: none;">無商品資料</li>`
                    : ""
                }
            </ul>
        </div>
        <div id="detail-${order.id}" style="display:none;">
            </div>
    `;
    container.appendChild(orderCard);
  });
}
