/*
 * 這是 /admin/login.html 專用的 JS
 */

// 【修正】路徑改為 ../../js/config.js
import { API_URL } from "../../js/config.js";

document.addEventListener("DOMContentLoaded", () => {
  // 檢查是否已登入，如果
  // 是，直接導向儀表板
  if (localStorage.getItem("adminToken")) {
    // 【修正】路徑改為 ../html/index.html
    window.location.href = "../html/index.html";
    return;
  }

  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginButton = document.getElementById("login-button");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // 防止表單跳轉

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    // 簡易 UI 處理
    loginButton.disabled = true;
    loginButton.textContent = "登入中...";
    loginError.textContent = "";

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 登入失敗 (例如 401, 404)
        throw new Error(data.message || "登入失敗");
      }

      // 登入成功！
      // 1. 將 Token 和用戶資訊存到 localStorage
      localStorage.setItem("adminToken", data.token);
      localStorage.setItem("adminUser", JSON.stringify(data.user));

      // 2. 導向儀表板主頁
      // 【修正】路徑改為 ../html/index.html
      window.location.href = "../html/index.html";
    } catch (error) {
      // 顯示錯誤
      loginError.textContent = error.message;
      loginButton.disabled = false;
      loginButton.textContent = "登入";
    }
  });
});
