// frontend/admin/js/constants.js

export const ORDER_STATUS_MAP = {
  Pending: "待處理",
  Processing: "採購中",
  Shipped_Internal: "已發貨 (往集運倉)",
  Warehouse_Received: "已入倉",
  Completed: "已完成",
  Cancelled: "已取消",
};

export const PAYMENT_STATUS_MAP = {
  UNPAID: "待付款",
  PAID: "已付款",
};

export const ORDER_TYPE_MAP = {
  Standard: "一般商城",
  Assist: "代客採購",
};
