import { verifyToken } from "./auth.js";

/**
 * 基礎的 Token 驗證守衛
 * 檢查 Token 是否存在且有效
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  // Token 格式: "Bearer YOUR_TOKEN_HERE"
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    // 401 Unauthorized (未經授權)
    return res.status(401).json({ message: "錯誤: 缺少 Token" });
  }

  const userPayload = verifyToken(token);

  if (userPayload == null) {
    // 403 Forbidden (禁止) - Token 無效或過期
    return res.status(403).json({ message: "錯誤: Token 無效或已過期" });
  }

  // 驗證通過！將用戶資訊附加到 req 物件上
  // 這樣後面的 API 就可以知道是 "誰" 在操作
  req.user = userPayload;
  next();
}

/**
 * Admin 權限守衛
 * 必須先通過 authenticateToken 才能使用
 */
export function isAdmin(req, res, next) {
  if (req.user && req.user.role === "admin") {
    next(); // 是 Admin，放行
  } else {
    return res.status(403).json({ message: "錯誤: 權限不足 (需要管理員)" });
  }
}

/**
 * Operator 權限守衛
 * (Admin 也算是一種 Operator)
 */
export function isOperator(req, res, next) {
  if (req.user && (req.user.role === "operator" || req.user.role === "admin")) {
    next(); // 是 Operator 或 Admin，放行
  } else {
    return res.status(403).json({ message: "錯誤: 權限不足 (需要操作員)" });
  }
}
