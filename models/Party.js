const mongoose = require("mongoose");

const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: true,  trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    gstRegistrationType: {
      type: String,
      enum: [
        "Regular",
        "Composition",
        "Unregistered",
        "Consumer",
        "Overseas",
        "Special Economic Zone",
        "Unknown"
      ],
      default: "Unregistered",
    },
    pan: { type: String, uppercase: true, trim: true },
    isTDSApplicable: { type: Boolean, default: false },
    tdsRate: { type: Number },
    tdsSection: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    balances: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

// Ensure contactNumber + client combo is unique
partySchema.index({ contactNumber: 1, createdByClient: 1 }, { unique: true });

// Ensure email + client combo is unique
partySchema.index({ email: 1, createdByClient: 1 });

module.exports = mongoose.model("Party", partySchema);
