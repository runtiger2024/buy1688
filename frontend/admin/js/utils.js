// frontend/admin/js/utils.js

// 複製文字到剪貼簿
export function copyToClipboard(text, message) {
  navigator.clipboard
    .writeText(text.trim())
    .then(() => {
      alert(message || "已複製到剪貼簿！");
    })
    .catch((err) => {
      console.error("複製失敗:", err);
      alert("複製失敗，請手動複製內容。");
    });
}

// 認證相關
export function getToken() {
  return localStorage.getItem("adminToken");
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("adminUser"));
  } catch (e) {
    return null;
  }
}

export function checkAuth() {
  if (!getToken()) {
    alert("請先登入");
    window.location.href = "../html/login.html";
    return false;
  }
  return true;
}

export function getAuthHeaders() {
  const token = getToken();
  if (!token) {
    console.error("Token not found");
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function logout() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.location.href = "../html/login.html";
}
