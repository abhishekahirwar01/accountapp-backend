// models/IssuedInvoiceNumber.js
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  company:       { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true }, 
  yearYY:        { type: Number, required: true, index: true },
  seq:           { type: Number, required: true },
  prefix:        { type: String, required: true },
}, { timestamps: true });

schema.index({ company: 1, yearYY: 1, seq: 1 }, { unique: true });
module.exports = mongoose.model("IssuedInvoiceNumber", schema);
