// models/EmailIntegration.js
const mongoose = require("mongoose");

const emailIntegrationSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, unique: true, index: true },
    provider: { type: String, default: "gmail" },
    connected: { type: Boolean, default: false },
    email: { type: String, default: null },

    // optional UX flag you already had
    termsAcceptedAt: { type: Date, default: null },

    // token fields – consider encrypting at rest in production
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    tokenType: { type: String, default: null },
    scope: { type: String, default: null },
    expiryDate: { type: Date, default: null }, // access token expiry
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailIntegration", emailIntegrationSchema);
