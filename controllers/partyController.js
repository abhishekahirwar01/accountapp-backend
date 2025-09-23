// controllers/party.controller.js
const Party = require("../models/Party");
const Customer = require("../models/Client")

const PRIV_ROLES = new Set(["master", "client", "admin"]);
const { myCache, key, invalidateClientsForMaster, invalidateClient } = require("../cache");  // Add cache import

exports.createParty = async (req, res) => {
  try {
    if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateCustomers) {
      return res.status(403).json({ message: "Not allowed to create customers" });
    }

    const {
      name,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      contactNumber,
      email,
    } = req.body;

    const party = await Party.create({
      name,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      contactNumber,
      email,
      createdByClient: req.auth.clientId,   // ✅ tenant
      createdByUser: req.auth.userId,       // optional
    });

    res.status(201).json({ message: "Party created", party });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Party already exists for this client" });
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

    res.json({ message: "Party updated", party: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate party details" });
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

    await doc.deleteOne();

    res.json({ message: "Party deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
