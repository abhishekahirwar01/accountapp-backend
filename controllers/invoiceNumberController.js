// controllers/invoiceNumberController.js
const { issueInvoiceNumber } = require("../services/invoiceIssuer");

exports.issueNumberCtrl = async (req, res) => {
  try {
    console.log("[BE] /api/invoices/issue-number hit with body:", req.body);
    const { companyId, date } = req.body; // POST
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const atDate = date ? new Date(date) : new Date();
    const { invoiceNumber } = await issueInvoiceNumber(companyId, atDate);
    res.json({ invoiceNumber });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
