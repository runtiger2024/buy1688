// frontend/js/orderShare.js
import { API_URL } from "./config.js";
import { loadComponent } from "./sharedUtils.js";

// 載入 Navbar
loadComponent("./_navbar.html", "navbar-placeholder");

// 複製純文字功能
window.copyText = (elementId) => {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => alert("已複製！"));
};

// 複製整筆訂單摘要
window.copyOrderSummary = () => {
  const id = document.getElementById("order-id").textContent;
  const total = document.getElementById("order-total").textContent;
  // 移除多餘的換行
  const text = `您好，我已下單匯款。\n訂單編號：${id}\n金額：TWD ${total}\n請協助確認，謝謝！`;
  navigator.clipboard
    .writeText(text)
    .then(() => alert("訂單摘要已複製！\n請點擊右側按鈕開啟 LINE 貼上發送。"));
};

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    alert("無效的訂單連結");
    window.location.href = "./index.html";
    return;
  }

  try {
    const response = await fetch(`${API_URL}/orders/share/${token}`);
    if (!response.ok) throw new Error("找不到訂單資料");
    const order = await response.json();

    // 填入基本資料
    document.getElementById("order-total").textContent = order.total_amount_twd;
    document.getElementById("table-total").textContent = order.total_amount_twd;
    document.getElementById("order-id").textContent = order.id;

    // 填入銀行資料
    if (order.bank_info) {
      document.getElementById("bank-name").textContent =
        order.bank_info.bank_name || "未設定";
      document.getElementById("bank-account").textContent =
        order.bank_info.bank_account || "未設定";
      document.getElementById("bank-account-name").textContent =
        order.bank_info.bank_account_name || "未設定";
    }

    // 填入詳細商品表格
    const tbody = document.getElementById("order-items-tbody");
    tbody.innerHTML = "";

    order.items.forEach((item) => {
      const tr = document.createElement("tr");

      // 處理連結顯示
      let linkHtml = "-";
      if (item.item_url) {
        // 使用更短的連結文字
        linkHtml = `<a href="${item.item_url}" target="_blank" class="item-link" title="${item.item_url}">連結</a>`;
      }

      // 處理規格顯示
      const specHtml = item.item_spec
        ? `<span class="spec-tag">${item.item_spec}</span>`
        : '<span style="color:#ccc">無</span>';

      const subtotal = item.snapshot_price_twd * item.quantity;

      tr.innerHTML = `
                        <td>${item.snapshot_name}</td>
                        <td>${specHtml}</td>
                        <td>${linkHtml}</td>
                        <td class="text-right">${item.snapshot_price_twd}</td>
                        <td class="text-right">${item.quantity}</td>
                        <td class="text-right">${subtotal}</td>
                    `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    document.querySelector(".share-container").innerHTML =
      '<p style="text-align:center; color:red; padding: 50px;">無法載入訂單資訊，請確認連結是否正確或聯繫客服。</p>';
  }
});
