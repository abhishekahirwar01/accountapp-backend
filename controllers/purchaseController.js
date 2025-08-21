// controllers/purchaseController.js
const mongoose = require("mongoose");
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const normalizePurchaseProducts = require("../utils/normalizePurchaseProducts");
const normalizePurchaseServices = require("../utils/normalizePurchaseServices");


exports.createPurchaseEntry = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { 
      vendor, 
      company: companyId, 
      date, 
      products, 
      services, 
      totalAmount, 
      description, 
      referenceNumber, 
      gstPercentage, 
      invoiceType 
    } = req.body;

    // Validate company
    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) return res.status(400).json({ message: "Invalid company selected" });

    // Validate vendor
    const vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.user.id });
    if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });

    // Normalize products if they exist
    let normalizedProducts = [];
    let productsTotal = 0;
    if (products && products.length > 0) {
      const result = await normalizePurchaseProducts(products, req.user.id);
      normalizedProducts = result.items;
      productsTotal = result.computedTotal;
    }

    // Normalize services if they exist
    let normalizedServices = [];
    let servicesTotal = 0;
    if (services && services.length > 0) {
      const result = await normalizePurchaseServices(services, req.user.id);
      normalizedServices = result.items;
      servicesTotal = result.computedTotal;
    }

    const finalTotal = typeof totalAmount === 'number' 
      ? totalAmount 
      : productsTotal + servicesTotal;

    // 1) Create entry
    const entry = await PurchaseEntry.create([{
      vendor: vendorDoc._id,
      company: company._id,
      client: req.user.id,
      date,
      products: normalizedProducts,
      services: normalizedServices,
      totalAmount: finalTotal,
      description,
      referenceNumber,
      gstPercentage,
      invoiceType,
      gstin: company.gstin || null,
    }], { session });

    // 2) Auto-increment stocks for existing products
    if (normalizedProducts.length > 0) {
      const ops = [];
      const productUpdates = [];

      for (const item of normalizedProducts) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        if (item.product) {  // Changed from item.productId to item.product
          ops.push({
            updateOne: {
              filter: { _id: item.product, createdByClient: req.user.id },
              update: { $inc: { stocks: qty } }
            }
          });
          productUpdates.push({ id: item.product, qty });
        } else if (item.name) {
          ops.push({
            updateOne: {
              filter: { name: String(item.name).toLowerCase().trim(), createdByClient: req.user.id },
              update: { $inc: { stocks: qty } }
            }
          });
        }
      }

      if (ops.length > 0) {
        const bulkWriteResult = await Product.bulkWrite(ops, { session });
        console.log('Stock update result:', bulkWriteResult);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ message: "Purchase entry created successfully", entry });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error in createPurchaseEntry:', err);
    res.status(500).json({ 
      error: err.message,
      message: "Failed to create purchase entry"
    });
  }
};


exports.getPurchaseEntries = async (req, res) => {
  try {
    const filter = {};

    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role === "client") {
      filter.client = req.user.id;
    }
    if (req.query.companyId) {
      filter.company = req.query.companyId; // validate ObjectId if needed
    }

    const entries = await PurchaseEntry.find(filter)
      .populate("vendor", "vendorName")
      .populate("products.product", "name")          // ✅ correct path
      .populate("services.serviceName", "name")      // ✅ if your service item key is serviceName
      .populate("company", "businessName")
      .sort({ date: -1 }); // optional

    res.status(200).json(entries);
  } catch (err) {
    console.error("Error fetching purchase entries:", err.message);
    res.status(500).json({ error: err.message });
  }
};



// DELETE a purchase entry
exports.deletePurchaseEntry = async (req, res) => {

  try {
    const purchase = await PurchaseEntry.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: "Purchase not found" });

    if (req.user.role !== "client" && purchase.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await purchase.deleteOne();
    res.json({ message: "Purchase deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// UPDATE a purchase entry
exports.updatePurchaseEntry = async (req, res) => {
  try {
    const entry = await PurchaseEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Purchase entry not found" });
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, services, ...otherUpdates } = req.body;

    // Validate company if being updated
    if (otherUpdates.company) {
      const company = await Company.findOne({ _id: otherUpdates.company, client: req.user.id });
      if (!company) return res.status(400).json({ message: "Invalid company selected" });
    }

    // Validate vendor if being updated
    if (otherUpdates.vendor) {
      const vendorDoc = await Vendor.findOne({ _id: otherUpdates.vendor, createdByClient: req.user.id });
      if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
    }

    // Handle products update
    if (products) {
      const { items: normalizedProducts, computedTotal: productsTotal } = 
        await normalizePurchaseProducts(products, req.user.id);
      entry.products = normalizedProducts;
      if (typeof otherUpdates.totalAmount !== "number") {
        otherUpdates.totalAmount = (otherUpdates.totalAmount || 0) + productsTotal;
      }
    }

    // Handle services update
    if (services) {
      const { items: normalizedServices, computedTotal: servicesTotal } = 
        await normalizePurchaseServices(services, req.user.id);
      entry.services = normalizedServices;
      if (typeof otherUpdates.totalAmount !== "number") {
        otherUpdates.totalAmount = (otherUpdates.totalAmount || 0) + servicesTotal;
      }
    }

    Object.assign(entry, otherUpdates);
    await entry.save();

    res.json({ message: "Purchase entry updated successfully", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET purchase entries by clientId (Admin access only)
exports.getPurchaseEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const entries = await PurchaseEntry.find({ client: clientId })
      .populate("vendor", "vendorName")
      .populate("items.product", "name")          // ✅ nested path
      .populate("company", "businessName")        // ✅ field name
      .sort({ date: -1 });


    res.status(200).json(entries);
  } catch (err) {
    console.error("Error fetching purchase entries by client:", err.message);
    res.status(500).json({ error: err.message });
  }
};
