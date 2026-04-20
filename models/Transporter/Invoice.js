const mongoose = require('mongoose');

// ONE INVOICE = ONE TRIP (Simplified)
const invoiceSchema = new mongoose.Schema({
  invoiceId: { type: String, unique: true, required: true },
  invoiceNo: { type: String, unique: true, required: true },
  
  // References
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  
  // Trip snapshot (denormalized for invoice history)
  tripDetails: {
    from: String,
    to: String,
    distance: Number,
    cargoType: String,
    cargoWeight: Number,
    startDate: Date,
    tripSheetNo: String,
    vehicleNo: String
  },
  
  // Financials (copied from trip)
  freightAmount: { type: Number, required: true },
  loadingCharges: { type: Number, default: 0 },
  unloadingCharges: { type: Number, default: 0 },
  detentionCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  gst: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  
  // Payment Details
  status: { type: String, enum: ['Pending', 'Paid', 'Overdue', 'Cancelled', 'Partially Paid'], default: 'Pending' },
  paymentDate: Date,
  paymentMode: String,
  paymentReference: String,
  amountPaid: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  
  dueDate: { type: Date, required: true },
  notes: String,
  
  // Documents
  pdfUrl: String,
  emailedAt: Date,
  printedAt: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

invoiceSchema.pre('save', function(next) {
  this.remainingAmount = this.totalAmount - this.amountPaid;
  
  if (this.remainingAmount === 0 && this.status !== 'Paid') {
    this.status = 'Paid';
    this.paymentDate = new Date();
  }
  
  this.updatedAt = new Date();
  next();
});

invoiceSchema.index({ tripId: 1 });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ invoiceNo: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);