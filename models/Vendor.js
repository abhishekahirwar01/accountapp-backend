const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
    vendorName: { type: String, required: true, lowercase: true, trim: true },
    contactNumber: { type: String, unique: true },
    email: { type: String,  unique: true, lowercase: true, trim: true },
    address: { type: String, trim: true },
    createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
}, { timestamps: true });

// Ensure name + client combo is unique
vendorSchema.index({ vendorName: 1, createdByClient: 1 }, { unique: true });

module.exports = mongoose.model("Vendor", vendorSchema);
