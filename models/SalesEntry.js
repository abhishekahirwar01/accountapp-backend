const mongoose = require("mongoose");

const UNIT_TYPES = ["Kg","Litre","Piece","Box","Meter","Dozen","Pack","Other"];

const salesItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  unitType: { type: String, enum: UNIT_TYPES, default: "Piece" },
  amount: { type: Number, required: true, min: 0 },     // quantity * pricePerUnit
}, { _id: false });

const salesSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  date: { type: Date, required: true },
  items: { type: [salesItemSchema], required: true, validate: v => v.length > 0 },
  totalAmount: { type: Number, required: true, min: 0 },

  description: { type: String },
  referenceNumber: { type: String },

  // optional/legacy
  gstPercentage: { type: Number },
  discountPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"] },
  gstin: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("SalesEntry", salesSchema);
