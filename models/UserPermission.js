// models/UserPermission.js
const mongoose = require("mongoose");

const userPermissionSchema = new mongoose.Schema(
  {
    // multi-tenant context
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    // the user these overrides apply to
    user:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // --- capability flags (null = inherit from client Permission) ---
    canCreateInventory:       { type: Boolean, default: null },
    canCreateCustomers:       { type: Boolean, default: null },
    canCreateVendors:         { type: Boolean, default: null },
    canCreateCompanies:       { type: Boolean, default: null },
    canUpdateCompanies:       { type: Boolean, default: null },
    canSendInvoiceEmail:      { type: Boolean, default: null },
    canSendInvoiceWhatsapp:   { type: Boolean, default: null },
    canCreateSaleEntries:     { type: Boolean, default: null },
    canCreatePurchaseEntries: { type: Boolean, default: null },
    canCreateJournalEntries:  { type: Boolean, default: null },
    canCreateReceiptEntries:  { type: Boolean, default: null },
    canCreatePaymentEntries:  { type: Boolean, default: null },
    canShowCustomers:         { type: Boolean, default: null }, // New field for showing customers in the sales section
    canShowVendors:           { type: Boolean, default: null }, 

    // optional scoping
    allowedCompanies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Company" }],

    // audit
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// Ensure one doc per (client,user)
userPermissionSchema.index({ client: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("UserPermission", userPermissionSchema);
