const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  clientUsername: {
    type: String,
    required: true,
    unique: true,
    index: true,
    set: (v) => String(v || "").trim().toLowerCase(), // normalize
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true,
    set: (v) => String(v || "").trim().toLowerCase(),
  },
  password: { type: String, required: true },
  contactName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    set: (v) => String(v || "").trim().toLowerCase(),
  },
  maxCompanies: { type: Number, default: 5 },
  canSendInvoiceEmail: { type: Boolean, default: false },
  canSendInvoiceWhatsapp: { type: Boolean, default: false },
  role: { type: String, default: "client" },
  userLimit: { type: Number, default: 5 },
  masterAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "MasterAdmin" },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password; // never leak password
      return ret;
    },
  },
});


// --- Static helper for availability checks ---
clientSchema.statics.isUsernameAvailable = async function (username, excludeId) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return false;
  const query = excludeId ? { clientUsername: u, _id: { $ne: excludeId } } : { clientUsername: u };
  const exists = await this.exists(query);
  return !exists;
};

// (Optional) hard guard in case something bypasses setters (bulk ops)
// Keep it lightweight to avoid double hashing etc.
clientSchema.pre("save", function (next) {
  if (this.isModified("clientUsername")) {
    this.clientUsername = String(this.clientUsername || "").trim().toLowerCase();
  }
  if (this.isModified("slug")) {
    this.slug = String(this.slug || "").trim().toLowerCase();
  }
  if (this.isModified("email")) {
    this.email = String(this.email || "").trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model("Client", clientSchema);
