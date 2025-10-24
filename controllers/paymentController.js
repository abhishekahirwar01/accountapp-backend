// controllers/paymentController.js
const PaymentEntry = require("../models/PaymentEntry");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const PaymentExpense = require("../models/PaymentExpense");
const User = require("../models/User");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { getFromCache, setToCache } = require('../RedisCache');
const { deletePaymentEntryCache, deletePaymentEntryCacheByUser } = require("../utils/cacheHelpers");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");

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

    const { vendor, expense, isExpense, date, amount, description, paymentMethod, referenceNumber, company: companyId } = req.body;

    if (!companyAllowedForUser(req, companyId)) {
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    if (paymentMethod && !["Cash", "UPI", "Bank Transfer", "Cheque"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // Validate expense vs vendor logic
    if (isExpense && !expense) {
      return res.status(400).json({ message: "Expense is required when isExpense is true" });
    }
    if (!isExpense && !vendor) {
      return res.status(400).json({ message: "Vendor is required when not an expense" });
    }
    if (isExpense && vendor) {
      return res.status(400).json({ message: "Cannot specify both expense and vendor" });
    }

    // Tenant ownership checks
    const companyDoc = await Company.findOne({ _id: companyId, client: req.auth.clientId });
    if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });

    let vendorDoc = null;
    let expenseDoc = null;

    if (!isExpense) {
      vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId });
      if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
    } else {
      expenseDoc = await PaymentExpense.findOne({ _id: expense, client: req.auth.clientId });
      if (!expenseDoc) return res.status(400).json({ message: "Expense not found or unauthorized" });
    }

    const payment = await PaymentEntry.create({
      vendor: vendorDoc?._id,
      expense: expenseDoc?._id,
      isExpense: isExpense || false,
      date,
      amount,
      description,
      paymentMethod,
      referenceNumber,
      company: companyDoc._id,
      client: req.auth.clientId,
      createdByUser: req.auth.userId, // optional if your schema has it
    });

    // Handle vendor balance for payments (reduce what we owe - make balance less negative)
    // Only update vendor balance if this is not an expense payment
    if (vendorDoc) {
      vendorDoc.balance += Number(amount);
      await vendorDoc.save();
    }

    // Notify admin AFTER creation succeeds
    const entityName = isExpense
      ? (expenseDoc?.name || "Unknown Expense")
      : (vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor");

    await notifyAdminOnPaymentAction({
      req,
      action: "create",
      vendorName: entityName,
      entryId: payment._id,
      companyId: companyDoc?._id?.toString(),
      amount,
    });



    // Access clientId and companyId after creation
    const clientId = payment.client.toString();

    // Call the cache deletion function
    // await deletePaymentEntryCache(clientId, companyId);
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

    // // Construct a cache key based on the query parameters
    // const cacheKey = `paymentEntries:${JSON.stringify({ clientId, companyId })}`;

    // // Check if the data is cached in Redis
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
    const query = PaymentEntry.find(where)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "vendor", select: "vendorName" })
      .populate({ path: "expense", select: "name" })
      .populate({ path: "company", select: "businessName" });

    const [entries, total] = await Promise.all([
      query.lean(),
      PaymentEntry.countDocuments(where),
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

    // // Construct a cache key based on clientId and query parameters
    // const cacheKey = `paymentEntriesByClient:${JSON.stringify({ client: clientId, company: companyId })}`;

    // // Check if the data is cached in Redis
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
      PaymentEntry.find(where)
        .sort({ date: -1 })
        .skip(skip)
        .limit(perPage)
        .populate({ path: "vendor", select: "vendorName" })
        .populate({ path: "expense", select: "name" })
        .populate({ path: "company", select: "businessName" })
        .lean(),
      PaymentEntry.countDocuments(where),
    ]);

    // Cache the fetched data in Redis for future requests
    // await setToCache(cacheKey, entries);

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

    const { vendor, expense, isExpense, company: newCompanyId, paymentMethod, ...rest } = req.body;

    if (paymentMethod && !["Cash", "UPI", "Bank Transfer", "Cheque"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // Company move check
    if (newCompanyId) {
      if (!companyAllowedForUser(req, newCompanyId)) {
        return res.status(403).json({ message: "You are not allowed to use this company" });
      }
      const companyDoc = await Company.findOne({ _id: newCompanyId, client: req.auth.clientId });
      if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
      payment.company = companyDoc._id;
    }

    // Vendor/Expense move check
    let vendorDoc;
    let expenseDoc;
    if (isExpense !== undefined) {
      payment.isExpense = isExpense;
    }

    if (isExpense) {
      if (expense) {
        expenseDoc = await PaymentExpense.findOne({ _id: expense, client: req.auth.clientId });
        if (!expenseDoc) return res.status(400).json({ message: "Expense not found or unauthorized" });
        payment.expense = expenseDoc._id;
        payment.vendor = undefined; // Clear vendor when it's an expense
      } else {
        // Get expense info for notification if not changing
        expenseDoc = await PaymentExpense.findById(payment.expense);
      }
    } else {
      if (vendor) {
        vendorDoc = await Vendor.findOne({ _id: vendor, createdByClient: req.auth.clientId });
        if (!vendorDoc) return res.status(400).json({ message: "Vendor not found or unauthorized" });
        payment.vendor = vendorDoc._id;
        payment.expense = undefined; // Clear expense when it's a vendor payment
      } else {
        // Get vendor info for notification if not changing
        vendorDoc = await Vendor.findById(payment.vendor);
      }
    }

    // Update payment method if provided
    if (paymentMethod !== undefined) {
      payment.paymentMethod = paymentMethod;
    }

    // Store original amount for balance adjustment
    const originalAmount = Number(payment.amount);
    const newAmount = rest.amount != null ? Number(rest.amount) : originalAmount;

    Object.assign(payment, rest);
    await payment.save();

    // Handle vendor balance adjustment for amount changes (only for vendor payments)
    if (!payment.isExpense) {
      const amountDifference = newAmount - originalAmount;
      if (amountDifference !== 0) {
        const currentVendorDoc = await Vendor.findById(payment.vendor);
        if (currentVendorDoc) {
          currentVendorDoc.balance += Number(amountDifference); // Add the difference (if amount increased, balance increases more)
          await currentVendorDoc.save();
        }
      }
    }

    const companyId = payment.company.toString();
    const entityName = payment.isExpense
      ? (expenseDoc?.name || "Unknown Expense")
      : (vendorDoc?.name || vendorDoc?.vendorName || vendorDoc?.title || "Unknown Vendor");

    await notifyAdminOnPaymentAction({
      req,
      action: "update",
      vendorName: entityName,
      entryId: payment._id,
      companyId,
    });

    // Invalidate cache
    // await deletePaymentEntryCache(payment.client.toString(), companyId);

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
    // Get entity info before deletion for notification
    let entityDoc;
    if (payment.isExpense) {
      entityDoc = await PaymentExpense.findById(payment.expense);
    } else {
      entityDoc = await Vendor.findById(payment.vendor);
    }

    // Handle vendor balance reversal for payment deletion (only for vendor payments)
    if (!payment.isExpense && entityDoc) {
      entityDoc.balance -= Number(payment.amount); // Subtract the payment amount from vendor balance
      await entityDoc.save();
    }

    await payment.deleteOne();

    const entityName = payment.isExpense
      ? (entityDoc?.name || "Unknown Expense")
      : (entityDoc?.name || entityDoc?.vendorName || entityDoc?.title || "Unknown Vendor");

    await notifyAdminOnPaymentAction({
      req,
      action: "delete",
      vendorName: entityName,
      entryId: payment._id,                 // ok to reference deleted id
      companyId: payment.company.toString(),
    });

    // Invalidate cache
    const companyId = payment.company.toString();
    // await deletePaymentEntryCache(payment.client.toString(), companyId);

    res.json({ message: "Payment deleted" });

  } catch (err) {
    console.error("deletePayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

