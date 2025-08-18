// controllers/salesController.js
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");


exports.createSalesEntry = async (req, res) => {
  try {
    const { party, company: companyId, date, products, service, totalAmount, description, referenceNumber, gstPercentage, discountPercentage, invoiceType } = req.body;

    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) return res.status(400).json({ message: "Invalid company selected" });

    const partyDoc = await Party.findOne({ _id: party, createdByClient: req.user.id });
    if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });

    // Normalize products if they exist
    let normalizedProducts = [];
    let productsTotal = 0;
    if (products && products.length > 0) {
      const result = await normalizeProducts(products, req.user.id);
      normalizedProducts = result.items;
      productsTotal = result.computedTotal;
    }

    // Normalize services if they exist
    let normalizedServices = [];
    let servicesTotal = 0;
    if (service && service.length > 0) {
      const result = await normalizeServices(service, req.user.id);
      normalizedServices = result.items;
      servicesTotal = result.computedTotal;
    }

    const finalTotal = typeof totalAmount === 'number' 
      ? totalAmount 
      : productsTotal + servicesTotal;

    const entry = await SalesEntry.create({
      party: partyDoc._id,
      company: company._id,
      client: req.user.id,
      date,
      products: normalizedProducts,
      service: normalizedServices,
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
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const { companyId, fromDate, toDate, clientId } = req.query;

    // Build filter
    const filter = {};
    if (req.user.role === "client") {
      filter.client = req.user.id;
    } else if (clientId) {
      filter.client = clientId; // optional: for master admin views
    }
    if (companyId) filter.company = companyId;
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) filter.date.$gte = new Date(fromDate);
      if (toDate)   filter.date.$lte = new Date(toDate);
    }

    const entries = await SalesEntry.find(filter)
      .populate("party", "name")
      .populate("products.product", "name")     // ✅ matches your saved field
      .populate("service.serviceName", "name")  // ✅ or "service.service" if you rename the key
      .populate("company", "businessName")
      .sort({ date: -1 });

    return res.status(200).json({ entries });
  } catch (err) {
    console.error("getSalesEntries error:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch sales entries", error: err.message });
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

    const { products, service, ...otherUpdates } = req.body;

    if (otherUpdates.company) {
      const company = await Company.findOne({ _id: otherUpdates.company, client: req.user.id });
      if (!company) return res.status(400).json({ message: "Invalid company selected" });
    }
    if (otherUpdates.party) {
      const partyDoc = await Party.findOne({ _id: otherUpdates.party, createdByClient: req.user.id });
      if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });
    }

    // Handle products update
    if (products) {
      const { items: normalizedProducts, computedTotal: productsTotal } = 
        await normalizeProducts(products, req.user.id);
      entry.products = normalizedProducts;
      if (typeof otherUpdates.totalAmount !== "number") {
        otherUpdates.totalAmount = (otherUpdates.totalAmount || 0) + productsTotal;
      }
    }

    // Handle services update
    if (service) {
      const { items: normalizedServices, computedTotal: servicesTotal } = 
        await normalizeServices(service, req.user.id);
      entry.service = normalizedServices;
      if (typeof otherUpdates.totalAmount !== "number") {
        otherUpdates.totalAmount = (otherUpdates.totalAmount || 0) + servicesTotal;
      }
    }

    Object.assign(entry, otherUpdates);
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
