/*
 * 這是 /html/login.html 和 /html/register.html (客戶端) 專用的 JS
 */
import { API_URL } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  // ==============================
  // 1. 會員登入邏輯
  // ==============================
  const loginForm = document.getElementById("customer-login-form");
  if (loginForm) {
    const loginError = document.getElementById("login-error");
    const loginButton = document.getElementById("login-button");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // 獲取欄位值
      const paopaoId = document.getElementById("paopao-id").value.trim();
      const password = document.getElementById("password").value.trim();

      // 基礎驗證
      if (!paopaoId || !password) {
        loginError.textContent = "請輸入帳號與密碼";
        return;
      }

      // UI 鎖定
      loginButton.disabled = true;
      loginButton.textContent = "登入中...";
      loginError.textContent = "";

      try {
        // 發送請求
        const response = await fetch(`${API_URL}/auth/customer-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paopaoId, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "登入失敗");
        }

        // 登入成功：儲存 Token 與使用者資訊
        localStorage.setItem("customerToken", data.token);
        localStorage.setItem("customerUser", JSON.stringify(data.customer));

        alert("登入成功！");
        // 導向首頁
        window.location.href = "../html/index.html";
      } catch (error) {
        console.error("Login Error:", error);
        loginError.textContent = error.message;
        loginButton.disabled = false;
        loginButton.textContent = "登入";
      }
    });
  }

  // ==============================
  // 2. 會員註冊邏輯
  // ==============================
  const registerForm = document.getElementById("customer-register-form");
  if (registerForm) {
    const registerError = document.getElementById("register-error");
    const registerButton = document.getElementById("register-button");

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const paopaoId = document.getElementById("paopao-id").value.trim();
      const phoneNumber = document.getElementById("phone-number").value.trim();
      const email = document.getElementById("email").value.trim();
      // 註冊頁面必須要有 id="password" 的輸入框
      const passwordInput = document.getElementById("password");
      const password = passwordInput ? passwordInput.value : "";

      if (!password) {
        registerError.textContent = "請填寫密碼";
        return;
      }

      registerButton.disabled = true;
      registerButton.textContent = "註冊中...";
      registerError.textContent = "";

      try {
        const response = await fetch(`${API_URL}/auth/customer-register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paopaoId, phoneNumber, email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "註冊失敗");
        }

        alert("註冊成功！請使用您的跑跑虎 ID 和剛設定的密碼登入。");
        window.location.href = "../html/login.html";
      } catch (error) {
        console.error("Register Error:", error);
        registerError.textContent = error.message;
        registerButton.disabled = false;
        registerButton.textContent = "確認註冊";
      }
    });
  }
});
