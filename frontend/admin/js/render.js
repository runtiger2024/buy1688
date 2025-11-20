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
    tbody.innerHTML =
      '<tr><td colspan="12" class="text-center">沒有符合條件的訂單。</td></tr>';
    return;
  }

  orders.forEach((order) => {
    const tr = document.createElement("tr");
    const costCny = Number(order.total_cost_cny);
    const profitTwd = order.total_amount_twd - costCny * exchangeRate;
    const profitClass = profitTwd >= 0 ? "text-success" : "text-danger";

    // 操作員顯示 (純文字)
    const assignedTo = order.operator_name
      ? `<br><small style="color:#666;">(${order.operator_name})</small>`
      : `<br><small style="color:#ccc;">(未指派)</small>`;

    // 倉庫/寄送資訊 (簡化顯示)
    let warehouseInfoHtml = "";
    if (order.recipient_address) {
      // 直購
      warehouseInfoHtml = `<span class="badge badge-warning">直寄</span>`;
    } else {
      // 集運
      const warehouseName =
        order.warehouse_name || '<span style="color:#dc3545">未選擇</span>';
      // 只保留一個小小的複製按鈕
      const copyBtn = order.warehouse_name
        ? `<i class="fas fa-copy" style="cursor:pointer; color:#17a2b8; margin-left:5px;" 
              onclick="copyShippingInfo('${order.paopao_id}', ${order.warehouse_id})" 
              title="複製倉庫地址"></i>`
        : "";
      warehouseInfoHtml = `${warehouseName} ${copyBtn}`;
    }

    // 憑證狀態 (簡化顯示)
    let voucherIcon = "";
    if (order.payment_status === "PENDING_REVIEW") {
      voucherIcon = `<span class="badge badge-warning">審核中</span>`;
    } else if (order.payment_voucher_url) {
      voucherIcon = `<a href="${order.payment_voucher_url}" target="_blank" title="查看憑證"><i class="fas fa-file-invoice-dollar" style="color:#28a745; font-size:1.2rem;"></i></a>`;
    } else {
      voucherIcon = `<span style="color:#ccc;">-</span>`;
    }

    // 物流單號 (簡化顯示，不放 Input)
    let trackingHtml = order.domestic_tracking_number
      ? `<a href="https://www.baidu.com/s?wd=${order.domestic_tracking_number}" target="_blank" style="font-family:monospace;">${order.domestic_tracking_number}</a>`
      : `<span style="color:#ccc;">未填寫</span>`;

    // 狀態標籤樣式
    let statusBadgeClass = "badge-secondary";
    if (order.status === "Pending") statusBadgeClass = "badge-warning";
    if (order.status === "Processing" || order.status === "Shipped_Internal")
      statusBadgeClass = "badge-info";
    if (order.status === "Completed" || order.status === "Warehouse_Received")
      statusBadgeClass = "badge-success";
    if (order.status === "Cancelled") statusBadgeClass = "badge-danger";

    // 付款標籤樣式
    let paymentBadgeClass = "badge-secondary";
    if (order.payment_status === "PAID") paymentBadgeClass = "badge-success";
    if (order.payment_status === "UNPAID") paymentBadgeClass = "badge-danger";
    if (order.payment_status === "PENDING_REVIEW")
      paymentBadgeClass = "badge-warning";

    // 訂單類型顏色
    const typeColor = order.type === "Assist" ? "#17a2b8" : "#6c757d";
    const typeName = ORDER_TYPE_MAP[order.type] || "一般商城";

    tr.innerHTML = `
            <td>#${order.id}</td>
            <td><span style="color:${typeColor}; font-weight:bold; font-size:0.85rem;">${typeName}</span></td>
            <td><small>${new Date(
              order.created_at
            ).toLocaleString()}</small></td>
            <td>${order.paopao_id}</td>
            <td>NT$ ${Number(order.total_amount_twd).toLocaleString()}</td>
            <td class="${profitClass}" style="font-weight:bold;">${profitTwd.toFixed(
      0
    )}</td>
            <td>${warehouseInfoHtml}</td>
            <td class="text-center">${voucherIcon}</td>
            <td>${trackingHtml}</td>
            <td>
                <span class="badge ${statusBadgeClass}">${
      ORDER_STATUS_MAP[order.status] || order.status
    }</span>
                ${assignedTo}
            </td>
            <td>
                <span class="badge ${paymentBadgeClass}">${
      PAYMENT_STATUS_MAP[order.payment_status] || order.payment_status
    }</span>
            </td>
            <td>
                <button class="btn btn-primary btn-small btn-view-order" data-id="${
                  order.id
                }">
                    <i class="fas fa-edit"></i> 管理
                </button>
            </td>
        `;

    tbody.appendChild(tr);
  });

  // 綁定「查看/管理」按鈕事件 (由 admin.js 處理)
  document.querySelectorAll(".btn-view-order").forEach((btn) => {
    btn.addEventListener("click", () => {
      // 這裡不需動作，讓 admin.js 的事件委派或後續處理邏輯去處理
    });
  });
}

// ... (renderProducts) ...

export function renderProducts(products, tbody) {
  tbody.innerHTML = "";
  if (products.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center">目前沒有商品。</td></tr>';
    return;
  }
  products.forEach((product) => {
    const tr = document.createElement("tr");
    const imgUrl =
      product.images && product.images.length > 0 ? product.images[0] : "";
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius:4px;">`
      : `<span style="color:#ccc; font-size:0.8rem;">無圖</span>`;

    const directTag = product.is_direct_buy
      ? '<br><span class="badge badge-warning" style="font-size:0.65rem; padding:2px 4px;">直購</span>'
      : "";

    tr.innerHTML = `
            <td>${product.id}</td>
            <td>${imgHtml}</td>
            <td>
                <div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${product.name}
                </div>
                ${directTag}
            </td>
            <td>${product.category ? product.category.name : "-"}</td>
            <td>${product.price_twd}</td>
            <td>${Number(product.cost_cny).toFixed(2)}</td>
            <td>
                <button class="btn btn-small btn-primary btn-edit-product" data-id="${
                  product.id
                }"><i class="fas fa-edit"></i></button>
                <button class="btn btn-small btn-danger btn-delete-product" data-id="${
                  product.id
                }"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// [核心修改] renderUsers 函數：新增彈性權限顯示邏輯
export function renderUsers(users, tbody, currentUser) {
  tbody.innerHTML = "";
  if (users.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">目前沒有其他用戶。</td></tr>';
    return;
  }
  users.forEach((user) => {
    const tr = document.createElement("tr");
    const isSelf = currentUser && currentUser.id === user.id;
    const isUserActive = user.status === "active";

    // --- 權限標籤邏輯 ---
    let permissionTags = [];
    if (user.role === "admin") {
      permissionTags.push(
        '<span class="badge badge-info" style="font-size:0.75rem; background:#17a2b8;">管理員</span>'
      );
    }
    // Operator 才會顯示彈性權限 (Admin 預設擁有，不需要重複顯示)
    if (user.role === "operator") {
      if (user.can_manage_products)
        permissionTags.push(
          '<span class="badge badge-secondary" style="font-size:0.75rem; background:#6c757d; color:white;">商品管理</span>'
        );
      if (user.can_manage_finance)
        permissionTags.push(
          '<span class="badge badge-secondary" style="font-size:0.75rem; background:#ffc107; color:#333;">財務設定</span>'
        );
    }
    const permissionHtml = permissionTags.join(" ");

    // --- 角色下拉選單邏輯 ---
    let roleHtml = "";
    if (isSelf) {
      // 自己的角色不可修改
      roleHtml = `<span class="badge badge-info">${
        user.role === "admin" ? "管理員" : "操作員"
      } (自己)</span>`;
    } else {
      // 其他用戶的角色可修改
      roleHtml = `<select class="user-role-select form-control-sm" data-id="${
        user.id
      }" style="padding:2px; font-size:0.9rem;">
            <option value="operator" ${
              user.role === "operator" ? "selected" : ""
            }>操作員</option>
            <option value="admin" ${
              user.role === "admin" ? "selected" : ""
            }>管理員</option>
         </select>`;
    }

    // --- 狀態按鈕邏輯 ---
    const toggleButtonHtml = isSelf
      ? '<span class="text-muted">-</span>'
      : `
        <button class="btn btn-small btn-primary btn-edit-user" data-id="${
          user.id
        }">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-small ${
          isUserActive ? "btn-danger" : "btn-success"
        } btn-toggle-status" 
                data-id="${user.id}" data-new-status="${
          isUserActive ? "inactive" : "active"
        }">
            ${
              isUserActive
                ? '<i class="fas fa-ban"></i>'
                : '<i class="fas fa-check"></i>'
            }
        </button>
    `;

    tr.innerHTML = `
            <td>${user.id}</td>
            <td>
                <strong>${user.username}</strong>
                <div style="font-size:0.8rem; color:#6c757d;">${
                  user.email || "-"
                }</div>
                <div style="margin-top:5px;">${permissionHtml}</div>
            </td>
            <td>${roleHtml}</td>
            <td>
                <small>${user.receive_notifications ? "開啟" : "關閉"}</small>
            </td>
            <td>
                <span class="badge ${
                  isUserActive ? "badge-success" : "badge-danger"
                }">${isUserActive ? "正常" : "停權"}</span>
            </td>
            <td>
                ${toggleButtonHtml}
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// ... (renderWarehouses) ...
export function renderWarehouses(warehousesArray, tbody) {
  tbody.innerHTML = "";
  if (warehousesArray.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">目前沒有倉庫資料。</td></tr>';
    return;
  }
  warehousesArray.forEach((wh) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${wh.id}</td>
            <td>${wh.name}</td>
            <td>${wh.receiver}<br><small>${wh.phone}</small></td>
            <td><div style="max-width:200px; font-size:0.8rem;">${
              wh.address
            }</div></td>
            <td>${
              wh.is_active
                ? '<span class="badge badge-success">啟用</span>'
                : '<span class="badge badge-secondary">停用</span>'
            }</td>
            <td><button class="btn btn-small btn-primary btn-edit-wh" data-id="${
              wh.id
            }"><i class="fas fa-edit"></i></button></td>
        `;
    tbody.appendChild(tr);
  });
}

// ... (renderCategories) ...
export function renderCategories(categories, tbody) {
  tbody.innerHTML = "";
  if (categories.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center">目前沒有分類。</td></tr>';
    return;
  }
  categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${cat.id}</td>
            <td>${cat.name}</td>
            <td>${cat.description || "-"}</td>
            <td>
                <button class="btn btn-small btn-primary btn-edit-category" data-id="${
                  cat.id
                }"><i class="fas fa-edit"></i></button>
                <button class="btn btn-small btn-danger btn-delete-category" data-id="${
                  cat.id
                }"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// ... (renderCustomers) ...
export function renderCustomers(customers, tbody) {
  tbody.innerHTML = "";
  if (customers.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">無會員資料</td></tr>';
    return;
  }
  customers.forEach((c) => {
    const vipBadge = c.is_vip
      ? '<span class="badge" style="background:gold; color:#333; margin-left:5px;">VIP</span>'
      : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
              <td>${c.id}</td>
              <td>${c.paopao_id} ${vipBadge}</td>
              <td>${c.email}</td>
              <td>${c.phone || "-"}</td>
              <td>${new Date(c.created_at).toLocaleDateString()}</td>
              <td>
                  <button class="btn btn-small btn-primary btn-edit-customer" data-id="${
                    c.id
                  }"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-small btn-warning btn-impersonate" data-id="${
                    c.id
                  }" title="登入此會員的前台"><i class="fas fa-user-secret"></i></button>
              </td>
          `;
    tbody.appendChild(tr);
  });

  // 綁定模擬登入事件
  document.querySelectorAll(".btn-impersonate").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("確定要登入此客戶的帳號嗎？\n這將會開啟一個新的前台視窗。")) {
        if (window.impersonateUser) window.impersonateUser(btn.dataset.id);
      }
    });
  });
}
