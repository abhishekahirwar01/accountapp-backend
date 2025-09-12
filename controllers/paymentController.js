// controllers/paymentController.js
const PaymentEntry = require("../models/PaymentEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { getFromCache, setToCache } = require('../RedisCache');
const { deletePaymentEntryCache , deletePaymentEntryCacheByUser } = require("../utils/cacheHelpers");

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
}

function companyAllowedForUser(req, companyId) {
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  // If allowed is empty -> no explicit restriction
  return allowed.length === 0 || allowed.includes(String(companyId));
}

function companyFilterForUser(req, requestedCompanyId) {
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : null;

  if (requestedCompanyId) {
    if (!allowed || allowed.length === 0 || allowed.includes(String(requestedCompanyId))) {
      return { company: requestedCompanyId };
    }
    // requested not allowed => return empty result
    return { company: { $in: [] } };
  }
  if (allowed && allowed.length > 0 && !userIsPriv(req)) {
    return { company: { $in: allowed } };
  }
  return {};
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

    // Access clientId and companyId after creation
    const clientId = payment.client.toString();

    // Call the cache deletion function
    await deletePaymentEntryCache(clientId, companyId);
    await deletePaymentEntryCacheByUser(clientId, companyId);

    res.status(201).json({ message: "Payment entry created", payment });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/** LIST (tenant-scoped, supports q/date/company filters + pagination) */
// exports.getPayments = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     const {
//       q,
//       companyId,
//       dateFrom,
//       dateTo,
//       page = 1,
//       limit = 100,
//     } = req.query;

//     const clientId = req.auth.clientId;

//     const where = {
//       client: req.auth.clientId,
//       ...companyFilterForUser(req, companyId),
//     };

//     if (dateFrom || dateTo) {
//       where.date = {};
//       if (dateFrom) where.date.$gte = new Date(dateFrom);
//       if (dateTo) where.date.$lte = new Date(dateTo);
//     }

//     if (q) {
//       where.$or = [
//         { description: { $regex: String(q), $options: "i" } },
//         { referenceNumber: { $regex: String(q), $options: "i" } },
//       ];
//     }

//     const perPage = Math.min(Number(limit) || 100, 500);
//     const skip = (Number(page) - 1) * perPage;

//      // Construct a cache key based on the query parameters
//     const cacheKey = `paymentEntries:${JSON.stringify({ clientId, companyId })}`;

//     // Check if the data is cached in Redis
//     const cachedEntries = await getFromCache(cacheKey);
//     if (cachedEntries) {
//       // If cached, return the data directly
//       return res.status(200).json({
//         success: true,
//         count: cachedEntries.length,
//         data: cachedEntries,
//       });
//     }

//     const query = PaymentEntry.find(where)
//       .sort({ date: -1 })
//       .skip(skip)
//       .limit(perPage)
//       .populate({ path: "vendor", select: "vendorName" })
//       .populate({ path: "company", select: "businessName" });

//     const [data, total] = await Promise.all([
//       query.lean(),
//       PaymentEntry.countDocuments(where),
//     ]);
//     const [entries, total] = await Promise.all([
//       query.lean(),
//       PaymentEntry.countDocuments(where),
//     ]);

//      // Cache the fetched data in Redis for future requests
//     await setToCache(cacheKey, entries);

//     res.status(200).json({
//       success: true,
//       total,
//       page: Number(page),
//       limit: perPage,
//       data,
//     });
//   } catch (err) {
//     console.error("getPayments error:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };



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



// /** ADMIN / MASTER: list by client (optional company + pagination) */
// exports.getPaymentsByClient = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);
//     if (!userIsPriv(req)) {
//       return res.status(403).json({ message: "Not authorized" });
//     }

//     const { clientId } = req.params;
//     const { companyId, page = 1, limit = 100 } = req.query;

//     const where = { client: clientId };
//     if (companyId) where.company = companyId;

//     const perPage = Math.min(Number(limit) || 100, 500);
//     const skip = (Number(page) - 1) * perPage;

//     // Construct a cache key based on clientId and query parameters
//     const cacheKey = `paymentEntriesByClient:${JSON.stringify({ client: clientId, company: companyId })}`;

//     // Check if the data is cached in Redis
//     const cachedEntries = await getFromCache(cacheKey);
//     if (cachedEntries) {
//       // If cached, return the data directly
//       return res.status(200).json({
//         success: true,
//         count: cachedEntries.length,
//         data: cachedEntries,
//       });
//     }

//     const [data, total] = await Promise.all([
//       PaymentEntry.find(where)
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(perPage)
//         .populate({ path: "vendor", select: "vendorName" })
//         .populate({ path: "company", select: "businessName" })
//         .lean(),
//       PaymentEntry.countDocuments(where),
//     ]);

//     // Cache the fetched data in Redis for future requests
//     await setToCache(cacheKey, entries);

//     res.status(200).json({
//       success: true,
//       total,
//       page: Number(page),
//       limit: perPage,
//       data,
//     });
//   } catch (err) {
//     console.error("getPaymentsByClient error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };



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
    if (vendor) {
      const vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId });
      if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
      payment.vendor = vendorDoc._id;
    }

    Object.assign(payment, rest);
    await payment.save();

    // Call the cache deletion function after updating
    const companyId = payment.company.toString();
    await deletePaymentEntryCache(payment.client.toString(), companyId);
await deletePaymentEntryCacheByUser(payment.client.toString(), companyId);
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

    await payment.deleteOne();
    // Call the cache deletion function after deletion
    const companyId = payment.company.toString();
    await deletePaymentEntryCache(payment.client.toString(), companyId);
    await deletePaymentEntryCacheByUser(payment.client.toString(), companyId);
    res.json({ message: "Payment deleted" });
  } catch (err) {
    console.error("deletePayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

