// utils/ensurePartyAndProduct.js
const Party = require("../models/Party");
const Product = require("../models/Product");

exports.ensurePartyAndProduct = async (partyName, productName, clientId) => {
  // Ensure Party
  let party = await Party.findOne({ name: partyName, createdByClient: clientId });
  if (!party) {
    party = new Party({ name: partyName, createdByClient: clientId });
    await party.save();
  }

  // Ensure Product
  let product = await Product.findOne({ name: productName, createdByClient: clientId });
  if (!product) {
    product = new Product({ name: productName, createdByClient: clientId });
    await product.save();
  }

  return { party, product };
};
