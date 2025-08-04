const ReceiptEntry = require("../models/ReceiptEntry");

exports.createReceipt = async (req, res) => {
  try {
    const { party, date, amount, description, referenceNumber, company } = req.body;

    const receipt = new ReceiptEntry({
      party,
      date,
      amount,
      description,
      referenceNumber,
      company,
      client: req.user.id,
    });

    await receipt.save();
    res.status(201).json({ message: "Receipt entry created", receipt });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getReceipts = async (req, res) => {
  try {
    const receipts = await ReceiptEntry.find({ client: req.user.id }).populate("party company");
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateReceipt = async (req, res) => {
  try {
    const receipt = await ReceiptEntry.findById(req.params.id);
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    if (req.user.role !== "admin" && receipt.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    Object.assign(receipt, req.body);
    await receipt.save();
    res.json({ message: "Receipt updated", receipt });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteReceipt = async (req, res) => {
  try {
    const receipt = await ReceiptEntry.findById(req.params.id);
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    if (req.user.role !== "admin" && receipt.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await receipt.deleteOne();
    res.json({ message: "Receipt deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.getReceiptsByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const receipts = await ReceiptEntry.find({ client: clientId }).populate("party company");
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
