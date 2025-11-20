// frontend/js/my-account.js
import { API_URL } from "./config.js";
import {
  loadComponent,
  setupCustomerAuth,
  setupHamburgerMenu,
  checkAuth,
  getAuthToken,
  getCustomer,
  customerLogout,
  loadCart,
  setupFooter, // [修正] 引入 setupFooter
} from "./sharedUtils.js";

let allOrdersData = [];
let currentTab = "all";
let bankInfo = null;

const STATUS_LABEL = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!checkAuth()) return;

  await loadComponent("../html/_navbar.html", "navbar-placeholder");
  setupHamburgerMenu();
  setupCustomerAuth();
  setupBottomNav();
  setupFooter(); // [修正] 執行 setupFooter

  let cart = {};
  loadCart(cart);
  const count = Object.values(cart).reduce((a, b) => a + b.quantity, 0);
  const badge = document.getElementById("mobile-cart-count");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "block" : "none";
  }

  renderUserProfile();
  await loadBankInfo();
  loadOrders();
  setupTabs();
});

function renderUserProfile() {
  const customer = getCustomer();
  if (!customer) return;

  const idEl = document.getElementById("profile-id");
  const emailEl = document.getElementById("profile-email");
  const phoneEl = document.getElementById("profile-phone");
  const roleEl = document.querySelector(".profile-role");

  if (idEl) idEl.textContent = customer.paopao_id || "未知";
  if (emailEl) emailEl.textContent = customer.email || "-";
  if (phoneEl) phoneEl.textContent = customer.phone || "未設定";

  if (roleEl) {
    if (customer.is_vip) {
      roleEl.textContent = "👑 VIP 會員";
      roleEl.style.background = "linear-gradient(90deg, #FFD700, #FFA500)";
      roleEl.style.color = "#000";
      roleEl.style.fontWeight = "bold";
      roleEl.style.padding = "4px 12px";
      roleEl.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
    } else {
      roleEl.textContent = "一般會員";
      roleEl.style.background = "rgba(0, 0, 0, 0.1)";
      roleEl.style.color = "#fff";
    }
  }

  const logoutBtn = document.getElementById("profile-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      customerLogout();
    });
  }
}

function setupBottomNav() {
  document.getElementById("tab-account")?.classList.add("active");
  const bottomCartBtn = document.getElementById("tab-cart");
  if (bottomCartBtn) {
    bottomCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "./index.html#cart-modal";
    });
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".order-tab-item");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.status;
      renderOrders();
    });
  });
}

async function loadOrders() {
  const container = document.getElementById("order-history-container");
  const headers = getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${API_URL}/orders/my`, { headers });
    if (!response.ok) throw new Error("載入失敗");
    allOrdersData = await response.json();
    renderOrders();
  } catch (error) {
    container.innerHTML = `<p style="text-align:center; color:red;">${error.message}</p>`;
  }
}

function renderOrders() {
  const container = document.getElementById("order-history-container");
  container.innerHTML = "";

  const filteredOrders = allOrdersData.filter((order) => {
    if (currentTab === "all") return true;
    if (currentTab === "UNPAID") return order.payment_status === "UNPAID";
    if (currentTab === "Processing")
      return (
        ["Pending", "Processing"].includes(order.status) &&
        order.payment_status === "PAID"
      );
    if (currentTab === "Shipped")
      return ["Shipped_Internal", "Warehouse_Received"].includes(order.status);
    if (currentTab === "Completed")
      return order.status === "Completed" || order.status === "Cancelled";
    return true;
  });

  if (filteredOrders.length === 0) {
    container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#999;">
                <i class="fas fa-clipboard-list" style="font-size:40px; margin-bottom:10px;"></i>
                <p>沒有此狀態的訂單</p>
            </div>`;
    return;
  }

  filteredOrders.forEach((order) => {
    const statusText = STATUS_LABEL[order.status] || order.status;
    const isUnpaid = order.payment_status === "UNPAID";
    const hasVoucher = !!order.payment_voucher_url;

    const isCancelled = order.status === "Cancelled";

    let typeBadge = "";
    if (order.type === "Assist") {
      typeBadge = `<span style="background:#17a2b8; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-left:8px; font-weight:normal;">代購商品</span>`;
    } else if (order.recipient_address) {
      typeBadge = `<span style="background:#ff5000; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-left:8px; font-weight:normal;">台灣直購</span>`;
    } else {
      typeBadge = `<span style="background:#6c757d; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-left:8px; font-weight:normal;">一般商品</span>`;
    }

    const itemsHtml = order.items
      .slice(0, 2)
      .map(
        (item) => `
            <div class="order-item">
                <div class="item-name">
                    ${item.snapshot_name}
                    ${
                      item.item_spec
                        ? `<br><small style="color:#999;">規格: ${item.item_spec}</small>`
                        : ""
                    }
                </div>
                <div class="item-qty">x${item.quantity}</div>
            </div>
        `
      )
      .join("");

    const moreItemsHtml =
      order.items.length > 2
        ? `<div style="font-size:0.8rem; color:#999; margin-top:5px;">...還有 ${
            order.items.length - 2
          } 項商品</div>`
        : "";

    let actionsHtml = "";
    let hiddenAreaHtml = "";

    if (isCancelled) {
      actionsHtml = `<button class="btn-action" onclick="window.location.href='order-share.html?token=${order.share_token}'">查看詳情</button>`;
    } else if (isUnpaid) {
      const bankBtn = `<button class="btn-action" onclick="copyBankInfo('${order.id}', '${order.total_amount_twd}')">複製匯款資訊</button>`;
      if (hasVoucher) {
        actionsHtml = `${bankBtn} <button class="btn-action" onclick="toggleVoucherForm('${order.id}')">查看已傳憑證</button>`;
        let imgDisplay = "";
        if (order.payment_voucher_url.startsWith("data:image")) {
          imgDisplay = `<img src="${order.payment_voucher_url}" style="max-width:100%; border-radius:4px; margin-top:10px;">`;
        } else {
          imgDisplay = `<a href="${order.payment_voucher_url}" target="_blank" style="color:#007bff; text-decoration:underline;">點擊查看憑證圖片</a>`;
        }
        hiddenAreaHtml = `
                    <div id="voucher-area-${order.id}" style="display:none; padding:15px; border-top:1px dashed #eee; background:#f0fff4;">
                        <p style="color:#28a745; font-weight:bold; margin:0;"><i class="fas fa-check-circle"></i> 憑證已上傳成功！</p>
                        ${imgDisplay}
                    </div>
                `;
      } else {
        actionsHtml = `${bankBtn} <button class="btn-action solid" onclick="toggleVoucherForm('${order.id}')">上傳憑證</button>`;
        hiddenAreaHtml = `
                    <div id="voucher-area-${order.id}" style="display:none; padding:15px; border-top:1px dashed #eee; background:#fafafa;">
                        <form onsubmit="window.handleVoucherUpload(event, '${order.id}')">
                            <p style="margin:0 0 5px 0; font-size:0.9rem;">上傳匯款憑證 (請選擇圖片):</p>
                            <input type="file" id="voucher-file-${order.id}" accept="image/*" required style="font-size:0.9rem; width:100%; margin-bottom:10px;">
                            <button type="submit" class="btn-action solid" style="width:100%;">確認上傳</button>
                            <div class="voucher-status" style="font-size:0.8rem; margin-top:5px; color:#666;"></div>
                        </form>
                    </div>
                `;
      }
    } else {
      actionsHtml = `<button class="btn-action" onclick="window.location.href='order-share.html?token=${order.share_token}'">查看詳情</button>`;
    }

    const cardStyle = isCancelled
      ? "background-color: #f2f2f2; opacity: 0.7;"
      : "";
    const statusColor = isCancelled
      ? "color: #dc3545;"
      : "color: var(--taobao-orange);";

    const card = document.createElement("div");
    card.className = "order-card";
    if (isCancelled) card.setAttribute("style", cardStyle);

    card.innerHTML = `
            <div class="order-card-header" ${
              isCancelled ? 'style="background-color: #e9e9e9;"' : ""
            }>
                <span class="order-id">訂單號 ${order.id} ${typeBadge}</span>
                <span class="order-status" style="${statusColor} font-weight:bold;">
                    ${isCancelled ? '<i class="fas fa-ban"></i> ' : ""}${
      isUnpaid && !isCancelled ? "待付款" : statusText
    }
                </span>
            </div>
            <div class="order-card-body" onclick="window.location.href='order-share.html?token=${
              order.share_token
            }'" style="cursor:pointer;">
                ${itemsHtml}
                ${moreItemsHtml}
            </div>
            <div class="order-card-footer" ${
              isCancelled ? 'style="background-color: #e9e9e9;"' : ""
            }>
                <div class="order-total-price">
                    <small>總計</small> TWD ${order.total_amount_twd}
                </div>
                <div class="order-actions">
                    ${actionsHtml}
                </div>
            </div>
            ${hiddenAreaHtml}
        `;
    container.appendChild(card);
  });
}

window.toggleVoucherForm = function (id) {
  const area = document.getElementById(`voucher-area-${id}`);
  if (area) {
    area.style.display = area.style.display === "none" ? "block" : "none";
  }
};

function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) return null;
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
    }
  } catch (error) {
    console.error(error);
  }
}

window.copyBankInfo = function (orderId, amount) {
  if (!bankInfo) return alert("讀取銀行資訊失敗");
  const text = `
【匯款資訊】
訂單: #${orderId}
金額: ${amount}
銀行: ${bankInfo.bank_name}
帳號: ${bankInfo.bank_account}
戶名: ${bankInfo.bank_account_name}
    `.trim();
  navigator.clipboard.writeText(text).then(() => alert("匯款資訊已複製！"));
};

window.handleVoucherUpload = function (e, orderId) {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const form = e.target;
  const fileInput = form.querySelector('input[type="file"]');
  const statusDiv = form.querySelector(".voucher-status");
  const btn = form.querySelector("button");

  const file = fileInput.files[0];
  if (!file) return alert("請選擇檔案");

  if (file.size > 5 * 1024 * 1024) {
    return alert("檔案過大，請選擇小於 5MB 的圖片");
  }

  btn.disabled = true;
  btn.textContent = "上傳中...";

  const reader = new FileReader();
  reader.onload = async function (event) {
    const base64String = event.target.result;
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/voucher`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ voucherUrl: base64String }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.message || "上傳失敗");
      }

      alert("憑證上傳成功！");
      loadOrders();
    } catch (error) {
      statusDiv.textContent = `錯誤: ${error.message}`;
      btn.disabled = false;
      btn.textContent = "確認上傳";
    }
  };
  reader.readAsDataURL(file);
};
