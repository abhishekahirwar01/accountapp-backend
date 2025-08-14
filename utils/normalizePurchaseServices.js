// utils/normalizePurchaseServices.js
const Service = require("../models/Service");

module.exports = async (rawServices = [], clientId) => {
  if (!Array.isArray(rawServices)) {
    throw new Error("Services must be an array");
  }

  const items = [];
  let computedTotal = 0;

  for (const item of rawServices) {
    const service = await Service.findOne({ _id: item.serviceName, createdByClient: clientId });
    if (!service) throw new Error(`Service not found or unauthorized: ${item.serviceName}`);

    const amount = Number(item.amount ?? service.cost); // Using cost for purchased services
    if (isNaN(amount)) throw new Error("Invalid amount");
    
    items.push({
      serviceName: service._id,
      amount,
      description: item.description || service.description || ""
    });

    computedTotal += amount;
  }

  return { items, computedTotal };
};