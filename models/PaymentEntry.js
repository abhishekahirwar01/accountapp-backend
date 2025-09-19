const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
//   mode: { type: String, enum: ["Cash", "Bank", "UPI", "Cheque"], required: false },
  description: { type: String },
  referenceNumber: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["payment"], default: "payment" }
}, { timestamps: true });

module.exports = mongoose.model("PaymentEntry", paymentSchema);
