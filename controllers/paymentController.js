const PaymentEntry = require("../models/PaymentEntry");

exports.createPayment = async (req, res) => {
  try {
    const { vendor, date, amount, description, referenceNumber, company } = req.body;

    const payment = new PaymentEntry({
      vendor,
      date,
      amount,
      description,
      referenceNumber,
      company,
      client: req.user.id,
    });

    await payment.save();
    res.status(201).json({ message: "Payment entry created", payment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const payments = await PaymentEntry.find({ client: req.user.id }).populate("vendor company");
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const payment = await PaymentEntry.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (req.user.role !== "admin" && payment.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    Object.assign(payment, req.body);
    await payment.save();
    res.json({ message: "Payment updated", payment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const payment = await PaymentEntry.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (req.user.role !== "admin" && payment.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await payment.deleteOne();
    res.json({ message: "Payment deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getPaymentsByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const payments = await PaymentEntry.find({ client: clientId }).populate("vendor company");
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
