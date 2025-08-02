const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  clientUsername: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  contactName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  maxCompanies: { type: Number, default: 5 },
  maxUsers: { type: Number, default: 10 },
  canSendInvoiceEmail: { type: Boolean, default: true },
  canSendInvoiceWhatsapp: { type: Boolean, default: false },
  role: { type: String, default: "client" },
  masterAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "MasterAdmin" },
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema);
