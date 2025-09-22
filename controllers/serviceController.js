const Service = require("../models/Service");
const { resolveClientId } = require("./common/tenant");
const { getFromCache, setToCache, deleteFromCache } = require('../RedisCache');

// Create
exports.createService = async (req, res) => {
  try {
    const { serviceName, amount, description } = req.body;
    const service = await Service.create({
      serviceName,
      amount,
      description,
      createdByClient: req.auth.clientId,  // TENANT
      createdByUser: req.auth.userId,    // ACTOR (remove if not in schema)
    });

    await service.save();

    // Invalidate cache for services list
    const servicesCacheKey = `services:client:${req.auth.clientId}`;
    // await deleteFromCache(servicesCacheKey);

    res.status(201).json({ message: "Service created", service });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Service already exists for this client" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get all
exports.getServices = async (req, res) => {
  try {
    const clientId = req.auth.clientId;

    const {
      q,
      companyId,
      page = 1,
      limit = 100,
    } = req.query;

    const cacheKey = `services:client:${clientId}:${JSON.stringify({ q, companyId, page, limit })}`;

    // Check cache first
    // const cached = await getFromCache(cacheKey);
    // if (cached) {
    //   res.set('X-Cache', 'HIT');
    //   res.set('X-Cache-Key', cacheKey);
    //   return res.json(cached);
    // }

    const where = { createdByClient: clientId };

    if (q) {
      where.serviceName = { $regex: String(q), $options: "i" };
    }
    if (companyId) {
      where.company = companyId; // only if your schema has a `company` field
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [items, total] = await Promise.all([
      Service.find(where).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Service.countDocuments(where),
    ]);

    const result = {
      services: items,
      total,
      page: Number(page),
      limit: perPage,
    };

    // Cache the result
    // await setToCache(cacheKey, result);
    // res.set('X-Cache', 'MISS');
    // res.set('X-Cache-Key', cacheKey);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    const privileged = ["master", "client", "admin"].includes(req.auth.role);
    const sameTenant = String(service.createdByClient) === req.auth.clientId;
    if (!privileged && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { serviceName, amount, description } = req.body;
    if (serviceName) service.serviceName = serviceName;
    if (typeof amount === "number" && amount >= 0) service.amount = amount;
    if (typeof description === "string") service.description = description;

    await service.save();

    // Invalidate cache for services list
    const servicesCacheKey = `services:client:${req.auth.clientId}`;
    // await deleteFromCache(servicesCacheKey);

    res.json({ message: "Service updated", service });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate service details" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    const privileged = ["master", "client", "admin"].includes(req.auth.role);
    const sameTenant = String(service.createdByClient) === req.auth.clientId;
    if (!privileged && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await service.deleteOne();

    // Invalidate cache for services list
    const servicesCacheKey = `services:client:${req.auth.clientId}`;
    // await deleteFromCache(servicesCacheKey);

    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.getServiceById = async (req, res) => {
  try {
    const doc = await Service.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    });
    if (!doc) return res.status(404).json({ message: "Service not found" });

    const service = { ...doc.toObject(), name: doc.serviceName };
    res.json({ service });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
}