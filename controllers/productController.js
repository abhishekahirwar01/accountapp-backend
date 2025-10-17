const Product = require("../models/Product");
const Unit = require("../models/Unit");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");


// Build message text per action
function buildProductNotificationMessage(action, { actorName, productName }) {
  const pName = productName || "Unknown Product";
  switch (action) {
    case "create":
      return `New product created by ${actorName}: ${pName}`;
    case "update":
      return `Product updated by ${actorName}: ${pName}`;
    case "delete":
      return `Product deleted by ${actorName}: ${pName}`;
    default:
      return `Product ${action} by ${actorName}: ${pName}`;
  }
}

// Unified notifier for product module
async function notifyAdminOnProductAction({ req, action, productName, entryId }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser();
  if (!adminUser) {
    console.warn("notifyAdminOnProductAction: no admin user found");
    return;
  }

  const message = buildProductNotificationMessage(action, {
    actorName: actor.name,
    productName,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "product", // entry type / category
    entryId, // product id
    req.auth.clientId
  );
}

// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const { name, stocks, unit, hsn } = req.body;

    // console.log('Creating product:', { name, stocks, unit, clientId: req.auth.clientId });

    // Check if product already exists for this client
    const existingProduct = await Product.findOne({
      name: name.trim(),
      createdByClient: req.auth.clientId
    });

    if (existingProduct) {
      console.log('Product already exists:', existingProduct);
      return res.status(400).json({ message: "Product already exists for this client" });
    }

    let normalizedUnit = null;
    if (unit && typeof unit === 'string' && unit.trim()) {
      normalizedUnit = unit.trim().toLowerCase();

      // Check if unit exists for this client (case-insensitive)
      let existingUnit = await Unit.findOne({
        createdByClient: req.auth.clientId,
        name: { $regex: new RegExp(`^${normalizedUnit}$`, 'i') }
      });

      if (!existingUnit) {
        // Create new unit
        existingUnit = await Unit.create({
          name: normalizedUnit,
          createdByClient: req.auth.clientId,
          createdByUser: req.auth.userId,
        });
      }
    }

    // ✅ ALWAYS use tenant from token and also track the actor
    try {
      const product = await Product.create({
        name: name.trim(),
        stocks,
        unit: normalizedUnit,
        hsn,
        createdByClient: req.auth.clientId, // tenant id
        createdByUser:   req.auth.userId,   // who created it
      });

      // console.log('Product created successfully:', product);

      // Notify admin after product created
      await notifyAdminOnProductAction({
        req,
        action: "create",
        productName: product.name,
        entryId: product._id,
      });

      return res.status(201).json({ message: "Product created", product });
    } catch (productErr) {
      console.error('Error creating product:', productErr);
      if (productErr.code === 11000) {
        // because of compound unique {createdByClient, name}
        return res.status(400).json({ message: "Product already exists for this client" });
      }
      return res.status(500).json({ message: "Server error", error: productErr.message });
    }
  } catch (err) {
    console.error('Error creating unit or other:', err);
    if (err.code === 11000) {
      // Unit duplicate error
      return res.status(400).json({ message: "Unit already exists for this client" });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    // ✅ scope by tenant
    const clientId = req.auth.clientId;

    const products = await Product.find({ createdByClient: clientId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/products/:id
exports.updateProducts = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, stocks, unit, hsn } = req.body;

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
    if (hsn !== undefined) product.hsn = hsn;

    if (unit !== undefined) {
      let normalizedUnit = null;
      if (unit && typeof unit === 'string' && unit.trim()) {
        normalizedUnit = unit.trim().toLowerCase();

        // Check if unit exists for this client (case-insensitive)
        let existingUnit = await Unit.findOne({
          createdByClient: req.auth.clientId,
          name: { $regex: new RegExp(`^${normalizedUnit}$`, 'i') }
        });

        if (!existingUnit) {
          // Create new unit
          existingUnit = await Unit.create({
            name: normalizedUnit,
            createdByClient: req.auth.clientId,
            createdByUser: req.auth.userId,
          });
        }
      }
      product.unit = normalizedUnit;
    }

    // Ensure required fields are set for legacy products
    if (!product.createdByUser) {
      product.createdByUser = req.auth.userId;
    }
    if (!product.createdByClient) {
      product.createdByClient = req.auth.clientId;
    }

    await product.save();

    // Notify admin after product updated
    await notifyAdminOnProductAction({
      req,
      action: "update",
      productName: product.name,
      entryId: product._id,
    });

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

    // Notify admin before deleting
    await notifyAdminOnProductAction({
      req,
      action: "delete",
      productName: product.name,
      entryId: product._id,
    });

    await product.deleteOne();
    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/products/bulk-delete
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Product IDs array is required" });
    }

    // ✅ authorize by tenant - fetch only this tenant's products
    const products = await Product.find({
      _id: { $in: productIds },
      createdByClient: req.auth.clientId,
    });

    // Check if all requested products belong to this tenant
    if (products.length !== productIds.length) {
      return res.status(403).json({ message: "Some products not found or not authorized to delete" });
    }

    // Delete the products
    const result = await Product.deleteMany({
      _id: { $in: productIds },
      createdByClient: req.auth.clientId,
    });

    return res.status(200).json({
      message: `${result.deletedCount} products deleted successfully`,
      deletedCount: result.deletedCount
    });
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

    // compute new stocks (prevent negatives)
    const sign = action === "increase" ? 1 : -1;
    for (const [id, qty] of qtyById.entries()) {
      const p = productMap.get(id);
      const current = Number(p.stocks || 0);
      const next = Math.max(0, current + sign * qty);
      p.stocks = next;
    }

    // persist with bulkWrite
    const ops = products.map(p => ({
      updateOne: { filter: { _id: p._id }, update: { $set: { stocks: p.stocks } } },
    }));
    await Product.bulkWrite(ops, { ordered: true });

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
      hsn: item["HSN"],
    }));

    // Check if product already exists and handle units
    for (const product of products) {
      const existingProduct = await Product.findOne({ name: product.name, createdByClient: req.auth.clientId });

      if (existingProduct) {
        return res.status(400).json({
          message: `Product ${product.name} already exists. Please update it instead of creating new.`,
        });
      }

      let normalizedUnit = null;
      if (product.unit && typeof product.unit === 'string' && product.unit.trim()) {
        normalizedUnit = product.unit.trim().toLowerCase();

        // Check if unit exists for this client (case-insensitive)
        let existingUnit = await Unit.findOne({
          createdByClient: req.auth.clientId,
          name: { $regex: new RegExp(`^${normalizedUnit}$`, 'i') }
        });

        if (!existingUnit) {
          // Create new unit
          existingUnit = await Unit.create({
            name: normalizedUnit,
            createdByClient: req.auth.clientId,
            createdByUser: req.auth.userId,
          });
        }
      }

      // Save new product
      await Product.create({
        name: product.name,
        stocks: product.stocks,
        unit: normalizedUnit,
        hsn: product.hsn,
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
