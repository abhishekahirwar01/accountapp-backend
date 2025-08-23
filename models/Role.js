// models/Role.js
const mongoose = require("mongoose");

const CAP_KEYS = [
  "canCreateInventory",
  "canCreateProducts",
  "canCreateCustomers",
  "canCreateVendors",
  "canCreateCompanies",
  "canUpdateCompanies",
  "canSendInvoiceEmail",
  "canSendInvoiceWhatsapp",
  "canCreateSaleEntries",
  "canCreatePurchaseEntries",
  "canCreateJournalEntries",
  "canCreateReceiptEntries",
  "canCreatePaymentEntries",
];

const roleSchema = new mongoose.Schema(
  {
    // e.g. "master", "admin", "client", "user", "auditor"
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },

    // store capability keys (or "*" to grant all caps)
    defaultPermissions: {
      type: [String],
      default: [],
      validate: {
        validator(vals) {
          return vals.every(v => v === "*" || CAP_KEYS.includes(v));
        },
        message: "defaultPermissions contains unknown capability key",
      },
    },
  },
  { timestamps: true }
);

// Helper: return array of allowed caps (strings)
roleSchema.statics.getPermissions = async function (roleName) {
  if (!roleName) return [];
  const doc = await this.findOne({ name: String(roleName).toLowerCase() }).lean();
  return doc?.defaultPermissions || [];
};

module.exports = mongoose.model("Role", roleSchema);
module.exports.CAP_KEYS = CAP_KEYS;
