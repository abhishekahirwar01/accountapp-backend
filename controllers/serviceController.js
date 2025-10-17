const Service = require("../models/Service");
const { resolveClientId } = require("./common/tenant");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");


// Build message text per action
function buildServiceNotificationMessage(action, { actorName, serviceName }) {
  const sName = serviceName || "Unknown Service";
  switch (action) {
    case "create":
      return `New service created by ${actorName}: ${sName}`;
    case "update":
      return `Service updated by ${actorName}: ${sName}`;
    case "delete":
      return `Service deleted by ${actorName}: ${sName}`;
    default:
      return `Service ${action} by ${actorName}: ${sName}`;
  }
}

// Unified notifier for service module
async function notifyAdminOnServiceAction({ req, action, serviceName, entryId }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser();
  if (!adminUser) {
    console.warn("notifyAdminOnServiceAction: no admin user found");
    return;
  }

  const message = buildServiceNotificationMessage(action, {
    actorName: actor.name,
    serviceName,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "service", // entry type / category
    entryId, // service id
    req.auth.clientId
  );
}

// Create
exports.createService = async (req, res) => {
  try {
    const { serviceName, amount, description, sac } = req.body;
    const service = await Service.create({
      serviceName,
      amount,
      description,
      sac,
      createdByClient: req.auth.clientId,  // TENANT
      createdByUser: req.auth.userId,    // ACTOR (remove if not in schema)
    });

    await service.save();

    // Notify admin after service created
    await notifyAdminOnServiceAction({
      req,
      action: "create",
      serviceName: service.serviceName,
      entryId: service._id,
    });

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

    return res.json({
      services: items,
      total,
      page: Number(page),
      limit: perPage,
    });
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

    const { serviceName, amount, description, sac } = req.body;
    if (serviceName) service.serviceName = serviceName;
    if (typeof amount === "number" && amount >= 0) service.amount = amount;
    if (typeof description === "string") service.description = description;
    if (sac !== undefined) service.sac = sac;

    await service.save();

    // Notify admin after service updated
    await notifyAdminOnServiceAction({
      req,
      action: "update",
      serviceName: service.serviceName,
      entryId: service._id,
    });

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

    // Notify admin before deleting
    await notifyAdminOnServiceAction({
      req,
      action: "delete",
      serviceName: service.serviceName,
      entryId: service._id,
    });

    await service.deleteOne();
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