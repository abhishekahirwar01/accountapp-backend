const mongoose = require('mongoose');
const Company = require('../Company');
const InvoiceCounter = require('../InvoiceCounter');
const SalesEntry = require('../SalesEntry');
const { deriveThreeLetterPrefix } = require('../../utils/prefix');

const tripInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, required: true },
  invoiceDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date },

  // References
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  consignorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
  consigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },

  // Snapshot of Consignor Details (at invoice time)
  consignorDetails: {
    name: String,
    contactNumber: String,
    email: String,
    gstin: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
  },

  // Snapshot of Consignee Details (at invoice time)
  consigneeDetails: {
    name: String,
    contactNumber: String,
    email: String,
    gstin: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
  },

  // Snapshot of Trip Details (at invoice time)
  tripDetails: {
    tripId: String,
    tripSheetNo: String,
    from: String,
    to: String,
    distance: Number,
    routeDetails: {
      pickupPoint: String,
      dropPoint: String,
      expectedTime: String,
      actualTime: String,
    },
    cargoType: String,
    cargoWeight: Number,
    cargoWeightUnit: String,
    cargoDescription: String,
    freightRate: Number,
    freightAmount: Number,
    driverEarnings: Number,
    loadingCharges: Number,
    unloadingCharges: Number,
    detentionCharges: Number,
    otherCharges: Number,
    subtotal: Number,
    gstPercentage: Number,
    gst: Number,
    totalAmount: Number,
    expenses: {
      diesel: Number,
      toll: Number,
      driverBata: Number,
      food: Number,
      maintenance: Number,
      other: Number,
      total: Number,
    },
    dynamicExpenses: [{
      expenseType: String,
      amount: Number,
      date: Date,
      receiptNo: String,
      description: String,
    }],
    netProfit: Number,
    startDate: Date,
    endDate: Date,
    lrNo: String,
    grNo: String,
    ewayBillNo: String,
    status: String,
    notes: String,
  },

  // Snapshot of Vehicle Details (at invoice time)
  vehicleDetails: {
    vehicleNumber: String,
    registrationNo: String,
    vehicleType: String,
    capacity: Number,
    brand: String,
    model: String,
  },

  // Snapshot of Driver Details (at invoice time)
  driverDetails: {
    name: String,
    licenseNo: String,
    contactNumber: String,
  },

  // Invoice Financials (can be different from trip totals if modified)
  invoiceSubtotal: { type: Number, default: 0 },
  invoiceLoadingCharges: { type: Number, default: 0 },
  invoiceUnloadingCharges: { type: Number, default: 0 },
  invoiceDetentionCharges: { type: Number, default: 0 },
  invoiceOtherCharges: { type: Number, default: 0 },
  invoiceTotalBeforeTax: { type: Number, default: 0 },

  invoiceGstPercentage: { type: Number   },
  invoiceGstAmount: { type: Number, default: 0 },

  invoiceDiscountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  invoiceDiscountValue: { type: Number, default: 0 },
  invoiceDiscountAmount: { type: Number, default: 0 },

  invoiceTotalAmount: { type: Number, default: 0 },
  

  advanceReceived: {
    type: Number,
    default: 0,
    min: 0
  },
  extraDiscount: {
    type: Number,
    default: 0
  },
  extraDiscountType: {
    type: String,
    enum: ["fixed", "percentage"],
    default: "fixed"
  },
  netPayable: {
    type: Number,
    default: 0
  },

  // Round trip information (for return journeys)
  isRoundTrip: { type: Boolean, default: false },
  returnTripDetails: {
    from: String,
    to: String,
    distance: Number,
    startDate: Date,
    endDate: Date,
  },

  // Additional charges specific to invoice
  extraCharges: [{
    description: String,
    amount: Number,
    type: { type: String, enum: ['loading', 'unloading', 'detention', 'waiting', 'overnight', 'other'] },
  }],

  // Payment
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit'], default: 'Cash' },
  paymentStatus: { type: String, enum: ['Pending', 'Partial', 'Paid'], default: 'Pending' },
  paidAmount: { type: Number, default: 0 },
  paymentDate: Date,
  paymentReference: String,

  // Invoice Status
  status: { type: String, enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'], default: 'Draft' },

  // Email tracking
  emailSent: { type: Boolean, default: false },
  emailSentAt: Date,
  emailSentTo: String,

  // PDF path (if stored)
  pdfPath: String,

  // Notes
  notes: String,
  termsAndConditions: String,

  // Metadata
  createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save middleware to calculate invoice totals
tripInvoiceSchema.pre('save', function (next) {
  // Calculate total before tax
  this.invoiceTotalBeforeTax = this.invoiceSubtotal + 
  this.invoiceLoadingCharges +
    this.invoiceUnloadingCharges +
    this.invoiceDetentionCharges +
     this.invoiceOtherCharges;

  // Add extra charges
  if (this.extraCharges && this.extraCharges.length) {
    const extraTotal = this.extraCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
    this.invoiceTotalBeforeTax += extraTotal;
  }

  // Calculate GST
  this.invoiceGstAmount = this.invoiceTotalBeforeTax * (this.invoiceGstPercentage / 100);

  // Calculate discount
  if (this.invoiceDiscountType === 'percentage') {
    this.invoiceDiscountAmount = this.invoiceTotalBeforeTax * (this.invoiceDiscountValue / 100);
  } else {
    this.invoiceDiscountAmount = this.invoiceDiscountValue;
  }

  // Calculate final total
  this.invoiceTotalAmount = this.invoiceTotalBeforeTax + this.invoiceGstAmount - this.invoiceDiscountAmount;

  // Calculate net payable after advance/extra discount
  const discountAmount =
    this.extraDiscountType === 'percentage'
      ? (this.invoiceTotalAmount || 0) * ((this.extraDiscount || 0) / 100)
      : (this.extraDiscount || 0);
  const advance = this.advanceReceived || 0;
  const computedNet = (this.invoiceTotalAmount || 0) - advance - discountAmount;
  this.netPayable = computedNet > 0 ? computedNet : 0;

  // Update payment status based on paid amount
  if (this.paidAmount >= this.invoiceTotalAmount) {
    this.paymentStatus = 'Paid';
    this.status = 'Paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'Partial';
  } else {
    this.paymentStatus = 'Pending';
  }

  // Auto-set overdue status
  if (this.status !== 'Paid' && this.dueDate && new Date() > this.dueDate) {
    this.status = 'Overdue';
  }

  this.updatedAt = new Date();
  next();
});

// Generate invoice number
tripInvoiceSchema.statics.generateInvoiceNumber = async function (companyId, atDate = new Date(), { session } = {}) {
  if (!companyId) throw new Error("companyId is required to generate invoice number");

  // Mirror sales invoice pattern: <PREFIX>S<YY><SEQ4>
  let companyQuery = Company.findById(companyId).lean();
  if (session) companyQuery = companyQuery.session(session);
  const company = await companyQuery;
  const prefix = deriveThreeLetterPrefix(company?.businessName || company?.name || "");
  const yearYY = Number(String(atDate.getFullYear()).slice(-2));

  for (let tries = 0; tries < 20; tries++) {
    const counter = await InvoiceCounter.findOneAndUpdate(
      { company: companyId, yearYY },
      { $inc: { seq: 1 }, $setOnInsert: { company: companyId, yearYY } },
      { upsert: true, new: true, session }
    );

    const seq = counter.seq;
    const invoiceNumber = `${prefix}S${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;

    // Guard against collisions across trip and sales invoices
    let tripExistsQuery = this.exists({ companyId, invoiceNumber });
    let salesExistsQuery = SalesEntry.exists({ company: companyId, invoiceYearYY: yearYY, invoiceNumber });
    if (session) {
      tripExistsQuery = tripExistsQuery.session(session);
      salesExistsQuery = salesExistsQuery.session(session);
    }

    const [existsInTrip, existsInSales] = await Promise.all([tripExistsQuery, salesExistsQuery]);

    if (!existsInTrip && !existsInSales) return invoiceNumber;
  }

  throw new Error("Failed to generate unique trip invoice number after multiple attempts");
};

// Method to populate trip details from a trip document
tripInvoiceSchema.methods.populateFromTrip = async function (trip, company, consignor, consignee, vehicle, driver) {
  // Populate consignor details
  if (consignor) {
    this.consignorDetails = {
      name: consignor.name,
      contactNumber: consignor.contactNumber,
      email: consignor.email,
      gstin: consignor.gstin,
      address: consignor.address,
      city: consignor.city,
      state: consignor.state,
      pincode: consignor.pincode,
    };
  }

  // Populate consignee details
  if (consignee) {
    this.consigneeDetails = {
      name: consignee.name,
      contactNumber: consignee.contactNumber,
      email: consignee.email,
      gstin: consignee.gstin,
      address: consignee.address,
      city: consignee.city,
      state: consignee.state,
      pincode: consignee.pincode,
    };
  }

  // Populate trip details snapshot
  this.tripDetails = {
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
  };

  // Populate vehicle details
  if (vehicle) {
    this.vehicleDetails = {
      vehicleNumber: vehicle.vehicleNumber || vehicle.registrationNo,
      registrationNo: vehicle.registrationNo,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity,
      brand: vehicle.brand,
      model: vehicle.model,
    };
  }

  // Populate driver details
  if (driver) {
    this.driverDetails = {
      name: driver.name,
      licenseNo: driver.licenseNo,
      contactNumber: driver.contactNumber || driver.phone,
    };
  }

  // Set initial invoice financials from trip
  this.invoiceSubtotal = trip.freightAmount || 0;
  this.invoiceLoadingCharges = trip.loadingCharges || 0;
  this.invoiceUnloadingCharges = trip.unloadingCharges || 0;
   this.invoiceDetentionCharges = trip.detentionCharges || 0;
  this.invoiceOtherCharges = trip.otherCharges || 0;
  this.invoiceGstPercentage = Number.isFinite(Number(trip.gstPercentage))
    ? Number(trip.gstPercentage)
    : 0;

  this.companyId = company._id || company;
  this.consignorId = consignor._id || consignor;
  this.consigneeId = consignee._id || consignee;
  this.tripId = trip._id;
  this.vehicleId = vehicle?._id;
  this.driverId = driver?._id;

  return this;
};

// Indexes for faster queries
tripInvoiceSchema.index({ companyId: 1 });
tripInvoiceSchema.index({ consignorId: 1 });
tripInvoiceSchema.index({ consigneeId: 1 });
tripInvoiceSchema.index({ tripId: 1 });
tripInvoiceSchema.index({ invoiceNumber: 1 });
tripInvoiceSchema.index({ invoiceDate: -1 });
tripInvoiceSchema.index({ status: 1 });
tripInvoiceSchema.index({ paymentStatus: 1 });
tripInvoiceSchema.index({ createdByClient: 1 });

module.exports = mongoose.model('TripInvoice', tripInvoiceSchema);
