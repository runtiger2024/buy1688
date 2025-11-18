/*
 * 這是 /login.html 和 /register.html (客戶端) 專用的 JS
 */
import { API_URL } from "./config.js"; // <-- 此路徑正確 (在同一層 js 資料夾)

document.addEventListener("DOMContentLoaded", () => {
  // --- 登入邏輯 ---
  const loginForm = document.getElementById("customer-login-form");
  if (loginForm) {
    const loginError = document.getElementById("login-error");
    const loginButton = document.getElementById("login-button");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const paopaoId = document.getElementById("paopao-id").value;
      const phoneNumber = document.getElementById("phone-number").value;

      loginButton.disabled = true;
      loginButton.textContent = "登入中...";
      loginError.textContent = "";

      try {
        const response = await fetch(`${API_URL}/auth/customer-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paopaoId, phoneNumber }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "登入失敗");
        }

        // 登入成功！
        localStorage.setItem("customerToken", data.token);
        localStorage.setItem("customerUser", JSON.stringify(data.customer));

        alert("登入成功！");
        // 【修正】路徑改為 ../html/index.html
        window.location.href = "../html/index.html"; // 導向首頁
      } catch (error) {
        loginError.textContent = error.message;
        loginButton.disabled = false;
        loginButton.textContent = "登入";
      }
    });
  }

  // --- 註冊邏輯 ---
  const registerForm = document.getElementById("customer-register-form");
  if (registerForm) {
    const registerError = document.getElementById("register-error");
    const registerButton = document.getElementById("register-button");

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const paopaoId = document.getElementById("paopao-id").value;
      const phoneNumber = document.getElementById("phone-number").value;
      const email = document.getElementById("email").value;

      registerButton.disabled = true;
      registerButton.textContent = "註冊中...";
      registerError.textContent = "";

      try {
        const response = await fetch(`${API_URL}/auth/customer-register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paopaoId, phoneNumber, email }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "註冊失敗");
        }

        // 註冊成功！
        alert("註冊成功！請使用您的跑跑虎 ID 和手機號碼登入。");
        // 【修正】路徑改為 ../html/login.html
        window.location.href = "../html/login.html"; // 導向登入頁
      } catch (error) {
        registerError.textContent = error.message;
        registerButton.disabled = false;
        registerButton.textContent = "確認註冊";
      }
    });
  }
});
