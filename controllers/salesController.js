// controllers/salesController.js
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const Product = require("../models/Product");

const { ensurePartyAndProduct } = require("../utils/ensurePartyAndProduct");

exports.createSalesEntry = async (req, res) => {
  try {
    const {
      party: partyId,       // align with frontend key
      date,
      amount,
      product: productId,   // align with frontend key
      description,
      gstPercentage,
      discountPercentage,
      invoiceType,
      company: companyId    // align with frontend key
    } = req.body;

    // ✅ Validate company
    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) {
      return res.status(400).json({ message: "Invalid company selected" });
    }

    // ✅ Validate party (customer)
    const party = await Party.findOne({ _id: partyId, createdByClient: req.user.id });
    if (!party) {
      return res.status(400).json({ message: "Customer not found or unauthorized" });
    }

    // ✅ Validate product
    const product = await Product.findOne({ _id: productId, createdByClient: req.user.id });
    if (!product) {
      return res.status(400).json({ message: "Product not found or unauthorized" });
    }

    // ✅ Create new sales entry
    const entry = new SalesEntry({
      party: party._id,
      date,
      amount,
      product: product._id,
      description,
      gstPercentage,
      discountPercentage,
      invoiceType,
      company: company._id,
      gstin: company.gstin || null,
      client: req.user.id
    });

    await entry.save();
    res.status(201).json({ message: "Sales entry created successfully", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// GET Sales Entries (Client or Master Admin)
exports.getSalesEntries = async (req, res) => {
  try {
    const filter = {};

    // If client, restrict to their own sales entries
    if (req.user.role === "client") {
      filter.client = req.user.id;
    }

    const entries = await SalesEntry.find(filter)
      .populate("party", "name") // populating party name
      .populate("product", "name") // populating product name
      .populate("company", "companyName") // populating company name
      .sort({ date: -1 }); // latest first

    res.status(200).json({ entries });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sales entries", error: err.message });
  }
};


// DELETE a sales entry
exports.deleteSalesEntry = async (req, res) => {
  try {
    const entry = await SalesEntry.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({ message: "Sales entry not found" });
    }

    // Only allow clients to delete their own entries
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await entry.deleteOne();
    res.status(200).json({ message: "Sales entry deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE a sales entry
exports.updateSalesEntry = async (req, res) => {
  try {
    const entry = await SalesEntry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: "Sales entry not found" });
    }

    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    Object.assign(entry, req.body); // Overwrite entry with new data
    await entry.save();

    res.status(200).json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// GET Sales Entries by clientId (for master admin)
exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("product", "name")
      .populate("company", "companyName")
      .sort({ date: -1 });

    res.status(200).json({ entries });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch entries", error: err.message });
  }
};
