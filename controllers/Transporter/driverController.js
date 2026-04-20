const Driver = require('../../models/Transporter/Driver');
const Trip = require('../../models/Transporter/Trip');
const mongoose = require('mongoose');
const { resolveActor, findAdminUser } = require("../../utils/actorUtils");
const { createNotification } = require("../notificationController");

// ==================== HELPER FUNCTIONS FOR DRIVER ====================

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDriverCompanyIds(input) {
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

  return Array.from(
    new Set(
      toArray(input)
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item.trim();
          if (typeof item === "object") {
            const id = item._id || item.id || "";
            return String(id).trim();
          }
          return String(item).trim();
        })
        .filter(Boolean)
    )
  );
}

// Build notification message
function buildDriverNotificationMessage(action, { actorName, driverName, driverId, oldStatus, newStatus }) {
  const dName = driverName || "Unknown Driver";
  const dId = driverId ? ` (${driverId})` : "";
  switch (action) {
    case "create":
      return `New driver created by ${actorName}: ${dName}${dId}`;
    case "update":
      return `Driver updated by ${actorName}: ${dName}${dId}`;
    case "delete":
      return `Driver deleted by ${actorName}: ${dName}${dId}`;
    case "status_update":
      return `Driver status changed by ${actorName}: ${dName}${dId} from ${oldStatus} to ${newStatus}`;
    default:
      return `Driver ${action} by ${actorName}: ${dName}${dId}`;
  }
}

// Unified notifier for driver module
async function notifyAdminOnDriverAction({ req, action, driverName, driverId, oldStatus, newStatus }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser();
  if (!adminUser) {
    console.warn("notifyAdminOnDriverAction: no admin user found");
    return;
  }

  const message = buildDriverNotificationMessage(action, {
    actorName: actor.name,
    driverName,
    driverId,
    oldStatus,
    newStatus
  });

  await createNotification(
    message,
    adminUser._id,
    actor.id,
    action,
    "driver",
    driverId,
    req.auth.clientId
  );
}

// ==================== CREATE ====================

exports.createDriver = async (req, res) => {
  try {
    const { name, phone, email, licenseNo, salaryPerTrip, bataPerDay, company, salaryType, salaryPerDay, profitPercentage } = req.body;

    const clientId = req.auth?.clientId || req.user?.clientId || req.user?.id;
    const userId = req.auth?.userId || req.user?._id || req.user?.userId;

    if (!req.auth?.clientId) {
      return res.status(401).json({ success: false, message: "Unauthorized: clientId missing" });
    }

    const companyIds = Array.isArray(company) ? company : company ? [company] : [];

    const existingDriver = await Driver.findOne({
      $or: [{ phone }, { licenseNo }],
      createdByClient: req.auth.clientId
    });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: 'Driver with this phone or license already exists'
      });
    }

    const nameExists = await Driver.findOne({
      createdByClient: req.auth.clientId,
      company: { $in: companyIds },
      name: { $regex: new RegExp(`^${escapeRegex(name?.trim())}$`, "i") },
    });
    if (nameExists) {
      return res.status(400).json({
        success: false,
        message: "Driver with this name already exists in this company"
      });
    }


    // Generate a unique driverId
    let driverId;
    let isUnique = false;
    let attempts = 0;
    const tenantCode = String(req.auth.clientId).slice(-4).toUpperCase();

    while (!isUnique && attempts < 3) {
      const driverCount = await Driver.countDocuments({ createdByClient: req.auth.clientId });
      const candidateId = `${tenantCode}-DRI-${String(driverCount + attempts + 1).padStart(4, "0")}`;

      const existing = await Driver.findOne({ driverId: candidateId });
      if (!existing) {
        driverId = candidateId;
        isUnique = true;
      }
      attempts++;
    }

    // Fallback if still not unique
    if (!driverId) {
      driverId = `DRI-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 10000)}`;
    }
    const driver = await Driver.create({
      driverId,
      name: name?.trim(),
      phone,
      email,
      licenseNo,
      salaryPerTrip: salaryPerTrip || 0,
      salaryPerDay: salaryPerDay || 0,
      salaryType: salaryType || 'Per Trip',
      profitPercentage: profitPercentage || 0,
      bataPerDay: bataPerDay || 300,
      createdBy: req.auth.userId,
      createdByClient: req.auth.clientId,
      createdByUser: req.auth.userId,
      company: companyIds,
      status: 'Active'
    });

    // SOCKET EMISSIONS (new code)
    if (global.io) {
      console.log('📡 Emitting driver-update event for client:', req.auth.clientId);
      global.io.to(`client-${req.auth.clientId}`).emit('driver-update', {
        message: 'Driver created',
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'create'
      });

      global.io.to('all-inventory-updates').emit('driver-update', {
        message: 'Driver created',
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'create',
        clientId: req.auth.clientId
      });
    }

    //  NOTIFICATION (new code)
    await notifyAdminOnDriverAction({
      req,
      action: "create",
      driverName: driver.name,
      driverId: driver._id,
    });

    await driver.save();

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      driver
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== READ ====================

exports.getAllDrivers = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 100, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // CHANGE: Use where object pattern like service controller
    const where = { createdByClient: req.auth?.clientId };

    if (status) where.status = status;

    if (search) {
      where.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
        { driverId: { $regex: escapeRegex(search), $options: 'i' } }
      ];
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const [drivers, total] = await Promise.all([
      Driver.find(where)
        .populate('company')
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Driver.countDocuments(where)
    ]);

    res.json({
      success: true,
      drivers,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / perPage),
        totalDrivers: total,
        limit: perPage
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDriverById = async (req, res) => {
  try {
    // CHANGE: Add tenant isolation
    const driver = await Driver.findOne({
      _id: req.params.id,
      createdByClient: req.auth?.clientId
    }).populate('company');

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get driver by name with all trips (SIMPLIFIED - Each trip is one route)
// @route   GET /api/drivers/name/:name
exports.getDriverByName = async (req, res) => {
  try {
    const { name } = req.params;
    const { includeTrips = 'true' } = req.query;

    const driver = await Driver.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
      createdByClient: req.auth?.clientId,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: `Driver "${name}" not found`
      });
    }

    let trips = [];
    let tripStats = {};

    if (includeTrips === 'true') {
      // SIMPLIFIED: Each trip is a single route
      trips = await Trip.find({ driverId: driver._id })
        .populate('vehicleId', 'registrationNo type')
        .populate('consignorId', 'name')
        .populate('consigneeId', 'name')
        .sort({ startDate: -1 });

      tripStats = {
        totalTrips: trips.length,
        completedTrips: trips.filter(t => t.status === 'Completed').length,
        inProgressTrips: trips.filter(t => t.status === 'InProgress').length,
        totalDistance: trips.reduce((sum, t) => sum + (t.distance || 0), 0),
        totalFreight: trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0),
        totalExpenses: trips.reduce((sum, t) => sum + (t.expenses?.total || 0), 0),
        netProfit: trips.reduce((sum, t) => sum + (t.netProfit || 0), 0)
      };
    }

    res.json({
      success: true,
      driver,
      tripStats,
      trips: includeTrips === 'true' ? trips : undefined
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all trips for a specific driver (SIMPLIFIED)
// @route   GET /api/drivers/:id/trips
exports.getDriverTrips = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const driver = await Driver.findOne({ _id: id, createdByClient: req.auth?.clientId });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    let query = { driverId: driver._id };
    if (status) query.status = status;
    if (fromDate || toDate) {
      query.startDate = {};
      if (fromDate) query.startDate.$gte = new Date(fromDate);
      if (toDate) query.startDate.$lte = new Date(toDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [trips, totalTrips] = await Promise.all([
      Trip.find(query)
        .populate('vehicleId', 'registrationNo type')
        .populate('consignorId', 'name')
        .populate('consigneeId', 'name')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Trip.countDocuments(query)
    ]);

    // Calculate summary using aggregation
    const summary = await Trip.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$distance' },
          totalFreight: { $sum: '$freightAmount' },
          totalExpenses: { $sum: '$expenses.total' },
          netProfit: { $sum: '$netProfit' },
          completedTrips: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      driver: {
        id: driver._id,
        name: driver.name,
        driverId: driver.driverId,
        phone: driver.phone,
        status: driver.status
      },
      summary: summary[0] || {
        totalDistance: 0,
        totalFreight: 0,
        totalExpenses: 0,
        netProfit: 0,
        completedTrips: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalTrips / parseInt(limit)),
        totalTrips,
        limit: parseInt(limit)
      },
      trips
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get driver monthly report
// @route   GET /api/drivers/:id/monthly-report
exports.getDriverMonthlyReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const driver = await Driver.findOne({ _id: id, createdByClient: req.auth?.clientId });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const trips = await Trip.find({
      driverId: driver._id,
      startDate: { $gte: startDate, $lte: endDate },
      status: 'Completed'
    }).populate('vehicleId', 'registrationNo');

    // Group trips by week
    const weeklyData = {};
    trips.forEach(trip => {
      const weekNumber = Math.ceil(trip.startDate.getDate() / 7);
      if (!weeklyData[weekNumber]) {
        weeklyData[weekNumber] = {
          week: weekNumber,
          trips: 0,
          distance: 0,
          earnings: 0,
          expenses: 0
        };
      }
      weeklyData[weekNumber].trips++;
      weeklyData[weekNumber].distance += trip.distance;
      weeklyData[weekNumber].earnings += trip.freightAmount;
      weeklyData[weekNumber].expenses += trip.expenses.total;
    });

    const monthlyStats = {
      totalTrips: trips.length,
      totalDistance: trips.reduce((sum, t) => sum + t.distance, 0),
      totalEarnings: trips.reduce((sum, t) => sum + t.freightAmount, 0),
      totalExpenses: trips.reduce((sum, t) => sum + t.expenses.total, 0),
      netProfit: trips.reduce((sum, t) => sum + t.netProfit, 0),
      weeklyBreakdown: Object.values(weeklyData)
    };

    // Calculate driver's salary
    let salaryEarned = 0;
    if (driver.salaryType === 'Per Trip') {
      salaryEarned = trips.length * driver.salaryPerTrip;
    } else if (driver.salaryType === 'Per Day') {
      const daysWorked = new Set(trips.map(t => t.startDate.toDateString())).size;
      salaryEarned = daysWorked * driver.salaryPerDay;
    } else if (driver.salaryType === 'Percentage') {
      salaryEarned = monthlyStats.totalEarnings * (driver.profitPercentage / 100);
    }

    res.json({
      success: true,
      driver: {
        name: driver.name,
        driverId: driver.driverId,
        salaryType: driver.salaryType,
        salaryEarned
      },
      month: `${year}-${month}`,
      stats: monthlyStats,
      trips: trips.map(trip => ({
        tripId: trip.tripId,
        tripSheetNo: trip.tripSheetNo,
        from: trip.from,
        to: trip.to,
        startDate: trip.startDate,
        distance: trip.distance,
        freightAmount: trip.freightAmount,
        vehicleNo: trip.vehicleId?.registrationNo
      }))
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get driver dashboard stats
// @route   GET /api/drivers/stats/summary
exports.getDriverStatsSummary = async (req, res) => {
  try {
    const stats = await Driver.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEarnings: { $sum: '$totalEarnings' },
          totalTrips: { $sum: '$totalTrips' },
          totalDistance: { $sum: '$totalDistance' }
        }
      }
    ]);

    const active = stats.find(s => s._id === 'Active') || { count: 0, totalEarnings: 0, totalTrips: 0, totalDistance: 0 };
    const inactive = stats.find(s => s._id === 'Inactive') || { count: 0, totalEarnings: 0, totalTrips: 0, totalDistance: 0 };
    const onLeave = stats.find(s => s._id === 'On Leave') || { count: 0, totalEarnings: 0, totalTrips: 0, totalDistance: 0 };

    res.json({
      success: true,
      stats: {
        total: active.count + inactive.count + onLeave.count,
        active: active.count,
        inactive: inactive.count,
        onLeave: onLeave.count,
        totalEarnings: active.totalEarnings,
        totalTrips: active.totalTrips,
        totalDistance: active.totalDistance
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== UPDATE ====================

exports.updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // CHANGE 1: Find with tenant check
    const driver = await Driver.findOne({
      _id: id,
      createdByClient: req.auth?.clientId
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // CHANGE 2: Add duplicate name check on update
    if (updateData.name && updateData.name !== driver.name) {
      const nameExists = await Driver.findOne({
        _id: { $ne: id },
        createdByClient: req.auth.clientId,
        name: { $regex: new RegExp(`^${escapeRegex(updateData.name.trim())}$`, "i") },
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: "Driver with this name already exists"
        });
      }
    }

    // CHANGE 3: Manual field updates instead of findByIdAndUpdate
    if (updateData.name) driver.name = updateData.name.trim();
    if (updateData.phone) driver.phone = updateData.phone;
    if (updateData.email) driver.email = updateData.email;
    if (updateData.licenseNo) driver.licenseNo = updateData.licenseNo;
    if (typeof updateData.salaryPerTrip === 'number') driver.salaryPerTrip = updateData.salaryPerTrip;
    if (typeof updateData.salaryPerDay === 'number') driver.salaryPerDay = updateData.salaryPerDay;
    if (updateData.salaryType) driver.salaryType = updateData.salaryType;
    if (typeof updateData.profitPercentage === 'number') driver.profitPercentage = updateData.profitPercentage;
    if (typeof updateData.bataPerDay === 'number') driver.bataPerDay = updateData.bataPerDay;
    if (updateData.company) driver.company = normalizeDriverCompanyIds(updateData.company);

    driver.updatedAt = Date.now();

    await driver.save();

    // CHANGE 4: ADD SOCKET EMISSIONS
    if (global.io) {
      console.log('📡 Emitting driver-update event for client:', req.auth.clientId);
      global.io.to(`client-${req.auth.clientId}`).emit('driver-update', {
        message: 'Driver updated',
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'update'
      });

      global.io.to('all-inventory-updates').emit('driver-update', {
        message: 'Driver updated',
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'update',
        clientId: req.auth.clientId
      });
    }

    // CHANGE 5: ADD NOTIFICATION
    await notifyAdminOnDriverAction({
      req,
      action: "update",
      driverName: driver.name,
      driverId: driver._id,
    });

    res.json({ success: true, message: 'Driver updated successfully', driver });
  } catch (error) {
    // CHANGE 6: Add duplicate handling
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate driver details"
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['Active', 'Inactive', 'On Leave', 'Suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    // CHANGE 1: Find with tenant check
    const driver = await Driver.findOne({
      _id: id,
      createdByClient: req.auth?.clientId
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const oldStatus = driver.status;
    driver.status = status;
    driver.notes = reason ? `Status changed from ${oldStatus} to ${status}: ${reason}` : `Status changed from ${oldStatus} to ${status}`;
    driver.updatedAt = Date.now();

    await driver.save();

    // CHANGE 2: ADD SOCKET EMISSIONS
    if (global.io) {
      global.io.to(`client-${req.auth.clientId}`).emit('driver-update', {
        message: `Driver status updated to ${status}`,
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'status_update',
        oldStatus,
        newStatus: status
      });

      global.io.to('all-inventory-updates').emit('driver-update', {
        message: `Driver status updated to ${status}`,
        driverId: driver._id,
        driverName: driver.name,
        driverCode: driver.driverId,
        action: 'status_update',
        oldStatus,
        newStatus: status,
        clientId: req.auth.clientId
      });
    }

    // CHANGE 3: ADD NOTIFICATION
    await notifyAdminOnDriverAction({
      req,
      action: "status_update",
      driverName: driver.name,
      driverId: driver._id,
      oldStatus,
      newStatus: status
    });

    res.json({ success: true, message: `Driver status updated to ${status}`, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Sync driver stats from trips
// @route   POST /api/drivers/:id/sync-stats
exports.syncDriverStats = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const trips = await Trip.find({ driverId: driver._id });

    const stats = {
      totalTrips: trips.length,
      totalDistance: trips.reduce((sum, t) => sum + (t.distance || 0), 0),
      totalEarnings: trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0),
      totalBata: trips.reduce((sum, t) => sum + (t.expenses?.driverBata || 0), 0),
      lastTripDate: trips.length > 0 ? trips[0].endDate : null
    };

    driver.totalTrips = stats.totalTrips;
    driver.totalDistance = stats.totalDistance;
    driver.totalEarnings = stats.totalEarnings;
    driver.totalBata = stats.totalBata;
    driver.lastTripDate = stats.lastTripDate;
    await driver.save();

    res.json({ success: true, message: 'Driver stats synced successfully', stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DELETE ====================

exports.deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;

    // CHANGE 1: Find with tenant check
    const driver = await Driver.findOne({
      _id: id,
      createdByClient: req.auth?.clientId
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const tripCount = await Trip.countDocuments({ driverId: id });

    // Store info for notification
    const driverName = driver.name;
    const driverIdVal = driver._id;
    const driverCode = driver.driverId;

    if (tripCount > 0) {
      // CHANGE 2: Update instead of delete
      driver.status = 'Inactive';
      driver.notes = `Marked inactive on ${new Date().toISOString()} due to existing trips`;
      await driver.save();

      // CHANGE 3: Add notification for inactivation
      await notifyAdminOnDriverAction({
        req,
        action: "update",
        driverName: driverName,
        driverId: driverIdVal,
      });

      return res.json({
        success: true,
        message: 'Driver has existing trips. Marked as inactive instead.',
        driver
      });
    }

    // CHANGE 4: Add notification before deletion
    await notifyAdminOnDriverAction({
      req,
      action: "delete",
      driverName: driverName,
      driverId: driverIdVal,
    });

    await driver.deleteOne();

    // CHANGE 5: ADD SOCKET EMISSIONS for deletion
    if (global.io) {
      console.log('📡 Emitting driver-update event for client:', req.auth.clientId);
      global.io.to(`client-${req.auth.clientId}`).emit('driver-update', {
        message: 'Driver deleted',
        driverId: driverIdVal,
        driverName: driverName,
        driverCode: driverCode,
        action: 'delete'
      });

      global.io.to('all-inventory-updates').emit('driver-update', {
        message: 'Driver deleted',
        driverId: driverIdVal,
        driverName: driverName,
        driverCode: driverCode,
        action: 'delete',
        clientId: req.auth.clientId
      });
    }

    res.json({ success: true, message: 'Driver deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
