// services/effectivePermissions.js
const Permission = require("../models/Permission");        // tenant defaults
const UserPermission = require("../models/UserPermission"); // per-user overrides
const Role = require("../models/Role");

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

function tri(userVal, baseVal) {
  // userVal: true | false | null/undefined (inherit)
  if (userVal === true)  return true;
  if (userVal === false) return false;
  return baseVal;
}

async function getEffectivePermissions({ clientId, userId, roleName, rolePerms }) {
  const [clientPerm, userPerm, roleDoc] = await Promise.all([
    Permission.findOne({ client: clientId }).lean(),
    UserPermission.findOne({ client: clientId, user: userId }).lean(),
    rolePerms ? null : (roleName ? Role.findOne({ name: String(roleName).toLowerCase() }).lean() : null),
  ]);

  // 1) Tenant caps (hard upper bound)
  const tenantCaps = Object.fromEntries(CAP_KEYS.map(k => [k, !!clientPerm?.[k]]));

  // 2) Role defaults (array of cap keys or "*")
  const roleList = rolePerms || roleDoc?.defaultPermissions || [];
  const grantsAll = Array.isArray(roleList) && roleList.includes("*");
  const roleCaps = Object.fromEntries(
    CAP_KEYS.map(k => [k, grantsAll || roleList.includes(k)])
  );

  // Base = tenant allows AND role grants
  const base = Object.fromEntries(
    CAP_KEYS.map(k => [k, tenantCaps[k] && !!roleCaps[k]])
  );

  // 3) User overrides (final)
  const caps = {};
  for (const k of CAP_KEYS) {
    // If tenant disabled, nothing can enable it
    caps[k] = tenantCaps[k] ? tri(userPerm?.[k], base[k]) : false;
  }

  return {
    caps,
    allowedCompanies: userPerm?.allowedCompanies || null,
    planCode: clientPerm?.planCode || "FREE",
  };
}

module.exports = { getEffectivePermissions, CAP_KEYS };
