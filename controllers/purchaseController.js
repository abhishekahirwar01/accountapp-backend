// controllers/purchaseController.js
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const { ensureVendorAndProduct } = require("../utils/ensurePartyAndProduct");
const Vendor = require("../models/Vendor");
const Product = require("../models/Product");

exports.createPurchaseEntry = async (req, res) => {
  try {
    const {
      vendor: vendorId,
      date,
      pricePerUnit,
      amount,
      product: productId,
      quantity,
      unitType,
      description,
      gstPercentage,
      invoiceType,
      company: companyId
    } = req.body;


    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) {
      return res.status(400).json({ message: "Invalid company selected" });
    }

    const vendor = await Vendor.findOne({ _id: vendorId, createdByClient: req.user.id });
    if (!vendor) {
      return res.status(400).json({ message: "Vendor not found or unauthorized" });
    }

    const product = await Product.findOne({ _id: productId, createdByClient: req.user.id });
    if (!product) {
      return res.status(400).json({ message: "Product not found or unauthorized" });
    }


    const entry = new PurchaseEntry({
      vendor: vendor._id,
      date,
      pricePerUnit,
      amount,
      product: product._id,
      quantity,
      unitType,
      description,
      gstPercentage,
      invoiceType,
      company: company._id,
      gstin: company.gstin || null,
      client: req.user.id
    });


    await entry.save();
    res.status(201).json({ message: "Purchase entry created successfully", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getPurchaseEntries = async (req, res) => {
  try {
    const filter = {};

    // If the user is a client, fetch only their data
    if (req.user.role === "client") {
      filter.client = req.user.id;
    }

    // If a specific company is selected, filter by it
    if (req.query.companyId) {
      filter.company = req.query.companyId;
    }

    const entries = await PurchaseEntry.find(filter)
      .populate("vendor", "vendorName")
      .populate("product", "productName")
      .populate("company", "companyName");

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
    if (!entry) {
      return res.status(404).json({ message: "Purchase entry not found" });
    }

    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    Object.assign(entry, req.body);
    await entry.save();

    res.status(200).json({ message: "Purchase entry updated successfully", entry });
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
      .populate("product", "productName")
      .populate("company", "companyName")
      .sort({ date: -1 });

    res.status(200).json(entries);
  } catch (err) {
    console.error("Error fetching purchase entries by client:", err.message);
    res.status(500).json({ error: err.message });
  }
};
