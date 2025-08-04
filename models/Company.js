const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  address: { type: String },
  companyOwner: { type: String, required: true },
  contactNumber: { type: String, required: true },
  gstin: { type: String, default: null },
  companyType: {
    type: String,
    required: true
  },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  // NEW: Assigned client
  selectedClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null }
}, { timestamps: true });

module.exports = mongoose.model("Company", companySchema);
