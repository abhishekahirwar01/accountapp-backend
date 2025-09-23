const Product = require("../models/Product");
const Unit = require("../models/Unit");
const { getFromCache, setToCache, deleteFromCache } = require('../RedisCache');

const ensureUnitExists = async (unitName, clientId, userId) => {
  const standardUnits = ["Piece", "Kg", "Litre", "Box", "Meter", "Dozen", "Pack"];
  if (standardUnits.includes(unitName)) return;

  try {
    await Unit.findOneAndUpdate(
      { name: unitName, createdByClient: clientId },
      { name: unitName, createdByClient: clientId, createdByUser: userId },
      { upsert: true, new: true }
    );
    // Invalidate units cache
    const unitsCacheKey = `units:client:${clientId}`;
    await deleteFromCache(unitsCacheKey);
  } catch (err) {
    console.error("Error ensuring unit exists:", err);
  }
};

// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const { name, stocks, unit } = req.body;

    // ✅ ALWAYS use tenant from token and also track the actor
    const product = await Product.create({
      name,
      stocks,
      unit,
      createdByClient: req.auth.clientId, // tenant id
      createdByUser:   req.auth.userId,   // who created it
    });

    // Ensure custom unit is saved
    await ensureUnitExists(unit, req.auth.clientId, req.auth.userId);

    // Invalidate cache for products list
    const productsCacheKey = `products:client:${req.auth.clientId}`;
    // await deleteFromCache(productsCacheKey);

    return res.status(201).json({ message: "Product created", product });
  } catch (err) {
    if (err.code === 11000) {
      // because of compound unique {createdByClient, name}
      return res.status(400).json({ message: "Product already exists for this client" });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    // ✅ scope by tenant
    const clientId = req.auth.clientId;
    const cacheKey = `products:client:${clientId}`;

    // Check cache first
    // const cached = await getFromCache(cacheKey);
    // if (cached) {
    //   res.set('X-Cache', 'HIT');
    //   res.set('X-Cache-Key', cacheKey);
    //   return res.json(cached);
    // }

    const products = await Product.find({ createdByClient: clientId })
      .sort({ createdAt: -1 })
      .lean();

    // Cache the result
    // await setToCache(cacheKey, products);
    // res.set('X-Cache', 'MISS');
    // res.set('X-Cache-Key', cacheKey);

    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/products/:id
exports.updateProducts = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, stocks, unit } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ authorize by tenant (optionally allow privileged roles)
    const sameTenant = product.createdByClient.toString() === req.auth.clientId;
    const privileged = ["master", "client", "admin"].includes(req.auth.role);
    if (!sameTenant && !privileged) {
      return res.status(403).json({ message: "Not authorized to update this product" });
    }

    if (name) product.name = name;
    if (typeof stocks === "number" && stocks >= 0) product.stocks = stocks;
    if (unit) product.unit = unit;

    await product.save();

    // Ensure custom unit is saved
    if (unit) await ensureUnitExists(unit, req.auth.clientId, req.auth.userId);

    // Invalidate cache for products list
    const productsCacheKey = `products:client:${req.auth.clientId}`;
    // await deleteFromCache(productsCacheKey);

    return res.status(200).json({ message: "Product updated", product });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate product details" });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/products/:id
exports.deleteProducts = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ authorize by tenant (optionally allow privileged roles)
    const sameTenant = product.createdByClient.toString() === req.auth.clientId;
    const privileged = ["master", "client", "admin"].includes(req.auth.role);
    if (!sameTenant && !privileged) {
      return res.status(403).json({ message: "Not authorized to delete this product" });
    }

    await product.deleteOne();

    // Invalidate cache for products list
    const productsCacheKey = `products:client:${req.auth.clientId}`;
    // await deleteFromCache(productsCacheKey);

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/products/update-stock-bulk
exports.updateStockBulk = async (req, res) => {
  try {
    const { items = [], action = "decrease" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items array is required." });
    }

    // merge duplicate lines and normalize keys
    const qtyById = new Map();
    for (const raw of items) {
      const productId = String(raw.product || raw.productId || "");
      const qty = Number(raw.quantity);
      if (!productId || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: "Each item needs product id and positive quantity." });
      }
      qtyById.set(productId, (qtyById.get(productId) || 0) + qty);
    }

    // ✅ fetch only this tenant's products
    const ids = [...qtyById.keys()];
    const products = await Product.find({
      _id: { $in: ids },
      createdByClient: req.auth.clientId,
    });

    // ensure all requested ids belong to this tenant
    const productMap = new Map(products.map(p => [String(p._id), p]));
    for (const id of ids) {
      if (!productMap.has(id)) {
        return res.status(404).json({ message: `Product not found or unauthorized: ${id}` });
      }
    }

    // compute new stocks and validate (no negatives)
    const sign = action === "increase" ? 1 : -1;
    for (const [id, qty] of qtyById.entries()) {
      const p = productMap.get(id);
      const current = Number(p.stocks || 0);
      const next = current + sign * qty;
      if (next < 0) {
        return res.status(400).json({
          message: `Insufficient stock for "${p.name}". Available: ${current}, requested: ${qty}`,
        });
      }
      p.stocks = next;
    }

    // persist with bulkWrite
    const ops = products.map(p => ({
      updateOne: { filter: { _id: p._id }, update: { $set: { stocks: p.stocks } } },
    }));
    await Product.bulkWrite(ops, { ordered: true });

    // Invalidate cache for products list
    const productsCacheKey = `products:client:${req.auth.clientId}`;
    // await deleteFromCache(productsCacheKey);

    return res.json({
      message: "Stock updated",
      updated: products.map(p => ({ id: p._id, name: p.name, stocks: p.stocks })),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.importProductsFromFile = async (req, res) => {
  const file = req.file;  // File uploaded using multer

  if (!file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Validate and format the data
    const products = jsonData.map((item) => ({
      name: item["Item Name"],
      stocks: item["Stock"],
      unit: item["Unit"],
    }));

    // Check if product already exists
    for (const product of products) {
      const existingProduct = await Product.findOne({ name: product.name, createdByClient: req.auth.clientId });

      if (existingProduct) {
        return res.status(400).json({
          message: `Product ${product.name} already exists. Please update it instead of creating new.`,
        });
      }

      // Save new product
      await Product.create({
        name: product.name,
        stocks: product.stocks,
        unit: product.unit,
        createdByClient: req.auth.clientId, // Add the client ID for multi-tenancy
        createdByUser: req.auth.userId, // Add the user ID
      });
    }

    return res.status(200).json({ message: "Products imported successfully." });
  } catch (error) {
    console.error("Error importing products:", error);
    res.status(500).json({ message: "Error importing products.", error: error.message });
  }
};
