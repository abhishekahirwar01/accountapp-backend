// controllers/salesController.js
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const Product = require("../models/Product");
const { normalizeItems } = require("../utils/normalizeItems");

const { ensurePartyAndProduct } = require("../utils/ensurePartyAndProduct");

exports.createSalesEntry = async (req, res) => {
  try {
    const { party, company: companyId, date, items, totalAmount, description, referenceNumber, gstPercentage, discountPercentage, invoiceType } = req.body;

    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) return res.status(400).json({ message: "Invalid company selected" });

    const partyDoc = await Party.findOne({ _id: party, createdByClient: req.user.id });
    if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });

    const { items: normalized, computedTotal } = await normalizeItems(items, req.user.id);
    const finalTotal = typeof totalAmount === "number" ? totalAmount : computedTotal;

    const entry = await SalesEntry.create({
      party: partyDoc._id,
      company: company._id,
      client: req.user.id,
      date,
      items: normalized,
      totalAmount: finalTotal,
      description,
      referenceNumber,
      gstPercentage,
      discountPercentage,
      invoiceType,
      gstin: company.gstin || null,
    });

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
      .populate("party", "name")
      .populate("items.product", "name")          // ✅ nested path
      .populate("company", "businessName")        // ✅ field name
      .sort({ date: -1 });

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
    if (!entry) return res.status(404).json({ message: "Sales entry not found" });
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const body = { ...req.body };

    if (body.company) {
      const company = await Company.findOne({ _id: body.company, client: req.user.id });
      if (!company) return res.status(400).json({ message: "Invalid company selected" });
    }
    if (body.party) {
      const partyDoc = await Party.findOne({ _id: body.party, createdByClient: req.user.id });
      if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });
    }
    if (body.items) {
      const { items: normalized, computedTotal } = await normalizeItems(body.items, req.user.id);
      body.items = normalized;
      if (typeof body.totalAmount !== "number") body.totalAmount = computedTotal;
    }

    Object.assign(entry, body);
    await entry.save();

    res.json({ message: "Sales entry updated successfully", entry });
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
      .populate("items.product", "name")          // ✅ nested path
      .populate("company", "businessName")        // ✅ field name
      .sort({ date: -1 });


    res.status(200).json({ entries });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch entries", error: err.message });
  }
};
