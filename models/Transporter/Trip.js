const mongoose = require('mongoose');

// ONE TRIP = ONE ROUTE/LEG (Simplified)
const tripSchema = new mongoose.Schema({
  tripId: { type: String, unique: true, required: true },
  tripSheetNo: { type: String, unique: true, required: true },

  // References
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
  consignorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
  consigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },

  // Trip Details (Single Route)
  from: { type: String, required: true },
  to: { type: String, required: true },
  distance: { type: Number, required: true },
  routeDetails: {
    pickupPoint: String,
    dropPoint: String,
    expectedTime: String,
    actualTime: String
  },

  // Cargo Details
  cargoType: { type: String, required: true },
  cargoWeight: { type: Number, required: true },
  cargoWeightUnit: { type: String },
  cargoDescription: String,

  // Financials
  freightRate: { type: Number },
  freightAmount: { type: Number },
  driverEarnings: { type: Number, default: 0 },

  // Additional Charges
  loadingCharges: { type: Number, default: 0 },
  unloadingCharges: { type: Number, default: 0 },
  detentionCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },

  subtotal: { type: Number, default: 0 },
  gstPercentage: { type: Number, default: 0 },  // ADD THIS - GST percentage
  gst: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },

  // Expenses
  expenses: {
    diesel: { type: Number, default: 0 },
    toll: { type: Number, default: 0 },
    driverBata: { type: Number, default: 0 },
    food: { type: Number, default: 0 },
    maintenance: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },

  // NEW: Dynamic Expenses Array
  dynamicExpenses: [{
    expenseType: {
      type: String,
      enum: ["hamalli",'fuel', 'toll', 'parking', 'driverBata', 'food', 'maintenance', 'loading', 'permit', 'other'],
    },
    amount: {
      type: Number,
      min: 0
    },
    date: {
      type: Date,
      default: Date.now
    },
    receiptNo: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    }
  }],

  // Profit/Loss
  netProfit: { type: Number, default: 0 },

  // Dates
  startDate: { type: Date },
  endDate: Date,

  // LR / GR Details
  lrNo: { type: String },
  grNo: { type: String },
  ewayBillNo: { type: String },

  // Status
  status: {
    type: String,
    enum: ['Draft', 'Started', 'InProgress', 'Completed', 'Cancelled', 'Delivered'],
    default: 'Draft'
  },

  // Invoice tracking
  invoiceGenerated: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  // Notes
  notes: String,

  createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware to calculate financials
tripSchema.pre('save', function (next) {
  // Calculate freight amount
  this.freightAmount = this.distance * this.freightRate;

  // Calculate subtotal (includes ALL charges)
  this.subtotal = this.freightAmount + 
    this.loadingCharges + 
    this.unloadingCharges +
    this.detentionCharges + 
    this.otherCharges;

  // Calculate GST - on the FULL subtotal (or adjust as per your business rules)
  const gstPercentage = typeof this.gstPercentage === 'number' ? this.gstPercentage : 0;
  
  // OPTION 1: Calculate GST on full subtotal (includes detention and other charges)
  if (gstPercentage > 0) {
    this.gst = this.subtotal * (gstPercentage / 100);
  } else {
    this.gst = 0;
  }
  
  // OPTION 2: If GST should exclude certain charges, use this instead:
  // const gstBase = this.freightAmount + this.loadingCharges + this.unloadingCharges + this.detentionCharges;
  // this.gst = gstBase * (gstPercentage / 100);

  // Calculate total amount
  this.totalAmount = this.subtotal + this.gst;

  // Calculate static expenses total
  const staticExpensesTotal = this.expenses.diesel + this.expenses.toll + this.expenses.driverBata +
    this.expenses.food + this.expenses.maintenance + this.expenses.other;
  
  // Calculate dynamic expenses total
  const dynamicExpensesTotal = this.dynamicExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  
  // Total expenses = static + dynamic
  this.expenses.total = staticExpensesTotal + dynamicExpensesTotal;

  // Calculate net profit
  this.netProfit = this.totalAmount - this.expenses.total;

  // Auto-set end date when status is Completed or Delivered
  if ((this.status === 'Completed' || this.status === 'Delivered') && !this.endDate) {
    this.endDate = new Date();
  }

  this.updatedAt = new Date();
  next();
});


// Indexes for faster queries
tripSchema.index({ companyId: 1 });
tripSchema.index({ driverId: 1 });
tripSchema.index({ vehicleId: 1 });
tripSchema.index({ consignorId: 1 });
tripSchema.index({ startDate: -1 });
tripSchema.index({ status: 1 });
tripSchema.index({ tripSheetNo: 1 });
tripSchema.index({ createdByClient: 1 });
tripSchema.index({ 'dynamicExpenses.date': -1 }); // Optional: for expense date queries

module.exports = mongoose.model('Trip', tripSchema);