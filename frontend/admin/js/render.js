// frontend/admin/js/render.js
import {
  ORDER_STATUS_MAP,
  PAYMENT_STATUS_MAP,
  ORDER_TYPE_MAP,
} from "./constants.js";

export function renderOrders(
  orders,
  tbody,
  availableOperators,
  exchangeRate,
  userRole
) {
  tbody.innerHTML = "";
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12">沒有符合條件的訂單。</td></tr>';
    return;
  }

  const operatorOptions = availableOperators
    .map((op) => `<option value="${op.id}">${op.username}</option>`)
    .join("");

  orders.forEach((order) => {
    const tr = document.createElement("tr");
    const costCny = Number(order.total_cost_cny);
    const profitTwd = order.total_amount_twd - costCny * exchangeRate;
    const profitClass = profitTwd >= 0 ? "profit-positive" : "profit-negative";
    const assignedTo = order.operator_name
      ? ` (指派給: ${order.operator_name})`
      : " (未指派)";

    // [新增] 顯示直購收件資訊
    let locationHtml = "";
    let trackingLabel = "大陸物流單號";

    if (order.recipient_address) {
      locationHtml = `
         <div style="font-size:0.85rem; line-height:1.4;">
            <span class="badge badge-warning">直寄</span><br>
            <strong>${order.recipient_name}</strong><br>
            ${order.recipient_phone}<br>
            ${order.recipient_address}
         </div>`;
      trackingLabel = "台灣物流單號";
    } else {
      const warehouseName =
        order.warehouse_name || '<span style="color:#dc3545">未選擇</span>';
      const copyBtn = order.warehouse_name
        ? `<button class="btn btn-primary btn-copy-shipping" 
                   data-paopao-id="${order.paopao_id}" 
                   data-warehouse-id="${order.warehouse_id}"
                   style="margin-top: 5px; font-size:0.7rem; padding:2px 6px;">📋 複製</button>`
        : "";
      locationHtml = `<strong>${warehouseName}</strong><br>${copyBtn}`;
    }

    // [新增] 審核狀態按鈕
    let voucherContent = "無";
    if (order.payment_status === "PENDING_REVIEW") {
      voucherContent = `<button class="btn btn-success btn-approve-order" data-id="${order.id}" style="font-size:0.8rem;">✅ 通過審核</button>`;
    } else if (order.payment_voucher_url) {
      voucherContent = `<button class="btn-link btn-view-voucher" data-id="${order.id}" style="color: #28a745; font-weight: bold; border: none; background: none; cursor: pointer; text-decoration: underline;">查看憑證</button>`;
    } else if (order.payment_status === "UNPAID") {
      voucherContent = '<span style="color:#dc3545;">待上傳</span>';
    }

    let trackingInputHtml = order.domestic_tracking_number
      ? `<a href="https://www.baidu.com/s?wd=${order.domestic_tracking_number}" target="_blank">${order.domestic_tracking_number}</a>`
      : "無";

    if (
      order.payment_status === "PAID" &&
      (order.status === "Processing" || order.status === "Shipped_Internal")
    ) {
      trackingInputHtml = `
            <div style="display:flex; flex-direction:column; gap:2px;">
                <small style="color:#666;">${trackingLabel}</small>
                <div style="display:flex; align-items:center; gap:5px;">
                    <input type="text" class="tracking-input" value="${
                      order.domestic_tracking_number || ""
                    }" placeholder="單號" style="width:100px; padding:4px;">
                    <button class="btn btn-primary btn-save-tracking" data-id="${
                      order.id
                    }" style="padding:4px 8px; font-size:0.8rem;">存</button>
                </div>
            </div>`;
    }

    // [新增] 商品詳細資訊預覽
    let productPreview = "";
    if (order.items && order.items.length > 0) {
      productPreview = `<div style="font-size:0.8rem; color:#666; max-width:200px;">`;
      order.items.slice(0, 3).forEach((item) => {
        const remark = item.client_remarks
          ? `<span style="color:#d63384;">(註)</span>`
          : "";
        const img = item.item_image_url
          ? `<a href="${item.item_image_url}" target="_blank" title="查看圖片">📷</a>`
          : "";
        productPreview += `<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">• ${item.snapshot_name} ${remark} ${img}</div>`;
      });
      if (order.items.length > 3)
        productPreview += `...共${order.items.length}項`;
      productPreview += `</div>`;
    }

    tr.innerHTML = `
            <td>${order.id}</td>
            <td>
                <span style="color: ${
                  order.type === "Assist" ? "blue" : "gray"
                }; font-weight: bold;">${
      ORDER_TYPE_MAP[order.type] || "一般商城"
    }</span>
                ${productPreview}
            </td>
            <td>${new Date(order.created_at).toLocaleString()}</td>
            <td>${order.paopao_id}</td>
            <td>${Number(order.total_amount_twd).toLocaleString("en-US")}</td>
            <td class="${profitClass}">${profitTwd.toFixed(0)}</td>
            <td>${locationHtml}</td>
            <td>${voucherContent}</td>
            <td>${trackingInputHtml}</td>
            <td><span class="status-${order.status}">${
      ORDER_STATUS_MAP[order.status] || order.status
    }</span><br><small>${assignedTo}</small></td>
            <td><span class="status-${order.payment_status}">${
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status
    }</span><br><small>(${order.payment_method || "N/A"})</small></td>
            <td>
                ${
                  order.payment_status === "UNPAID"
                    ? `<button class="btn btn-update btn-mark-paid" data-id="${order.id}">標記已付</button>`
                    : ""
                }
                <select class="order-status-select" data-id="${order.id}">
                    ${Object.keys(ORDER_STATUS_MAP)
                      .map(
                        (key) =>
                          `<option value="${key}" ${
                            order.status === key ? "selected" : ""
                          }>${ORDER_STATUS_MAP[key]}</option>`
                      )
                      .join("")}
                </select>
                <select class="order-operator-select" data-id="${
                  order.id
                }" data-role="admin">
                    <option value="">-- 指派給 --</option>
                    ${operatorOptions}
                </select>
            </td>
        `;

    if (order.operator_id)
      tr.querySelector(".order-operator-select").value = order.operator_id;
    if (userRole !== "admin") {
      const opSelect = tr.querySelector(".order-operator-select");
      if (opSelect) opSelect.style.display = "none";
    }
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".btn-approve-order").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.approveOrder) window.approveOrder(btn.dataset.id);
    });
  });
}

// ... (Other render functions) ...
export function renderProducts(products, tbody) {
  tbody.innerHTML = "";
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">目前沒有商品。</td></tr>';
    return;
  }
  products.forEach((product) => {
    const tr = document.createElement("tr");
    const imgUrl =
      product.images && product.images.length > 0 ? product.images[0] : "";
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover;">`
      : "無圖片";
    const directTag = product.is_direct_buy
      ? '<br><span class="badge badge-warning" style="font-size:0.7rem">直購</span>'
      : "";

    tr.innerHTML = `
            <td>${product.id}</td>
            <td>${imgHtml}</td>
            <td>${product.name} ${directTag}</td>
            <td>${product.price_twd}</td>
            <td>${product.cost_cny}</td>
            <td>
                <button class="btn btn-edit" data-id="${product.id}">編輯</button>
                <button class="btn btn-delete" data-id="${product.id}">封存</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

export function renderUsers(users, tbody, currentUser) {
  tbody.innerHTML = "";
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">目前沒有其他用戶。</td></tr>';
    return;
  }
  users.forEach((user) => {
    const tr = document.createElement("tr");
    const isSelf = currentUser && currentUser.id === user.id;
    const isUserActive = user.status === "active";
    const roleCellContent = isSelf
      ? user.role === "admin"
        ? "管理員 (自己)"
        : "操作員 (自己)"
      : `<select class="user-role-select" data-id="${
          user.id
        }"><option value="operator" ${
          user.role === "operator" ? "selected" : ""
        }>操作員</option><option value="admin" ${
          user.role === "admin" ? "selected" : ""
        }>管理員</option></select>`;

    tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${roleCellContent}</td>
            <td><span class="${
              isUserActive ? "status-active" : "status-inactive"
            }">${isUserActive ? "啟用中" : "已停權"}</span></td>
            <td>${
              !isSelf
                ? `<button class="btn ${
                    isUserActive ? "btn-delete" : "btn-update"
                  } btn-toggle-status" data-id="${user.id}" data-new-status="${
                    isUserActive ? "inactive" : "active"
                  }">${isUserActive ? "停權" : "啟用"}</button>`
                : '<span style="color:#ccc">不可操作</span>'
            }</td>
        `;
    tbody.appendChild(tr);
  });
}

export function renderWarehouses(warehousesArray, tbody) {
  tbody.innerHTML = "";
  if (warehousesArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">目前沒有倉庫資料。</td></tr>';
    return;
  }
  warehousesArray.forEach((wh) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${wh.id}</td><td>${wh.name}</td><td><small>${
      wh.address
    }</small></td><td>${
      wh.is_active
        ? '<span class="status-active">啟用</span>'
        : '<span class="status-inactive">停用</span>'
    }</td><td><button class="btn btn-edit btn-edit-warehouse" data-id="${
      wh.id
    }">編輯</button></td>`;
    tbody.appendChild(tr);
  });
}

export function renderCategories(categories, tbody) {
  tbody.innerHTML = "";
  if (categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">目前沒有分類。</td></tr>';
    return;
  }
  categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${cat.id}</td><td>${cat.name}</td><td>${
      cat.description || ""
    }</td><td><button class="btn btn-edit btn-edit-category" data-id="${
      cat.id
    }">編輯</button><button class="btn btn-delete btn-delete-category" data-id="${
      cat.id
    }">刪除</button></td>`;
    tbody.appendChild(tr);
  });
}
