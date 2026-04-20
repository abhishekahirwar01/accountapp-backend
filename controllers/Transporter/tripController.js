const mongoose = require("mongoose");
const Trip = require("../../models/Transporter/Trip");
const Vehicle = require("../../models/Transporter/Vehicle");
const Driver = require("../../models/Transporter/Driver");
const Party = require("../../models/Party");
const Company = require("../../models/Company");
const TripInvoice = require("../../models/Transporter/TripInvoice");
const {
  calculateDriverEarningsForTrip,
  updateDriverStats,
} = require("../../utils/driverStatsUtils");
const { issueTripNumbers } = require('../../services/tripInvoiceIssuer');

// Update driver's trip count; keeps logic in one place
const bumpDriverTripCount = async (driverId, delta) => {
  if (!driverId || !delta) return;
  try {
    const driver = await Driver.findById(driverId).select("totalTrips");
    if (!driver) return;
    const nextCount = Math.max(0, (driver.totalTrips || 0) + delta);
    if (nextCount === driver.totalTrips) return;
    await Driver.findByIdAndUpdate(driverId, { totalTrips: nextCount });
  } catch (err) {
    console.error("Error updating driver trip count:", err);
  }
};

// Update vehicle's trip count; keeps logic in one place
const bumpVehicleTripCount = async (vehicleId, delta) => {
  if (!vehicleId || !delta) return;
  try {
    const vehicle = await Vehicle.findById(vehicleId).select("totalTrips");
    if (!vehicle) return;
    const nextCount = Math.max(0, (vehicle.totalTrips || 0) + delta);
    if (nextCount === vehicle.totalTrips) return;
    await Vehicle.findByIdAndUpdate(vehicleId, { totalTrips: nextCount });
  } catch (err) {
    console.error("Error updating vehicle trip count:", err);
  }
};


// Keep this for backward compatibility but mark as deprecated
const generateTripIdentifiers = async (companyId) => {
  // Deprecated: Use issueTripNumbers instead
  console.warn('generateTripIdentifiers is deprecated. Use issueTripNumbers instead.');
  const { tripId, tripSheetNo } = await issueTripNumbers(companyId);
  return { tripId, tripSheetNo };
};

// Helper function to recalculate trip totals including dynamic expenses
const recalculateTripTotals = async (tripId) => {
  try {
    const trip = await Trip.findById(tripId);
    if (!trip) return null;

    // Recalculate freight amount
    trip.freightAmount = trip.distance * trip.freightRate;

    // Recalculate subtotal (INCLUDES ALL CHARGES)
    trip.subtotal = trip.freightAmount + 
      trip.loadingCharges + 
      trip.unloadingCharges +
      trip.detentionCharges + 
      trip.otherCharges;

    // Recalculate GST - should be on subtotal (or as per GST rules)
    const gstPercentage = typeof trip.gstPercentage === 'number' ? trip.gstPercentage : 0;
    
    // OPTION 1: Calculate GST on full subtotal (including all charges)
    if (gstPercentage > 0) {
      trip.gst = trip.subtotal * (gstPercentage / 100);
    } else {
      trip.gst = 0;
    }

    // OPTION 2: If GST should exclude certain charges (like detention), 
    // then use the original logic but include detention if needed:
    // const gstBase = trip.freightAmount + trip.loadingCharges + trip.unloadingCharges + trip.detentionCharges;
    // trip.gst = gstBase * (gstPercentage / 100);

    // Recalculate total amount
    trip.totalAmount = trip.subtotal + trip.gst;

    // Recalculate static expenses total
    const staticExpensesTotal = trip.expenses.diesel + trip.expenses.toll +
      trip.expenses.driverBata + trip.expenses.food +
      trip.expenses.maintenance + trip.expenses.other;

    // Calculate dynamic expenses total
    const dynamicExpensesTotal = (trip.dynamicExpenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);

    // Total expenses
    trip.expenses.total = staticExpensesTotal + dynamicExpensesTotal;

    // Recalculate net profit
    trip.netProfit = trip.totalAmount - trip.expenses.total;

    await trip.save();
    return trip;
  } catch (error) {
    console.error("Error recalculating trip totals:", error);
    return null;
  }
};


// Get vehicles by company (for dropdown)
exports.getVehiclesByCompany = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const vehicles = await Vehicle.find({
      companies: { $in: [companyId] },
      status: "Active"
    }).select("_id registrationNo vehicleType capacity brand");

    res.json(vehicles);
  } catch (err) {
    console.error("Error fetching vehicles:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get drivers by company (for dropdown)
exports.getDriversByCompany = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const drivers = await Driver.find({
      companies: { $in: [companyId] },
      status: "Active"
    }).select("_id name licenseNumber contactNumber");

    res.json(drivers);
  } catch (err) {
    console.error("Error fetching drivers:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get customers by company (for dropdown - consignor/consignee)
exports.getCustomersByCompany = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const parties = await Party.find({
      company: { $in: [companyId] },
      createdByClient: req.user.createdByClient || req.user.id
    }).select("_id name contactNumber email address city");

    res.json(parties);
  } catch (err) {
    console.error("Error fetching parties:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Add a single expense to a trip
exports.addTripExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { expenseType, amount, date, receiptNo, description } = req.body;

    if (!expenseType || !amount || !date) {
      return res.status(400).json({ message: "Expense type, amount, and date are required" });
    }

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Add new expense
    trip.dynamicExpenses.push({
      expenseType,
      amount,
      date: new Date(date),
      receiptNo,
      description
    });

    await trip.save();

    // Recalculate totals
    const updatedTrip = await recalculateTripTotals(id);

    res.json({
      message: "Expense added successfully",
      trip: updatedTrip
    });
  } catch (err) {
    console.error("Error adding expense:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Remove an expense from a trip
exports.removeTripExpense = async (req, res) => {
  try {
    const { id, expenseId } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Remove expense
    trip.dynamicExpenses = trip.dynamicExpenses.filter(
      exp => exp._id.toString() !== expenseId
    );

    await trip.save();

    // Recalculate totals
    const updatedTrip = await recalculateTripTotals(id);

    res.json({
      message: "Expense removed successfully",
      trip: updatedTrip
    });
  } catch (err) {
    console.error("Error removing expense:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update a specific expense
exports.updateTripExpense = async (req, res) => {
  try {
    const { id, expenseId } = req.params;
    const { expenseType, amount, date, receiptNo, description } = req.body;

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Find and update expense
    const expense = trip.dynamicExpenses.id(expenseId);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    if (expenseType !== undefined) expense.expenseType = expenseType;
    if (amount !== undefined) expense.amount = amount;
    if (date !== undefined) expense.date = new Date(date);
    if (receiptNo !== undefined) expense.receiptNo = receiptNo;
    if (description !== undefined) expense.description = description;

    await trip.save();

    // Recalculate totals
    const updatedTrip = await recalculateTripTotals(id);

    res.json({
      message: "Expense updated successfully",
      trip: updatedTrip
    });
  } catch (err) {
    console.error("Error updating expense:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Create a new trip
exports.createTrip = async (req, res) => {
  try {
    const {
      companyId,
      vehicleId,
      driverId,
      consignorId,
      consigneeId,
      from,
      to,
      distance,
      routeDetails,
      cargoType,
      cargoWeight,
      cargoWeightUnit,
      cargoDescription,
      freightRate,
      loadingCharges,
      unloadingCharges,
      detentionCharges,
      otherCharges,
      expenses,
      dynamicExpenses,
      gstPercentage,
      startDate,
      endDate,
      lrNo,
      grNo,
      ewayBillNo,
      status,
      notes
    } = req.body;

    const validDynamicExpenses = (dynamicExpenses || [])
      .filter(exp => exp.expenseType && exp.expenseType.trim() !== "" && exp.amount > 0)
      .map(exp => ({
        expenseType: exp.expenseType,
        amount: exp.amount,
        date: exp.date || new Date(),
        receiptNo: exp.receiptNo,
        description: exp.description
      }));

    // Validate required fields with explicit checks
    const distanceNum = Number(distance);
    const cargoWeightNum = Number(cargoWeight);
    const freightRateNum = Number(freightRate);

    const missing = [];
    if (!companyId) missing.push("companyId");
    if (!vehicleId) missing.push("vehicleId");
    if (!driverId) missing.push("driverId");
    if (!consignorId) missing.push("consignorId");
    if (!consigneeId) missing.push("consigneeId");
    if (!from) missing.push("from");
    if (!to) missing.push("to");
    if (!cargoType) missing.push("cargoType");
    if (!cargoWeightUnit) missing.push("cargoWeightUnit");
    if (!startDate) missing.push("startDate");
    if (!Number.isFinite(distanceNum) || distanceNum <= 0) missing.push("distance");
    if (!Number.isFinite(cargoWeightNum) || cargoWeightNum <= 0) missing.push("cargoWeight");
    if (!Number.isFinite(freightRateNum) || freightRateNum <= 0) missing.push("freightRate");

    if (missing.length) {
      return res.status(400).json({ message: "Missing required fields", fields: missing });
    }

    // Validate that consignor and consignee exist in Party model
    const consignor = await Party.findOne({
      _id: consignorId,
      createdByClient: req.user.createdByClient || req.user.id,
      company: { $in: [companyId] }
    });

    const consignee = await Party.findOne({
      _id: consigneeId,
      createdByClient: req.user.createdByClient || req.user.id,
      company: { $in: [companyId] }
    });

    if (!consignor) {
      return res.status(400).json({ message: "Consignor (sender) not found or doesn't belong to this company" });
    }

    if (!consignee) {
      return res.status(400).json({ message: "Consignee (receiver) not found or doesn't belong to this company" });
    }

    // Generate unique identifiers
    const { tripId, tripSheetNo } = await issueTripNumbers(companyId, new Date(startDate));

    const trip = new Trip({
      tripId,
      tripSheetNo,
      companyId,
      vehicleId,
      driverId,
      consignorId,
      consigneeId,
      from,
      to,
      distance,
      routeDetails,
      cargoType,
      cargoWeight,
      cargoWeightUnit,
      cargoDescription,
      freightRate,
      loadingCharges: loadingCharges || 0,
      unloadingCharges: unloadingCharges || 0,
      detentionCharges: detentionCharges || 0,
      otherCharges: otherCharges || 0,
      expenses: {
        diesel: expenses?.diesel || 0,
        toll: expenses?.toll || 0,
        driverBata: expenses?.driverBata || 0,
        food: expenses?.food || 0,
        maintenance: expenses?.maintenance || 0,
        other: expenses?.other || 0
      },
      dynamicExpenses: validDynamicExpenses,
      // Preserve explicit 0 when company is not GST registered; only coalesce when missing
      gstPercentage: Number.isFinite(Number(gstPercentage)) ? Number(gstPercentage) : 0,
      startDate,
      endDate,
      lrNo,
      grNo,
      ewayBillNo,
      status: status || "Draft",
      notes,
      createdByClient: req.user.createdByClient || req.user.id,
      createdByUser: req.user.id
    });

    // Compute driver earnings for this trip
    trip.driverEarnings = await calculateDriverEarningsForTrip(driverId, trip);

    await trip.save();
    await Promise.all([
      bumpDriverTripCount(driverId, 1),
      bumpVehicleTripCount(vehicleId, 1),
      updateDriverStats(
        driverId,
        companyId,
        req.user.createdByClient || req.user.id
      ),
    ]);

    // Populate references for response
    const populatedTrip = await Trip.findById(trip._id)
      .populate("companyId", "businessName industryType registrationNumber")
      .populate("vehicleId", "registrationNo vehicleType capacity brand")
      .populate("driverId", "name licenseNumber contactNumber")
      .populate("consignorId", "name address city state contactNumber email")  // Party fields
      .populate("consigneeId", "name address city state contactNumber email"); // Party fields

    res.status(201).json({
      message: "Trip created successfully",
      trip: populatedTrip
    });
  } catch (err) {
    console.error("Error creating trip:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get all trips with filters
exports.getTrips = async (req, res) => {
  try {
    const {
      companyId,
      status,
      startDateFrom,
      startDateTo,
      vehicleId,
      driverId,
      page = 1,
      limit = 10
    } = req.query;

    const where = { createdByClient: req.user.createdByClient || req.user.id };

    if (companyId && companyId !== "all") {
      where.companyId = companyId;
    }
    if (status) where.status = status;
    if (vehicleId) where.vehicleId = vehicleId;
    if (driverId) where.driverId = driverId;
    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) where.startDate.$gte = new Date(startDateFrom);
      if (startDateTo) where.startDate.$lte = new Date(startDateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [trips, total] = await Promise.all([
      Trip.find(where)
        .populate("companyId", "businessName industryType registrationNumber")
        .populate("vehicleId", "registrationNo vehicleType capacity brand")
        .populate("driverId", "name licenseNumber contactNumber")
        .populate("consignorId", "name")
        .populate("consigneeId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Trip.countDocuments(where)
    ]);

    res.json({
      trips,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get trips by company
exports.getTripsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const where = {
      companyId,
      createdByClient: req.user.createdByClient || req.user.id
    };

    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [trips, total] = await Promise.all([
      Trip.find(where)
        .populate("companyId", "businessName industryType registrationNumber")
        .populate("vehicleId", "registrationNo vehicleType")
        .populate("driverId", "name licenseNumber")
        .populate("consignorId", "name")
        .populate("consigneeId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Trip.countDocuments(where)
    ]);

    res.json({
      trips,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error("Error fetching trips by company:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get single trip by ID
exports.getTripById = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    })
      .populate("companyId", "businessName industryType registrationNumber")
      .populate("vehicleId", "registrationNo vehicleType capacity brand model year fuelType")
      .populate("driverId", "name licenseNumber licenseNo contactNumber phone address")
      .populate("consignorId", "name contactNumber phone email address city state gstin pincode")  // Party fields
      .populate("consigneeId", "name contactNumber phone email address city state gstin pincode"); // Party fields

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Enrich response with denormalized details for form auto-fill
    const tripObj = trip.toObject();
    if (tripObj.driverId) {
      tripObj.licenseNo =
        tripObj.driverId.licenseNo ||
        tripObj.driverId.licenseNumber ||
        tripObj.licenseNo;
      // Normalize driver id field for frontend select
      tripObj.driverId = tripObj.driverId._id || tripObj.driverId.id || tripObj.driverId;
    }
    if (tripObj.dynamicExpenses) {
      tripObj.dynamicExpenses = tripObj.dynamicExpenses.map(exp => ({
        ...exp,
        id: exp._id,
        date: exp.date ? new Date(exp.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }));
    }
    if (tripObj.consignorId) {
      const consignorIdVal = tripObj.consignorId._id || tripObj.consignorId.id || tripObj.consignorId;
      tripObj.consignorId = consignorIdVal;
      tripObj.consignorDetails = {
        name: tripObj.consignorId.name,
        contactNumber: tripObj.consignorId.contactNumber || tripObj.consignorId.phone,
        gstin: tripObj.consignorId.gstin,
        address: tripObj.consignorId.address,
        city: tripObj.consignorId.city,
        state: tripObj.consignorId.state,
        pincode: tripObj.consignorId.pincode,
        email: tripObj.consignorId.email,
      };
    }
    if (tripObj.consigneeId) {
      const consigneeIdVal = tripObj.consigneeId._id || tripObj.consigneeId.id || tripObj.consigneeId;
      tripObj.consigneeId = consigneeIdVal;
      tripObj.consigneeDetails = {
        name: tripObj.consigneeId.name,
        contactNumber: tripObj.consigneeId.contactNumber || tripObj.consigneeId.phone,
        gstin: tripObj.consigneeId.gstin,
        address: tripObj.consigneeId.address,
        city: tripObj.consigneeId.city,
        state: tripObj.consigneeId.state,
        pincode: tripObj.consigneeId.pincode,
        email: tripObj.consigneeId.email,
      };
    }

    res.json(tripObj);
  } catch (err) {
    console.error("Error fetching trip:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update trip
exports.updateTrip = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Don't allow updates to completed or delivered trips (unless changing from them)
    // But allow updates if status is being changed FROM Completed/Delivered? Usually no.
    // We'll allow updates but log it
    if ((trip.status === "Completed" || trip.status === "Delivered") &&
      (!req.body.status || req.body.status === trip.status)) {
      return res.status(400).json({ message: "Cannot update completed or delivered trips" });
    }

    const previousDriverId = trip.driverId ? trip.driverId.toString() : null;
    const previousVehicleId = trip.vehicleId ? trip.vehicleId.toString() : null;
    const previousStatus = trip.status;

    // Filter and clean dynamicExpenses BEFORE updating
    if (req.body.dynamicExpenses) {
      // Filter out expenses with empty expenseType or invalid amount
      req.body.dynamicExpenses = req.body.dynamicExpenses
        .filter(exp => exp.expenseType && exp.expenseType.trim() !== "" && exp.amount > 0)
        .map(exp => ({
          expenseType: exp.expenseType.trim(),
          amount: Number(exp.amount),
          date: exp.date || new Date(),
          receiptNo: exp.receiptNo || "",
          description: exp.description || ""
        }));
    }


    // Update fields (excluding calculated fields)
    const updatableFields = [
      "vehicleId", "driverId", "consignorId", "consigneeId",
      "consignorDetails", "consigneeDetails",
      "from", "to", "distance", "routeDetails", "cargoType", "cargoWeight", "cargoWeightUnit",
      "cargoDescription", "freightRate", "loadingCharges", "unloadingCharges",
      "detentionCharges", "otherCharges", "expenses", "dynamicExpenses", "gstPercentage",
      "startDate", "endDate", "lrNo", "grNo", "ewayBillNo", "notes", "status",
      "invoiceGenerated", "licenseNo"
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        trip[field] = req.body[field];
      }
    });

    // If status moved to Completed/Delivered and no endDate provided, set it
    if ((trip.status === "Completed" || trip.status === "Delivered") && !trip.endDate) {
      trip.endDate = new Date();
    }

    // If status changed from Completed/Delivered to something else, clear endDate
    if ((previousStatus === "Completed" || previousStatus === "Delivered") &&
      (trip.status !== "Completed" && trip.status !== "Delivered")) {
      trip.endDate = null;
    }

    // Force recalculation of financials if status changed or financial fields changed
    const financialFields = [
      "distance", "freightRate", "loadingCharges", "unloadingCharges",
      "detentionCharges", "otherCharges", "expenses", "dynamicExpenses", "gstPercentage"
    ];
    const shouldRecalc = financialFields.some(field => req.body[field] !== undefined) ||
      previousStatus !== trip.status;

    await trip.save();

    // Recalculate totals if needed (this will trigger pre-save middleware)
    if (shouldRecalc) {
      // The pre-save middleware already recalculates, so just fetch the updated trip
      const updatedTrip = await Trip.findById(trip._id);
      if (updatedTrip) {
        Object.assign(trip, updatedTrip);
      }
    }

    const populatedTrip = await Trip.findById(trip._id)
      .populate("companyId", "businessName industryType registrationNumber")
      .populate("vehicleId", "registrationNo vehicleType")
      .populate("driverId", "name licenseNumber")
      .populate("consignorId", "name")
      .populate("consigneeId", "name");

    const driverChanged = previousDriverId && trip.driverId &&
      previousDriverId !== trip.driverId.toString();
    const vehicleChanged = previousVehicleId && trip.vehicleId &&
      previousVehicleId !== trip.vehicleId.toString();

    const adjustments = [];
    if (driverChanged) {
      adjustments.push(bumpDriverTripCount(previousDriverId, -1));
      adjustments.push(bumpDriverTripCount(trip.driverId, 1));
      adjustments.push(updateDriverStats(previousDriverId, trip.companyId, req.user.createdByClient || req.user.id));
      adjustments.push(updateDriverStats(trip.driverId, trip.companyId, req.user.createdByClient || req.user.id));
    }
    if (vehicleChanged) {
      adjustments.push(bumpVehicleTripCount(previousVehicleId, -1));
      adjustments.push(bumpVehicleTripCount(trip.vehicleId, 1));
    }
    if (adjustments.length) {
      await Promise.all(adjustments);
    }

    // If an invoice already exists for this trip, sync its snapshot to the latest trip data
    try {
      const existingInvoice = await TripInvoice.findOne({ tripId: trip._id });
      if (existingInvoice) {
        const [companyDoc, consignorDoc, consigneeDoc, vehicleDoc, driverDoc] = await Promise.all([
          Company.findById(trip.companyId),
          Party.findById(trip.consignorId),
          Party.findById(trip.consigneeId),
          Vehicle.findById(trip.vehicleId),
          Driver.findById(trip.driverId),
        ]);

        await existingInvoice.populateFromTrip(
          trip,
          companyDoc,
          consignorDoc,
          consigneeDoc,
          vehicleDoc,
          driverDoc,
        );
        await existingInvoice.save();
      }
    } catch (syncErr) {
      console.error("Error syncing trip invoice with updated trip:", syncErr);
    }

    res.json({ message: "Trip updated successfully", trip: populatedTrip });
  } catch (err) {
    console.error("Error updating trip:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update trip status
exports.updateTripStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualTime, endDate, dynamicExpenses } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    trip.status = status;

    if (dynamicExpenses !== undefined) {
      trip.dynamicExpenses = dynamicExpenses;
    }


    // Update route details actual time if provided
    if (actualTime && trip.routeDetails) {
      trip.routeDetails.actualTime = actualTime;
    }

    // If status is Completed or Delivered, set end date
    if (status === "Completed" || status === "Delivered") {
      trip.endDate = endDate || new Date();
    }

    await trip.save();

    res.json({ message: "Trip status updated successfully", trip });
  } catch (err) {
    console.error("Error updating trip status:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete trip (only if in Draft status)
exports.deleteTrip = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (trip.status !== "Draft") {
      return res.status(400).json({ message: "Only draft trips can be deleted" });
    }

    const driverId = trip.driverId;
    const vehicleId = trip.vehicleId;

    await trip.deleteOne();
    await Promise.all([
      bumpDriverTripCount(driverId, -1),
      bumpVehicleTripCount(vehicleId, -1),
      updateDriverStats(
        driverId,
        trip.companyId,
        req.user.createdByClient || req.user.id
      ),
    ]);

    res.json({ message: "Trip deleted successfully" });
  } catch (err) {
    console.error("Error deleting trip:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getTripStats = async (req, res) => {
  try {
    const { companyId } = req.query;

    console.log("=== STATS DEBUG ===");
    console.log("CompanyId from query:", companyId);
    console.log("User object:", JSON.stringify(req.user, null, 2));

    // Get client ID
    const clientId = req.user.createdByClient || req.user.id;
    console.log("Client ID:", clientId);

    // First, check all trips without any filter
    const allTrips = await Trip.find({});
    console.log(`Total trips in database: ${allTrips.length}`);

    if (allTrips.length > 0) {
      console.log("First trip sample:", {
        createdByClient: allTrips[0].createdByClient,
        companyId: allTrips[0].companyId,
        status: allTrips[0].status
      });
    }

    // Check trips by client
    const clientTrips = await Trip.find({ createdByClient: clientId });
    console.log(`Trips with clientId ${clientId}: ${clientTrips.length}`);

    // Check trips by company
    const companyTrips = await Trip.find({ companyId: companyId });
    console.log(`Trips with companyId ${companyId}: ${companyTrips.length}`);

    // Check trips with both filters
    const bothFilters = await Trip.find({
      createdByClient: clientId,
      companyId: companyId
    });
    console.log(`Trips with both filters: ${bothFilters.length}`);

    // Build final filter
    const filter = {
      createdByClient: clientId
    };

    if (companyId && companyId !== "all" && companyId !== "undefined" && companyId !== "null") {
      filter.companyId = companyId;
    }

    console.log("Final filter:", JSON.stringify(filter, null, 2));

    // Get trips
    const trips = await Trip.find(filter);
    console.log(`Found ${trips.length} trips matching filter`);

    // Calculate stats
    const stats = {
      totalTrips: trips.length,
      completedTrips: trips.filter(t => t.status === "Completed").length,
      deliveredTrips: trips.filter(t => t.status === "Delivered").length,
      inProgressTrips: trips.filter(t => t.status === "InProgress").length,
      startedTrips: trips.filter(t => t.status === "Started").length,
      draftTrips: trips.filter(t => t.status === "Draft").length,
      cancelledTrips: trips.filter(t => t.status === "Cancelled").length,
      totalRevenue: trips.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
      totalProfit: trips.reduce((sum, t) => sum + (t.netProfit || 0), 0),
      totalDistance: trips.reduce((sum, t) => sum + (t.distance || 0), 0),
      totalCargoWeight: trips.reduce((sum, t) => sum + (t.cargoWeight || 0), 0)
    };

    console.log("Calculated Stats:", stats);
    console.log("=== STATS DEBUG END ===");

    res.json(stats);
  } catch (err) {
    console.error("Error fetching trip stats:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
