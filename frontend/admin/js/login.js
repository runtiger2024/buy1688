/*
 * 這是 /admin/html/login.html 專用的 JS
 */

import { API_URL } from "../../js/config.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. 檢查是否已登入，如果是，直接導向儀表板
  const token = localStorage.getItem("adminToken");
  if (token) {
    window.location.href = "../html/index.html";
    return;
  }

  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginButton = document.getElementById("login-button");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // 防止表單跳轉

      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();

      if (!username || !password) {
        loginError.textContent = "請輸入帳號與密碼";
        return;
      }

      // UI 處理
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
        window.location.href = "../html/index.html";
      } catch (error) {
        // 顯示錯誤
        console.error("Admin Login Error:", error);
        loginError.textContent = error.message;
        loginButton.disabled = false;
        loginButton.textContent = "登入";
      }
    });
  }
});
