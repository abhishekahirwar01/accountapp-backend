// controllers/purchaseController.js
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const {ensureVendorAndProduct } = require("../utils/ensurePartyAndProduct");

exports.createPurchaseEntry = async (req, res) => {
  try {
    const {
      vendorName,
      date,
      amount,
     product: productName,
      description,
      gstPercentage,
      invoiceType,
      companyId
    } = req.body;

    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) {
      return res.status(400).json({ message: "Invalid company selected" });
    }
    if (req.user.role === "client" && company.client.toString() !== req.user.id) {
  return res.status(403).json({ message: "This company does not belong to you" });
}

    const { vendor, product } = await ensureVendorAndProduct(vendorName, productName,  req.user.id);

    const entry = new PurchaseEntry({
      vendor: vendor._id,
      date,
      amount,
      product: product._id,
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
