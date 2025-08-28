// utils/normalizeServices.js
const Service = require("../models/Service");

module.exports = async function normalizeServices(rows, clientId) {
  const items = [];
  let computedTotal = 0;

  for (const r of rows || []) {
    const id = r.service; // ✅ expect 'service'
    if (!id) continue;

    // Optional tenant check (ensure this matches your Service schema field)
    const svc = await Service.findOne({ _id: id, createdByClient: clientId })
      .select("_id")
      .lean();
    if (!svc) continue;

    const amount = Number(r.amount) || 0;
    const description = r.description || "";

    items.push({ service: svc._id, amount, description }); // ✅
    computedTotal += amount;
  }

  return { items, computedTotal };
};
