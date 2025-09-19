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
const { getFromCache, setToCache } = require('../RedisCache');
const { deleteSalesEntryCache, deleteSalesEntryCacheByUser } = require('../utils/cacheHelpers');
// at top of controllers/salesController.js
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role")


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
      userName: req.user.userName || 'Unknown',  // Ensure userName is set here
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
if (req.auth.role !== 'client' && !req.auth.userName && req.auth.userId) {
  const user = await User.findById(req.auth.userId)
    .select('displayName fullName name userName username email')
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


// ---------- Helpers: actor + admin notification (sales) ----------

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
      id: req.auth?.userId || req.auth?.id || req.user?.id || req.auth?.clientId || null,
      name: String(claimName).trim(),
      role,
      kind: role === "client" ? "client" : "user",
    };
  }

  // If actor is a client, fetch from Client model
  if (role === "client") {
    const clientId = req.auth?.clientId;
    if (!clientId) return { id: null, name: "Unknown User", role, kind: "client" };

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
  const userId = req.auth?.userId || req.auth?.id || req.user?.id || req.user?._id;
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
    adminUser = await User.findOne({ role: adminRole._id, companies: companyId }).select("_id");
  }
  // Fallback: any admin
  if (!adminUser) {
    adminUser = await User.findOne({ role: adminRole._id }).select("_id");
  }
  return adminUser;
}

// Build message text per action
function buildSalesNotificationMessage(action, { actorName, partyName, invoiceNumber, amount }) {
  const pName = partyName || "Unknown Party";
  switch (action) {
    case "create":
      return `New sales entry created by ${actorName} for party ${pName}` +
        (amount != null ? ` of ₹${amount}.` : ".");
    case "update":
      return `Sales entry updated by ${actorName} for party ${pName}.`;
    case "delete":
      return `Sales entry deleted by ${actorName} for party ${pName}.`;
    default:
      return `Sales entry ${action} by ${actorName} for party ${pName}.`;
  }
}

// Unified notifier for sales module
async function notifyAdminOnSalesAction({ req, action, partyName, entryId, companyId, amount }) {
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
    adminUser._id,        // recipient (admin)
    actor.id,             // actor id (user OR client)
    action,               // "create" | "update" | "delete"
    "sales",              // entry type / category
    entryId,              // sales entry id
    req.auth.clientId
  );
}


// In your getSalesEntries controller
exports.getSalesEntries = async (req, res) => {
  try {
    await ensureAuthCaps(req);
    const filter = {};

    // For master admin, don't filter by client to allow viewing all clients' data
    if (req.auth.role !== "master") {
      if (req.auth.role === "client") {
        filter.client = req.auth.clientId;
      } else {
        filter.client = req.auth.clientId; // For staff users, still filter by their client
      }
    }

    if (req.query.companyId) {
      filter.company = req.query.companyId;
    }

    // Add date range filter if provided
    if (req.query.dateFrom || req.query.dateTo) {
      filter.date = {};
      if (req.query.dateFrom) filter.date.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.date.$lte = new Date(req.query.dateTo);
    }

    // Add search query filter if provided
    if (req.query.q) {
      filter.$or = [
        { description: { $regex: String(req.query.q), $options: "i" } },
        { referenceNumber: { $regex: String(req.query.q), $options: "i" } },
      ];
    }

    const perPage = Math.min(Number(req.query.limit) || 100, 500);
    const skip = (Number(req.query.page) - 1) * perPage;

    // Construct a more predictable cache key
    const cacheKeyData = {
      client: req.auth.role === "master" ? "all" : (req.auth.clientId || req.auth.userId || "unknown"),
      company: req.query.companyId || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      q: req.query.q || null,
      page: Number(req.query.page) || 1,
      limit: perPage
    };
    const cacheKey = `salesEntries:${JSON.stringify(cacheKeyData)}`;

    console.log('Sales req.auth:', req.auth); // Debug log
    console.log('Sales cache key data:', cacheKeyData); // Debug log
    console.log('Sales cache key:', cacheKey); // Debug log

    // Check if the data is cached in Redis
    const cached = await getFromCache(cacheKey);
    if (cached) {
      // Handle both old and new cache formats for backward compatibility
      const data = cached.data || cached;
      const total = cached.total || (Array.isArray(data) ? data.length : 0);
      return res.status(200).json({
        success: true,
        total,
        page: Number(req.query.page),
        limit: perPage,
        data,
      });
    }

    // If not cached, fetch the data from the database
    const query = SalesEntry.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("company", "businessName");

    const [data, total] = await Promise.all([
      query.lean(),
      SalesEntry.countDocuments(filter),
    ]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, { data, total });

    res.status(200).json({
      success: true,
      total,
      page: Number(req.query.page),
      limit: perPage,
      data,
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
    await ensureAuthCaps(req);
    if (!userIsPriv(req)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { clientId } = req.params;
    const { companyId, page = 1, limit = 100 } = req.query;

    // Construct query with optional company filter
    const where = { client: clientId };
    if (companyId) where.company = companyId;

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    // Construct a consistent cache key
    const cacheKeyData = {
      clientId: clientId,
      companyId: companyId || null,
      page: Number(page) || 1,
      limit: perPage
    };
    const cacheKey = `salesEntriesByClient:${JSON.stringify(cacheKeyData)}`;

    // Check if the data is cached in Redis
    const cached = await getFromCache(cacheKey);
    if (cached) {
      // Handle both old and new cache formats for backward compatibility
      const data = cached.data || cached;
      const total = cached.total || (Array.isArray(data) ? data.length : 0);
      return res.status(200).json({
        success: true,
        total,
        page: Number(page),
        limit: perPage,
        data,
      });
    }

    // Fetch data from database if not cached
    const query = SalesEntry.find(where)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("company", "businessName");

    const [data, total] = await Promise.all([
      query.lean(),
      SalesEntry.countDocuments(where),
    ]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, { data, total });

    // Return the data in consistent format
    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: perPage,
      data,
    });
  } catch (err) {
    console.error("getSalesEntriesByClient error:", err);
    res.status(500).json({ message: "Failed to fetch entries", error: err.message });
  }
};




exports.createSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let entry, companyDoc, partyDoc, selectedBank;

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res.status(403).json({ message: "Not allowed to create sales entries" });
    }

    // Destructure the request body
    const { company: companyId, paymentMethod, party, totalAmount, bank } = req.body;

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
      return res.status(403).json({ message: "You are not allowed to use this company" });
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
      let normalizedProducts = [], productsTotal = 0, productsTax = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeProducts(
          products,
          req.auth.clientId
        );
        normalizedProducts = items;
        productsTotal = computedTotal;
        productsTax = computedTax;
      }

      // Normalize services with GST calculations
      let normalizedServices = [], servicesTotal = 0, servicesTax = 0;
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

      const finalTotal = typeof totalAmount === "number"
        ? totalAmount
        : typeof invoiceTotalIn === "number"
          ? invoiceTotalIn
          : +(computedSubtotal + computedTaxAmount).toFixed(2);

      const finalTaxAmount = typeof taxAmountIn === "number" ? taxAmountIn : computedTaxAmount;

      const atDate = date ? new Date(date) : new Date();

      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } = await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

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
                gstPercentage: computedTaxAmount > 0 ?
                  +((computedTaxAmount / computedSubtotal) * 100).toFixed(2) : 0,
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

            // Invalidate cache before response
            const clientId = entry.client.toString();
            await deleteSalesEntryCache(clientId, companyId);

            // Send response after notification creation
            return res.status(201).json({ message: "Sales entry created successfully", entry });
          }
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) continue;
          throw e;
        }
      }
    });

  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res.status(500).json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};




const sameTenant = (entryClientId, userClientId) => {
  return entryClientId.toString() === userClientId.toString();
};


// UPDATE a sales entry (replace your current function)
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

    // Don’t allow changing invoiceNumber/year from payload
    const { totalAmount, invoiceNumber, invoiceYearYY, gstRate, notes, ...rest } =
      otherUpdates;
    if (typeof gstRate === "number") {
      entry.gstPercentage = gstRate;
    }
    if (notes !== undefined) {
      entry.notes = notes;
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
    const clientId = entry.client.toString();  // Retrieve clientId from the entry

    // Call the reusable cache deletion function
    await deleteSalesEntryCache(clientId, companyId);

    res.json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    console.error("Error updating sales entry:", err);
    res.status(500).json({ error: err.message });
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
      const clientId = entry.client.toString();  // Retrieve clientId from the entry

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




