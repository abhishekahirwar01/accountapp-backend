// controllers/paymentController.js
const PaymentEntry = require("../models/PaymentEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { getFromCache, setToCache } = require('../RedisCache');
const { deletePaymentEntryCache, deletePaymentEntryCacheByUser } = require("../utils/cacheHelpers");
const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role")

// roles that can bypass allowedCompanies restrictions
const PRIV_ROLES = new Set(["master", "client", "admin"]);

function sameTenant(a, b) {
  return String(a) === String(b);
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth?.role);
}

async function ensureAuthCaps(req) {
  // Normalize legacy req.user into req.auth
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      userName: req.user.userName,       // may be undefined for clients
      clientName: req.user.contactName,
    };
  }
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    if (!req.auth.caps) req.auth.caps = caps;
    if (!req.auth.allowedCompanies) req.auth.allowedCompanies = allowedCompanies;
  }

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
      undefined; // no "Unknown" fallback
  }
}

// ---------- Helpers: actor + admin notification (payment) ----------

// Robust actor resolver (clients -> Client.contactName; staff -> User names)
async function resolveActor(req) {
  const role = req.auth?.role;

  const validName = (v) => {
    const s = String(v ?? '').trim();
    return s && !/^unknown$/i.test(s) && s !== '-';
  };

  if (role === "client") {
    // Prefer name from token if available
    if (validName(req.auth?.clientName)) {
      return { id: req.auth?.clientId || null, name: String(req.auth.clientName).trim(), role, kind: "client" };
    }
    // Fallback: fetch Client
    const clientId = req.auth?.clientId;
    if (!clientId) return { id: null, name: "Unknown User", role, kind: "client" };

    const clientDoc = await Client.findById(clientId)
      .select("contactName clientUsername email phone")
      .lean();

    const name =
      (validName(clientDoc?.contactName) && clientDoc.contactName) ||
      (validName(clientDoc?.clientUsername) && clientDoc.clientUsername) ||
      (validName(clientDoc?.email) && clientDoc.email) ||
      (validName(clientDoc?.phone) && clientDoc.phone) ||
      "Unknown User";

    return { id: clientId, name: String(name).trim(), role, kind: "client" };
  }

  // Staff (admin/master/etc.)
  const claimName =
    req.auth?.displayName ||
    req.auth?.fullName ||
    req.auth?.name ||
    req.auth?.userName ||
    req.auth?.username ||
    null;

  if (validName(claimName)) {
    return {
      id: req.auth?.userId || req.auth?.id || req.user?.id || null,
      name: String(claimName).trim(),
      role,
      kind: "user",
    };
  }

  const userId = req.auth?.userId || req.auth?.id || req.user?.id || req.user?._id;
  if (!userId) return { id: null, name: "Unknown User", role, kind: "user" };

  const userDoc = await User.findById(userId)
    .select("displayName fullName name userName username email")
    .lean();

  const name =
    (validName(userDoc?.displayName) && userDoc.displayName) ||
    (validName(userDoc?.fullName) && userDoc.fullName) ||
    (validName(userDoc?.name) && userDoc.name) ||
    (validName(userDoc?.userName) && userDoc.userName) ||
    (validName(userDoc?.username) && userDoc.username) ||
    (validName(userDoc?.email) && userDoc.email) ||
    "Unknown User";

  return { id: userId, name: String(name).trim(), role, kind: "user" };
}

// Find an admin associated with a company; fallback to any admin
async function findAdminUser(companyId) {
  const adminRole = await Role.findOne({ name: "admin" }).select("_id");
  if (!adminRole) return null;

  let adminUser = null;
  if (companyId) {
    adminUser = await User.findOne({ role: adminRole._id, companies: companyId }).select("_id");
  }
  if (!adminUser) {
    adminUser = await User.findOne({ role: adminRole._id }).select("_id");
  }
  return adminUser;
}

// Build message per action (payment wording)
function buildPaymentNotificationMessage(action, { actorName, vendorName, amount }) {
  const vName = vendorName || "Unknown Vendor";
  switch (action) {
    case "create":
      return `New payment entry created by ${actorName} for vendor ${vName}` +
        (amount != null ? ` of ₹${amount}.` : ".");
    case "update":
      return `Payment entry updated by ${actorName} for vendor ${vName}.`;
    case "delete":
      return `Payment entry deleted by ${actorName} for vendor ${vName}.`;
    default:
      return `Payment entry ${action} by ${actorName} for vendor ${vName}.`;
  }
}

// Unified notifier
async function notifyAdminOnPaymentAction({ req, action, vendorName, entryId, companyId, amount }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser(companyId);
  if (!adminUser) {
    console.warn("notifyAdminOnPaymentAction: no admin user found");
    return;
  }

  const message = buildPaymentNotificationMessage(action, {
    actorName: actor.name,
    vendorName,
    amount,
  });

  await createNotification(
    message,
    adminUser._id,   // recipient (admin)
    actor.id,        // actor id (user OR client)
    action,          // "create" | "update" | "delete"
    "payment",       // category
    entryId,         // payment _id
    req.auth.clientId
  );
}


function companyAllowedForUser(req, companyId) {
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  // If allowed is empty -> no explicit restriction
  return allowed.length === 0 || allowed.includes(String(companyId));
}

/** CREATE */
exports.createPayment = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    if (!userIsPriv(req) && !req.auth.caps?.canCreatePaymentEntries) {
      return res.status(403).json({ message: "Not allowed to create payment entries" });
    }

    const { vendor, date, amount, description, referenceNumber, company: companyId } = req.body;

    if (!companyAllowedForUser(req, companyId)) {
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    // Tenant ownership checks
    const [companyDoc, vendorDoc] = await Promise.all([
      Company.findOne({ _id: companyId, client: req.auth.clientId }),
      Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId }),
    ]);
    if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
    if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });

    const payment = await PaymentEntry.create({
      vendor: vendorDoc._id,
      date,
      amount,
      description,
      referenceNumber,
      company: companyDoc._id,
      client: req.auth.clientId,
      createdByUser: req.auth.userId, // optional if your schema has it
    });

    // Notify admin AFTER creation succeeds
    const vendorName = vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor";
    await notifyAdminOnPaymentAction({
      req,
      action: "create",
      vendorName,
      entryId: payment._id,
      companyId: companyDoc?._id?.toString(),
      amount,
    });



    // Access clientId and companyId after creation
    const clientId = payment.client.toString();

    // Call the cache deletion function
    await deletePaymentEntryCache(clientId, companyId);
    // await deletePaymentEntryCacheByUser(clientId, companyId);

    res.status(201).json({ message: "Payment entry created", payment });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



/** LIST (tenant-scoped, supports q/date/company filters + pagination) */
exports.getPayments = async (req, res) => {
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
    const cacheKey = `paymentEntries:${JSON.stringify({ clientId, companyId })}`;

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
    const query = PaymentEntry.find(where)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "vendor", select: "vendorName" })
      .populate({ path: "company", select: "businessName" });

    const [entries, total] = await Promise.all([
      query.lean(),
      PaymentEntry.countDocuments(where),
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
    console.error("getPayments error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};



/** ADMIN / MASTER: list by client (optional company + pagination) */
exports.getPaymentsByClient = async (req, res) => {
  try {
    await ensureAuthCaps(req);
    if (!userIsPriv(req)) {
      return res.status(403).json({ message: "Not authorized" });
    }

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
    const cacheKey = `paymentEntriesByClient:${JSON.stringify({ client: clientId, company: companyId })}`;

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
      PaymentEntry.find(where)
        .sort({ date: -1 })
        .skip(skip)
        .limit(perPage)
        .populate({ path: "vendor", select: "vendorName" })
        .populate({ path: "company", select: "businessName" })
        .lean(),
      PaymentEntry.countDocuments(where),
    ]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

    res.status(200).json({ entries, total, page: Number(page), limit: perPage });
  } catch (err) {
    console.error("getPaymentsByClient error:", err);
    res.status(500).json({ error: err.message });
  }
};



/** UPDATE */
exports.updatePayment = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const payment = await PaymentEntry.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (!userIsPriv(req) && !sameTenant(payment.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { vendor, company: newCompanyId, ...rest } = req.body;

    // Company move check
    if (newCompanyId) {
      if (!companyAllowedForUser(req, newCompanyId)) {
        return res.status(403).json({ message: "You are not allowed to use this company" });
      }
      const companyDoc = await Company.findOne({ _id: newCompanyId, client: req.auth.clientId });
      if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
      payment.company = companyDoc._id;
    }

    // Vendor move check
    let vendorDoc;
    if (vendor) {
      vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId });
      if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
      payment.vendor = vendorDoc._id;
    } else {
      // Get vendor info for notification if not changing
      vendorDoc = await Vendor.findById(payment.vendor);
    }

    Object.assign(payment, rest);
    await payment.save();
    const companyId = payment.company.toString();
    const vendorName = vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor";

    await notifyAdminOnPaymentAction({
      req,
      action: "update",
      vendorName,
      entryId: payment._id,
      companyId,
    });

    // Invalidate cache
    await deletePaymentEntryCache(payment.client.toString(), companyId);

    res.json({ message: "Payment updated", payment });

  } catch (err) {
    console.error("updatePayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/** DELETE */
exports.deletePayment = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const payment = await PaymentEntry.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (!userIsPriv(req) && !sameTenant(payment.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }
    // NEW: Get vendor info before deletion for notification
    const vendorDoc = await Vendor.findById(payment.vendor);

    await payment.deleteOne();

    const vendorName = vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor";

    await notifyAdminOnPaymentAction({
      req,
      action: "delete",
      vendorName,
      entryId: payment._id,                 // ok to reference deleted id
      companyId: payment.company.toString(),
    });

    // Invalidate cache
    const companyId = payment.company.toString();
    await deletePaymentEntryCache(payment.client.toString(), companyId);

    res.json({ message: "Payment deleted" });

  } catch (err) {
    console.error("deletePayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

