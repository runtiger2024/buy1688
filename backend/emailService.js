// backend/emailService.js
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import prisma from "./db.js"; // 引入 prisma 用於查詢設定

dotenv.config();

const SITE_NAME = process.env.SITE_NAME || "代採購平台";
const SITE_URL = process.env.SITE_URL || "http://localhost:5500/frontend/html";

/**
 * 獲取有效的 Email 設定 (優先查 DB)
 */
async function getEmailConfig() {
  // 1. 查詢資料庫
  const settings = await prisma.systemSettings.findMany({
    where: { key: { in: ["email_api_key", "email_from_email"] } },
  });
  const config = {};
  settings.forEach((s) => (config[s.key] = s.value));

  // 2. DB 有值則使用，否則使用 .env
  const apiKey = config.email_api_key || process.env.SENDGRID_API_KEY;
  const fromEmail = config.email_from_email || process.env.SENDGRID_FROM_EMAIL;

  return { apiKey, fromEmail };
}

/**
 * [新增] 檢查特定通知是否開啟
 */
async function isNotificationEnabled(key) {
  try {
    const setting = await prisma.systemSettings.findUnique({
      where: { key: key },
    });
    // 預設為 true (找不到設定時預設開啟)
    if (!setting) return true;
    return setting.value === "true";
  } catch (error) {
    console.error(`檢查通知開關失敗 (${key}):`, error);
    return true; // 發生錯誤時預設開啟，避免漏信
  }
}

/**
 * 統一的 Email 寄送函數
 */
async function sendEmail(to, subject, html, bcc = null) {
  const { apiKey, fromEmail } = await getEmailConfig();

  if (!apiKey || !fromEmail) {
    console.log(`(模擬 Email 至 ${to}): ${subject}`);
    console.warn("⚠️ Email 未發送：未設定 API Key 或寄件者");
    return;
  }

  sgMail.setApiKey(apiKey);

  const msg = {
    to: to,
    from: {
      name: SITE_NAME,
      email: fromEmail,
    },
    subject: `【${SITE_NAME}】 ${subject}`,
    html: html,
  };

  if (bcc) {
    msg.bcc = bcc;
  }

  try {
    await sgMail.send(msg);
    console.log(`Email 已成功寄送至 ${to} (BCC: ${bcc ? bcc.length : 0})`);
  } catch (error) {
    console.error("Email 寄送失敗:", error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
}

// --- 模板 1：客戶註冊成功 ---
export async function sendRegistrationSuccessEmail(customer) {
  // [新增] 檢查開關
  if (!(await isNotificationEnabled("enable_email_register"))) {
    console.log("🔕 系統設定已關閉「註冊通知」，跳過發送。");
    return;
  }

  const subject = "歡迎加入！您的帳戶已成功建立";
  const html = `
    <h1>歡迎, ${customer.paopao_id}！</h1>
    <p>感謝您註冊 ${SITE_NAME}。</p>
    <p>您的帳號：${customer.paopao_id}</p>
    <p>您的密碼：(請用您註冊時設定的密碼登入)</p> <p>您可以隨時前往 <a href="${SITE_URL}/login.html">登入</a> 並開始購物。</p>
  `;

  await sendEmail(customer.email, subject, html);
}

// --- 模板 2：客戶建立訂單 (線下轉帳) ---
export async function sendOrderConfirmationEmail(order, payment_details) {
  // [新增] 檢查開關
  if (!(await isNotificationEnabled("enable_email_order"))) {
    console.log("🔕 系統設定已關閉「訂單建立通知」，跳過發送。");
    return;
  }

  const subject = `您的訂單 #${order.id} 已成功建立 (待付款)`;

  // 產生商品列表
  const itemsHtml = order.items
    .map(
      (item) =>
        `<li>${item.snapshot_name} (TWD ${item.snapshot_price_twd} x ${item.quantity})</li>`
    )
    .join("");

  // 產生匯款資訊
  const paymentHtml = payment_details
    ? `
        <hr>
        <h3>匯款資訊 (請盡快完成)</h3>
        <p style="font-size: 1.1em; background: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
${payment_details.note}
        </p>
    `
    : "";

  const html = `
        <h1>訂單 #${order.id} 待付款</h1>
        <p>嗨, ${order.paopao_id}！</p>
        <p>您的訂單已成功建立，總金額為 <strong>TWD ${order.total_amount_twd}</strong>。</p>
        
        <h3>訂單詳情</h3>
        <ul>
            ${itemsHtml}
        </ul>
        
        ${paymentHtml}
        
        <p style="margin-top: 20px;">
            您可以隨時前往「<a href="${SITE_URL}/my-account.html">我的訂單</a>」頁面查看訂單狀態。
        </p>
    `;

  await sendEmail(order.customer_email, subject, html);
}

// --- 模板 3：管理員確認收到款項 ---
export async function sendPaymentReceivedEmail(order) {
  // [新增] 檢查開關
  if (!(await isNotificationEnabled("enable_email_payment"))) {
    console.log("🔕 系統設定已關閉「收款確認通知」，跳過發送。");
    return;
  }

  const subject = `您的訂單 #${order.id} 已確認付款`;
  const html = `
        <h1>訂單 #${order.id} 已確認付款</h1>
        <p>嗨, ${order.paopao_id}！</p>
        <p>我們已確認收到您 TWD ${order.total_amount_twd} 的款項。</p>
        <p>訂單狀態已更新為「${order.status}」，我們將盡快為您安排採購。</p>
        <p>您可以隨時前往「<a href="${SITE_URL}/my-account.html">我的訂單</a>」頁面查看最新狀態。</p>
    `;

  await sendEmail(order.customer_email, subject, html);
}

// --- 模板 4：管理員更新訂單狀態 ---
export async function sendOrderStatusUpdateEmail(order) {
  // [新增] 檢查開關
  if (!(await isNotificationEnabled("enable_email_status"))) {
    console.log("🔕 系統設定已關閉「狀態更新通知」，跳過發送。");
    return;
  }

  const subject = `您的訂單 #${order.id} 狀態已更新為：${order.status}`;

  let trackingHtml = "";
  if (order.status === "Shipped_Internal" && order.domestic_tracking_number) {
    trackingHtml = `
            <p><strong>大陸境內物流單號：</strong> ${order.domestic_tracking_number}</p>
            <p style="color:#d32f2f;">請注意：貨物已發往集運倉，此單號僅供大陸境內查詢，請登入您的跑跑虎集運APP追蹤後續國際運單。</p>
        `;
  }

  const html = `
        <h1>訂單 #${order.id} 狀態更新</h1>
        <p>嗨, ${order.paopao_id}！</p>
        <p>您的訂單狀態已更新為： <strong>${order.status}</strong></p>

        ${trackingHtml}

        ${
          order.notes
            ? `<p><strong>操作員備註：</strong> ${order.notes}</p>`
            : ""
        }

        <p>您可以隨時前往「<a href="${SITE_URL}/my-account.html">我的訂單</a>」頁面查看最新狀態。</p>
    `;

  await sendEmail(order.customer_email, subject, html);
}

// --- 模板 5：新訂單通知 (給工作人員) ---
// [注意] 此通知由 "Users.receive_notifications" 控制，不受 SystemSettings 開關影響
export async function sendNewOrderNotificationToStaff(order, staffEmails) {
  if (!staffEmails || staffEmails.length === 0) return;

  const subject = `【新訂單通知】 #${order.id} (金額: $${order.total_amount_twd})`;

  // 簡單的商品摘要
  const itemsSummary = order.items
    .map((i) => `- ${i.snapshot_name} x${i.quantity}`)
    .join("<br>");

  // 注意：這裡的連結假設 admin 位於 ../admin/html/index.html 相對路徑
  const adminUrl =
    process.env.ADMIN_URL || `${SITE_URL}/../admin/html/index.html`;

  const html = `
    <h2>🔔 新訂單通知</h2>
    <p>有一筆新的訂單已提交，請盡快處理。</p>
    <hr>
    <ul>
        <li><strong>訂單編號：</strong> <a href="${adminUrl}">${order.id}</a></li>
        <li><strong>客戶 ID：</strong> ${order.paopao_id}</li>
        <li><strong>總金額：</strong> TWD ${order.total_amount_twd}</li>
        <li><strong>訂單類型：</strong> ${order.type}</li>
    </ul>
    <p><strong>商品摘要：</strong></p>
    <p>${itemsSummary}</p>
    <hr>
    <p>此為系統自動發送，請勿回覆。</p>
  `;

  const { apiKey, fromEmail } = await getEmailConfig();
  if (!apiKey || !fromEmail) return;

  sgMail.setApiKey(apiKey);

  const msg = {
    to: fromEmail, // 主收件人為系統信箱
    bcc: staffEmails, // 密件副本發送給所有開啟通知的管理員
    from: { name: SITE_NAME, email: fromEmail },
    subject: subject,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log(`工作人員通知信已發送至 ${staffEmails.length} 位管理員`);
  } catch (error) {
    console.error("工作人員通知信發送失敗:", error);
  }
}
