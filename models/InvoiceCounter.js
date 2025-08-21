// models/InvoiceCounter.js
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  yearYY:  { type: Number, required: true, index: true }, // e.g., 25 for 2025
  seq:     { type: Number, required: true, default: 0 },
}, { timestamps: true });

schema.index({ company: 1, yearYY: 1 }, { unique: true });
module.exports = mongoose.model("InvoiceCounter", schema);
