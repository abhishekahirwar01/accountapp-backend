const Service = require("../models/Service");

module.exports = async (rawServices = [], clientId) => {
  if (!Array.isArray(rawServices)) throw new Error("Services must be an array");

  const items = [];
  let computedTotal = 0;

  for (const item of rawServices) {
    // incoming payload uses `service`
    const serviceDoc = await Service.findOne({
      _id: item.service,
      createdByClient: clientId,
    });
    if (!serviceDoc) throw new Error(`Service not found or unauthorized: ${item.service}`);

    const amount = Number(item.amount ?? serviceDoc.amount);
    if (Number.isNaN(amount)) throw new Error("Invalid amount");

    items.push({
      // ⬅️ match SalesEntry schema
      serviceName: serviceDoc._id,
      amount,
      description: item.description || serviceDoc.description || "",
    });

    computedTotal += amount;
  }

  return { items, computedTotal };
};
