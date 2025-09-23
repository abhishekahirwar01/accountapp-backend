// controllers/party.controller.js
const Party = require("../models/Party");
const Customer = require("../models/Client")

const PRIV_ROLES = new Set(["master", "client", "admin"]);
const { getFromCache, setToCache, deleteFromCache } = require('../RedisCache');

exports.createParty = async (req, res) => {
  try {
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
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      contactNumber,
      email: email?.toLowerCase(),
      createdByClient: req.auth.clientId,
      createdByUser: req.auth.userId,
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

    const cacheKey = `parties:client:${req.auth.clientId}:${JSON.stringify({ q, page, limit })}`;

    // 1) Check cache first
    // const cached = await getFromCache(cacheKey);
    // if (cached) {
    //   res.set('X-Cache', 'HIT');
    //   res.set('X-Cache-Key', cacheKey);
    //   return res.json(cached);
    // }

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

    const result = { parties, total, page: Number(page), limit: perPage };

    // // 3) Cache the result
    // await setToCache(cacheKey, result);
    // res.set('X-Cache', 'MISS');
    // res.set('X-Cache-Key', cacheKey);

    res.json(result);
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

    // Invalidate cache for parties list
    // const partiesCacheKey = `parties:client:${req.auth.clientId}`;
    // await deleteFromCache(partiesCacheKey);

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

    await doc.deleteOne();

    // // Invalidate cache for parties list
    // const partiesCacheKey = `parties:client:${req.auth.clientId}`;
    // await deleteFromCache(partiesCacheKey);

    res.json({ message: "Party deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
