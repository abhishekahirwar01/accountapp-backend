// controllers/party.controller.js
const Party = require("../models/Party");
const Customer = require("../models/Client")
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");

const PRIV_ROLES = new Set(["master", "client", "admin"]);
const { myCache, key, invalidateClientsForMaster, invalidateClient } = require("../cache");  // Add cache import

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth?.role);
}

async function ensureAuthCaps(req) {
  // normalize legacy req.user → req.auth
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      // do NOT force "Unknown" – let resolver fetch names correctly
      userName: req.user.userName,       // may be undefined for clients
      clientName: req.user.contactName,  // if your auth layer sets it for clients
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


// Build message text per action
function buildPartyNotificationMessage(action, { actorName, partyName }) {
  const pName = partyName || "Unknown Party";
  switch (action) {
    case "create":
      return `New party created by ${actorName}: ${pName}`;
    case "update":
      return `Party updated by ${actorName}: ${pName}`;
    case "delete":
      return `Party deleted by ${actorName}: ${pName}`;
    default:
      return `Party ${action} by ${actorName}: ${pName}`;
  }
}

// Unified notifier for party module
async function notifyAdminOnPartyAction({ req, action, partyName, entryId }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser();
  if (!adminUser) {
    console.warn("notifyAdminOnPartyAction: no admin user found");
    return;
  }

  const message = buildPartyNotificationMessage(action, {
    actorName: actor.name,
    partyName,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "party", // entry type / category
    entryId, // party id
    req.auth.clientId
  );
}

exports.createParty = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateCustomers) {
      return res.status(403).json({ message: "Not allowed to create customers" });
    }


    const {
      name,
      address,
      city,
      state,
      pincode,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      tdsRate,
      tdsSection,
      contactNumber,
      email,
    } = req.body;

    // Check for existing party with same contact number or email BEFORE creation
    const existingParty = await Party.findOne({
      createdByClient: req.auth.clientId,
      $or: [
        { contactNumber: contactNumber },
        { email: email?.toLowerCase() }
      ]
    });

    if (existingParty) {
      if (existingParty.contactNumber === contactNumber) {
        return res.status(400).json({ message: "Contact number already exists for this client" });
      }
      if (existingParty.email === email?.toLowerCase()) {
        return res.status(400).json({ message: "Email already exists for this client" });
      }
    }

    const party = await Party.create({
      name,
      address,
      city,
      state,
      pincode,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      tdsRate,
      tdsSection,
      contactNumber,
      email: email?.toLowerCase(),
      createdByClient: req.auth.clientId,
      createdByUser: req.auth.userId,
    });

    // Notify admin after party created
    await notifyAdminOnPartyAction({
      req,
      action: "create",
      partyName: party.name,
      entryId: party._id,
    });

    res.status(201).json({ message: "Party created", party });
  } catch (err) {
    if (err.code === 11000) {
      // Better error message extraction
      const keyPattern = err.keyPattern;
      let message = "Duplicate field error";
      
      if (keyPattern.contactNumber && keyPattern.createdByClient) {
        message = "Contact number already exists for this client";
      } else if (keyPattern.email && keyPattern.createdByClient) {
        message = "Email already exists for this client";
      } else {
        // Log the actual duplicate field for debugging
        console.log("Duplicate key error details:", err.keyValue);
        message = `Duplicate field: ${Object.keys(err.keyValue)[0]}`;
      }
      
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getParties = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 100,
    } = req.query;

    const where = { createdByClient: req.auth.clientId };

    if (q) {
      where.$or = [
        { name: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { contactNumber: { $regex: String(q), $options: "i" } },
      ];
    }

      // 2) If cache miss, fetch from DB
    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [parties, total] = await Promise.all([
      Party.find(where).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Party.countDocuments(where),
    ]);


    res.json({ parties, total, page: Number(page), limit: perPage });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getPartyBalance = async (req, res) => {
  try {
    const { partyId } = req.params; // Get the partyId from the URL parameter


    // 2) If cache miss, fetch from DB
    const party = await Party.findById(partyId);

    if (!party) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({ balance: party.balance });
  } catch (err) {
    console.error("Error fetching party balance:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



// GET /api/parties/balances
exports.getPartyBalancesBulk = async (req, res) => {
  try {
    const where = { createdByClient: req.auth.clientId };

    const rows = await Party.find(where)
      .select({ _id: 1, balance: 1 })
      .lean();

    const balances = {};

    return res.json({ balances });
  } catch (err) {
    console.error("getPartyBalancesBulk error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.updateParty = async (req, res) => {
  try {
    const doc = await Party.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Party not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    Object.assign(doc, req.body);
    await doc.save();

    // Notify admin after party updated
    await notifyAdminOnPartyAction({
      req,
      action: "update",
      partyName: doc.name,
      entryId: doc._id,
    });

    res.json({ message: "Party updated", party: doc });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      let message = `Duplicate ${field}`;
      if (field === "contactNumber") {
        message = "Contact number already exists for this client";
      } else if (field === "email") {
        message = "Email already exists for this client";
      }
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteParty = async (req, res) => {
  try {
    const doc = await Party.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Party not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Notify admin before deleting (since doc will be gone after)
    await notifyAdminOnPartyAction({
      req,
      action: "delete",
      partyName: doc.name,
      entryId: doc._id,
    });

    await doc.deleteOne();

    res.json({ message: "Party deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
