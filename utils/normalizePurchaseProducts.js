// utils/normalizePurchaseProducts.js
const Product = require("../models/Product");

module.exports = async (rawProducts = [], clientId) => {
  if (!Array.isArray(rawProducts)) {
    throw new Error("Products must be an array");
  }

  const items = [];
  let computedTotal = 0;

  for (const item of rawProducts) {
    const product = await Product.findOne({ _id: item.product, createdByClient: clientId });
    if (!product) throw new Error(`Product not found or unauthorized: ${item.product}`);

    const quantity = Number(item.quantity ?? 1);
    if (isNaN(quantity)) throw new Error("Invalid quantity"); // Fixed this line
    
    const pricePerUnit = Number(item.pricePerUnit ?? product.costPrice); // Using costPrice for purchases
    if (isNaN(pricePerUnit)) throw new Error("Invalid price");

    const amount = Number(item.amount ?? quantity * pricePerUnit);

     // Get GST percentage from the request or use product default
    const gstPercentage = Number(item.gstPercentage ?? product.gstPercentage ?? 18);
    
    // Calculate tax and total for this line
    const lineTax = +(amount * gstPercentage / 100).toFixed(2);
    const lineTotal = +(amount + lineTax).toFixed(2);
    
    items.push({
      product: product._id,
      quantity,
      pricePerUnit,
      unitType: item.unitType || product.unitType || "Piece",
      amount,
       gstPercentage, // NEW: Save GST percentage
      lineTax,       // NEW: Save calculated tax
      lineTotal      // NEW: Save line total (amount + tax)
    });

    computedTotal += amount;
  }

  return { items, computedTotal };
};