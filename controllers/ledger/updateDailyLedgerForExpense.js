const DailyStockLedger = require("../../models/DailyStockLedger");
const mongoose = require("mongoose");

/**
 * Normalize ledger date to 18:30 UTC (midnight IST)
 */
function normalizeDateToIST(date) {
  const d = new Date(date);
  d.setUTCHours(18, 30, 0, 0);
  return d;
}

/**
 * Update Daily Ledger for a new/edited/deleted expense.
 * 
 * @param {Object} options 
 * @param {ObjectId} options.companyId
 * @param {ObjectId} options.clientId
 * @param {Date}    options.date     // date of expense
 * @param {ObjectId} options.expenseHeadId // paymentExpense ID
 * @param {Number} options.amountDelta    // +amount for add, -amount for delete
 * @param {ClientSession?} session 
 */
exports.updateDailyLedgerForExpense = async function ({
  companyId,
  clientId,
  date,
  expenseHeadId,
  amountDelta
}, session = null) {
  try {
    const ledgerDate = normalizeDateToIST(date);

    let ledger = await DailyStockLedger.findOne({
      clientId,
      companyId,
      date: ledgerDate
    }).session(session);

    // If ledger doesn't exist → create new
    if (!ledger) {
      ledger = new DailyStockLedger({
        clientId,
        companyId,
        date: ledgerDate,
        openingStock: { quantity: 0, amount: 0 },
        closingStock: { quantity: 0, amount: 0 },
        totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
        totalSalesOfTheDay: { quantity: 0, amount: 0 },
        totalCOGS: 0,
        expenseSummary: [],
        totalExpenses: 0
      });
    }

    // STEP 1 → Apply delta to totalExpenses
    ledger.totalExpenses = (ledger.totalExpenses || 0) + amountDelta;

    // STEP 2 → Update individual expense head
    const existingHead = ledger.expenseSummary.find(
      (e) => e.expenseHead.toString() === expenseHeadId.toString()
    );

    if (existingHead) {
      existingHead.amount += amountDelta;

      // Remove if becomes zero or negative
      if (existingHead.amount <= 0) {
        ledger.expenseSummary = ledger.expenseSummary.filter(
          (e) => e.expenseHead.toString() !== expenseHeadId.toString()
        );
      }

    } else if (amountDelta > 0) {
      ledger.expenseSummary.push({
        expenseHead: expenseHeadId,
        amount: amountDelta,
      });
    }

    await ledger.save({ session });

    return ledger;
  } catch (err) {
    console.error("Error updating daily ledger for expense:", err);
    throw err;
  }
};
