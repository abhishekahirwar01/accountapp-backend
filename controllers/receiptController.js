// controllers/receiptController.js
const mongoose = require("mongoose");
const ReceiptEntry = require("../models/ReceiptEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const { getEffectivePermissions } = require("../services/effectivePermissions");

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
    return { company: { $in: [] } }; // not allowed -> empty
  }
  if (allowed && allowed.length > 0 && !userIsPriv(req)) {
    return { company: { $in: allowed } };
  }
  return {};
}


/** CREATE */
// exports.createReceipt = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     if (!userIsPriv(req) && !req.auth.caps?.canCreateReceiptEntries) {
//       return res.status(403).json({ message: "Not allowed to create receipt entries" });
//     }

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
//       Party.findOne({ _id: party, createdByClient: req.auth.clientId }).select({ balance: 1 }),
//     ]);
//     if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
//     if (!partyDoc)  return res.status(400).json({ message: "Customer not found or unauthorized" });

//     // Try transaction first
//     let session;
//     try {
//       session = await mongoose.startSession();
//       session.startTransaction();

//       // 1) Deduct from party balance (guard ensures balance >= amt)
//       const updatedParty = await adjustBalanceGuarded({
//         partyId: partyDoc._id,
//         clientId: req.auth.clientId,
//         delta: -amt,
//         session,
//       });
//       if (!updatedParty) {
//         throw new Error("Receipt amount exceeds customer's remaining balance");
//       }

//       // 2) Create receipt
//       const [receipt] = await ReceiptEntry.create([{
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
//       session.endSession();

//       return res.status(201).json({
//         message: "Receipt entry created",
//         receipt,
//         updatedBalance: Number(updatedParty.balance),
//       });
//     } catch (txErr) {
//       if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) {} }
//       // Fallback for non-replica-set deployments: do guarded $inc then create
//       try {
//         const updatedParty = await adjustBalanceGuarded({
//           partyId: partyDoc._id,
//           clientId: req.auth.clientId,
//           delta: -amt,
//           session: undefined,
//         });
//         if (!updatedParty) {
//           return res.status(400).json({ message: "Receipt amount exceeds customer's remaining balance" });
//         }

//         const receipt = await ReceiptEntry.create({
//           party: partyDoc._id,
//           date,
//           amount: amt,
//           description,
//           referenceNumber,
//           company: companyDoc._id,
//           client: req.auth.clientId,
//           createdByUser: req.auth.userId,
//           type: "receipt",
//         });

//         return res.status(201).json({
//           message: "Receipt entry created",
//           receipt,
//           updatedBalance: Number(updatedParty.balance),
//         });
//       } catch (fallbackErr) {
//         return res.status(400).json({ message: fallbackErr.message || "Failed to create receipt" });
//       }
//     }
//   } catch (err) {
//     console.error("createReceipt error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };
/** CREATE */
/** CREATE */
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
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    // Ensure company & party belong to this tenant
    const [companyDoc, partyDoc] = await Promise.all([
      Company.findOne({ _id: companyId, client: req.auth.clientId }),
      Party.findOne({ _id: party, createdByClient: req.auth.clientId }).select({ balance: 1 }),
    ]);
    if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
    if (!partyDoc)  return res.status(400).json({ message: "Customer not found or unauthorized" });

    // Try transaction first
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      // 1) Create receipt without checking balance
      const [receipt] = await ReceiptEntry.create([{
        party: partyDoc._id,
        date,
        amount: amt,
        description,
        referenceNumber,
        company: companyDoc._id,
        client: req.auth.clientId,
        createdByUser: req.auth.userId,
        type: "receipt",
      }], { session });

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: "Receipt entry created",
        receipt,
      });
    } catch (txErr) {
      if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) {} }
      // Fallback for non-replica-set deployments: create receipt
      try {
        const receipt = await ReceiptEntry.create({
          party: partyDoc._id,
          date,
          amount: amt,
          description,
          referenceNumber,
          company: companyDoc._id,
          client: req.auth.clientId,
          createdByUser: req.auth.userId,
          type: "receipt",
        });

        return res.status(201).json({
          message: "Receipt entry created",
          receipt,
        });
      } catch (fallbackErr) {
        return res.status(400).json({ message: fallbackErr.message || "Failed to create receipt" });
      }
    }
  } catch (err) {
    console.error("createReceipt error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



/** LIST (tenant filtered, supports company filter, q, date range, pagination) */
exports.getReceipts = async (req, res) => {
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

    const where = {
      client: req.auth.clientId,
      ...companyFilterForUser(req, companyId),
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

    const query = ReceiptEntry.find(where)
      .sort({ date: -1 })
      .skip(skip)
      .limit(perPage)
      .populate({ path: "party", select: "name" })
      .populate({ path: "company", select: "businessName" });

    const [data, total] = await Promise.all([
      query.lean(),
      ReceiptEntry.countDocuments(where),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: perPage,
      data,
    });
  } catch (err) {
    console.error("getReceipts error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/** UPDATE */
// exports.updateReceipt = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     const receipt = await ReceiptEntry.findById(req.params.id);
//     if (!receipt) return res.status(404).json({ message: "Receipt not found" });

//     if (!userIsPriv(req) && !sameTenant(receipt.client, req.auth.clientId)) {
//       return res.status(403).json({ message: "Not authorized" });
//     }

//     const { party, company: newCompanyId, ...rest } = req.body;

//     // Validate company move
//     if (newCompanyId) {
//       if (!companyAllowedForUser(req, newCompanyId)) {
//         return res.status(403).json({ message: "You are not allowed to use this company" });
//       }
//       const companyDoc = await Company.findOne({ _id: newCompanyId, client: req.auth.clientId });
//       if (!companyDoc) return res.status(400).json({ message: "Invalid company selected" });
//       receipt.company = companyDoc._id;
//     }

//     // Validate party move
//     if (party) {
//       const partyDoc = await Party.findOne({ _id: party, createdByClient: req.auth.clientId });
//       if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });
//       receipt.party = partyDoc._id;
//     }

//     Object.assign(receipt, rest);
//     await receipt.save();

//     res.json({ message: "Receipt updated", receipt });
//   } catch (err) {
//     console.error("updateReceipt error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

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

    // Validate party move (we’ll adjust balances only against the *final* party on delta)
    if (party) {
      const partyDoc = await Party.findOne({ _id: party, createdByClient: req.auth.clientId });
      if (!partyDoc) return res.status(400).json({ message: "Customer not found or unauthorized" });
      receipt.party = partyDoc._id;
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
      if (date       != null) receipt.date = new Date(date);
      if (description!== undefined) receipt.description = description;
      if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;

      await receipt.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({ message: "Receipt updated", receipt });
    } catch (txErr) {
      if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) {} }

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
        if (date       != null) receipt.date = new Date(date);
        if (description!== undefined) receipt.description = description;
        if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;

        await receipt.save();

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
// 
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

      await session.commitTransaction();
      session.endSession();

      return res.json({
        message: "Receipt deleted",
        updatedBalance: Number(updatedParty?.balance ?? 0),
      });
    } catch (txErr) {
      if (session) { try { await session.abortTransaction(); session.endSession(); } catch (_) {} }

      // Fallback
      try {
        await ReceiptEntry.deleteOne({ _id: receipt._id });

        const updatedParty = await adjustBalanceGuarded({
          partyId: receipt.party,
          clientId: req.auth.clientId,
          delta: +amt,
          session: undefined,
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

    const where = { client: clientId };
    if (companyId) where.company = companyId;

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [entries, total] = await Promise.all([
      ReceiptEntry.find(where)
        .sort({ date: -1 })
        .skip(skip)
        .limit(perPage)
        .populate({ path: "party", select: "name" })
        .populate({ path: "company", select: "businessName" })
        .lean(),
      ReceiptEntry.countDocuments(where),
    ]);

    res.status(200).json({ success: true, total, page: Number(page), limit: perPage, data: entries });
  } catch (err) {
    console.error("getReceiptsByClient error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
