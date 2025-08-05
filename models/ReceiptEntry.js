const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: false },
  date: { type: Date, required: false },
  amount: { type: Number, required: false },
  description: { type: String },
  referenceNumber: { type: String },  // optional UTR/Cheque/Transaction ID
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: false },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: false },
  type: { type: String, enum: ["receipt"], default: "receipt" }
}, { timestamps: true });

module.exports = mongoose.model("ReceiptEntry", receiptSchema);
