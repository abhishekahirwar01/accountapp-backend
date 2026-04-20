// models/Transporter/TripExpense.js
const mongoose = require('mongoose');

const tripExpenseSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true
  },
  expenseType: {
    type: String,
    enum: ['fuel', 'toll', 'parking', 'driverBata', 'food', 'maintenance', 'loading', 'permit', 'other'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  receiptNo: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  paymentMode: {
    type: String,
    enum: ['cash', 'bank', 'upi', 'other'],
    default: 'cash'
  },
  vendorName: String,
  createdByClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  createdByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

tripExpenseSchema.index({ tripId: 1 });
tripExpenseSchema.index({ expenseType: 1 });
tripExpenseSchema.index({ date: -1 });

module.exports = mongoose.model('TripExpense', tripExpenseSchema);