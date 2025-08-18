const mongoose = require("mongoose");

const emailIntegrationSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, unique: true, index: true },
    provider: { type: String, default: "gmail" },
    connected: { type: Boolean, default: false },
    email: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
    tokens: { type: Object, default: {} }, // for real OAuth later
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailIntegration", emailIntegrationSchema);
