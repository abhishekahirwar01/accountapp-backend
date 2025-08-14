const Service = require("../models/Service");

// Create
exports.createService = async (req, res) => {
  try {
    const { serviceName, amount, description } = req.body;
    const service = new Service({
      serviceName,
      amount,
      description,
      createdByClient: req.user.id
    });

    await service.save();
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
    const services = await Service.find({ createdByClient: req.user.id });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    if (req.user.role !== "admin" && String(service.createdByClient) !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { serviceName, amount, description } = req.body;
    if (serviceName) service.serviceName = serviceName;
    if (typeof amount === "number" && amount >= 0) service.amount = amount;
    if (typeof description === "string") service.description = description;

    await service.save();
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

    if (req.user.role !== "admin" && String(service.createdByClient) !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

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
      createdByClient: req.user.id,
    });
    if (!doc) return res.status(404).json({ message: "Service not found" });

    const service = { ...doc.toObject(), name: doc.serviceName };
    res.json({ service });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
}