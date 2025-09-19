// controllers/vendor.controller.js
const Vendor = require("../models/Vendor");
const { getFromCache, setToCache, deleteFromCache } = require('../RedisCache');

const PRIV_ROLES = new Set(["master", "client", "admin"]);

exports.createVendor = async (req, res) => {
  try {
    // // permission gate (non-privileged must have explicit capability)
    // if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateVendors) {
    //   return res.status(403).json({ message: "Not allowed to create vendors" });
    // }

    const {
      vendorName,
      contactNumber,
      email,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
    } = req.body;

    const vendor = await Vendor.create({
      vendorName,
      contactNumber,
      email,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      createdByClient: req.auth.clientId,   // ✅ tenant
      createdByUser: req.auth.userId,       // optional
    });

    // Invalidate cache for vendors list
    // const vendorsCacheKey = `vendors:client:${req.auth.clientId}`;
    // await deleteFromCache(vendorsCacheKey);

    res.status(201).json({ message: "Vendor created", vendor });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ message: "Vendor already exists for this client" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 100,
    } = req.query;

    // const cacheKey = `vendors:client:${req.auth.clientId}:${JSON.stringify({ q, page, limit })}`;

    // // Check cache first
    // const cached = await getFromCache(cacheKey);
    // if (cached) {
    //   res.set('X-Cache', 'HIT');
    //   res.set('X-Cache-Key', cacheKey);
    //   return res.json(cached);
    // }

    const where = { createdByClient: req.auth.clientId };

    if (q) {
      // search by name / email / phone
      where.$or = [
        { vendorName: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { contactNumber: { $regex: String(q), $options: "i" } },
      ];
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [vendors, total] = await Promise.all([
      Vendor.find(where).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Vendor.countDocuments(where),
    ]);

    const result = { vendors, total, page: Number(page), limit: perPage };

    // Cache the result
    // await setToCache(cacheKey, result);
    // res.set('X-Cache', 'MISS');
    // res.set('X-Cache-Key', cacheKey);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const doc = await Vendor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Vendor not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const up = req.body;
    if (up.vendorName != null) doc.vendorName = up.vendorName;
    if (up.contactNumber != null) doc.contactNumber = up.contactNumber;
    if (up.email != null) doc.email = up.email;
    if (up.address != null) doc.address = up.address;
    if (up.city != null) doc.city = up.city;
    if (up.state != null) doc.state = up.state;
    if (up.gstin != null) doc.gstin = up.gstin;
    if (up.gstRegistrationType != null) doc.gstRegistrationType = up.gstRegistrationType;
    if (up.pan != null) doc.pan = up.pan;
    if (typeof up.isTDSApplicable === "boolean") doc.isTDSApplicable = up.isTDSApplicable;

    await doc.save();

    // // Invalidate cache for vendors list
    // const vendorsCacheKey = `vendors:client:${req.auth.clientId}`;
    // await deleteFromCache(vendorsCacheKey);

    res.json({ message: "Vendor updated", vendor: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate vendor details" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const doc = await Vendor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Vendor not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await doc.deleteOne();

    // // Invalidate cache for vendors list
    // const vendorsCacheKey = `vendors:client:${req.auth.clientId}`;
    // await deleteFromCache(vendorsCacheKey);

    res.json({ message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
