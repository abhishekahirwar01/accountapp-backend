// controllers/purchaseController.js
const PurchaseEntry = require("../models/PurchaseEntry");
const Company = require("../models/Company");
const { ensurePartyAndProduct } = require("../utils/ensurePartyAndProduct");

exports.createPurchaseEntry = async (req, res) => {
  try {
    const {
      partyName,
      date,
      amount,
     product: productName,
      description,
      gstPercentage,
      invoiceType,
      companyId
    } = req.body;

    const company = await Company.findOne({ _id: companyId, client: req.user.id });
    if (!company) {
      return res.status(400).json({ message: "Invalid company selected" });
    }
    if (req.user.role === "client" && company.client.toString() !== req.user.id) {
  return res.status(403).json({ message: "This company does not belong to you" });
}

    const { party, product } = await ensurePartyAndProduct(partyName, productName,  req.user.id);

    const entry = new PurchaseEntry({
      party: party._id,
      date,
      amount,
      product: product._id,
      description,
      gstPercentage,
      invoiceType,
      company: company._id,
      gstin: company.gstin || null,
      client: req.user.id
    });

    await entry.save();
    res.status(201).json({ message: "Purchase entry created successfully", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
