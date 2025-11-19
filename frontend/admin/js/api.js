// frontend/admin/js/api.js
import { API_URL } from "../../js/config.js";
import { getAuthHeaders } from "./utils.js";

// 統一的 Fetch 處理
async function fetchData(endpoint, options = {}) {
  const headers = getAuthHeaders();
  if (!headers) throw new Error("No Auth");

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP Error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  // 設定
  getSettings: () => fetch(`${API_URL}/settings`).then((res) => res.json()),
  updateSettings: (data) =>
    fetchData("/admin/settings", { method: "PUT", body: JSON.stringify(data) }),

  // 儀表板
  getStats: () => fetchData("/admin/dashboard/stats"),

  // 倉庫
  getWarehouses: () => fetch(`${API_URL}/warehouses`).then((res) => res.json()),
  createWarehouse: (data) =>
    fetchData("/admin/warehouses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWarehouse: (id, data) =>
    fetchData(`/admin/warehouses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // 訂單
  getOrders: (params) => {
    const qs = new URLSearchParams(params).toString();
    return fetchData(`/orders/operator?${qs}`);
  },
  updateOrder: (id, data) =>
    fetchData(`/orders/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // 商品
  getProducts: () => fetch(`${API_URL}/products`).then((res) => res.json()),
  createProduct: (data) =>
    fetchData("/admin/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProduct: (id, data) =>
    fetchData(`/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  archiveProduct: (id) =>
    fetchData(`/admin/products/${id}`, { method: "DELETE" }),

  // 用戶 (Staff)
  getUsers: () => fetchData("/admin/users"),
  createUser: (data) =>
    fetchData("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUserStatus: (id, status) =>
    fetchData(`/admin/users/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  updateUserRole: (id, role) =>
    fetchData(`/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  updateUserPassword: (id, password) =>
    fetchData(`/admin/users/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    }),

  // [新增] 會員 (Customers)
  getCustomers: () => fetchData("/admin/customers"),
  updateCustomer: (id, data) =>
    fetchData(`/admin/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateCustomerPassword: (id, password) =>
    fetchData(`/admin/customers/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    }),

  // 分類
  getCategories: () => fetchData("/admin/categories"),
  createCategory: (data) =>
    fetchData("/admin/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCategory: (id, data) =>
    fetchData(`/admin/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCategory: (id) =>
    fetchData(`/admin/categories/${id}`, { method: "DELETE" }),
};
