// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const { sendSalesInvoiceEmail } = require("../services/invoiceEmail");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { issueSalesInvoiceNumber } = require("../services/invoiceIssuer");

// at top of controllers/salesController.js
const { getEffectivePermissions } = require("../services/effectivePermissions");

const PRIV_ROLES = new Set(["master", "client", "admin"]);


async function ensureAuthCaps(req) {
  // Normalize: support old middlewares that used req.user
  if (!req.auth && req.user)
    req.auth = {
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


function pickCompanyGSTIN(c) {
  return (
    c?.gstin ??
    c?.gstIn ??
    c?.gstNumber ??
    c?.gst_no ??
    c?.gst ??
    c?.gstinNumber ??
    c?.tax?.gstin ??
    null
  );
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
        party, company: companyId, date, products, services,
        totalAmount, description, referenceNumber,
        gstPercentage, gstRate, discountPercentage, invoiceType,
        taxAmount: taxAmountIn, invoiceTotal: invoiceTotalIn,
      } = req.body;

      companyDoc = await Company.findOne({ _id: companyId, client: req.auth.clientId }).session(session);
      if (!companyDoc) throw new Error("Invalid company selected");

      partyDoc = await Party.findOne({ _id: party, createdByClient: req.auth.clientId }).session(session);
      if (!partyDoc) throw new Error("Customer not found or unauthorized");

      // normalize lines as you already do ...
      let normalizedProducts = [], productsTotal = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal } = await normalizeProducts(products, req.auth.clientId);
        normalizedProducts = items; productsTotal = computedTotal;
      }

      let normalizedServices = [], servicesTotal = 0;
      if (Array.isArray(services) && services.length > 0) {
        const { items, computedTotal } = await normalizeServices(services, req.auth.clientId);
        normalizedServices = items; servicesTotal = computedTotal;
      }

      const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0);
      const effectiveGstPct = typeof gstPercentage === "number" ? gstPercentage
                             : (typeof gstRate === "number" ? gstRate : 0);
      const taxAmount = typeof taxAmountIn === "number"
        ? taxAmountIn
        : +((computedSubtotal * effectiveGstPct) / 100).toFixed(2);

      const finalTotal = typeof totalAmount === "number"
        ? totalAmount
        : (typeof invoiceTotalIn === "number" ? invoiceTotalIn : +(computedSubtotal + taxAmount).toFixed(2));

      const atDate = date ? new Date(date) : new Date();

      // ⬇️ allocate & insert with retry (handles legacy duplicates)
      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } =
          await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

        try {
          const docs = await SalesEntry.create([{
            party: partyDoc._id,
            company: companyDoc._id,
            client: req.auth.clientId,
            date,
            products: normalizedProducts,
            services: normalizedServices,
            totalAmount: finalTotal,
            description,
            referenceNumber,
            gstPercentage: effectiveGstPct,
            discountPercentage,
            invoiceType,
            gstin: companyDoc.gstin || null,
            invoiceNumber,
            invoiceYearYY: yearYY,
            createdByUser: req.auth.userId,
          }], { session });

          entry = docs[0];

          // record issuance only AFTER success
          await IssuedInvoiceNumber.create([{
            company: companyDoc._id,
            series: "sales",
            invoiceNumber,
            yearYY,
            seq,
            prefix
          }], { session });

          break; // success
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) {
            // number was used by a legacy doc; try the next one
            continue;
          }
          throw e;
        }
      }
    });

    return res.status(201).json({ message: "Sales entry created successfully", entry });
  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res.status(500).json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};



// exports.createSalesEntry = async (req, res) => {
//   const session = await mongoose.startSession();
//   let entry, companyDoc, partyDoc;

//   try {
//     await ensureAuthCaps(req);

//     if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
//       return res
//         .status(403)
//         .json({ message: "Not allowed to create sales entries" });
//     }

//     const { company: companyId } = req.body;
//     if (!companyAllowedForUser(req, companyId)) {
//       return res
//         .status(403)
//         .json({ message: "You are not allowed to use this company" });
//     }

//     await session.withTransaction(async () => {
//       const {
//         party,
//         company: bodyCompanyId,
//         date,
//         products,
//         services,
//         // FE sends GST-inclusive here (invoice total); we still compute defensively
//         totalAmount,
//         description,
//         referenceNumber,
//         gstPercentage, // preferred
//         gstRate,       // legacy
//         discountPercentage,
//         invoiceType,
//         taxAmount: taxAmountIn,       // optional from FE
//         invoiceTotal: invoiceTotalIn, // legacy alias for GST-inclusive total
//       } = req.body;

//       companyDoc = await Company.findOne({
//         _id: bodyCompanyId,
//         client: req.auth.clientId,
//       }).session(session);
//       if (!companyDoc) throw new Error("Invalid company selected");

//       partyDoc = await Party.findOne({
//         _id: party,
//         createdByClient: req.auth.clientId,
//       }).session(session);
//       if (!partyDoc) throw new Error("Customer not found or unauthorized");

//       // Normalize lines
//       let normalizedProducts = [],
//         productsTotal = 0;
//       if (Array.isArray(products) && products.length > 0) {
//         const { items, computedTotal } = await normalizeProducts(
//           products,
//           req.auth.clientId
//         );
//         normalizedProducts = items;
//         productsTotal = computedTotal;
//       }

//       let normalizedServices = [],
//         servicesTotal = 0;
//       if (Array.isArray(services) && services.length > 0) {
//         const { items, computedTotal } = await normalizeServices(
//           services,
//           req.auth.clientId
//         );
//         normalizedServices = items;
//         servicesTotal = computedTotal;
//       }

//       // Subtotal from normalized lines
//       const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0);

//       // Effective GST %
//       const effectiveGstPct =
//         typeof gstPercentage === "number"
//           ? gstPercentage
//           : typeof gstRate === "number"
//             ? gstRate
//             : 0;

//       // Tax amount (prefer FE if provided)
//       const taxAmount =
//         typeof taxAmountIn === "number"
//           ? taxAmountIn
//           : +((computedSubtotal * effectiveGstPct) / 100).toFixed(2);

//       // Final total (prefer FE totalAmount, then invoiceTotal, else compute)
//       const finalTotal =
//         typeof totalAmount === "number"
//           ? totalAmount
//           : typeof invoiceTotalIn === "number"
//             ? invoiceTotalIn
//             : +(computedSubtotal + taxAmount).toFixed(2);

//       const atDate = date ? new Date(date) : new Date();
//       const { invoiceNumber, yearYY } = await issueSalesInvoiceNumber(
//         companyDoc._id,
//         atDate,
//         { session }
//       );
//       const companyGSTIN = pickCompanyGSTIN(companyDoc);

//       const docs = await SalesEntry.create(
//         [
//           {
//             party: partyDoc._id,
//             company: companyDoc._id,
//             client: req.auth.clientId,
//             date: atDate,
//             products: normalizedProducts,
//             services: normalizedServices,

//             // ✅ store GST-inclusive total
//             totalAmount: finalTotal,

//             // optional: if your schema has these fields they'll be saved; otherwise ignored
//             subTotal: computedSubtotal,
//             taxAmount,
//             gstPercentage: effectiveGstPct,

//             description,
//             referenceNumber,
//             discountPercentage,
//             invoiceType,
//             gstin: companyGSTIN,
//             invoiceNumber,
//             invoiceYearYY: yearYY,
//             createdByUser: req.auth.userId,
//           },
//         ],
//         { session }
//       );

//       entry = docs[0];
//     });

//     // async email (non-blocking)
//     setImmediate(() => {
//       sendSalesInvoiceEmail({
//         clientId: req.auth.clientId,
//         sale: entry.toObject ? entry.toObject() : entry,
//         partyId: entry.party,
//         companyId: entry.company,
//       }).catch((err) => console.error("Invoice email failed:", err.message));
//     });

//     return res
//       .status(201)
//       .json({ message: "Sales entry created successfully", entry });
//   } catch (err) {
//     console.error("createSalesEntry error:", err);
//     return res
//       .status(500)
//       .json({ message: "Something went wrong", error: err.message });
//   } finally {
//     session.endSession();
//   }
// };





// UPDATE a sales entry (replace your current function)
exports.updateSalesEntry = async (req, res) => {
  try {
    // Make sure req.auth.caps and allowedCompanies exist
    await ensureAuthCaps(req);

    const entry = await SalesEntry.findById(req.params.id);
    if (!entry)
      return res.status(404).json({ message: "Sales entry not found" });

    // Tenant auth: allow privileged roles or same tenant only
    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, services, ...otherUpdates } = req.body;

    // If company is being changed, check permission + existence
    if (otherUpdates.company) {
      if (!companyAllowedForUser(req, otherUpdates.company)) {
        return res
          .status(403)
          .json({ message: "You are not allowed to use this company" });
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
        return res
          .status(400)
          .json({ message: "Customer not found or unauthorized" });
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
    if (Array.isArray(services)) {
      const { items: normalizedServices, computedTotal } =
        await normalizeServices(services, req.auth.clientId);
      entry.services = normalizedServices;
      servicesTotal = computedTotal;
    }

    // Don’t allow changing invoiceNumber/year from payload
    const { totalAmount, invoiceNumber, invoiceYearYY, gstRate, ...rest } =
      otherUpdates;
    if (typeof gstRate === "number") {
      entry.gstPercentage = gstRate;
    }
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
        (Array.isArray(entry.services)
          ? entry.services.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      entry.totalAmount = sumProducts + sumServices;
    }

    await entry.save();

    // optional: keep your async email
    // setImmediate(() => {
    //   sendSalesInvoiceEmail({
    //     clientId: req.auth.clientId,
    //     saleId: entry._id,
    //   }).catch((err) => console.error("Failed to send invoice email:", err));
    // });

    res.json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    console.error("Error updating sales entry:", err);
    res.status(500).json({ error: err.message });
  }
};



// exports.updateSalesEntry = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     const entry = await SalesEntry.findById(req.params.id);
//     if (!entry)
//       return res.status(404).json({ message: "Sales entry not found" });

//     if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     const { products, services, ...otherUpdates } = req.body;

//     // Company change: permission + existence, and refresh GSTIN if needed
//     if (otherUpdates.company) {
//       if (!companyAllowedForUser(req, otherUpdates.company)) {
//         return res
//           .status(403)
//           .json({ message: "You are not allowed to use this company" });
//       }
//       const company = await Company.findOne({
//         _id: otherUpdates.company,
//         client: req.auth.clientId,
//       });
//       if (!company) {
//         return res.status(400).json({ message: "Invalid company selected" });
//       }
//       // If company changes, mirror GSTIN from company
//       const companyGSTIN = pickCompanyGSTIN(company);
//       entry.gstin = companyGSTIN;

//     }

//     // Party change: same tenant
//     if (otherUpdates.party) {
//       const party = await Party.findOne({
//         _id: otherUpdates.party,
//         createdByClient: req.auth.clientId,
//       });
//       if (!party) {
//         return res
//           .status(400)
//           .json({ message: "Customer not found or unauthorized" });
//       }
//     }

//     // Normalize lines only if arrays are provided (allows clearing with [])
//     let productsTotal = 0;
//     let servicesTotal = 0;

//     if (Array.isArray(products)) {
//       const { items: normalizedProducts, computedTotal } =
//         await normalizeProducts(products, req.auth.clientId);
//       entry.products = normalizedProducts;
//       productsTotal = computedTotal;
//     }

//     if (Array.isArray(services)) {
//       const { items: normalizedServices, computedTotal } =
//         await normalizeServices(services, req.auth.clientId);
//       entry.services = normalizedServices;
//       servicesTotal = computedTotal;
//     }

//     // Protect invoice fields; accept legacy gstRate
//     const {
//       totalAmount, // may be GST-inclusive from FE
//       invoiceNumber,
//       invoiceYearYY,
//       gstRate, // legacy name
//       taxAmount: taxAmountIn, // optional
//       invoiceTotal: invoiceTotalIn, // optional legacy alias
//       gstPercentage, // preferred
//       ...rest
//     } = otherUpdates;

//     // Apply simple fields
//     Object.assign(entry, rest);

//     // Effective GST %
//     const effectiveGstPct =
//       typeof gstPercentage === "number"
//         ? gstPercentage
//         : typeof gstRate === "number"
//           ? gstRate
//           : typeof entry.gstPercentage === "number"
//             ? entry.gstPercentage
//             : 0;
//     entry.gstPercentage = effectiveGstPct;

//     // Subtotal from either newly-normalized totals or existing entry
//     const currentProductsTotal =
//       productsTotal ||
//       (Array.isArray(entry.products)
//         ? entry.products.reduce(
//           (s, it) => s + (Number(it.amount) || 0),
//           0
//         )
//         : 0);
//     const currentServicesTotal =
//       servicesTotal ||
//       (Array.isArray(entry.services)
//         ? entry.services.reduce(
//           (s, it) => s + (Number(it.amount) || 0),
//           0
//         )
//         : 0);
//     const computedSubtotal = currentProductsTotal + currentServicesTotal;

//     // Tax amount
//     const taxAmount =
//       typeof taxAmountIn === "number"
//         ? taxAmountIn
//         : +((computedSubtotal * effectiveGstPct) / 100).toFixed(2);

//     // Final total precedence:
//     // 1) explicit totalAmount from FE
//     // 2) legacy invoiceTotal from FE
//     // 3) recompute subtotal + tax
//     if (typeof totalAmount === "number") {
//       entry.totalAmount = totalAmount;
//     } else if (typeof invoiceTotalIn === "number") {
//       entry.totalAmount = invoiceTotalIn;
//     } else {
//       entry.totalAmount = +(computedSubtotal + taxAmount).toFixed(2);
//     }

//     // Optional breakdown fields if present in schema
//     entry.subTotal = computedSubtotal;
//     entry.taxAmount = taxAmount;

//     await entry.save();

//     setImmediate(() => {
//       sendSalesInvoiceEmail({
//         clientId: req.auth.clientId,
//         saleId: entry._id,
//       }).catch((err) => console.error("Failed to send invoice email:", err));
//     });

//     res.json({ message: "Sales entry updated successfully", entry });
//   } catch (err) {
//     console.error("Error updating sales entry:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

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
      .populate({ path: "services.service", select: "serviceName", strictPopulate: false }) // ✅
      .populate("company", "businessName")
      .sort({ date: -1 });
    // Return consistent format
    res.status(200).json({
      success: true,
      count: entries.length,
      data: entries, // Use consistent key
    });
  } catch (err) {
    console.error("Error fetching sales entries:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
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

// GET Sales Entries by clientId (for master admin)
exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({ path: "services.service", select: "serviceName", strictPopulate: false }) // ✅
      .populate("company", "businessName")
      .sort({ date: -1 });

    res.status(200).json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch entries", error: err.message });
  }
};
