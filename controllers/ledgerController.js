// controllers/ledgerController.js
const PurchaseEntry = require("../models/PurchaseEntry");
const PaymentEntry = require("../models/PaymentEntry");
const Vendor = require("../models/Vendor");
const PaymentExpense = require("../models/PaymentExpense");

const PRIV_ROLES = new Set(["master", "client", "admin"]);

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth?.role);
}

function sameTenant(a, b) {
  return String(a) === String(b);
}

// Get payables ledger data
exports.getPayablesLedger = async (req, res) => {
  try {
    const clientId = req.auth.clientId;

    // Get all purchase entries (debit side - what we owe)
    const purchaseEntries = await PurchaseEntry.find({
      client: clientId,
      paymentMethod: "Credit" // Only credit purchases create payables
    })
    .populate("vendor", "vendorName")
    .populate("company", "companyName")
    .sort({ date: 1 })
    .lean();

    // Get all payment entries (credit side - what we've paid)
    const paymentEntries = await PaymentEntry.find({
      client: clientId
    })
    .populate("vendor", "vendorName")
    .populate("company", "companyName")
    .sort({ date: 1 })
    .lean();

    // Format debit entries (purchases/invoices)
    const debitEntries = purchaseEntries.map(entry => ({
      id: entry._id,
      date: entry.date,
      type: "Purchase",
      description: entry.description || `Purchase from ${entry.vendor?.vendorName || "Unknown Vendor"}`,
      vendorName: entry.vendor?.vendorName || "Unknown Vendor",
      invoiceNo: entry.invoiceNumber,
      amount: entry.totalAmount,
      company: entry.company?.companyName || "Unknown Company",
      referenceNumber: entry.referenceNumber
    }));

    // Format credit entries (payments)
    const creditEntries = paymentEntries.map(entry => ({
      id: entry._id,
      date: entry.date,
      type: "Payment",
      description: entry.description || `Payment to ${entry.vendor?.vendorName || "Unknown Vendor"}`,
      vendorName: entry.vendor?.vendorName || "Unknown Vendor",
      paymentMethod: entry.paymentMethod,
      amount: entry.amount,
      company: entry.company?.companyName || "Unknown Company",
      referenceNumber: entry.referenceNumber
    }));

    // Calculate totals
    const totalDebit = debitEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalCredit = creditEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const balance = totalDebit - totalCredit;

    res.json({
      debit: debitEntries,
      credit: creditEntries,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balance: balance
      }
    });

  } catch (error) {
    console.error("Error fetching payables ledger:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }

};


// Get vendor-specific payables ledger data
exports.getVendorPayablesLedger = async (req, res) => {
  try {
    const clientId = req.auth.clientId;
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ message: "Vendor ID is required" });
    }

    // Get all purchase entries for the vendor (debit side - all purchases)
    const purchaseEntries = await PurchaseEntry.find({
      client: clientId,
      vendor: vendorId
    })
    .populate("vendor", "vendorName")
    .populate("company", "companyName")
    .sort({ date: 1 })
    .lean();

    // Get all payment entries for the vendor (credit side - payments except credit payments)
    const paymentEntries = await PaymentEntry.find({
      client: clientId,
      vendor: vendorId,
      paymentMethod: { $ne: "Credit" } // Exclude credit payments
    })
    .populate("vendor", "vendorName")
    .populate("company", "companyName")
    .sort({ date: 1 })
    .lean();

    // Format debit entries (purchases/invoices)
    const debitEntries = purchaseEntries.map(entry => ({
      id: entry._id,
      date: entry.date,
      type: "Purchase",
      description: entry.description || `Purchase from ${entry.vendor?.vendorName || "Unknown Vendor"}`,
      vendorName: entry.vendor?.vendorName || "Unknown Vendor",
      invoiceNo: entry.invoiceNumber,
      paymentMethod: entry.paymentMethod,
      amount: entry.totalAmount,
      company: entry.company?.companyName || "Unknown Company",
      referenceNumber: entry.referenceNumber
    }));

    // Format credit entries (payments)
    const creditEntries = paymentEntries.map(entry => ({
      id: entry._id,
      date: entry.date,
      type: "Payment",
      description: entry.description || `Payment to ${entry.vendor?.vendorName || "Unknown Vendor"}`,
      vendorName: entry.vendor?.vendorName || "Unknown Vendor",
      paymentMethod: entry.paymentMethod,
      amount: entry.amount,
      company: entry.company?.companyName || "Unknown Company",
      referenceNumber: entry.referenceNumber
    }));

    // Calculate totals
    const totalDebit = debitEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalCredit = creditEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const balance = totalDebit - totalCredit;

    res.json({
      debit: debitEntries,
      credit: creditEntries,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balance: balance
      }
    });

  } catch (error) {
    console.error("Error fetching vendor payables ledger:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get expense-specific payables ledger data
exports.getExpensePayablesLedger = async (req, res) => {
  try {
    const clientId = req.auth.clientId;
    const { expenseId } = req.query;

    if (!expenseId) {
      return res.status(400).json({ message: "Expense ID is required" });
    }

    // Get all payment entries for the expense (these are the "payments" - credit side)
    const expensePaymentEntries = await PaymentEntry.find({
      client: clientId,
      expense: expenseId,
      isExpense: true
    })
    .populate("expense", "name")
    .populate("company", "companyName")
    .sort({ date: 1 })
    .lean();

    // For expenses, debit side is typically empty (no outstanding amounts to pay)
    const debitEntries = [];

    // Format credit entries (expense payments - these are the actual payments made)
    const creditEntries = expensePaymentEntries.map(entry => ({
      id: entry._id,
      date: entry.date,
      type: "Expense Payment",
      description: entry.description || `Expense payment for ${entry.expense?.name || "Unknown Expense"}`,
      vendorName: entry.expense?.name || "Unknown Expense",
      paymentMethod: entry.paymentMethod,
      amount: entry.amount,
      company: entry.company?.companyName || "Unknown Company",
      referenceNumber: entry.referenceNumber
    }));

    // Calculate totals
    const totalDebit = debitEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalCredit = creditEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const balance = totalDebit - totalCredit;

    res.json({
      debit: debitEntries,
      credit: creditEntries,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balance: balance
      }
    });

  } catch (error) {
    console.error("Error fetching expense payables ledger:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};