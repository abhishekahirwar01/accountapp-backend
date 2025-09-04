// controllers/party.controller.js
const Party = require("../models/Party");

const PRIV_ROLES = new Set(["master", "client", "admin"]);
const { myCache, key, invalidateClientsForMaster, invalidateClient } = require("../cache");  // Add cache import

const {generatePartyBalanceCacheKey} = require("../utils/cacheHelpers")
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

     // CACHE INVALIDATION: Invalidate the cache for this client's parties list
    const cacheKey = key.client(req.auth.clientId);  // Cache key for the client’s parties
    myCache.del(cacheKey);  // Invalidate cache for client's party list

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

    const cacheKey = key.client(req.auth.clientId, q, page, limit);  // Generate a cache key based on query parameters

    // 1) Check cache first
    const cached = myCache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');  // Debug header to track cache hit
      res.set('X-Cache-Key', cacheKey);
      return res.status(200).json(cached);
    }

      // 2) If cache miss, fetch from DB
    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [parties, total] = await Promise.all([
      Party.find(where).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Party.countDocuments(where),
    ]);

    // 3) Store the result in cache
    myCache.set(cacheKey, { parties, total, page: Number(page), limit: perPage });

    res.set('X-Cache', 'MISS');  // Debug header to track cache miss
    res.set('X-Cache-Key', cacheKey);

    res.json({ parties, total, page: Number(page), limit: perPage });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getPartyBalance = async (req, res) => {
  try {
    const { partyId } = req.params; // Get the partyId from the URL parameter

    // Generate a cache key for the party balance
     const cacheKey = generatePartyBalanceCacheKey(req.auth.clientId, partyId);

    // 1) Check cache first
    const cached = myCache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', cacheKey);
      return res.json({ balance: cached });
    }

    // 2) If cache miss, fetch from DB
    const party = await Party.findById(partyId);

    if (!party) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Cache the balance value
    myCache.set(cacheKey, party.balance);

    res.set('X-Cache', 'MISS');
    res.set('X-Cache-Key', cacheKey);

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
    for (const r of rows) {
      // Generate a cache key for each party balance
      const cacheKey = generatePartyBalanceCacheKey(req.auth.clientId, r._id);

      // 1) Check cache first
      const cached = myCache.get(cacheKey);
      if (cached) {
        balances[String(r._id)] = cached;
      } else {
        // 2) If cache miss, fetch from DB and cache it
        balances[String(r._id)] = r.balance;
        myCache.set(cacheKey, r.balance);  // Store in cache
      }
    }

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

    // Invalidate cache for this party
    const cacheKey = key.client(req.auth.clientId);
    myCache.del(cacheKey);  // Invalidate the cache for the list of parties

    // Invalidate the cache for this party's balance
    const partyBalanceKey = generatePartyBalanceCacheKey(req.auth.clientId, doc._id);
    myCache.del(partyBalanceKey);

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

    // Invalidate cache for this party
    const cacheKey = key.client(req.auth.clientId);
    myCache.del(cacheKey);  // Invalidate the cache for the list of parties

    // Invalidate the cache for this party's balance
    const partyBalanceKey = generatePartyBalanceCacheKey(req.auth.clientId, doc._id);
    myCache.del(partyBalanceKey);

    res.json({ message: "Party deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
