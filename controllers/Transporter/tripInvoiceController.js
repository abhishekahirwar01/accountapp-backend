const mongoose = require('mongoose');
const TripInvoice = require('../../models/Transporter/TripInvoice');
const Trip = require('../../models/Transporter/Trip');
const Party = require('../../models/Party');
const Vehicle = require('../../models/Transporter/Vehicle');
const Driver = require('../../models/Transporter/Driver');
const Company = require('../../models/Company');
const { sendTransportInvoiceEmail } = require('../../services/transportInvoiceEmail')

// Generate trip invoice (creates a new invoice record)
exports.generateTripInvoice = async (req, res) => {
  try {
    const { tripId } = req.params;
    const {
      advanceReceived = 0,
      extraDiscount = 0,
      extraDiscountType = "fixed",
      invoiceDate,
      dueDate,
      paymentMethod,
      notes,
    } = req.body || {};
    const clientId = req.user.createdByClient || req.user.id;

    // Check if invoice already exists for this trip
    const existingInvoice = await TripInvoice.findOne({
      tripId,
      createdByClient: clientId
    });

    if (existingInvoice) {
      return res.status(400).json({
        message: "Invoice already exists for this trip",
        invoiceId: existingInvoice._id
      });
    }

    // Fetch trip details with all populated references
    const trip = await Trip.findOne({
      _id: tripId,
      createdByClient: clientId,
    }).populate('vehicleId driverId consignorId consigneeId companyId');

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Fetch consignor, consignee, vehicle, driver details
    const consignor = await Party.findOne({ _id: trip.consignorId });
    const consignee = await Party.findOne({ _id: trip.consigneeId });
    const vehicle = await Vehicle.findOne({ _id: trip.vehicleId });
    const driver = await Driver.findOne({ _id: trip.driverId });
    const company = await Company.findOne({ _id: trip.companyId });

    // Generate invoice number using sales-style pattern
    const invoiceNumber = await TripInvoice.generateInvoiceNumber(trip.companyId, new Date());

    // Create new invoice - USE TRIP'S ACTUAL TOTALS
    const invoice = new TripInvoice({
      invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      companyId: trip.companyId,
      consignorId: trip.consignorId,
      consigneeId: trip.consigneeId,
      tripId: trip._id,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,

      consignorDetails: consignor ? {
        name: consignor.name,
        contactNumber: consignor.contactNumber,
        email: consignor.email,
        gstin: consignor.gstin,
        address: consignor.address,
        city: consignor.city,
        state: consignor.state,
        pincode: consignor.pincode,
      } : {},

      consigneeDetails: consignee ? {
        name: consignee.name,
        contactNumber: consignee.contactNumber,
        email: consignee.email,
        gstin: consignee.gstin,
        address: consignee.address,
        city: consignee.city,
        state: consignee.state,
        pincode: consignee.pincode,
      } : {},

      tripDetails: {
        tripId: trip.tripId,
        tripSheetNo: trip.tripSheetNo,
        from: trip.from,
        to: trip.to,
        distance: trip.distance,
        routeDetails: trip.routeDetails ? { ...trip.routeDetails } : {},
        cargoType: trip.cargoType,
        cargoWeight: trip.cargoWeight,
        cargoWeightUnit: trip.cargoWeightUnit,
        cargoDescription: trip.cargoDescription,
        freightRate: trip.freightRate,
        freightAmount: trip.freightAmount,
        driverEarnings: trip.driverEarnings,
        loadingCharges: trip.loadingCharges,
        unloadingCharges: trip.unloadingCharges,
        detentionCharges: trip.detentionCharges,
        otherCharges: trip.otherCharges,
        subtotal: trip.subtotal,
        gstPercentage: trip.gstPercentage,
        gst: trip.gst,
        totalAmount: trip.totalAmount,
        expenses: trip.expenses ? { ...trip.expenses } : {},
        dynamicExpenses: trip.dynamicExpenses ? [...trip.dynamicExpenses] : [],
        netProfit: trip.netProfit,
        startDate: trip.startDate,
        endDate: trip.endDate,
        lrNo: trip.lrNo,
        grNo: trip.grNo,
        ewayBillNo: trip.ewayBillNo,
        status: trip.status,
        notes: trip.notes,
      },

      vehicleDetails: vehicle ? {
        vehicleNumber: vehicle.vehicleNumber || vehicle.registrationNo,
        registrationNo: vehicle.registrationNo,
        vehicleType: vehicle.vehicleType,
        capacity: vehicle.capacity,
        brand: vehicle.brand,
        model: vehicle.model,
      } : {},

      driverDetails: driver ? {
        name: driver.name,
        licenseNo: driver.licenseNo,
        contactNumber: driver.contactNumber || driver.phone,
      } : {},

      // IMPORTANT: Use trip's actual totals, not recalculated values
      invoiceSubtotal: trip.freightAmount || 0,
      invoiceLoadingCharges: trip.loadingCharges || 0,
      invoiceUnloadingCharges: trip.unloadingCharges || 0,
      invoiceDetentionCharges: trip.detentionCharges || 0,  // Add this field to your schema!
      invoiceOtherCharges: trip.otherCharges || 0,
      invoiceTotalBeforeTax: trip.subtotal || 0,  // Use trip's subtotal directly
      invoiceGstPercentage: trip.gstPercentage || 0,
      invoiceGstAmount: trip.gst || 0,  // Use trip's GST directly
      invoiceTotalAmount: trip.totalAmount || 0,  // Use trip's total amount directly

      advanceReceived,
      extraDiscount,
      extraDiscountType,

      paymentMethod: paymentMethod || "Credit",
      status: "Sent",
      notes: notes !== undefined ? notes : trip.notes,
      createdByClient: clientId,
      createdByUser: req.user.id,
    });

    await invoice.save();

    await Trip.findByIdAndUpdate(trip._id, {
      invoiceGenerated: true,
      invoiceId: invoice._id,
    });

    const populatedInvoice = await TripInvoice.findById(invoice._id)
      .populate('companyId', 'businessName gstin address city state pincode')
      .populate('consignorId', 'name contactNumber')
      .populate('consigneeId', 'name contactNumber')
      .populate('tripId', 'tripId tripSheetNo from to status');

    res.status(201).json({
      message: "Trip invoice created successfully",
      invoice: populatedInvoice,
    });
  } catch (err) {
    console.error("Error generating trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Create trip invoice (with custom financials)
exports.createTripInvoice = async (req, res) => {
  try {
    const {
      companyId,
      consignorId,
      consigneeId,
      tripId,
      invoiceDate,
      dueDate,
      invoiceSubtotal,
      invoiceLoadingCharges,
      invoiceUnloadingCharges,
      invoiceOtherCharges,
      invoiceGstPercentage,
      invoiceDiscountType,
      invoiceDiscountValue,
      paymentMethod,
      notes,
      termsAndConditions,
      extraCharges,
      isRoundTrip,
      returnTripDetails,
      advanceReceived = 0,
      extraDiscount = 0,
      extraDiscountType = "fixed",
      netPayable,
    } = req.body;

    if (!companyId || !consignorId || !consigneeId || !tripId || !invoiceDate) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const trip = await Trip.findOne({
      _id: tripId,
      createdByClient: req.user.createdByClient || req.user.id,
    }).populate('vehicleId driverId');

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const consignor = await Party.findOne({ _id: consignorId });
    const consignee = await Party.findOne({ _id: consigneeId });
    const vehicle = await Vehicle.findOne({ _id: trip.vehicleId });
    const driver = await Driver.findOne({ _id: trip.driverId });

    const invoiceNumber = await TripInvoice.generateInvoiceNumber(
      companyId,
      invoiceDate ? new Date(invoiceDate) : new Date()
    );

    const invoice = new TripInvoice({
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      dueDate: dueDate ? new Date(dueDate) : null,
      companyId,
      consignorId,
      consigneeId,
      tripId,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,

      consignorDetails: consignor ? {
        name: consignor.name,
        contactNumber: consignor.contactNumber,
        email: consignor.email,
        gstin: consignor.gstin,
        address: consignor.address,
        city: consignor.city,
        state: consignor.state,
        pincode: consignor.pincode,
      } : {},

      consigneeDetails: consignee ? {
        name: consignee.name,
        contactNumber: consignee.contactNumber,
        email: consignee.email,
        gstin: consignee.gstin,
        address: consignee.address,
        city: consignee.city,
        state: consignee.state,
        pincode: consignee.pincode,
      } : {},

      tripDetails: {
        tripId: trip.tripId,
        tripSheetNo: trip.tripSheetNo,
        from: trip.from,
        to: trip.to,
        distance: trip.distance,
        routeDetails: trip.routeDetails ? { ...trip.routeDetails } : {},
        cargoType: trip.cargoType,
        cargoWeight: trip.cargoWeight,
        cargoWeightUnit: trip.cargoWeightUnit,
        cargoDescription: trip.cargoDescription,
        freightRate: trip.freightRate,
        freightAmount: trip.freightAmount,
        driverEarnings: trip.driverEarnings,
        loadingCharges: trip.loadingCharges,
        unloadingCharges: trip.unloadingCharges,
        detentionCharges: trip.detentionCharges,
        otherCharges: trip.otherCharges,
        subtotal: trip.subtotal,
        gstPercentage: trip.gstPercentage,
        gst: trip.gst,
        totalAmount: trip.totalAmount,
        expenses: trip.expenses ? { ...trip.expenses } : {},
        dynamicExpenses: trip.dynamicExpenses ? [...trip.dynamicExpenses] : [],
        netProfit: trip.netProfit,
        startDate: trip.startDate,
        endDate: trip.endDate,
        lrNo: trip.lrNo,
        grNo: trip.grNo,
        ewayBillNo: trip.ewayBillNo,
        status: trip.status,
        notes: trip.notes,
      },

      vehicleDetails: vehicle ? {
        vehicleNumber: vehicle.vehicleNumber || vehicle.registrationNo,
        registrationNo: vehicle.registrationNo,
        vehicleType: vehicle.vehicleType,
        capacity: vehicle.capacity,
        brand: vehicle.brand,
        model: vehicle.model,
      } : {},

      driverDetails: driver ? {
        name: driver.name,
        licenseNo: driver.licenseNo,
        contactNumber: driver.contactNumber || driver.phone,
      } : {},

      invoiceSubtotal: trip.freightAmount || 0,
      invoiceLoadingCharges: trip.loadingCharges || 0,
      invoiceUnloadingCharges: trip.unloadingCharges || 0,
      invoiceDetentionCharges: trip.detentionCharges || 0,
      invoiceOtherCharges: trip.otherCharges || 0,
      invoiceTotalBeforeTax: trip.subtotal || 0,  // Use trip's subtotal directly
      invoiceGstPercentage: trip.gstPercentage || 0,
      invoiceGstAmount: trip.gst || 0,  // Use trip's GST directly
      invoiceTotalAmount: trip.totalAmount || 0,  // Use trip's total amount directly
      advanceReceived,
      extraDiscount,
      extraDiscountType,
      netPayable,

      extraCharges: extraCharges || [],
      isRoundTrip: isRoundTrip || false,
      returnTripDetails: returnTripDetails || null,

      paymentMethod: paymentMethod || 'Cash',
      notes,
      termsAndConditions,
      createdByClient: req.user.createdByClient || req.user.id,
      createdByUser: req.user.id,
    });

    await invoice.save();

    await Trip.findByIdAndUpdate(trip._id, {
      invoiceGenerated: true,
      invoiceId: invoice._id,
    });

    const populatedInvoice = await TripInvoice.findById(invoice._id)
      .populate('companyId', 'businessName gstin address city state pincode')
      .populate('consignorId', 'name contactNumber')
      .populate('consigneeId', 'name contactNumber')
      .populate('tripId', 'tripId tripSheetNo from to status');

    res.status(201).json({
      message: "Trip invoice created successfully",
      invoice: populatedInvoice,
    });
  } catch (err) {
    console.error("Error creating trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get all trip invoices
exports.getTripInvoices = async (req, res) => {
  try {
    const {
      companyId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const where = { createdByClient: req.user.createdByClient || req.user.id };

    if (companyId && companyId !== 'all') {
      where.companyId = companyId;
    }
    if (status) where.status = status;
    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.$gte = new Date(startDate);
      if (endDate) where.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      TripInvoice.find(where)
        .populate('companyId', 'businessName')
        .populate('consigneeId', 'name')
        .populate('tripId', 'tripId from to')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TripInvoice.countDocuments(where),
    ]);

    res.json({
      data: invoices,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error("Error fetching trip invoices:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get single trip invoice by ID
exports.getTripInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    })
      .populate('companyId', 'businessName gstin address city state pincode emailId mobileNumber')
      .populate('consignorId', 'name contactNumber email gstin address city state pincode')
      .populate('consigneeId', 'name contactNumber email gstin address city state pincode')
      .populate('tripId', 'tripId tripSheetNo from to distance cargoType cargoWeight status');

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    res.json(invoice);
  } catch (err) {
    console.error("Error fetching trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get trip invoice by trip ID
exports.getTripInvoiceByTripId = async (req, res) => {
  try {
    const { tripId } = req.params;
    const clientId = req.user.createdByClient || req.user.id;

    const invoice = await TripInvoice.findOne({
      tripId,
      createdByClient: clientId,
    })
      .populate('companyId', 'businessName gstin address city state pincode mobileNumber emailId')
      .populate('consignorId', 'name contactNumber email gstin address city state pincode')
      .populate('consigneeId', 'name contactNumber email gstin address city state pincode')
      .populate('tripId', 'tripId tripSheetNo from to distance cargoType cargoWeight status');

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found for this trip" });
    }

    res.json(invoice);
  } catch (err) {
    console.error("Error fetching trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Preview trip invoice (generate PDF without saving)
exports.previewTripInvoice = async (req, res) => {
  try {
    const { tripId } = req.params;
    const clientId = req.user.createdByClient || req.user.id;

    let invoice = await TripInvoice.findOne({
      tripId,
      createdByClient: clientId,
    });

    if (!invoice) {
      const trip = await Trip.findOne({
        _id: tripId,
        createdByClient: clientId,
      }).populate('vehicleId driverId consignorId consigneeId companyId');

      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const consignor = await Party.findOne({ _id: trip.consignorId });
      const consignee = await Party.findOne({ _id: trip.consigneeId });
      const vehicle = await Vehicle.findOne({ _id: trip.vehicleId });
      const driver = await Driver.findOne({ _id: trip.driverId });

      invoice = {
        invoiceNumber: `PREVIEW-${trip.tripId}`,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        companyId: await Company.findById(trip.companyId),
        consignorDetails: consignor,
        consigneeDetails: consignee,
        tripDetails: {
          tripId: trip.tripId,
          tripSheetNo: trip.tripSheetNo,
          from: trip.from,
          to: trip.to,
          distance: trip.distance,
          routeDetails: trip.routeDetails,
          cargoType: trip.cargoType,
          cargoWeight: trip.cargoWeight,
          cargoWeightUnit: trip.cargoWeightUnit,
          cargoDescription: trip.cargoDescription,
          freightRate: trip.freightRate,
          freightAmount: trip.freightAmount,
          driverEarnings: trip.driverEarnings,
          loadingCharges: trip.loadingCharges,
          unloadingCharges: trip.unloadingCharges,
          detentionCharges: trip.detentionCharges,
          otherCharges: trip.otherCharges,
          subtotal: trip.subtotal,
          gstPercentage: trip.gstPercentage,
          gst: trip.gst,
          totalAmount: trip.totalAmount,
          expenses: trip.expenses,
          dynamicExpenses: trip.dynamicExpenses,
          netProfit: trip.netProfit,
          startDate: trip.startDate,
          endDate: trip.endDate,
          lrNo: trip.lrNo,
          grNo: trip.grNo,
          ewayBillNo: trip.ewayBillNo,
          status: trip.status,
          notes: trip.notes,
        },
        vehicleDetails: vehicle,
        driverDetails: driver,
        invoiceSubtotal: trip.freightAmount || 0,
        invoiceLoadingCharges: trip.loadingCharges || 0,
        invoiceUnloadingCharges: trip.unloadingCharges || 0,
        invoiceOtherCharges: trip.otherCharges || 0,
        invoiceGstPercentage: trip.gstPercentage || 0,
        invoiceTotalAmount: trip.totalAmount || 0,
        notes: trip.notes,
      };
    }

    // Generate PDF using the template
    const { generatePdfForTripInvoiceTemplate } = require("../../lib/pdf-trip-invoice-template");

    const pdfBlob = await generatePdfForTripInvoiceTemplate(
      invoice.tripDetails || invoice.tripId,
      invoice.companyId,
      invoice.consignorDetails,
      invoice.consigneeDetails,
      null, null, null
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Trip_Invoice_${tripId}.pdf"`);

    const buffer = Buffer.from(await pdfBlob.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error("Error generating invoice preview:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update trip invoice
exports.updateTripInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    if (invoice.status === 'Paid') {
      return res.status(400).json({ message: "Cannot update paid invoices" });
    }

    const updatableFields = [
      'dueDate', 'invoiceLoadingCharges', 'invoiceUnloadingCharges', 'invoiceOtherCharges',
      'invoiceGstPercentage', 'invoiceDiscountType', 'invoiceDiscountValue', 'paymentMethod',
      'paymentStatus', 'paidAmount', 'status', 'notes', 'termsAndConditions', 'extraCharges',
      'advanceReceived', 'extraDiscount', 'extraDiscountType',
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        invoice[field] = req.body[field];
      }
    });

    await invoice.save();

    const populatedInvoice = await TripInvoice.findById(invoice._id)
      .populate('companyId', 'businessName')
      .populate('consigneeId', 'name')
      .populate('tripId', 'tripId from to');

    res.json({
      message: "Trip invoice updated successfully",
      invoice: populatedInvoice,
    });
  } catch (err) {
    console.error("Error updating trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete trip invoice
exports.deleteTripInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    if (invoice.status === 'Paid') {
      return res.status(400).json({ message: "Cannot delete paid invoices" });
    }

    if (invoice.tripId) {
      await Trip.findByIdAndUpdate(invoice.tripId, {
        $unset: { invoiceId: 1 },
        invoiceGenerated: false,
      });
    }

    await invoice.deleteOne();

    res.json({ message: "Trip invoice deleted successfully" });
  } catch (err) {
    console.error("Error deleting trip invoice:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Mark invoice as sent
exports.markInvoiceAsSent = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    invoice.status = 'Sent';
    await invoice.save();

    res.json({ message: "Invoice marked as sent", invoice });
  } catch (err) {
    console.error("Error marking invoice as sent:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Record payment
exports.recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, paymentDate } = req.body;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    const newPaidAmount = (invoice.paidAmount || 0) + amount;
    invoice.paidAmount = newPaidAmount;

    if (paymentMethod) invoice.paymentMethod = paymentMethod;
    if (paymentDate) invoice.paymentDate = new Date(paymentDate);

    await invoice.save();

    res.json({
      message: "Payment recorded successfully",
      invoice: {
        _id: invoice._id,
        paidAmount: invoice.paidAmount,
        paymentStatus: invoice.paymentStatus,
        status: invoice.status,
        totalAmount: invoice.invoiceTotalAmount,
        remainingAmount: invoice.invoiceTotalAmount - invoice.paidAmount,
      },
    });
  } catch (err) {
    console.error("Error recording payment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Send invoice email
exports.sendInvoiceEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    }).populate('companyId consigneeId');

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    const recipientEmail = email || invoice.consigneeDetails?.email;

    if (!recipientEmail) {
      return res.status(400).json({ message: "No email address found for recipient" });
    }

    const { generatePdfForTripInvoiceTemplate } = require("../../lib/pdf-trip-invoice-template");

    const pdfBlob = await generatePdfForTripInvoiceTemplate(
      invoice.tripDetails,
      invoice.companyId,
      invoice.consignorDetails,
      invoice.consigneeDetails,
      null, null, null
    );

    invoice.emailSent = true;
    invoice.emailSentAt = new Date();
    invoice.emailSentTo = recipientEmail;
    invoice.status = 'Sent';
    await invoice.save();

    res.json({
      message: "Invoice sent successfully",
      emailSentTo: recipientEmail
    });
  } catch (err) {
    console.error("Error sending invoice email:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get invoice statistics
exports.getInvoiceStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const clientId = req.user.createdByClient || req.user.id;

    const filter = { createdByClient: clientId };
    if (companyId && companyId !== 'all') {
      filter.companyId = companyId;
    }

    const invoices = await TripInvoice.find(filter);

    const stats = {
      totalInvoices: invoices.length,
      draftInvoices: invoices.filter(i => i.status === 'Draft').length,
      sentInvoices: invoices.filter(i => i.status === 'Sent').length,
      paidInvoices: invoices.filter(i => i.status === 'Paid').length,
      overdueInvoices: invoices.filter(i => i.status === 'Overdue').length,
      totalAmount: invoices.reduce((sum, i) => sum + (i.invoiceTotalAmount || 0), 0),
      totalPaid: invoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0),
      totalPending: invoices.reduce((sum, i) => sum + ((i.invoiceTotalAmount || 0) - (i.paidAmount || 0)), 0),
    };

    res.json(stats);
  } catch (err) {
    console.error("Error fetching invoice stats:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update the sendTripInvoiceEmail function
// In tripInvoiceController.js, update the sendTripInvoiceEmail function

// In tripInvoiceController.js
exports.sendTripInvoiceEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      to, 
      subject, 
      message, 
      pdfBase64, 
      fileName,
      customerName: bodyCustomerName,
      invoiceNumber: bodyInvoiceNumber 
    } = req.body;
    
    const clientId = req.user.id;

    console.log("📧 Sending transport invoice email");
    console.log("To:", to);
    console.log("Has PDF attachment:", !!pdfBase64);

    // Find the invoice
    const invoice = await TripInvoice.findOne({
      _id: id,
      createdByClient: req.user.createdByClient || req.user.id,
    }).populate('companyId', 'businessName emailId brandColor mobileNumber');

    if (!invoice) {
      return res.status(404).json({ message: "Trip invoice not found" });
    }

    const recipientEmail = to;
    if (!recipientEmail) {
      return res.status(400).json({ message: "No email address provided" });
    }

    const customerName = bodyCustomerName || 
                        invoice.consigneeDetails?.name || 
                        invoice.consignorDetails?.name || 
                        "Customer";

    const companyName = invoice.companyId?.businessName || "Transport Company";
    const emailSubject = subject || `Transport Invoice ${invoice.invoiceNumber} from ${companyName}`;
    
    // Generate HTML email content
    const html = generateInvoiceEmailHtml({
      invoice,
      customerName,
      companyName,
      companyEmail: invoice.companyId?.emailId,
      customMessage: message,
    });

    // Prepare attachments
    const attachments = [];
    if (pdfBase64) {
      attachments.push({
        filename: fileName || `Invoice-${invoice.invoiceNumber}.pdf`,
        content: Buffer.from(pdfBase64, "base64"),
        contentType: "application/pdf",
      });
    }

    // Send email using the same method as transaction invoices
    const { _internal } = require("../../controllers/integrations/gmailController");
    
    await _internal.sendWithClientGmail({
      clientId: clientId,
      fromName: companyName,
      to: recipientEmail,
      subject: emailSubject,
      html: html,
      attachments: attachments,
    });

    // Update invoice tracking
    invoice.emailSent = true;
    invoice.emailSentAt = new Date();
    invoice.emailSentTo = recipientEmail;
    await invoice.save();

    res.json({
      success: true,
      message: "Invoice email sent successfully with PDF attachment",
      data: {
        emailSentTo: recipientEmail,
        hasAttachment: !!pdfBase64,
      },
    });

  } catch (err) {
    console.error("Error sending invoice email:", err);
    res.status(500).json({ 
      message: "Failed to send invoice email", 
      error: err.message 
    });
  }
};

// Helper function to generate HTML email
function generateInvoiceEmailHtml({ invoice, customerName, companyName, companyEmail, customMessage }) {
  const totalAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(invoice.invoiceTotalAmount || 0);
  
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4F46E5;">Transport Invoice ${invoice.invoiceNumber}</h2>
      <p>Dear ${customerName},</p>
      ${customMessage ? `<p>${customMessage.replace(/\n/g, '<br/>')}</p>` : ''}
      <h3>Invoice Summary:</h3>
      <ul>
        <li>Invoice Number: ${invoice.invoiceNumber}</li>
        <li>Total Amount: ${totalAmount}</li>
        <li>Due Date: ${dueDate}</li>
      </ul>
      <p>The complete invoice is attached as a PDF.</p>
      <p>Best regards,<br/>${companyName}<br/>${companyEmail || ''}</p>
    </div>
  `;
}