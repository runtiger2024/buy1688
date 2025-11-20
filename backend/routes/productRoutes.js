// backend/routes/productRoutes.js
import express from "express";
import Joi from "joi";
import prisma from "../db.js";
import { authenticateToken, isAdmin } from "../middleware.js";

const router = express.Router();

// 公開：獲取商品列表 (給前台用，不含成本)
router.get("/", async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const whereClause = { is_archived: false };

    if (category && !isNaN(parseInt(category))) {
      whereClause.category_id = parseInt(category);
    }
    if (search) {
      whereClause.name = { contains: search, mode: "insensitive" };
    }

    const products = await prisma.products.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        images: true,
        specs: true,
        price_twd: true,
        is_direct_buy: true,
        // [注意] 這裡故意不回傳 cost_cny
      },
      orderBy: { created_at: "desc" },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// [新增] Admin 專用：獲取完整商品列表 (含成本、分類資訊)
router.get("/manage", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const products = await prisma.products.findMany({
      where: { is_archived: false },
      include: {
        category: true, // 包含分類關聯，且預設會回傳所有欄位 (包含 cost_cny)
      },
      orderBy: { created_at: "desc" },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// 公開：獲取單一商品
router.get("/:id", async (req, res, next) => {
  try {
    const product = await prisma.products.findFirst({
      where: { id: parseInt(req.params.id), is_archived: false },
      include: { category: { select: { name: true } } },
    });
    if (!product) return res.status(404).json({ message: "找不到商品" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Admin：新增商品
router.post("/", authenticateToken, isAdmin, async (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow(null, ""),
    price_twd: Joi.number().integer().min(0).required(),
    cost_cny: Joi.number().min(0).required(),
    images: Joi.array().items(Joi.string().uri()).default([]),
    specs: Joi.array().items(Joi.string()).default([]),
    category_id: Joi.number().integer().allow(null),
    is_direct_buy: Joi.boolean().default(false),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const newProduct = await prisma.products.create({
      data: {
        ...value,
        category_id: value.category_id ? parseInt(value.category_id) : null,
      },
    });
    res.status(201).json(newProduct);
  } catch (err) {
    next(err);
  }
});

// Admin：更新商品
router.put("/:id", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const {
      name,
      description,
      price_twd,
      cost_cny,
      images,
      specs,
      category_id,
      is_direct_buy,
    } = req.body;

    const updated = await prisma.products.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        description,
        images: images || [],
        specs: specs || [],
        price_twd: parseInt(price_twd),
        cost_cny: parseFloat(cost_cny),
        category_id: category_id ? parseInt(category_id) : null,
        is_direct_buy: is_direct_buy === true || is_direct_buy === "true",
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Admin：封存商品
router.delete("/:id", authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const archived = await prisma.products.update({
      where: { id: parseInt(req.params.id) },
      data: { is_archived: true },
    });
    res.json({ message: "商品已封存", product: archived });
  } catch (err) {
    next(err);
  }
});

export default router;
