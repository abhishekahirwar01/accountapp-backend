const mongoose = require("mongoose");

const partySchema = new mongoose.Schema({
  name: { type: String, required: true,unique: true, lowercase: true, trim: true },
  createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
}, { timestamps: true });

// Ensure name + client combo is unique
partySchema.index({ name: 1, createdByClient: 1 }, { unique: true });

module.exports = mongoose.model("Party", partySchema);
