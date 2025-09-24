// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const BankDetail = require("../models/BankDetail");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { issueSalesInvoiceNumber } = require("../services/invoiceIssuer");
const { getFromCache, setToCache } = require("../RedisCache");
const {
  deleteSalesEntryCache,
  deleteSalesEntryCacheByUser,
} = require("../utils/cacheHelpers");
// at top of controllers/salesController.js
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role");

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
      userName: req.user.userName || "Unknown", // Ensure userName is set here
      clientName: req.user.contactName,
    };

  // If there's no auth context, throw error
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  // If caps or allowedCompanies are missing, load them
  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }

  // If userName is still not set, query the database for user details
  // if (!req.auth.userName) {
  //   const user = await User.findById(req.auth.userId);  // Assuming the userId is correct
  //   req.auth.userName = user ? user.userName : 'Unknown';  // Fallback to 'Unknown' if user is not found
  // }

  // updated: only for staff (non-client) logins
  if (req.auth.role !== "client" && !req.auth.userName && req.auth.userId) {
    const user = await User.findById(req.auth.userId)
      .select("displayName fullName name userName username email")
      .lean();
    req.auth.userName =
      user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.userName ||
      user?.username ||
      user?.email ||
      undefined; // no "Unknown" fallback here
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


// ---- Actor resolver: supports staff users and clients ----
async function resolveActor(req) {
  // Fast path: use names from JWT if present
  const claimName =
    req.auth?.displayName ||
    req.auth?.fullName ||
    req.auth?.name ||
    req.auth?.userName ||
    req.auth?.username ||
    req.auth?.clientName || // if you add this in JWT for clients
    null;

  const role = req.auth?.role;

  // If the claim has a string, return with best-effort id as well
  if (claimName && String(claimName).trim()) {
    return {
      id:
        req.auth?.userId ||
        req.auth?.id ||
        req.user?.id ||
        req.auth?.clientId ||
        null,
      name: String(claimName).trim(),
      role,
      kind: role === "client" ? "client" : "user",
    };
  }

  // If actor is a client, fetch from Client model
  if (role === "client") {
    const clientId = req.auth?.clientId;
    if (!clientId)
      return { id: null, name: "Unknown User", role, kind: "client" };

    const clientDoc = await Client.findById(clientId)
      .select("contactName clientUsername email phone")
      .lean();

    const name =
      clientDoc?.contactName ||
      clientDoc?.clientUsername ||
      clientDoc?.email ||
      clientDoc?.phone ||
      "Unknown User";

    return { id: clientId, name: String(name).trim(), role, kind: "client" };
  }

  // Otherwise treat as internal user
  const userId =
    req.auth?.userId || req.auth?.id || req.user?.id || req.user?._id;
  if (!userId) return { id: null, name: "Unknown User", role, kind: "user" };

  const userDoc = await User.findById(userId)
    .select("displayName fullName name userName username email")
    .lean();

  const name =
    userDoc?.displayName ||
    userDoc?.fullName ||
    userDoc?.name ||
    userDoc?.userName ||
    userDoc?.username ||
    userDoc?.email ||
    "Unknown User";

  return { id: userId, name: String(name).trim(), role, kind: "user" };
}

// Optionally find an admin scoped to a company; fallback to any admin
async function findAdminUser(companyId) {
  const adminRole = await Role.findOne({ name: "admin" }).select("_id");
  if (!adminRole) return null;

  // First try admin mapped to this company (if you store it in "companies")
  let adminUser = null;
  if (companyId) {
    adminUser = await User.findOne({
      role: adminRole._id,
      companies: companyId,
    }).select("_id");
  }
  // Fallback: any admin
  if (!adminUser) {
    adminUser = await User.findOne({ role: adminRole._id }).select("_id");
  }
  return adminUser;
}

// Build message text per action
function buildSalesNotificationMessage(
  action,
  { actorName, partyName, invoiceNumber, amount }
) {
  const pName = partyName || "Unknown Party";
  switch (action) {
    case "create":
      return (
        `New sales entry created by ${actorName} for party ${pName}` +
        (amount != null ? ` of ₹${amount}.` : ".")
      );
    case "update":
      return `Sales entry updated by ${actorName} for party ${pName}.`;
    case "delete":
      return `Sales entry deleted by ${actorName} for party ${pName}.`;
    default:
      return `Sales entry ${action} by ${actorName} for party ${pName}.`;
  }
}

// Unified notifier for sales module
async function notifyAdminOnSalesAction({
  req,
  action,
  partyName,
  entryId,
  companyId,
  amount,
}) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser(companyId);
  if (!adminUser) {
    console.warn("notifyAdminOnSalesAction: no admin user found");
    return;
  }

  const message = buildSalesNotificationMessage(action, {
    actorName: actor.name,
    partyName,
    amount,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "sales", // entry type / category
    entryId, // sales entry id
    req.auth.clientId
  );
}

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

    // Construct a cache key based on the filter
    const cacheKey = `salesEntries:${JSON.stringify(filter)}`;

    // Check if the data is cached in Redis
    const cachedEntries = await getFromCache(cacheKey);
    if (cachedEntries) {
      // If cached, return the data directly
      return res.status(200).json({
        success: true,
        count: cachedEntries.length,
        data: cachedEntries,
      });
    }

    // If not cached, fetch the data from the database
    const entries = await SalesEntry.find(filter)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      }) // ✅
      .populate("company", "businessName")
      .sort({ date: -1 });
    // Return consistent format

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

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

// GET Sales Entries by clientId (for master admin)
exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Construct a cache key based on clientId
    const cacheKey = `salesEntriesByClient:${clientId}`;

    // Check if the data is cached in Redis
    const cachedEntries = await getFromCache(cacheKey);
    if (cachedEntries) {
      // If cached, return the data directly
      return res.status(200).json({
        success: true,
        count: cachedEntries.length,
        data: cachedEntries,
      });
    }

    // Fetch data from database if not cached
    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("company", "businessName")
      .sort({ date: -1 });

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

    // Return the fetched data
    res.status(200).json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch entries", error: err.message });
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

//     const { company: companyId, paymentMethod, party, totalAmount } = req.body;

//     if (!party) {
//       return res.status(400).json({ message: "Customer ID is required" });
//     }

//     if (paymentMethod === "Credit") {
//       partyDoc = await Party.findById(party);
//       if (!partyDoc) {
//         return res.status(404).json({ message: "Customer not found" });
//       }
//       partyDoc.balance += totalAmount;
//       await partyDoc.save();
//     }

//     if (!companyAllowedForUser(req, companyId)) {
//       return res
//         .status(403)
//         .json({ message: "You are not allowed to use this company" });
//     }

//     await session.withTransaction(async () => {
//       const {
//         party,
//         company: companyId,
//         date,
//         products,
//         services,
//         totalAmount,
//         description,
//         referenceNumber,
//         gstPercentage,
//         gstRate,
//         discountPercentage,
//         invoiceType,
//         taxAmount: taxAmountIn,
//         invoiceTotal: invoiceTotalIn,
//       } = req.body;

//       companyDoc = await Company.findOne({
//         _id: companyId,
//         client: req.auth.clientId,
//       }).session(session);
//       if (!companyDoc) throw new Error("Invalid company selected");

//       partyDoc = await Party.findOne({
//         _id: party,
//         createdByClient: req.auth.clientId,
//       }).session(session);
//       if (!partyDoc) throw new Error("Customer not found or unauthorized");

//       if (paymentMethod === "Credit") {
//   await Party.updateOne(
//     { _id: partyDoc._id, createdByClient: req.auth.clientId },
//     { $inc: { balance: finalTotal } },
//     { session }
//   );
// }

//       // Normalize products with GST calculations
//       let normalizedProducts = [], productsTotal = 0, productsTax = 0;
//       if (Array.isArray(products) && products.length > 0) {
//         const { items, computedTotal, computedTax } = await normalizeProducts(
//           products,
//           req.auth.clientId
//         );
//         normalizedProducts = items;
//         productsTotal = computedTotal;
//         productsTax = computedTax;
//       }

//       // Normalize services with GST calculations
//       let normalizedServices = [], servicesTotal = 0, servicesTax = 0;
//       if (Array.isArray(services) && services.length > 0) {
//         const { items, computedTotal, computedTax } = await normalizeServices(
//           services,
//           req.auth.clientId
//         );
//         normalizedServices = items;
//         servicesTotal = computedTotal;
//         servicesTax = computedTax;
//       }

//       const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0);
//       const computedTaxAmount = (productsTax || 0) + (servicesTax || 0);

//       // Use computed values if not explicitly provided
//       const finalTotal = typeof totalAmount === "number"
//         ? totalAmount
//         : typeof invoiceTotalIn === "number"
//           ? invoiceTotalIn
//           : +(computedSubtotal + computedTaxAmount).toFixed(2);

//       const finalTaxAmount = typeof taxAmountIn === "number"
//         ? taxAmountIn
//         : computedTaxAmount;

//       const atDate = date ? new Date(date) : new Date();

//       let attempts = 0;
//       while (true) {
//         attempts++;
//         const { invoiceNumber, yearYY, seq, prefix } =
//           await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

//         try {
//           const docs = await SalesEntry.create(
//             [
//               {
//                 party: partyDoc._id,
//                 company: companyDoc._id,
//                 client: req.auth.clientId,
//                 date,
//                 products: normalizedProducts,
//                 services: normalizedServices,
//                 totalAmount: finalTotal,
//                 taxAmount: finalTaxAmount, // NEW: Save total tax amount
//                 subTotal: computedSubtotal, // NEW: Save subtotal
//                 description,
//                 referenceNumber,
//                 gstPercentage: computedTaxAmount > 0 ?
//                   +((computedTaxAmount / computedSubtotal) * 100).toFixed(2) : 0,
//                 discountPercentage,
//                 invoiceType,
//                 gstin: companyDoc.gstin || null,
//                 invoiceNumber,
//                 invoiceYearYY: yearYY,
//                 paymentMethod,
//                 createdByUser: req.auth.userId,
//               },
//             ],
//             { session }
//           );

//           entry = docs[0];

//           await IssuedInvoiceNumber.create(
//             [
//               {
//                 company: companyDoc._id,
//                 series: "sales",
//                 invoiceNumber,
//                 yearYY,
//                 seq,
//                 prefix,
//               },
//             ],
//             { session }
//           );

//           break;
//         } catch (e) {
//           if (e?.code === 11000 && attempts < 20) {
//             continue;
//           }
//           throw e;
//         }
//       }
//     });

//     const clientId = entry.client.toString();  // Retrieve clientId from the entry

//     // Call the reusable cache deletion function
//     await deleteSalesEntryCache(clientId, companyId);

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
exports.createSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let entry, companyDoc, partyDoc, selectedBank;

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res
        .status(403)
        .json({ message: "Not allowed to create sales entries" });
    }

    // Destructure the request body
    const {
      company: companyId,
      paymentMethod,
      party,
      totalAmount,
      bank,
    } = req.body;

    if (!party) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (paymentMethod === "Credit") {
      partyDoc = await Party.findById(party);
      if (!partyDoc) {
        return res.status(404).json({ message: "Customer not found" });
      }
      partyDoc.balance += totalAmount;
      await partyDoc.save();
    }

    if (!companyAllowedForUser(req, companyId)) {
      return res
        .status(403)
        .json({ message: "You are not allowed to use this company" });
    }

    // 🔴 IMPORTANT: remove the pre-transaction save that caused validation
    // if (paymentMethod === "Credit") { ... partyDoc.save() }  <-- DELETE THIS WHOLE BLOCK

    await session.withTransaction(async () => {
      // Handle transaction logic here
      const {
        party,
        company: companyId,
        date,
        products,
        services,
        totalAmount,
        description,
        referenceNumber,
        gstRate,
        discountPercentage,
        invoiceType,
        taxAmount: taxAmountIn,
        invoiceTotal: invoiceTotalIn,
        notes,
      } = req.body;

      companyDoc = await Company.findOne({
        _id: companyId,
        client: req.auth.clientId,
      }).session(session);
      if (!companyDoc) throw new Error("Invalid company selected");

      partyDoc = await Party.findOne({
        _id: party,
        createdByClient: req.auth.clientId,
      }).session(session);
      if (!partyDoc) throw new Error("Customer not found or unauthorized");

      // Normalize products with GST calculations
      let normalizedProducts = [],
        productsTotal = 0,
        productsTax = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeProducts(
          products,
          req.auth.clientId,
          req.auth.userId
        );
        normalizedProducts = items;
        productsTotal = computedTotal;
        productsTax = computedTax;
      }

      // Normalize services with GST calculations
      let normalizedServices = [],
        servicesTotal = 0,
        servicesTax = 0;
      if (Array.isArray(services) && services.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeServices(
          services,
          req.auth.clientId
        );
        normalizedServices = items;
        servicesTotal = computedTotal;
        servicesTax = computedTax;
      }

      const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0);
      const computedTaxAmount = (productsTax || 0) + (servicesTax || 0);

      const finalTotal =
        typeof totalAmount === "number"
          ? totalAmount
          : typeof invoiceTotalIn === "number"
          ? invoiceTotalIn
          : +(computedSubtotal + computedTaxAmount).toFixed(2);

      const finalTaxAmount =
        typeof taxAmountIn === "number" ? taxAmountIn : computedTaxAmount;

      const atDate = date ? new Date(date) : new Date();

      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } =
          await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

        try {
          const docs = await SalesEntry.create(
            [
              {
                party: partyDoc._id,
                company: companyDoc._id,
                client: req.auth.clientId,
                date,
                products: normalizedProducts,
                services: normalizedServices,
                totalAmount: finalTotal,
                taxAmount: finalTaxAmount, // NEW: Save total tax amount
                subTotal: computedSubtotal, // NEW: Save subtotal
                description,
                referenceNumber,
                gstPercentage:
                  computedTaxAmount > 0
                    ? +((computedTaxAmount / computedSubtotal) * 100).toFixed(2)
                    : 0,
                discountPercentage,
                invoiceType,
                gstin: companyDoc.gstin || null,
                invoiceNumber,
                invoiceYearYY: yearYY,
                paymentMethod,
                createdByUser: req.auth.userId,
                notes: notes || "",
              },
            ],
            { session }
          );

          entry = docs[0];

          // Ensure only one response is sent
          if (!res.headersSent) {
            // After sales entry is created, notify the admin

            // Notify admin AFTER entry created (and before response)
            await notifyAdminOnSalesAction({
              req,
              action: "create",
              partyName: partyDoc?.name,
              entryId: entry._id,
              companyId: companyDoc?._id?.toString(),
              amount: entry?.totalAmount,
            });

            await IssuedInvoiceNumber.create(
              [
                {
                  company: companyDoc._id,
                  series: "sales",
                  invoiceNumber,
                  yearYY,
                  seq,
                  prefix,
                },
              ],
              { session }
            );

            // Send response after notification creation
            return res
              .status(201)
              .json({ message: "Sales entry created successfully", entry });
          }
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) continue;
          throw e;
        }
      }
    });

    const clientId = entry.client.toString(); // Retrieve clientId from the entry

    // Call the reusable cache deletion function
    await deleteSalesEntryCache(clientId, companyId);
  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};

const sameTenant = (entryClientId, userClientId) => {
  return entryClientId.toString() === userClientId.toString();
};

// UPDATE a sales entry (replace your current function)
// exports.updateSalesEntry = async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     // Ensure the user has permission
//     await ensureAuthCaps(req);
//     if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
//       return res
//         .status(403)
//         .json({ message: "Not allowed to update sales entries" });
//     }

//     // Find the sales entry by ID
//     const entry = await SalesEntry.findById(req.params.id);
//     if (!entry)
//       return res.status(404).json({ message: "Sales entry not found" });

//     // Tenant auth: allow privileged roles or same tenant only
//     if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     const { products, services, ...otherUpdates } = req.body;

//     // If company is being changed, check permission + existence
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
//     }

//     // If party is being changed, validate it belongs to the same tenant
//     let partyDoc = null;
//     if (otherUpdates.party) {
//       partyDoc = await Party.findOne({
//         _id: otherUpdates.party,
//         createdByClient: req.auth.clientId,
//       });
//       if (!partyDoc) {
//         return res
//           .status(400)
//           .json({ message: "Customer not found or unauthorized" });
//       }
//     }

//     let productsTotal = 0;
//     let servicesTotal = 0;

//     // Normalize product lines only if provided (Array.isArray allows clearing with [])
//     if (Array.isArray(products)) {
//       const { items: normalizedProducts, computedTotal } =
//         await normalizeProducts(products, req.auth.clientId);
//       entry.products = normalizedProducts;
//       productsTotal = computedTotal;
//     }

//     // Normalize service lines only if provided (Array.isArray allows clearing with [])
//     if (Array.isArray(services)) {
//       const { items: normalizedServices, computedTotal } =
//         await normalizeServices(services, req.auth.clientId);
//       entry.services = normalizedServices;
//       servicesTotal = computedTotal;
//     }

//     // Don’t allow changing invoiceNumber/year from payload
//     const {
//       totalAmount,
//       invoiceNumber,
//       invoiceYearYY,
//       gstRate,
//       notes,
//       ...rest
//     } = otherUpdates;
//     if (typeof gstRate === "number") {
//       entry.gstPercentage = gstRate;
//     }
//     if (notes !== undefined) {
//       entry.notes = notes;
//     }
//     Object.assign(entry, rest);

//     // Recalculate total if not explicitly provided
//     if (typeof totalAmount === "number") {
//       entry.totalAmount = totalAmount;
//     } else {
//       const sumProducts =
//         productsTotal ||
//         (Array.isArray(entry.products)
//           ? entry.products.reduce((s, it) => s + (Number(it.amount) || 0), 0)
//           : 0);
//       const sumServices =
//         servicesTotal ||
//         (Array.isArray(entry.services)
//           ? entry.services.reduce((s, it) => s + (Number(it.amount) || 0), 0)
//           : 0);
//       entry.totalAmount = sumProducts + sumServices;
//     }

//     await notifyAdminOnSalesAction({
//       req,
//       action: "update",
//       partyName:
//         (partyDoc ? partyDoc.name : null) ||
//         entry?.party?.name ||
//         "Unknown Party",
//       entryId: entry._id,
//       companyId: entry.company?.toString(),
//     });

//     // Adjust party balance on payment method update
//     if (!partyDoc) {
//       partyDoc = await Party.findOne({
//         _id: entry.party,
//         createdByClient: req.auth.clientId,
//       });
//     }

//     const originalPaymentMethod = entry.paymentMethod;
//     const originalAmount = entry.totalAmount || 0;
//     const newPaymentMethod =
//       otherUpdates.paymentMethod || originalPaymentMethod;
//     const newAmount =
//       typeof totalAmount === "number" ? totalAmount : entry.totalAmount;

//     if (originalPaymentMethod !== "Credit" && newPaymentMethod === "Credit") {
//       partyDoc.balance += newAmount;
//       await partyDoc.save();
//     } else if (
//       originalPaymentMethod === "Credit" &&
//       newPaymentMethod !== "Credit"
//     ) {
//       partyDoc.balance -= originalAmount;
//       await partyDoc.save();
//     } else if (
//       originalPaymentMethod === "Credit" &&
//       newPaymentMethod === "Credit" &&
//       originalAmount !== newAmount
//     ) {
//       const difference = newAmount - originalAmount;
//       partyDoc.balance += difference;
//       await partyDoc.save();
//     }

//     await entry.save();

//     // Retrieve companyId and clientId from the sales entry to delete related cache
//     const companyId = entry.company.toString();
//     const clientId = entry.client.toString(); // Retrieve clientId from the entry

//     // Call the reusable cache deletion function
//     await deleteSalesEntryCache(clientId, companyId);

//     res.json({ message: "Sales entry updated successfully", entry });
//   } catch (err) {
//     console.error("Error updating sales entry:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

exports.updateSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res.status(403).json({ message: "Not allowed to update sales entries" });
    }

    // Find the sales entry by ID
    const entry = await SalesEntry.findById(req.params.id);
    if (!entry)
      return res.status(404).json({ message: "Sales entry not found" });

    // Tenant auth: allow privileged roles or same tenant only
    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, services, paymentMethod, totalAmount, party, ...otherUpdates } = req.body;

    // Store original values for credit adjustment
    const originalPaymentMethod = entry.paymentMethod;
    const originalTotalAmount = entry.totalAmount;
    const originalPartyId = entry.party.toString();

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
    let partyDoc = null;
    if (otherUpdates.party) {
      partyDoc = await Party.findOne({
        _id: otherUpdates.party,
        createdByClient: req.auth.clientId,
      });
      if (!partyDoc) {
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

    // Don't allow changing invoiceNumber/year from payload
    const { invoiceNumber, invoiceYearYY, gstRate, notes, ...rest } = otherUpdates;
    if (typeof gstRate === "number") {
      entry.gstPercentage = gstRate;
    }
    if (notes !== undefined) {
      entry.notes = notes;
    }
    Object.assign(entry, rest);

    // Handle payment method and party changes for credit adjustment
    if (paymentMethod !== undefined) {
      entry.paymentMethod = paymentMethod;
    }

    if (party !== undefined) {
      entry.party = party;
    }

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

    // CREDIT BALANCE ADJUSTMENT LOGIC
    await session.withTransaction(async () => {
      const currentPartyId = party || originalPartyId;
      const currentPaymentMethod = paymentMethod || originalPaymentMethod;
      const currentTotalAmount = entry.totalAmount;

      // Find the current party document
      const currentPartyDoc = await Party.findOne({
        _id: currentPartyId,
        createdByClient: req.auth.clientId,
      }).session(session);
      
      if (!currentPartyDoc) {
        throw new Error("Party not found");
      }

      // Handle credit balance adjustments
      if (originalPaymentMethod === "Credit" && currentPaymentMethod === "Credit") {
        // Both old and new are Credit - adjust the balance by the difference
        if (originalPartyId === currentPartyId) {
          // Same party - adjust balance by amount difference
          const amountDifference = currentTotalAmount - originalTotalAmount;
          currentPartyDoc.balance += amountDifference;
        } else {
          // Different parties - remove from old party, add to new party
          const originalPartyDoc = await Party.findOne({
            _id: originalPartyId,
            createdByClient: req.auth.clientId,
          }).session(session);
          
          if (originalPartyDoc) {
            originalPartyDoc.balance -= originalTotalAmount;
            await originalPartyDoc.save({ session });
          }
          
          currentPartyDoc.balance += currentTotalAmount;
        }
      } else if (originalPaymentMethod === "Credit" && currentPaymentMethod !== "Credit") {
        // Changed from Credit to non-Credit - remove from party balance
        const originalPartyDoc = await Party.findOne({
          _id: originalPartyId,
          createdByClient: req.auth.clientId,
        }).session(session);
        
        if (originalPartyDoc) {
          originalPartyDoc.balance -= originalTotalAmount;
          await originalPartyDoc.save({ session });
        }
      } else if (originalPaymentMethod !== "Credit" && currentPaymentMethod === "Credit") {
        // Changed from non-Credit to Credit - add to party balance
        currentPartyDoc.balance += currentTotalAmount;
      }
      // If both are non-Credit, no balance adjustment needed

      await currentPartyDoc.save({ session });
    });

    await notifyAdminOnSalesAction({
      req,
      action: "update",
      partyName: (partyDoc ? partyDoc.name : null) || (entry?.party?.name) || "Unknown Party",
      entryId: entry._id,
      companyId: entry.company?.toString(),
    });

    await entry.save();

    // Retrieve companyId and clientId from the sales entry to delete related cache
    const companyId = entry.company.toString();
    const clientId = entry.client.toString();

    // Call the reusable cache deletion function
    await deleteSalesEntryCache(clientId, companyId);

    res.json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    console.error("Error updating sales entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};



exports.deleteSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await ensureAuthCaps(req);
    // Find the sales entry by ID
    const entry = await SalesEntry.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({ message: "Sales entry not found" });
    }

    // Only allow clients to delete their own entries
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Fetch the party document
    const partyDoc = await Party.findById(entry.party);
    if (!partyDoc) {
      console.error("Party not found");
      return res.status(400).json({ message: "Party not found" });
    }

    // Start the transaction
    await session.withTransaction(async () => {
      // Delete the sales entry
      await entry.deleteOne();

      // Retrieve companyId and clientId from the sales entry to delete related cache
      const companyId = entry.company.toString();
      const clientId = entry.client.toString(); // Retrieve clientId from the entry

      await notifyAdminOnSalesAction({
        req,
        action: "delete",
        partyName: partyDoc?.name,
        entryId: entry._id,
        companyId,
      });
      // Invalidate cache next
      await deleteSalesEntryCache(clientId, companyId);
      // Respond
      res.status(200).json({ message: "Sales entry deleted successfully" });
    });
  } catch (err) {
    console.error("Error deleting sales entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};
