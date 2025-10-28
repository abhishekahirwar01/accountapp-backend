const mongoose = require("mongoose");
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const BankDetail = require("../models/BankDetail");
const User = require("../models/User");
const normalizePurchaseProducts = require("../utils/normalizePurchaseProducts");
const normalizePurchaseServices = require("../utils/normalizePurchaseServices");
const { getFromCache, setToCache } = require('../RedisCache');
const { deletePurchaseEntryCache, deletePurchaseEntryCacheByUser } = require('../utils/cacheHelpers')

// load effective caps if middleware didn’t attach them
const { getEffectivePermissions } = require("../services/effectivePermissions");

const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");



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
      clientName: req.user.contactName,
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
      undefined; // no "Unknown" here
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


// ---------- Helpers: actor + admin notification (purchase) ----------

// Build message per action (purchase wording)
function buildPurchaseNotificationMessage(action, { actorName, vendorName, amount }) {
  const vName = vendorName || "Unknown Vendor";
  switch (action) {
    case "create":
      return `New purchase entry created by ${actorName} for vendor ${vName}` +
        (amount != null ? ` of ₹${amount}.` : ".");
    case "update":
      return `Purchase entry updated by ${actorName} for vendor ${vName}.`;
    case "delete":
      return `Purchase entry deleted by ${actorName} for vendor ${vName}.`;
    default:
      return `Purchase entry ${action} by ${actorName} for vendor ${vName}.`;
  }
}

// Unified notifier for purchase module
async function notifyAdminOnPurchaseAction({ req, action, vendorName, entryId, companyId, amount }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser(companyId);
  if (!adminUser) {
    console.warn("notifyAdminOnPurchaseAction: no admin user found");
    return;
  }

  const message = buildPurchaseNotificationMessage(action, {
    actorName: actor.name,
    vendorName,
    amount,
  });

  await createNotification(
    message,
    adminUser._id,       // recipient (admin)
    actor.id,            // actor id (user OR client)
    action,              // "create" | "update" | "delete"
    "purchase",          // category
    entryId,             // purchase entry id
    req.auth.clientId
  );
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
            totalAmount, description, referenceNumber, gstPercentage, invoiceType, paymentMethod,
          } = req.body;

          // Make sure companyId is defined here
          companyDoc = await Company.findOne({ _id: companyId, client: req.auth.clientId }).session(session);
          if (!companyDoc) throw new Error("Invalid company selected");

          vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId }).session(session);
          if (!vendorDoc) throw new Error("Vendor not found or unauthorized");

          // Validate the bank field - make sure the bank belongs to the company (optional)
          let selectedBank = null;
          if (bank && mongoose.Types.ObjectId.isValid(bank)) {
            selectedBank = await BankDetail.findById(bank);
            if (!selectedBank || !selectedBank.company.equals(companyId)) {
              selectedBank = null; // Invalid bank, set to null
            }
          }

          let normalizedProducts = [], productsTotal = 0;
          if (Array.isArray(products) && products.length > 0) {
            const { items, computedTotal } = await normalizePurchaseProducts(
              products,
              req.auth.clientId,
              req.auth.userId /* pass session if normalize funcs use db */
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
            bank: bank && mongoose.Types.ObjectId.isValid(bank) ? bank : null,
            paymentMethod,
          }], { session });
          entry = docs[0];

          // Handle vendor balance for credit purchases
          if (paymentMethod === "Credit") {
            vendorDoc.balance -= finalTotal; // Negative balance means we owe the vendor
            await vendorDoc.save({ session });
          }



        }, txnOpts);

        // Access clientId and companyId after creation
        const clientId = entry.client.toString();
        const companyIdStr = companyId?.toString?.() || companyId;

        // Notify admin (outside the transaction, after success)
        const vendorName = vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor";
        await notifyAdminOnPurchaseAction({
          req,
          action: "create",
          vendorName,
          entryId: entry._id,
          companyId: companyIdStr,
          amount: entry?.totalAmount,
        });

        // Invalidate cache
        // await deletePurchaseEntryCache(clientId, companyIdStr);

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
    // const cachedEntries = await getFromCache(cacheKey);
    // if (cachedEntries) {
    //   // If cached, return the data directly
    //   return res.status(200).json({
    //     success: true,
    //     count: cachedEntries.length,
    //     data: cachedEntries,
    //   });
    // }

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
    // await setToCache(cacheKey, entries);

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
    // const cachedEntries = await getFromCache(cacheKey);
    // if (cachedEntries) {
    //   // If cached, return the data directly
    //   return res.status(200).json({
    //     success: true,
    //     count: cachedEntries.length,
    //     data: cachedEntries,
    //   });
    // }

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

    // await setToCache(cacheKey, entries);

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

    // Store original values BEFORE any modifications
    const originalPaymentMethod = entry.paymentMethod;
    const originalTotalAmount = entry.totalAmount;
    const originalVendorId = entry.vendor.toString();

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

    // Handle vendor balance adjustments for payment method changes
    const newPaymentMethod = otherUpdates.paymentMethod || originalPaymentMethod;
    const newTotalAmount = entry.totalAmount; // after update

    if (originalPaymentMethod === "Credit" && newPaymentMethod === "Credit") {
      // Both credit - adjust by difference (negative means we owe more)
      const amountDifference = newTotalAmount - originalTotalAmount;
      const vendorDoc = await Vendor.findById(entry.vendor);
      if (vendorDoc) {
        vendorDoc.balance -= amountDifference; // Subtract difference (more negative = owe more)
        await vendorDoc.save();
      }
    } else if (originalPaymentMethod === "Credit" && newPaymentMethod !== "Credit") {
      // Changed from credit to non-credit - add back to balance (owe less)
      const vendorDoc = await Vendor.findById(entry.vendor);
      if (vendorDoc) {
        vendorDoc.balance += originalTotalAmount; // Add back what we owed
        await vendorDoc.save();
      }
    } else if (originalPaymentMethod !== "Credit" && newPaymentMethod === "Credit") {
      // Changed from non-credit to credit - subtract from balance (owe more)
      const vendorDoc = await Vendor.findById(entry.vendor);
      if (vendorDoc) {
        vendorDoc.balance -= newTotalAmount; // Subtract new amount (owe more)
        await vendorDoc.save();
      }
    }
    // If both non-credit, no change needed

    await entry.save();
    // Notify after save
    const companyId = entry.company.toString();
    const clientId = entry.client.toString();

    const vendorDoc = await Vendor.findById(entry.vendor).select("vendorName name title").lean();
    const vendorName = vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor";

    await notifyAdminOnPurchaseAction({
      req,
      action: "update",
      vendorName,
      entryId: entry._id,
      companyId,
    });

    // clear cache
    // await deletePurchaseEntryCache(clientId, companyId);
    return res.json({ message: "Purchase entry updated successfully", entry });

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

    // Handle vendor balance reversal for credit purchases
    if (entry.paymentMethod === "Credit") {
      if (vendorDoc) {
        vendorDoc.balance += entry.totalAmount; // Add back what we owed (less negative)
        await vendorDoc.save();
      }
    }

    await entry.deleteOne();

    const clientId = entry.client.toString();
    const companyId = entry.company.toString();


    await notifyAdminOnPurchaseAction({
      req,
      action: "delete",
      vendorName,
      entryId: entry._id,
      companyId,
    });

    // Invalidate cache
    // await deletePurchaseEntryCache(clientId, companyId);

    return res.json({ message: "Purchase deleted" });

  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};