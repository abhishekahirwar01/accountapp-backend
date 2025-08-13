// validation/permission.schema.js
const { z } = require("zod");

const bool = z.coerce.boolean().optional();
const nonNegInt = z.coerce.number().int().min(0).optional();

const base = z.object({
  // feature flags
  canCreateUsers: bool,
  canCreateProducts: bool,
  canCreateCustomers: bool,     // ✅ add
  canCreateVendors: bool,       // ✅ add

  // messaging
  canSendInvoiceEmail: bool,
  canSendInvoiceWhatsapp: bool,

  // limits
  maxCompanies: nonNegInt,
  maxUsers: nonNegInt,
  maxInventories: nonNegInt,    // ✅ add

  // plan
  planCode: z.string().max(50).optional(),
}).strict(); // keep strict to block unknown keys

exports.putPermissionsSchema = base;
exports.patchPermissionsSchema = base.partial();
