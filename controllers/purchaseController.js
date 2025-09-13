const mongoose = require("mongoose");
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const BankDetail = require("../models/BankDetail");
const normalizePurchaseProducts = require("../utils/normalizePurchaseProducts");
const normalizePurchaseServices = require("../utils/normalizePurchaseServices");
const { getFromCache, setToCache } = require('../RedisCache');
const { deletePurchaseEntryCache, deletePurchaseEntryCacheByUser } = require('../utils/cacheHelpers')

// load effective caps if middleware didn’t attach them
const { getEffectivePermissions } = require("../services/effectivePermissions");

const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role")


// --- helpers -----------------------------------------------------

const PRIV_ROLES = new Set(["master", "client", "admin"]);

async function ensureAuthCaps(req) {
  // Support older code paths that put auth on req.user
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      userName: req.user.userName || 'Unknown',
    };
  }
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }

  // NEW: Ensure userName is always set
  if (!req.auth.userName) {
    // Try to get the user's name from the database if not available in auth
    try {
      const user = await User.findById(req.auth.userId);
      if (user) {
        req.auth.userName = user.name || user.username || user.email || 'Unknown User';
      } else {
        req.auth.userName = 'Unknown User';
      }
    } catch (error) {
      console.error("Error fetching user for userName:", error);
      req.auth.userName = 'Unknown User';
    }
  }
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth.role);
}

function sameTenant(a, b) {
  return String(a) === String(b);
}

function companyAllowedForUser(req, companyId) {
  if (!companyId) return true;
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  return allowed.length === 0 || allowed.includes(String(companyId));
}


// --- CREATE ------------------------------------------------------
exports.createPurchaseEntry = async (req, res) => {
  const session = await mongoose.startSession();
  const txnOpts = {
    readPreference: "primary",
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
  };

  try {
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreatePurchaseEntries) {
      return res.status(403).json({ message: "Not allowed to create purchase entries" });
    }
    const { company: companyId, bank } = req.body;  // Make sure companyId is properly initialized here
    if (!companyAllowedForUser(req, companyId)) {
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    let entry;
    let vendorDoc, companyDoc;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await session.withTransaction(async () => {
          const {
            vendor, company: _companyId, date, products, services,
            totalAmount, description, referenceNumber, gstPercentage, invoiceType,
          } = req.body;

          // Make sure companyId is defined here
          companyDoc = await Company.findOne({ _id: companyId, client: req.auth.clientId }).session(session);
          if (!companyDoc) throw new Error("Invalid company selected");

          vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId }).session(session);
          if (!vendorDoc) throw new Error("Vendor not found or unauthorized");

          // Validate the bank field - make sure the bank belongs to the company
          const selectedBank = await BankDetail.findById(bank);
          // if (!selectedBank || !selectedBank.company.equals(companyId)) {
          //   throw new Error("Invalid bank selected for this company");
          // }

          let normalizedProducts = [], productsTotal = 0;
          if (Array.isArray(products) && products.length > 0) {
            const { items, computedTotal } = await normalizePurchaseProducts(
              products,
              req.auth.clientId /* pass session if normalize funcs use db */
            );
            normalizedProducts = items; productsTotal = computedTotal;
          }

          let normalizedServices = [], servicesTotal = 0;
          if (Array.isArray(services) && services.length > 0) {
            const { items, computedTotal } = await normalizePurchaseServices(
              services,
              req.auth.clientId /* pass session if normalize funcs use db */
            );
            normalizedServices = items; servicesTotal = computedTotal;
          }

          const finalTotal = (typeof totalAmount === "number")
            ? totalAmount
            : (productsTotal + servicesTotal);

          const docs = await PurchaseEntry.create([{
            vendor: vendorDoc._id,
            company: companyDoc._id,
            client: req.auth.clientId,
            createdByUser: req.auth.userId,
            date,
            products: normalizedProducts,
            services: normalizedServices,
            totalAmount: finalTotal,
            description,
            referenceNumber,
            gstPercentage,
            invoiceType,
            gstin: companyDoc.gstin || null,
            bank: req.body.bank,
          }], { session });
          entry = docs[0];

          // NEW: Create notification for admin after purchase entry is created
          const adminRole = await Role.findOne({ name: "admin" });
          console.log("Admin role:", adminRole);
          if (!adminRole) {
            console.error("Admin role not found");
            return;
          }

          const adminUser = await User.findOne({
            role: adminRole._id
          });

          console.log("Admin user lookup:", { companyId, adminUser: adminUser ? adminUser._id : "not found" });

          console.log("Creating notification for admin user...");
          if (adminUser) {
            console.log("req.auth:", req.auth);

            // DEBUG: Look up the user document to get the actual userName
            const userDoc = await User.findById(req.auth.userId);
            console.log("User document found:", userDoc);

            // FIX: Use multiple fallback options for userName
            const userName = userDoc?.userName || userDoc?.name ||
              userDoc?.username || req.auth.userName ||
              req.auth.name || 'Unknown User';

            // FIX: Use multiple fallback options for vendorName
            const vendorName = vendorDoc?.name || vendorDoc?.vendorName ||
              vendorDoc?.title || 'Unknown Vendor';

            console.log("Final values - UserName:", userName, "VendorName:", vendorName);

            const notificationMessage = `New purchase entry created by ${userName} for vendor ${vendorName}.`;

            await createNotification(
              notificationMessage,
              adminUser._id,
              req.auth.userId,
              "create", // action type
              "purchase", // entry type
              entry._id,
              req.auth.clientId
            );
            console.log("Purchase notification created successfully.");
          }

        }, txnOpts);

        // Access clientId and companyId after creation
        const clientId = entry.client.toString();

        // Call the cache deletion function
        await deletePurchaseEntryCache(clientId, companyId);
        // await deletePurchaseEntryCacheByUser(clientId, companyId);

        return res.status(201).json({ message: "Purchase entry created successfully", entry });

      } catch (e) {
        const labels = new Set(e?.errorLabels || e?.errorLabelSet || []);
        if (labels.has("TransientTransactionError") || e?.code === 112 || e?.code === 11000) {
          // small backoff then retry
          await new Promise(r => setTimeout(r, 30 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }

    return res.status(500).json({ message: "Failed to create purchase entry after retries" });
  } catch (err) {
    console.error("createPurchaseEntry error:", err);
    return res.status(500).json({ message: "Failed to create purchase entry", error: err.message });
  } finally {
    session.endSession();
  }
};
// --- LIST / SEARCH / PAGINATE -----------------------------------
exports.getPurchaseEntries = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const {
      q,
      companyId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 100,
    } = req.query;

    const clientId = req.auth.clientId;  // Extract clientId correctly

    const where = {
      client: clientId,
      ...(companyAllowedForUser(req, companyId) ? { ...(companyId && { company: companyId }) } : { company: { $in: [] } }),
    };

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.$gte = new Date(dateFrom);
      if (dateTo) where.date.$lte = new Date(dateTo);
    }

    if (q) {
      where.$or = [
        { description: { $regex: String(q), $options: "i" } },
        { referenceNumber: { $regex: String(q), $options: "i" } },
      ];
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    // Construct a cache key based on the query parameters
    const cacheKey = `purchaseEntries:${JSON.stringify({ clientId, companyId })}`;

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
    const query = PurchaseEntry.find(where)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "vendor", select: "vendorName" })
      .populate({ path: "products.product", select: "name unitType" })
      .populate({ path: "services.serviceName", select: "serviceName" })
      .populate({ path: "services.service", select: "serviceName", strictPopulate: false })
      .populate({ path: "company", select: "businessName" });

    const [entries, total] = await Promise.all([
      query.lean(),
      PurchaseEntry.countDocuments(where),
    ]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: perPage,
      data: entries,
    });
  } catch (err) {
    console.error("getPurchaseEntries error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};


// --- ADMIN: LIST BY CLIENT --------------------------------------
exports.getPurchaseEntriesByClient = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const { clientId } = req.params;
    const { companyId, page = 1, limit = 100 } = req.query;

    // only master/admin can query arbitrary clients; client can only query self
    if (req.auth.role === "client" && String(clientId) !== String(req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (!PRIV_ROLES.has(req.auth.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const where = { client: clientId };
    if (companyId) where.company = companyId;

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    // Construct a cache key based on clientId and query parameters
    const cacheKey = `purchaseEntriesByClient:${JSON.stringify({ client: clientId, company: companyId })}`;

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

    const [entries, total] = await Promise.all([
      PurchaseEntry.find(where)
        .sort({ date: -1 })
        .skip(skip)
        .limit(perPage)
        .populate({ path: "vendor", select: "vendorName" })
        .populate({ path: "products.product", select: "name unitType" })
        .populate({ path: "services.serviceName", select: "serviceName" })
        .populate({ path: "services.service", select: "serviceName", strictPopulate: false })
        .populate({ path: "company", select: "businessName" })
        .lean(),
      PurchaseEntry.countDocuments(where),
    ]);

    await setToCache(cacheKey, entries);

    res.status(200).json({ entries, total, page: Number(page), limit: perPage });
  } catch (err) {
    console.error("getPurchaseEntriesByClient error:", err);
    res.status(500).json({ error: err.message });
  }
};



// --- UPDATE ------------------------------------------------------
exports.updatePurchaseEntry = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const entry = await PurchaseEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Purchase entry not found" });

    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, services, ...otherUpdates } = req.body;

    // Company change checks
    if (otherUpdates.company) {
      if (!companyAllowedForUser(req, otherUpdates.company)) {
        return res.status(403).json({ message: "You are not allowed to use this company" });
      }
      const company = await Company.findOne({ _id: otherUpdates.company, client: req.auth.clientId });
      if (!company) return res.status(400).json({ message: "Invalid company selected" });
    }

    // Vendor change check
    if (otherUpdates.vendor) {
      const vendorDoc = await Vendor.findOne({ _id: otherUpdates.vendor, createdByClient: req.auth.clientId });
      if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
    }

    let productsTotal = 0;
    let servicesTotal = 0;

    if (Array.isArray(products)) {
      const { items: normalizedProducts, computedTotal } =
        await normalizePurchaseProducts(products, req.auth.clientId);
      entry.products = normalizedProducts;
      productsTotal = computedTotal;
    }

    if (Array.isArray(services)) {
      const { items: normalizedServices, computedTotal } =
        await normalizePurchaseServices(services, req.auth.clientId);
      entry.services = normalizedServices;
      servicesTotal = computedTotal;
    }

    // ⛔ invoice fields no longer special; just apply updates normally
    Object.assign(entry, otherUpdates);

    // compute total if not explicitly provided
    if (typeof otherUpdates.totalAmount === "number") {
      entry.totalAmount = otherUpdates.totalAmount;
    } else {
      const sumProducts =
        productsTotal ||
        (Array.isArray(entry.products) ? entry.products.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0);
      const sumServices =
        servicesTotal ||
        (Array.isArray(entry.services) ? entry.services.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0);
      entry.totalAmount = sumProducts + sumServices;
    }

    await entry.save();
    // NEW: Create notification for admin after purchase entry is updated
    const adminRole = await Role.findOne({ name: "admin" });
    if (adminRole) {
      const adminUser = await User.findOne({ role: adminRole._id });
      if (adminUser) {
        // Get vendor info
        const vendorDoc = await Vendor.findById(entry.vendor);
        const vendorName = vendorDoc?.name || vendorDoc?.vendorName || "Unknown Vendor";

        // DEBUG: Check what entry contains
        console.log("Purchase entry structure:", entry);

        // FIX: Use the correct user reference
        // Option 1: Use the user who made the request (usually the correct approach)
        const requestingUserDoc = await User.findById(req.auth.userId);

        // Option 2: If entry has a createdByUser field, use that
        // const requestingUserDoc = await User.findById(entry.createdByUser);

        // Use safe fallback with multiple possible field names
        const userName = requestingUserDoc?.userName || requestingUserDoc?.name ||
          requestingUserDoc?.username || 'Unknown User';

        console.log("Found user document:", requestingUserDoc);
        console.log("Extracted user name:", userName);

        const notificationMessage = `Purchase entry updated by ${userName} for vendor ${vendorName}.`;

        await createNotification(
          notificationMessage,
          adminUser._id,
          req.auth.userId,
          "update", // action type
          "purchase", // entry type
          entry._id,
          req.auth.clientId
        );
        console.log("Purchase update notification created successfully.");
      }
    }

    // After deletion, clear the relevant cache for client and company
    const clientId = entry.client.toString();
    const companyId = entry.company.toString();

    // Call the cache deletion function
    await deletePurchaseEntryCache(clientId, companyId);
    //  await deletePurchaseEntryCacheByUser(clientId, companyId);
    res.json({ message: "Purchase entry updated successfully", entry });
  } catch (err) {
    console.error("updatePurchaseEntry error:", err);
    res.status(500).json({ error: err.message });
  }
};


// --- DELETE ------------------------------------------------------
exports.deletePurchaseEntry = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const entry = await PurchaseEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Purchase not found" });

    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // NEW: Get vendor info before deletion for notification
    const vendorDoc = await Vendor.findById(entry.vendor);
    
    // DEBUG: Look up the user document to get the actual userName
    const userDoc = await User.findById(req.auth.userId);
    console.log("User document found for delete:", userDoc);
    
    // FIX: Use multiple fallback options for userName
    const userName = userDoc?.userName || userDoc?.name || 
                    userDoc?.username || req.auth.userName || 
                    req.auth.name || 'Unknown User';
    
    // FIX: Use multiple fallback options for vendorName
    const vendorName = vendorDoc?.name || vendorDoc?.vendorName || 
                      vendorDoc?.title || 'Unknown Vendor';

    console.log("Final values - UserName:", userName, "VendorName:", vendorName);

    await entry.deleteOne();

    // NEW: Create notification for admin after purchase entry is deleted
    const adminRole = await Role.findOne({ name: "admin" });
    if (adminRole) {
      const adminUser = await User.findOne({ role: adminRole._id });
      if (adminUser) {
        const notificationMessage = `Purchase entry deleted by ${userName} for vendor ${vendorName}.`;
        await createNotification(
          notificationMessage,
          adminUser._id,
          req.auth.userId,
          "delete", // action type
          "purchase", // entry type
          entry._id, // Use the original entry ID even though it's deleted
          req.auth.clientId
        );
        console.log("Purchase delete notification created successfully.");
      }
    }

    // After deletion, clear the relevant cache for client and company
    const clientId = entry.client.toString();
    const companyId = entry.company.toString();

    // Call the cache deletion function
    await deletePurchaseEntryCache(clientId, companyId);
    //  await deletePurchaseEntryCacheByUser(clientId, companyId);
    res.json({ message: "Purchase deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};