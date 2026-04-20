// models/Transporter/TripCounter.js
const mongoose = require('mongoose');

const TripCounterSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true
  },
  sequence: {
    type: Number,
    default: 0
  }
});

// Compound unique index to ensure one counter per company per month
TripCounterSchema.index({ companyId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('TripCounter', TripCounterSchema);