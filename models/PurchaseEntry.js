// models/PurchaseEntry.js
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  description: { type: String },
  gstPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"], required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  gstin: { type: String },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true }
}, { timestamps: true });

module.exports = mongoose.model("PurchaseEntry", purchaseSchema);
