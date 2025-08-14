const Product = require("../models/Product");

exports.createProduct = async (req, res) => {
  try {
    const { name , stocks } = req.body;

    const product = new Product({
      name,
      stocks,
      createdByClient: req.user.id
    });

    await product.save();
    res.status(201).json({ message: "Product created", product });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Product already exists for this client" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find({ createdByClient: req.user.id });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message })
  }

}

exports.updateProducts = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, stocks } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && product.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this product" });
    }

    if (name) product.name = name;
    if (typeof stocks === "number" && stocks >= 0) product.stocks = stocks; // ✅ Update stocks only if valid

    await product.save();
    res.status(200).json({ message: "Product updated", product });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate product details" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.deleteProducts = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Party not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && product.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this product" });
    }

    await product.deleteOne();
    res.status(200).json({ message: "product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};




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

    // fetch only this client's products
    const ids = [...qtyById.keys()];
    const products = await Product.find({
      _id: { $in: ids },
      createdByClient: req.user.id,
    });

    // existence & authorization checks
    const productMap = new Map(products.map(p => [String(p._id), p]));
    for (const id of ids) {
      if (!productMap.has(id)) {
        return res.status(404).json({ message: `Product not found or unauthorized: ${id}` });
      }
    }

    // compute new stocks and validate (no negative results)
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

    res.json({
      message: "Stock updated",
      updated: products.map(p => ({ id: p._id, name: p.name, stocks: p.stocks })),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
