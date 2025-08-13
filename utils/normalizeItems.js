const Product = require("../models/Product");

exports.normalizeItems = async (rawItems = [], clientId) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("At least one item is required.");
  }
  const items = [];
  let computedTotal = 0;

  for (const it of rawItems) {
    const prod = await Product.findOne({ _id: it.product, createdByClient: clientId });
    if (!prod) throw new Error("Product not found or unauthorized");

    const quantity = Number(it.quantity) || 0;
    const pricePerUnit = Number(it.pricePerUnit) || 0;
    const amount = Number(it.amount ?? quantity * pricePerUnit);

    items.push({
      product: prod._id,
      quantity,
      pricePerUnit,
      unitType: it.unitType || "Piece",
      amount,
    });

    computedTotal += amount;
  }

  return { items, computedTotal };
};
