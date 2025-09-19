// controllers/receiptController.js
const mongoose = require("mongoose");
const ReceiptEntry = require("../models/ReceiptEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { getFromCache, setToCache } = require('../RedisCache');
const { deleteReceiptEntryCache, deleteReceiptEntryCacheByUser, flushAllCache } = require("../utils/cacheHelpers");

const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role")

// privileged roles that can skip allowedCompanies checks
const PRIV_ROLES = new Set(["master", "client", "admin"]);

async function adjustBalanceGuarded({ partyId, clientId, delta, session }) {
  if (delta < 0) {
    // deducting → require enough balance
    const updated = await Party.findOneAndUpdate(
      { _id: partyId, createdByClient: clientId, balance: { $gte: -delta } },
      { $inc: { balance: delta } }, // delta is negative, so it deducts
      { new: true, session, select: { _id: 1, balance: 1 } }
    );
    return updated; // null if guard failed
  } else {
    // adding back / reducing receipt → always allowed
    return Party.findOneAndUpdate(
      { _id: partyId, createdByClient: clientId },
      { $inc: { balance: delta } },
      { new: true, session, select: { _id: 1, balance: 1 } }
    );
  }
}
function sameTenant(a, b) {
  return String(a) === String(b);
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth?.role);
}


async function ensureAuthCaps(req) {
  // Normalize: support stacks still setting req.user
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      // ❌ don't default to "Unknown" — let resolver do the right thing
      userName: req.user.userName,        // may be undefined for clients
      clientName: req.user.contactName,   // if your auth layer provides it for clients
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

  // Only backfill staff names (not clients)
  if (req.auth.role !== "client" && !req.auth.userName && req.auth.userId) {
    const userDoc = await User.findById(req.auth.userId)
      .select("displayName fullName name userName username email")
      .lean();
    req.auth.userName =
      userDoc?.displayName ||
      userDoc?.fullName ||
      userDoc?.name ||
      userDoc?.userName ||
      userDoc?.username ||
      userDoc?.email ||
      undefined; // no "Unknown"
  }
}

// ---- Actor resolver: supports staff users and clients ----
async function resolveActor(req) {
  const role = req.auth?.role;

  // treat placeholders as invalid
  const validName = (v) => {
    const s = String(v ?? "").trim();
    return s && !/^unknown$/i.test(s) && s !== "-";
  };

  // CLIENT path: prefer token's clientName; else fetch Client.contactName
  if (role === "client") {
    if (validName(req.auth?.clientName)) {
      return {
        id: req.auth?.clientId || null,
        name: String(req.auth.clientName).trim(),
        role,
        kind: "client",
      };
    }
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

  // STAFF path: claims first, else fetch User
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

// Try to find an admin tied to company; fallback to any admin
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

// Build message text per action (receipt wording)
function buildReceiptNotificationMessage(action, { actorName, customerName, oldAmount, newAmount }) {
  const cName = customerName || "Unknown Customer";
  switch (action) {
    case "create":
      return `New receipt entry created by ${actorName} for customer ${cName} of amount ₹${newAmount}.`;
    case "update":
      return `Receipt entry updated by ${actorName} for customer ${cName}. Amount changed from ₹${oldAmount} to ₹${newAmount}.`;
    case "delete":
      return `Receipt entry deleted by ${actorName} for customer ${cName}. Amount ₹${oldAmount} was refunded.`;
    default:
      return `Receipt entry ${action} by ${actorName} for customer ${cName}.`;
  }
}

// Unified notifier for receipt module
async function notifyAdminOnReceiptAction({ req, action, customerName, entryId, companyId, oldAmount, newAmount }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser(companyId);
  if (!adminUser) {
    console.warn("notifyAdminOnReceiptAction: no admin user found");
    return;
  }

  const message = buildReceiptNotificationMessage(action, {
    actorName: actor.name,
    customerName,
    oldAmount,
    newAmount,
  });

  await createNotification(
    message,
    adminUser._id,     // recipient (admin)
    actor.id,          // actor id (user OR client)
    action,            // "create" | "update" | "delete"
    "payment",         // category you're using for receipts
    entryId,           // receipt _id
    req.auth.clientId
  );
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



// exports.createReceipt = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     const { party, date, amount, description, referenceNumber, company: companyId } = req.body;

//     if (!party || !companyId) {
//       return res.status(400).json({ message: "party and company are required" });
//     }
    
//     const amt = Number(amount || 0);
//     if (!(amt > 0)) {
//       return res.status(400).json({ message: "Amount must be > 0" });
//     }
    
//     if (!companyAllowedForUser(req, companyId)) {
//       return res.status(403).json({ message: "You are not allowed to use this company" });
//     }

//     // Ensure company & party belong to this tenant
//     const [companyDoc, partyDoc] = await Promise.all([
//       Company.findOne({ _id: companyId, client: req.auth.clientId }),
//       Party.findOne({ _id: party, createdByClient: req.auth.clientId }).select({ balance: 1, name: 1 }),
//     ]);
    
//     if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
//     if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });

//     // DEBUG: Log current state
//     console.log('Creating receipt:', {
//       party: partyDoc._id,
//       currentBalance: partyDoc.balance,
//       amount: amt,
//       expectedNewBalance: partyDoc.balance - amt
//     });

//     let session;
//     let receipt;
//     let updatedParty;

//     try {
//       // Try transaction approach first
//       session = await mongoose.startSession();
//       session.startTransaction();

//       // 1) Deduct amount from party balance
//       updatedParty = await Party.findOneAndUpdate(
//         { _id: party, createdByClient: req.auth.clientId },
//         { $inc: { balance: -amt } },
//         { new: true, session }
//       );

//       if (!updatedParty) {
//         throw new Error("Failed to update party balance");
//       }

//       // 2) Create receipt
//       [receipt] = await ReceiptEntry.create([{
//         party: partyDoc._id,
//         date,
//         amount: amt,
//         description,
//         referenceNumber,
//         company: companyDoc._id,
//         client: req.auth.clientId,
//         createdByUser: req.auth.userId,
//         type: "receipt",
//       }], { session });

//       await session.commitTransaction();
      
//       console.log('Transaction successful. New balance:', updatedParty.balance);

//     } catch (txErr) {
//       console.error('Transaction failed, trying fallback:', txErr);
      
//       if (session) {
//         try { await session.abortTransaction(); } catch (abortErr) {}
//         try { session.endSession(); } catch (endErr) {}
//       }

//       // Fallback: Non-transaction approach
//       updatedParty = await Party.findOneAndUpdate(
//         { _id: party, createdByClient: req.auth.clientId },
//         { $inc: { balance: -amt } },
//         { new: true }
//       );

//       if (!updatedParty) {
//         return res.status(400).json({ message: "Failed to update party balance" });
//       }

//       receipt = await ReceiptEntry.create({
//         party: partyDoc._id,
//         date,
//         amount: amt,
//         description,
//         referenceNumber,
//         company: companyDoc._id,
//         client: req.auth.clientId,
//         createdByUser: req.auth.userId,
//         type: "receipt",
//       });

//       console.log('Fallback successful. New balance:', updatedParty.balance);
//     } finally {
//       if (session) {
//         try { session.endSession(); } catch (e) {}
//       }
//     }

//     // Send response
//     return res.status(201).json({
//       message: "Receipt entry created",
//       receipt,
//       updatedBalance: updatedParty.balance
//     });

//   } catch (err) {
//     console.error("createReceipt error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

exports.createReceipt = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const { party, date, amount, description, referenceNumber, company: companyId } = req.body;

    if (!party || !companyId) {
      return res.status(400).json({ message: "party and company are required" });
    }
    
    const amt = Number(amount || 0);
    if (!(amt > 0)) {
      return res.status(400).json({ message: "Amount must be > 0" });
    }
    
    if (!companyAllowedForUser(req, companyId)) {
      return res.status(400).json({ message: "You are not allowed to use this company" });
    }

    // Ensure company & party belong to this tenant
    const [companyDoc, partyDoc] = await Promise.all([
      Company.findOne({ _id: companyId, client: req.auth.clientId }),
      Party.findOne({ _id: party, createdByClient: req.auth.clientId }).select({ balance: 1, name: 1 }),
    ]);
    
    if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
    if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });

    // ✅ SMART FIX: Calculate actual amount to deduct (cap at current balance)
    const amountToDeduct = Math.min(amt, partyDoc.balance);
    const willClearBalance = amountToDeduct === partyDoc.balance;
    const hasExcess = amt > partyDoc.balance;

    let session;
    let receipt;
    let updatedParty;

    try {
      // Try transaction approach first
      session = await mongoose.startSession();
      session.startTransaction();

      // 1) Deduct amount from party balance (capped at current balance)
      updatedParty = await Party.findOneAndUpdate(
        { _id: party, createdByClient: req.auth.clientId },
        { $inc: { balance: -amountToDeduct } },
        { new: true, session }
      );

      if (!updatedParty) {
        throw new Error("Failed to update party balance");
      }

      // 2) Create receipt for the FULL amount (even if we deducted less)
      [receipt] = await ReceiptEntry.create([{
        party: partyDoc._id,
        date,
        amount: amt, // Store the original amount requested
        actualAmountApplied: amountToDeduct, // Store how much was actually applied
        description: hasExcess ? 
          `${description} (Note: Only ₹${amountToDeduct} applied to balance. Customer had credit of ₹${amt - amountToDeduct})` : 
          description,
        referenceNumber,
        company: companyDoc._id,
        client: req.auth.clientId,
        createdByUser: req.auth.userId,
        type: "receipt",
      }], { session });

      await session.commitTransaction();
      
      console.log('Receipt processed. Amount requested:', amt, 'Amount applied:', amountToDeduct, 'New balance:', updatedParty.balance);

    } catch (txErr) {
      console.error('Transaction failed, trying fallback:', txErr);
      
      if (session) {
        try { await session.abortTransaction(); } catch (abortErr) {}
        try { session.endSession(); } catch (endErr) {}
      }

      // Fallback: Non-transaction approach
      updatedParty = await Party.findOneAndUpdate(
        { _id: party, createdByClient: req.auth.clientId },
        { $inc: { balance: -amountToDeduct } },
        { new: true }
      );

      if (!updatedParty) {
        return res.status(400).json({ message: "Failed to update party balance" });
      }

      receipt = await ReceiptEntry.create({
        party: partyDoc._id,
        date,
        amount: amt,
        actualAmountApplied: amountToDeduct,
        description: hasExcess ? 
          `${description} (Note: Only ₹${amountToDeduct} applied to balance. Customer had credit of ₹${amt - amountToDeduct})` : 
          description,
        referenceNumber,
        company: companyDoc._id,
        client: req.auth.clientId,
        createdByUser: req.auth.userId,
        type: "receipt",
      });
    } finally {
      if (session) {
        try { session.endSession(); } catch (e) {}
      }
    }

    // Return appropriate message based on what happened
    let message = "Receipt entry created";
    if (hasExcess) {
      message = `Receipt created. Only ₹${amountToDeduct} applied to balance. Customer has credit of ₹${amt - amountToDeduct}`;
    } else if (willClearBalance) {
      message = "Receipt created. Customer balance is now zero.";
    }

    // Invalidate cache before response
    const clientId = receipt.client.toString();
    const companyIdFromReceipt = receipt.company.toString();
    await deleteReceiptEntryCache(clientId, companyIdFromReceipt);

    return res.status(201).json({
      message,
      receipt,
      updatedBalance: updatedParty.balance,
      amountRequested: amt,
      amountApplied: amountToDeduct,
      creditAmount: hasExcess ? amt - amountToDeduct : 0
    });

  } catch (err) {
    console.error("createReceipt error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/** LIST (tenant filtered, supports company filter, q, date range, pagination) */
exports.getReceipts = async (req, res) => {
  try {
    await ensureAuthCaps(req);
    const filter = {}; // Initialize filter object

    // Set the client filter based on the authenticated user
    if (req.auth.role === "client") {
      filter.client = req.auth.clientId;
    } else {
      filter.client = req.auth.clientId; // For staff users, still filter by their client
    }

    // Add company filter if provided
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
      client: filter.client,
      company: filter.company || null,
      dateFrom: filter.date?.$gte?.toISOString() || null,
      dateTo: filter.date?.$lte?.toISOString() || null,
      q: filter.$or ? String(req.query.q || '') : null,
      page: Number(req.query.page) || 1,
      limit: perPage
    };
    const cacheKey = `receiptEntries:${JSON.stringify(cacheKeyData)}`;

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
    const query = ReceiptEntry.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "party", select: "name" })
      .populate({ path: "company", select: "businessName" });

    // Fetch data and total count simultaneously
    const [data, total] = await Promise.all([query.lean(), ReceiptEntry.countDocuments(filter)]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, data);

    // Return the data in a consistent format
    res.status(200).json({
      success: true,
      total,
      page: Number(req.query.page),
      limit: perPage,
      data,
    });
  } catch (err) {
    console.error("getReceipts error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};


/** UPDATE */
exports.updateReceipt = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const receipt = await ReceiptEntry.findById(req.params.id);
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    if (!userIsPriv(req) && !sameTenant(receipt.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { party, company: newCompanyId, amount, date, description, referenceNumber } = req.body;
    const newAmount = amount != null ? Number(amount) : undefined;
    if (newAmount != null && !(newAmount > 0)) {
      return res.status(400).json({ message: "Amount must be > 0" });
    }

    // Validate company move
    if (newCompanyId) {
      if (!companyAllowedForUser(req, newCompanyId)) {
        return res.status(403).json({ message: "You are not allowed to use this company" });
      }
      const companyDoc = await Company.findOne({ _id: newCompanyId, client: req.auth.clientId });
      if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
      receipt.company = companyDoc._id;
    }

    // Validate party move and get party info for notification
    let partyDoc;
    if (party) {
      partyDoc = await Party.findOne({ _id: party, createdByClient: req.auth.clientId });
      if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });
      receipt.party = partyDoc._id;
    } else {
      // Get party info for notification if not changing
      partyDoc = await Party.findById(receipt.party);
    }

    // Compute delta
    const oldAmount = Number(receipt.amount || 0);
    const finalAmount = newAmount != null ? newAmount : oldAmount;
    const delta = finalAmount - oldAmount; // >0 means more deduction, <0 means refund

    // Try transaction
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      // Apply delta to current receipt.party
      if (delta !== 0) {
        const updatedParty = await adjustBalanceGuarded({
          partyId: receipt.party,
          clientId: req.auth.clientId,
          delta: -delta, // if delta>0, -delta is negative (deduct); if delta<0, -delta is positive (refund)
          session,
        });
        if (!updatedParty) {
          throw new Error("Increase exceeds customer's remaining balance");
        }
      }

      // Persist receipt
      if (newAmount != null) receipt.amount = finalAmount;
      if (date != null) receipt.date = new Date(date);
      if (description !== undefined) receipt.description = description;
      if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;

      await receipt.save({ session });

      await notifyAdminOnReceiptAction({
        req,
        action: "update",
        customerName: partyDoc?.name || partyDoc?.partyName || partyDoc?.customerName,
        entryId: receipt._id,
        companyId: receipt.company.toString(),
        oldAmount: oldAmount,
        newAmount: finalAmount,
      });

      await session.commitTransaction();
      session.endSession();

      const companyId = receipt.company.toString();

      // Call the cache deletion function
      await deleteReceiptEntryCache(req.auth.clientId, companyId);

      return res.json({ message: "Receipt updated", receipt });
    } catch (txErr) {
      if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) { } }

      // Fallback non-transaction
      try {
        if (delta !== 0) {
          const updatedParty = await adjustBalanceGuarded({
            partyId: receipt.party,
            clientId: req.auth.clientId,
            delta: -delta,
            session: undefined,
          });
          if (!updatedParty) {
            return res.status(400).json({ message: "Increase exceeds customer's remaining balance" });
          }
        }

        if (newAmount != null) receipt.amount = finalAmount;
        if (date != null) receipt.date = new Date(date);
        if (description !== undefined) receipt.description = description;
        if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;

        await receipt.save();

        await notifyAdminOnReceiptAction({
          req,
          action: "update",
          customerName: partyDoc?.name || partyDoc?.partyName || partyDoc?.customerName,
          entryId: receipt._id,
          companyId: receipt.company.toString(),
          oldAmount: oldAmount,
          newAmount: finalAmount,
        });


        return res.json({ message: "Receipt updated", receipt });
      } catch (fallbackErr) {
        return res.status(400).json({ message: fallbackErr.message || "Failed to update receipt" });
      }
    }
  } catch (err) {
    console.error("updateReceipt error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



/** DELETE */
exports.deleteReceipt = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const receipt = await ReceiptEntry.findById(req.params.id);
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    if (!userIsPriv(req) && !sameTenant(receipt.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const amt = Number(receipt.amount || 0);

    // NEW: Get party info before deletion for notification
    const partyDoc = await Party.findById(receipt.party);

    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      // 1) Delete
      await ReceiptEntry.deleteOne({ _id: receipt._id }).session(session);

      // 2) Add back to balance
      const updatedParty = await adjustBalanceGuarded({
        partyId: receipt.party,
        clientId: req.auth.clientId,
        delta: +amt,  // add back
        session,
      });

      await notifyAdminOnReceiptAction({
        req,
        action: "delete",
        customerName: partyDoc?.name || partyDoc?.partyName || partyDoc?.customerName,
        entryId: receipt._id,
        companyId: receipt.company.toString(),
        oldAmount: amt,
      });


      await session.commitTransaction();
      session.endSession();

      const companyId = receipt.company.toString();

      // Call the cache deletion function
      await deleteReceiptEntryCache(req.auth.clientId, companyId);

      return res.json({
        message: "Receipt deleted",
        updatedBalance: Number(updatedParty?.balance ?? 0),
      });
    } catch (txErr) {
      if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) { } }

      // Fallback
      try {
        await ReceiptEntry.deleteOne({ _id: receipt._id });

        const updatedParty = await adjustBalanceGuarded({
          partyId: receipt.party,
          clientId: req.auth.clientId,
          delta: +amt,
          session: undefined,
        });

        await notifyAdminOnReceiptAction({
          req,
          action: "delete",
          customerName: partyDoc?.name || partyDoc?.partyName || partyDoc?.customerName,
          entryId: receipt._id,
          companyId: receipt.company.toString(),
          oldAmount: amt,
        });


        return res.json({
          message: "Receipt deleted",
          updatedBalance: Number(updatedParty?.balance ?? 0),
        });
      } catch (fallbackErr) {
        return res.status(400).json({ message: fallbackErr.message || "Failed to delete receipt" });
      }
    }
  } catch (err) {
    console.error("deleteReceipt error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


/** ADMIN: list by client (with optional company, pagination) */
exports.getReceiptsByClient = async (req, res) => {
  try {
    await ensureAuthCaps(req);
    if (!userIsPriv(req)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { clientId } = req.params;
    const { companyId, page = 1, limit = 100 } = req.query;

    const filter = { client: clientId };
    if (companyId) filter.company = companyId;

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    // Construct a consistent cache key
    const cacheKeyData = {
      clientId: clientId,
      companyId: companyId || null,
      page: Number(page) || 1,
      limit: perPage
    };
    const cacheKey = `receiptEntriesByClient:${JSON.stringify(cacheKeyData)}`;

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

    // Fetch the data from the database if not cached
    const query = ReceiptEntry.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "party", select: "name" })
      .populate({ path: "company", select: "businessName" });

    // Fetch data and total count simultaneously
    const [data, total] = await Promise.all([query.lean(), ReceiptEntry.countDocuments(filter)]);

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, data);

    // Return the data in a consistent format
    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: perPage,
      data,
    });
  } catch (err) {
    console.error("getReceiptsByClient error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
