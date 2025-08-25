// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const { sendSalesInvoiceEmail } = require("../services/invoiceEmail");
const { issueSalesInvoiceNumber } = require("../services/invoiceIssuer");


// at top of controllers/salesController.js
const { getEffectivePermissions } = require("../services/effectivePermissions");

const PRIV_ROLES = new Set(["master", "client" , "admin"]);

async function ensureAuthCaps(req) {
  // Normalize: support old middlewares that used req.user
  if (!req.auth && req.user) req.auth = {
    clientId: req.user.id,
    userId: req.user.userId || req.user.id,
    role: req.user.role,
    caps: req.user.caps,
    allowedCompanies: req.user.allowedCompanies,
  };

  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  // If caps/allowedCompanies missing, load them
  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth.role);
}

function companyAllowedForUser(req, companyId) {
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  return allowed.length === 0 || allowed.includes(String(companyId));
}



exports.createSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let entry, companyDoc, partyDoc;

  try {
    await ensureAuthCaps(req);

    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res.status(403).json({ message: "Not allowed to create sales entries" });
    }

    const { company: companyId } = req.body;
    if (!companyAllowedForUser(req, companyId)) {
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    await session.withTransaction(async () => {
      const {
        party,
        company: companyId,
        date,
        products,
        service,
        totalAmount,
        description,
        referenceNumber,
        gstPercentage,
        discountPercentage,
        invoiceType,
      } = req.body;

      companyDoc = await Company.findOne({ _id: companyId, client: req.auth.clientId }).session(session);
      if (!companyDoc) throw new Error("Invalid company selected");

      partyDoc = await Party.findOne({ _id: party, createdByClient: req.auth.clientId }).session(session);
      if (!partyDoc) throw new Error("Customer not found or unauthorized");

      let normalizedProducts = [], productsTotal = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal } = await normalizeProducts(products, req.auth.clientId);
        normalizedProducts = items; productsTotal = computedTotal;
      }

      let normalizedServices = [], servicesTotal = 0;
      if (Array.isArray(service) && service.length > 0) {
        const { items, computedTotal } = await normalizeServices(service, req.auth.clientId);
        normalizedServices = items; servicesTotal = computedTotal;
      }

      const finalTotal = (typeof totalAmount === "number")
        ? totalAmount
        : (productsTotal + servicesTotal);

      const atDate = date ? new Date(date) : new Date();
      const { invoiceNumber, yearYY } = await issueSalesInvoiceNumber(
        companyId,
        atDate,
        { session, series: "sales" }
      );

      const docs = await SalesEntry.create([{
        party: partyDoc._id,
        company: companyDoc._id,
        client: req.auth.clientId,
        date,
        products: normalizedProducts,
        service: normalizedServices,
        totalAmount: finalTotal,
        description,
        referenceNumber,
        gstPercentage,
        discountPercentage,
        invoiceType,
        gstin: companyDoc.gstin || null,
        invoiceNumber,
        invoiceYearYY: yearYY,
        createdByUser: req.auth.userId,
      }], { session });

      entry = docs[0];
    });

    setImmediate(() => {
      sendSalesInvoiceEmail({
        clientId: req.auth.clientId,
        sale: entry.toObject ? entry.toObject() : entry,
        partyId: entry.party,
        companyId: entry.company,
      }).catch(err => console.error("Invoice email failed:", err.message));
    });

    return res.status(201).json({ message: "Sales entry created successfully", entry });
  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res.status(500).json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};





// GET Sales Entries (Client or Master Admin)
// In your getSalesEntries controller
exports.getSalesEntries = async (req, res) => {
  try {
    const filter = {};

    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role === "client") {
      filter.client = req.user.id;
    }
    if (req.query.companyId) {
      filter.company = req.query.companyId;
    }

    const entries = await SalesEntry.find(filter)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate("service.serviceName", "name")
      .populate("company", "businessName")
      .sort({ date: -1 });

    // Return consistent format
    res.status(200).json({
      success: true,
      count: entries.length,
      data: entries  // Use consistent key
    });

  } catch (err) {
    console.error("Error fetching sales entries:", err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
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

// UPDATE a sales entry (replace your current function)
exports.updateSalesEntry = async (req, res) => {
  try {
    // Make sure req.auth.caps and allowedCompanies exist
    await ensureAuthCaps(req);

    const entry = await SalesEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Sales entry not found" });

    // Tenant auth: allow privileged roles or same tenant only
    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, service, ...otherUpdates } = req.body;

    // If company is being changed, check permission + existence
    if (otherUpdates.company) {
      if (!companyAllowedForUser(req, otherUpdates.company)) {
        return res.status(403).json({ message: "You are not allowed to use this company" });
      }
      const company = await Company.findOne({
        _id: otherUpdates.company,
        client: req.auth.clientId,
      });
      if (!company) {
        return res.status(400).json({ message: "Invalid company selected" });
      }
    }

    // If party is being changed, validate it belongs to the same tenant
    if (otherUpdates.party) {
      const party = await Party.findOne({
        _id: otherUpdates.party,
        createdByClient: req.auth.clientId,
      });
      if (!party) {
        return res.status(400).json({ message: "Customer not found or unauthorized" });
      }
    }

    let productsTotal = 0;
    let servicesTotal = 0;

    // Normalize product lines only if provided (Array.isArray allows clearing with [])
    if (Array.isArray(products)) {
      const { items: normalizedProducts, computedTotal } =
        await normalizeProducts(products, req.auth.clientId);
      entry.products = normalizedProducts;
      productsTotal = computedTotal;
    }

    // Normalize service lines only if provided (Array.isArray allows clearing with [])
    if (Array.isArray(service)) {
      const { items: normalizedServices, computedTotal } =
        await normalizeServices(service, req.auth.clientId);
      entry.service = normalizedServices;
      servicesTotal = computedTotal;
    }

    // Don’t allow changing invoiceNumber/year from payload
    const { totalAmount, invoiceNumber, invoiceYearYY, ...rest } = otherUpdates;
    Object.assign(entry, rest);

    // Recalculate total if not explicitly provided
    if (typeof totalAmount === "number") {
      entry.totalAmount = totalAmount;
    } else {
      const sumProducts =
        productsTotal ||
        (Array.isArray(entry.products)
          ? entry.products.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      const sumServices =
        servicesTotal ||
        (Array.isArray(entry.service)
          ? entry.service.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      entry.totalAmount = sumProducts + sumServices;
    }

    await entry.save();

    // optional: keep your async email
    setImmediate(() => {
      sendSalesInvoiceEmail({ clientId: req.auth.clientId, saleId: entry._id })
        .catch(err => console.error("Failed to send invoice email:", err));
    });

    res.json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    console.error("Error updating sales entry:", err);
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
