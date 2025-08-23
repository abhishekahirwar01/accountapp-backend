// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const { sendSalesInvoiceEmail } = require("../services/invoiceEmail");
const { issueInvoiceNumber } = require("../services/invoiceIssuer");


exports.createSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();

  // declare OUTSIDE; we'll assign INSIDE the transaction
  let entry;
  let companyDoc;
  let partyDoc;

  try {
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

      // use the SAME session and DO NOT re-declare with const
      companyDoc = await Company.findOne({ _id: companyId, client: req.user.id })
        .session(session);
      if (!companyDoc) throw new Error("Invalid company selected");

      partyDoc = await Party.findOne({ _id: party, createdByClient: req.user.id })
        .session(session);
      if (!partyDoc) throw new Error("Customer not found or unauthorized");

      // normalize line items
      let normalizedProducts = [], productsTotal = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal } = await normalizeProducts(products, req.user.id);
        normalizedProducts = items; productsTotal = computedTotal;
      }

      let normalizedServices = [], servicesTotal = 0;
      if (Array.isArray(service) && service.length > 0) {
        const { items, computedTotal } = await normalizeServices(service, req.user.id);
        normalizedServices = items; servicesTotal = computedTotal;
      }

      const finalTotal = (typeof totalAmount === "number")
        ? totalAmount
        : (productsTotal + servicesTotal);

      // get invoice number INSIDE the same transaction
      const atDate = date ? new Date(date) : new Date();
      const { invoiceNumber, yearYY } = await issueInvoiceNumber(
        companyId,
        atDate,
        { session, series: "sales" }   // <— add series explicitly
      );


      // create the sale (assign to outer 'entry')
      const docs = await SalesEntry.create([{
        party: partyDoc._id,
        company: companyDoc._id,
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
        gstin: companyDoc.gstin || null,

        // persist generated number
        invoiceNumber,
        invoiceYearYY: yearYY,
      }], { session });
      console.log('Created Sales Entry:', docs);
      entry = docs[0];
    }); // auto-committed/aborted by withTransaction

    // after commit, fire-and-forget email
    setImmediate(() => {
      sendSalesInvoiceEmail({
        clientId: req.user.id,
        sale: entry.toObject ? entry.toObject() : entry,
        partyId: partyDoc._id,
        companyId: companyDoc._id,
      }).catch(err => console.error("Invoice email failed:", err.message));
    });

    return res.status(201).json({ message: "Sales entry created successfully", entry });
  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res.status(500).json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession(); // always end the session
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

// UPDATE a sales entry
// UPDATE a sales entry
exports.updateSalesEntry = async (req, res) => {
  try {
    const entry = await SalesEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Sales entry not found" });
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, service, ...otherUpdates } = req.body;

    // Validate company if being updated
    if (otherUpdates.company) {
      const company = await Company.findOne({ _id: otherUpdates.company, client: req.user.id });
      if (!company) return res.status(400).json({ message: "Invalid company selected" });
    }

    // Validate party if being updated
    if (otherUpdates.party) {
      partyDoc = await Party.findOne({ _id: party, createdByClient: req.user.id })
        .session(session);

      if (!partyDoc) throw new Error("Customer not found or unauthorized");

    }

    let productsTotal = 0;
    let servicesTotal = 0;

    // Handle products update
    if (products) {
      try {
        const { items: normalizedProducts, computedTotal } = await normalizeProducts(products, req.user.id);
        entry.products = normalizedProducts;
        productsTotal = computedTotal;
      } catch (err) {
        return res.status(400).json({ message: `Invalid products data: ${err.message}` });
      }
    }

    // Handle services update
    if (service) {
      try {
        const { items: normalizedServices, computedTotal } = await normalizeServices(service, req.user.id);
        entry.service = normalizedServices;
        servicesTotal = computedTotal;
      } catch (err) {
        return res.status(400).json({ message: `Invalid service data: ${err.message}` });
      }
    }

    // Apply updates
    const { totalAmount, ...rest } = otherUpdates;
    Object.assign(entry, rest);

    // Calculate total amount
    if (typeof totalAmount === 'number') {
      entry.totalAmount = totalAmount;
    } else {
      const sumProducts = productsTotal || entry.products.reduce((sum, item) => sum + (item.amount || 0), 0);
      const sumServices = servicesTotal || entry.service.reduce((sum, item) => sum + (item.amount || 0), 0);
      entry.totalAmount = sumProducts + sumServices;
    }

    await entry.save();

    // Send invoice email asynchronously
    setImmediate(() => {
      sendSalesInvoiceEmail({ clientId: req.user.id, saleId: entry._id })
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
