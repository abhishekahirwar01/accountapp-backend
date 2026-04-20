const Vehicle = require("../../models/Transporter/Vehicle");
const Trip = require("../../models/Transporter/Trip");
const mongoose = require('mongoose');
const Company = require("../../models/Company");
const { resolveClientId } = require("../common/tenant");
const { createNotification } = require("../notificationController");
const { resolveActor, findAdminUser } = require("../../utils/actorUtils");

// ==================== HELPER FUNCTIONS (Matching Service Module) ====================

// ==================== HELPER FUNCTIONS ====================

function normalizeVehicleCompanyIds(input) {
  const toArray = (value) => {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {
          // Ignore parse errors
        }
      }
      return [trimmed];
    }
    return [value];
  };

  const ids = toArray(input)
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (mongoose.Types.ObjectId.isValid(trimmed)) {
          return trimmed;
        }
        return trimmed;
      }
      if (typeof item === "object") {
        const id = item._id || item.id || "";
        return String(id).trim();
      }
      return String(item).trim();
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVehicleCompanyScopeFilter(companyId) {
  if (!companyId || companyId === "all") return {};

  return {
    $or: [
      { companies: companyId },
      { company: companyId },
      {
        $and: [
          {
            $or: [
              { companies: { $exists: false } },
              { companies: null },
              { companies: { $size: 0 } },
            ],
          },
          {
            $or: [{ company: { $exists: false } }, { company: null }],
          },
        ],
      },
    ],
  };
}

// ==================== NON-BLOCKING NOTIFICATION (FIXED) ====================

async function notifyAdminOnVehicleAction({ req, action, vehicleRegNo, entryId }) {
  try {
    // Try to get actor info
    let actorName = req.auth?.userId || "System";
    let actorId = req.auth?.userId || null;
    
    // Try to find admin user (but don't fail if not found)
    const adminUser = await mongoose.model("User").findOne({ role: "admin" });
    if (!adminUser) {
      console.log("No admin user found for notification");
      return;
    }

    // Try to create notification (don't await if it fails)
    const message = `Vehicle ${action} by ${actorName}: ${vehicleRegNo}`;
    
    const Notification = mongoose.model("Notification");
    await Notification.create({
      message,
      recipient: adminUser._id,
      actor: actorId,
      action: action,
      entryType: "vehicle",
      entryId: entryId,
      clientId: req.auth?.clientId,
    });
    
    console.log(`Notification sent: ${message}`);
  } catch (error) {
    // Just log the error, don't throw it
    console.error("Failed to create notification (non-blocking):", error.message);
  }
}

// ==================== CREATE ====================

// ==================== CREATE (Fixed - No duplicates allowed) ====================

// @desc    Create new vehicle
// @route   POST /api/vehicles
exports.createVehicle = async (req, res) => {
  try {
    const {
      registrationNo,
      vehicleType,
      brand,
      model,
      year,
      capacity,
      fuelType,
      fuelEfficiency,
      purchaseDate,
      purchasePrice,
      insuranceValidTill,
      fitnessValidTill,
      company,
      companies,
      ownerName,
      ownerContact,
      notes,
    } = req.body;

    const normalizedCompanies = normalizeVehicleCompanyIds(
      companies !== undefined ? companies : company
    );
    const normalizedRegNo = String(registrationNo || "").trim().toUpperCase();

    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({
      createdByClient: req.auth.clientId,
      registrationNo: normalizedRegNo,
    });

    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message: `Vehicle with registration number ${normalizedRegNo} already exists.`,
      });
    }

    // 🔴 FIX: Generate unique vehicleId
    const vehicleCount = await Vehicle.countDocuments({ 
      createdByClient: req.auth.clientId 
    });
    const vehicleId = `VEH-${String(vehicleCount + 1).padStart(4, '0')}`;

    // Create new vehicle
    const vehicle = new Vehicle({
      vehicleId,  // ← ADD THIS - CRITICAL!
      registrationNo: normalizedRegNo,
      vehicleType,
      brand,
      model,
      year,
      capacity,
      fuelType,
      fuelEfficiency,
      purchaseDate,
      purchasePrice,
      insuranceValidTill,
      fitnessValidTill,
      company: normalizedCompanies.length === 1 ? normalizedCompanies[0] : undefined,
      companies: normalizedCompanies,
      ownerName,
      ownerContact,
      notes,
      createdByClient: req.auth.clientId,
      createdByUser: req.auth.userId,
    });

    await vehicle.save();

    // Emit socket event
    try {
      if (global.io) {
        global.io.to(`client-${req.auth.clientId}`).emit("vehicle-update", {
          message: "Vehicle created",
          vehicleId: vehicle._id,
          registrationNo: vehicle.registrationNo,
          action: "create",
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError.message);
    }

    res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      vehicle,
    });
  } catch (err) {
    console.error("Create vehicle error:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Vehicle with this registration number already exists for your client",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ==================== READ ====================

// @desc    Get all vehicles (with filters)
// @route   GET /api/vehicles
exports.getVehicles = async (req, res) => {
  try {
    const requestedClientId = req.query.clientId || req.auth.clientId;
    const {
      q,
      companyId,
      company,
      vehicleType,
      status,
      page = 1,
      limit = 100,
    } = req.query;

    const isPrivileged = ["master", "admin"].includes(req.auth.role);

    if (!isPrivileged && requestedClientId !== req.auth.clientId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this client's data.",
      });
    }

    const where = { createdByClient: requestedClientId };

    if (q) {
      where.$or = [
        { registrationNo: { $regex: String(q), $options: "i" } },
        { brand: { $regex: String(q), $options: "i" } },
        { model: { $regex: String(q), $options: "i" } },
      ];
    }

    if (vehicleType) {
      where.vehicleType = vehicleType;
    }

    if (status) {
      where.status = status;
    }

    const resolvedCompanyId = companyId || company;
    if (resolvedCompanyId && resolvedCompanyId !== "all") {
      Object.assign(where, buildVehicleCompanyScopeFilter(String(resolvedCompanyId)));
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [items, total] = await Promise.all([
      Vehicle.find(where)
        .populate("company")
        .populate("companies")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Vehicle.countDocuments(where),
    ]);

    return res.json({
      success: true,
      vehicles: items,
      total,
      page: Number(page),
      limit: perPage,
    });
  } catch (err) {
    console.error("Get vehicles error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Get single vehicle by ID
// @route   GET /api/vehicles/:id
exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    })
      .populate("company")
      .populate("companies");

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    res.json({
      success: true,
      vehicle,
    });
  } catch (err) {
    console.error("Get vehicle by ID error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Get vehicles dropdown (for select inputs)
// @route   GET /api/vehicles/dropdown
exports.getVehicleDropdown = async (req, res) => {
  try {
    const { companyId, status = "Active" } = req.query;

    let where = {
      createdByClient: req.auth.clientId,
      status,
    };

    if (companyId && companyId !== "all") {
      Object.assign(where, buildVehicleCompanyScopeFilter(String(companyId)));
    }

    const vehicles = await Vehicle.find(where)
      .select("registrationNo vehicleType brand model company companies")
      .populate("company", "businessName")
      .sort({ registrationNo: 1 })
      .lean();

    res.json({
      success: true,
      vehicles: vehicles.map((v) => ({
        id: v._id,
        registrationNo: v.registrationNo,
        vehicleType: v.vehicleType,
        brand: v.brand,
        model: v.model,
        companyName: v.company?.businessName,
      })),
    });
  } catch (err) {
    console.error("Get vehicle dropdown error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Get vehicles by company
// @route   GET /api/vehicles/company/:companyId
exports.getVehiclesByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status, page = 1, limit = 100 } = req.query;

    const where = {
      createdByClient: req.auth.clientId,
      ...buildVehicleCompanyScopeFilter(companyId),
    };

    if (status) where.status = status;

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [vehicles, total] = await Promise.all([
      Vehicle.find(where)
        .sort({ registrationNo: 1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Vehicle.countDocuments(where),
    ]);

    res.json({
      success: true,
      vehicles,
      total,
      page: Number(page),
      limit: perPage,
    });
  } catch (err) {
    console.error("Get vehicles by company error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Get vehicle stats summary (dashboard)
// @route   GET /api/vehicles/stats/summary
exports.getVehicleStatsSummary = async (req, res) => {
  try {
    const { companyId } = req.query;

    // Build query - get ALL vehicles for this client
    let query = { createdByClient: req.auth.clientId };

    // If companyId provided, filter vehicles that belong to this company
    if (companyId && companyId !== "all") {
      query = {
        ...query,
        $or: [
          { companies: companyId },
          { company: companyId }
        ]
      };
    }

    console.log("Stats query:", JSON.stringify(query));

    // Get all vehicles matching the query
    const vehicles = await Vehicle.find(query);
    
    console.log("Vehicles found:", vehicles.length);
    console.log("Vehicles:", vehicles.map(v => ({ 
      regNo: v.registrationNo, 
      status: v.status,
      companies: v.companies 
    })));

    // Calculate statistics
    const stats = {
      total: vehicles.length,
      active: vehicles.filter(v => v.status === 'Active').length,
      underMaintenance: vehicles.filter(v => v.status === 'Under Maintenance').length,
      retired: vehicles.filter(v => v.status === 'Retired').length,
      onTrip: vehicles.filter(v => v.status === 'On Trip').length,
      totalRevenue: vehicles.reduce((sum, v) => sum + (v.totalRevenue || 0), 0),
      totalTrips: vehicles.reduce((sum, v) => sum + (v.totalTrips || 0), 0),
      totalDistance: vehicles.reduce((sum, v) => sum + (v.totalDistance || 0), 0),
    };

    // Vehicle type distribution (only active vehicles)
    const typeMap = {};
    vehicles.forEach(v => {
      if (v.status === 'Active') {
        const type = v.vehicleType;
        typeMap[type] = (typeMap[type] || 0) + 1;
      }
    });
    
    const typeDistribution = Object.entries(typeMap).map(([type, count]) => ({
      _id: type,
      count
    }));

    res.json({
      success: true,
      stats,
      typeDistribution,
    });
  } catch (err) {
    console.error("Get vehicle stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ==================== UPDATE (For modifications) ====================

// @desc    Update vehicle
// @route   PUT /api/vehicles/:id
exports.updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const {
      registrationNo,
      vehicleType,
      brand,
      model,
      year,
      capacity,
      fuelType,
      fuelEfficiency,
      purchaseDate,
      purchasePrice,
      insuranceValidTill,
      fitnessValidTill,
      company,
      companies,
      ownerName,
      ownerContact,
      status,
      notes,
    } = req.body;

    // 🔴 FIXED: If changing registration number, check for duplicate
    if (registrationNo && registrationNo.toUpperCase() !== vehicle.registrationNo) {
      const existingVehicle = await Vehicle.findOne({
        createdByClient: req.auth.clientId,
        registrationNo: registrationNo.toUpperCase(),
        _id: { $ne: vehicle._id }  // Exclude current vehicle
      });

      if (existingVehicle) {
        return res.status(409).json({
          success: false,
          message: `Vehicle with registration number ${registrationNo.toUpperCase()} already exists.`,
        });
      }
      vehicle.registrationNo = registrationNo.toUpperCase();
    }

    // Update other fields
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (brand) vehicle.brand = brand;
    if (model) vehicle.model = model;
    if (year) vehicle.year = year;
    if (capacity) vehicle.capacity = capacity;
    if (fuelType) vehicle.fuelType = fuelType;
    if (fuelEfficiency) vehicle.fuelEfficiency = fuelEfficiency;
    if (purchaseDate) vehicle.purchaseDate = purchaseDate;
    if (purchasePrice) vehicle.purchasePrice = purchasePrice;
    if (insuranceValidTill) vehicle.insuranceValidTill = insuranceValidTill;
    if (fitnessValidTill) vehicle.fitnessValidTill = fitnessValidTill;
    if (ownerName) vehicle.ownerName = ownerName;
    if (ownerContact) vehicle.ownerContact = ownerContact;
    if (status) vehicle.status = status;
    if (notes) vehicle.notes = notes;

    // Update company mapping (only in update, not in create)
    const hasCompany =
      Object.prototype.hasOwnProperty.call(req.body, "company") ||
      Object.prototype.hasOwnProperty.call(req.body, "companies");
    if (hasCompany) {
      const normalizedCompanies = normalizeVehicleCompanyIds(
        Object.prototype.hasOwnProperty.call(req.body, "companies")
          ? companies
          : company
      );
      vehicle.companies = normalizedCompanies;
      vehicle.company = normalizedCompanies.length === 1 ? normalizedCompanies[0] : undefined;
    }

    await vehicle.save();

    // Emit socket event
    try {
      if (global.io) {
        global.io.to(`client-${req.auth.clientId}`).emit("vehicle-update", {
          message: "Vehicle updated",
          vehicleId: vehicle._id,
          registrationNo: vehicle.registrationNo,
          action: "update",
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError.message);
    }

    await notifyAdminOnVehicleAction({
      req,
      action: "update",
      vehicleRegNo: vehicle.registrationNo,
      entryId: vehicle._id,
    });

    res.json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle,
    });
  } catch (err) {
    console.error("Update vehicle error:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Vehicle with this registration number already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Update vehicle status
// @route   PATCH /api/vehicles/:id/status
exports.updateVehicleStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;

    if (!["Active", "Under Maintenance", "Retired", "On Trip"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    vehicle.status = status;
    if (reason) {
      vehicle.notes = reason;
    }
    await vehicle.save();

    try {
      if (global.io) {
        global.io.to(`client-${req.auth.clientId}`).emit("vehicle-update", {
          message: `Vehicle status updated to ${status}`,
          vehicleId: vehicle._id,
          registrationNo: vehicle.registrationNo,
          action: "update",
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError.message);
    }

    res.json({
      success: true,
      message: `Vehicle status updated to ${status}`,
      vehicle,
    });
  } catch (err) {
    console.error("Update vehicle status error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Sync vehicle stats from trips
// @route   POST /api/vehicles/:id/sync-stats
exports.syncVehicleStats = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const trips = await Trip.find({ vehicleId: vehicle._id });

    const stats = {
      totalTrips: trips.length,
      totalDistance: trips.reduce((sum, t) => sum + (t.distance || 0), 0),
      totalRevenue: trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0),
      totalExpenses: trips.reduce((sum, t) => sum + (t.expenses?.total || 0), 0),
      lastTripDate: trips.length > 0 ? trips[0].endDate : null,
    };

    vehicle.totalTrips = stats.totalTrips;
    vehicle.totalDistance = stats.totalDistance;
    vehicle.totalRevenue = stats.totalRevenue;
    vehicle.totalExpenses = stats.totalExpenses;
    vehicle.lastTripDate = stats.lastTripDate;
    await vehicle.save();

    res.json({
      success: true,
      message: "Vehicle stats synced successfully",
      stats,
    });
  } catch (err) {
    console.error("Sync vehicle stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Delete vehicle
// @route   DELETE /api/vehicles/:id
exports.deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const tripCount = await Trip.countDocuments({ vehicleId: vehicle._id });

    if (tripCount > 0) {
      vehicle.status = "Retired";
      await vehicle.save();

      return res.json({
        success: true,
        message: "Vehicle has existing trips. Marked as retired instead.",
        vehicle,
      });
    }

    const vehicleRegNo = vehicle.registrationNo;
    const vehicleId = vehicle._id;

    await notifyAdminOnVehicleAction({
      req,
      action: "delete",
      vehicleRegNo,
      entryId: vehicleId,
    });

    await vehicle.deleteOne();

    try {
      if (global.io) {
        global.io.to(`client-${req.auth.clientId}`).emit("vehicle-update", {
          message: "Vehicle deleted",
          vehicleId: vehicleId,
          registrationNo: vehicleRegNo,
          action: "delete",
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError.message);
    }

    res.json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (err) {
    console.error("Delete vehicle error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ==================== TRIP RELATED ====================

// @desc    Get all trips for a specific vehicle
// @route   GET /api/vehicles/:id/trips
exports.getVehicleTrips = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const vehicle = await Vehicle.findOne({
      _id: id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    let query = { vehicleId: vehicle._id };

    if (status) query.status = status;
    if (fromDate || toDate) {
      query.startDate = {};
      if (fromDate) query.startDate.$gte = new Date(fromDate);
      if (toDate) query.startDate.$lte = new Date(toDate);
    }

    const perPage = Math.min(Number(limit) || 10, 100);
    const skip = (Number(page) - 1) * perPage;

    const [trips, totalTrips] = await Promise.all([
      Trip.find(query)
        .populate("driverId", "name phone")
        .populate("consignorId", "name")
        .populate("consigneeId", "name")
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Trip.countDocuments(query),
    ]);

    const summary = await Trip.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDistance: { $sum: "$distance" },
          totalRevenue: { $sum: "$freightAmount" },
          totalExpenses: { $sum: "$expenses.total" },
          netProfit: { $sum: "$netProfit" },
          completedTrips: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      vehicle: {
        id: vehicle._id,
        registrationNo: vehicle.registrationNo,
        vehicleType: vehicle.vehicleType,
        status: vehicle.status,
      },
      summary: summary[0] || {
        totalDistance: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        completedTrips: 0,
      },
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalTrips / perPage),
        totalTrips,
        limit: perPage,
      },
      trips,
    });
  } catch (err) {
    console.error("Get vehicle trips error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Get vehicle revenue report
// @route   GET /api/vehicles/:id/revenue
exports.getVehicleRevenue = async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate, toDate } = req.query;

    const vehicle = await Vehicle.findOne({
      _id: id,
      createdByClient: req.auth.clientId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    let query = { vehicleId: vehicle._id, status: "Completed" };

    if (fromDate || toDate) {
      query.endDate = {};
      if (fromDate) query.endDate.$gte = new Date(fromDate);
      if (toDate) query.endDate.$lte = new Date(toDate);
    }

    const trips = await Trip.find(query);

    const revenueData = {
      totalTrips: trips.length,
      totalDistance: trips.reduce((sum, t) => sum + (t.distance || 0), 0),
      totalRevenue: trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0),
      totalExpenses: trips.reduce((sum, t) => sum + (t.expenses?.total || 0), 0),
      netProfit: trips.reduce((sum, t) => sum + (t.netProfit || 0), 0),
      averageRevenuePerTrip:
        trips.length > 0
          ? trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0) / trips.length
          : 0,
      averageDistancePerTrip:
        trips.length > 0
          ? trips.reduce((sum, t) => sum + (t.distance || 0), 0) / trips.length
          : 0,
    };

    res.json({
      success: true,
      vehicle: {
        id: vehicle._id,
        registrationNo: vehicle.registrationNo,
        vehicleType: vehicle.vehicleType,
      },
      revenueData,
    });
  } catch (err) {
    console.error("Get vehicle revenue error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};