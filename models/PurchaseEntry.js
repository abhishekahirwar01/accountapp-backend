// models/PurchaseEntry.js
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  pricePerUnit: { type: Number },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  unitType: { type: String, enum: ["Kg", "Litre", "Piece", "Box", "Meter", "Dozen", "Pack", "Other"], default: "Piece" }, // ✅ Added field
  quantity: { type: Number, required: true },
  description: { type: String },
  gstPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"], required: false },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  gstin: { type: String },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true }
}, { timestamps: true });

module.exports = mongoose.model("PurchaseEntry", purchaseSchema);
