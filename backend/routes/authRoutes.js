// backend/routes/authRoutes.js
import express from "express";
import Joi from "joi";
import prisma from "../db.js";
import { comparePassword, generateToken, hashPassword } from "../auth.js";
import { sendRegistrationSuccessEmail } from "../emailService.js";
import { authenticateToken, isAdmin } from "../middleware.js";

const router = express.Router();

// --- 管理員/操作員登入 ---
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "請輸入帳號和密碼" });
    }

    const user = await prisma.users.findUnique({
      where: { username: username },
    });

    if (!user) return res.status(404).json({ message: "帳號不存在" });
    if (user.status !== "active")
      return res.status(403).json({ message: "帳號已被停權" });

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "密碼錯誤" });

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// --- 獲取當前用戶資訊 ---
router.get("/me", authenticateToken, (req, res) => {
  res.json(req.user);
});

// --- [新增] 管理員模擬客戶登入 (Impersonate) ---
router.post(
  "/admin/impersonate",
  authenticateToken,
  isAdmin,
  async (req, res, next) => {
    try {
      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ message: "缺少客戶 ID" });

      const customer = await prisma.customers.findUnique({
        where: { id: parseInt(customerId) },
      });

      if (!customer) return res.status(404).json({ message: "找不到該會員" });

      // 生成該客戶的 Token (Role 強制設為 customer)
      const token = generateToken({ ...customer, role: "customer" });

      res.json({
        token,
        customer: {
          id: customer.id,
          paopao_id: customer.paopao_id,
          email: customer.email,
          phone: customer.phone,
          is_vip: customer.is_vip,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// --- 客戶註冊 ---
router.post("/customer-register", async (req, res, next) => {
  const registerSchema = Joi.object({
    paopaoId: Joi.string()
      .min(1)
      .required()
      .messages({ "string.empty": "跑跑虎 ID 為必填" }),
    phoneNumber: Joi.string()
      .pattern(/^09\d{8}$/)
      .required()
      .messages({ "string.pattern.base": "手機號碼格式錯誤" }),
    email: Joi.string()
      .email()
      .required()
      .messages({ "string.email": "Email 格式錯誤" }),
    password: Joi.string()
      .min(6)
      .required()
      .messages({ "string.min": "密碼至少 6 碼" }),
  });

  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const { paopaoId, phoneNumber, email, password } = value;
    const hashedPassword = await hashPassword(password);

    const customer = await prisma.customers.create({
      data: {
        paopao_id: paopaoId,
        password_hash: hashedPassword,
        email: email,
        phone: phoneNumber,
      },
    });

    sendRegistrationSuccessEmail(customer).catch(console.error);
    res.status(201).json({ message: "註冊成功！", customer });
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ message: "此 ID 或 Email 已被註冊" });
    next(err);
  }
});

// --- 客戶登入 ---
router.post("/customer-login", async (req, res, next) => {
  try {
    const { paopaoId, password } = req.body;
    if (!paopaoId || !password)
      return res.status(400).json({ message: "請輸入帳號和密碼" });

    const customer = await prisma.customers.findUnique({
      where: { paopao_id: paopaoId },
    });
    if (!customer) return res.status(404).json({ message: "帳號不存在" });

    const isMatch = await comparePassword(password, customer.password_hash);
    if (!isMatch) return res.status(401).json({ message: "密碼錯誤" });

    const token = generateToken({ ...customer, role: "customer" });

    // [修改] 回傳資料加入 phone 和 is_vip
    res.json({
      token,
      customer: {
        id: customer.id,
        paopao_id: customer.paopao_id,
        email: customer.email,
        phone: customer.phone,
        is_vip: customer.is_vip, // [新增] 確保前端能拿到 VIP 狀態
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
