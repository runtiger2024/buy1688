// backend/emailService.js
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const SITE_NAME = process.env.SITE_NAME || "代採購平台";
const SITE_URL = process.env.SITE_URL || "http://localhost:5500/frontend/html"; // [新增] 網站 URL

let isSendGridActive = false;

if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  isSendGridActive = true;
  console.log("✅ Email 服務 (SendGrid) 已啟用。");
} else {
  console.warn(
    "⚠️ Email 服務未啟用。請在 .env 中設定 SENDGRID_API_KEY 和 SENDGRID_FROM_EMAIL"
  );
}

/**
 * 統一的 Email 寄送函數
 * @param {string} to - 收件者 Email
 * @param {string} subject - 信件主旨
 * @param {string} html - 信件內容 (HTML 格式)
 */
async function sendEmail(to, subject, html) {
  if (!isSendGridActive) {
    console.log(`(Email 模擬寄送至 ${to}): ${subject}`);
    return Promise.resolve(); // 返回一個 resolved Promise
  }

  const msg = {
    to: to,
    from: {
      name: SITE_NAME,
      email: SENDGRID_FROM_EMAIL,
    },
    subject: `【${SITE_NAME}】 ${subject}`,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log(`Email 已成功寄送至 ${to}`);
  } catch (error) {
    console.error("Email 寄送失敗:", error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
}

// --- 模板 1：客戶註冊成功 ---
export async function sendRegistrationSuccessEmail(customer) {
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

// --- 模板 4：管理員更新訂單狀態 (例如：已發貨、已入倉) ---
export async function sendOrderStatusUpdateEmail(order) {
  const subject = `您的訂單 #${order.id} 狀態已更新為：${order.status}`;

  // ✅ 新增：追蹤碼資訊
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
