const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    vendorName: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    gstRegistrationType: {
      type: String,
      enum: ["Regular", "Composition", "Unregistered", "Consumer", "Overseas", "Special Economic Zone", "Unknown"],
      default: "Unregistered",
    },
    pan: { type: String, uppercase: true, trim: true },
    isTDSApplicable: { type: Boolean, default: false },
    contactNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
     createdByUser:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Ensure contactNumber + client combo is unique
vendorSchema.index({ contactNumber: 1, createdByClient: 1 }, { unique: true });

// Ensure email + client combo is unique
vendorSchema.index({ email: 1, createdByClient: 1 }, { unique: true });

module.exports = mongoose.model("Vendor", vendorSchema);
