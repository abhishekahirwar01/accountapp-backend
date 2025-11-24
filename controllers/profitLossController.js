// controllers/profitLossController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const PurchaseEntry = require("../models/PurchaseEntry");
const ReceiptEntry = require("../models/ReceiptEntry");
const PaymentEntry = require("../models/PaymentEntry");
const Product = require("../models/Product");
const DailyStockLedger = require("../models/DailyStockLedger"); // ⬅️ ADD THIS
const { getEffectivePermissions } = require("../services/effectivePermissions");

const PRIV_ROLES = new Set(["master", "client", "admin"]);

async function ensureAuthCaps(req) {
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
    };
  }
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }

  console.log('req.auth:', req.auth);
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth.role);
}

function companyAllowedForUser(req, companyId) {
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  return allowed.length === 0 || allowed.includes(String(companyId));
}



// ✅ UPDATED: Get opening stock from Daily Stock Ledger - USE IST DATES
async function getOpeningStock(clientId, companyId, startDate) {
  try {
    // Convert to IST standardized date (18:30 UTC)
    const standardizedDate = new Date(startDate);
    standardizedDate.setUTCHours(18, 30, 0, 0);

    console.log('🔍 Looking for opening stock on IST date:', standardizedDate.toISOString());

    const openingStockLedger = await DailyStockLedger.findOne({
      clientId: new mongoose.Types.ObjectId(clientId),
      companyId: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true },
      date: standardizedDate
    });

    if (openingStockLedger && openingStockLedger.openingStock) {
      console.log('✅ Found opening stock for IST date:', openingStockLedger.openingStock.amount);
      return openingStockLedger.openingStock.amount || 0;
    }

    console.log('❌ No opening stock found for IST date, using 0');
    return 0;

  } catch (error) {
    console.error("Error getting opening stock from ledger:", error);
    return 0;
  }
}


// ✅ UPDATED: Get closing stock from Daily Stock Ledger - USE IST DATES
async function getClosingStock(clientId, companyId, endDate) {
  try {
    // Convert to IST standardized date (18:30 UTC)
    const standardizedDate = new Date(endDate);
    standardizedDate.setUTCHours(18, 30, 0, 0);

    console.log('🔍 Looking for closing stock on IST date:', standardizedDate.toISOString());

    const closingStockLedger = await DailyStockLedger.findOne({
      clientId: new mongoose.Types.ObjectId(clientId),
      companyId: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true },
      date: standardizedDate
    });

    if (closingStockLedger && closingStockLedger.closingStock) {
      console.log('✅ Found closing stock for IST date:', closingStockLedger.closingStock.amount);
      return closingStockLedger.closingStock.amount || 0;
    }

    console.log('❌ No closing stock found for IST date, using 0');
    return 0;

  } catch (error) {
    console.error("Error getting closing stock from ledger:", error);
    return 0;
  }
}

// ✅ NEW: Get total purchases from Daily Stock Ledger for the period
async function getPurchasesFromLedger(clientId, companyId, startDate, endDate) {
  try {
    // Convert dates to IST format
    const startDateIST = new Date(startDate);
    startDateIST.setUTCHours(18, 30, 0, 0);
    
    const endDateIST = new Date(endDate);
    endDateIST.setUTCHours(18, 30, 0, 0);

    const ledgers = await DailyStockLedger.find({
      clientId: new mongoose.Types.ObjectId(clientId),
      companyId: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true },
      date: { $gte: startDateIST, $lte: endDateIST }
    });

    const totalPurchases = ledgers.reduce((total, ledger) => {
      return total + (ledger.totalPurchaseOfTheDay?.amount || 0);
    }, 0);

    console.log('📦 Total purchases from ledger:', totalPurchases);
    return totalPurchases;

  } catch (error) {
    console.error("Error getting purchases from ledger:", error);
    return 0;
  }
}

// ✅ NEW: Get total sales from Daily Stock Ledger for the period
async function getSalesFromLedger(clientId, companyId, startDate, endDate) {
  try {
    // Convert dates to IST format
    const startDateIST = new Date(startDate);
    startDateIST.setUTCHours(18, 30, 0, 0);
    
    const endDateIST = new Date(endDate);
    endDateIST.setUTCHours(18, 30, 0, 0);

    const ledgers = await DailyStockLedger.find({
      clientId: new mongoose.Types.ObjectId(clientId),
      companyId: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true },
      date: { $gte: startDateIST, $lte: endDateIST }
    });

    const totalSales = ledgers.reduce((total, ledger) => {
      return total + (ledger.totalSalesOfTheDay?.amount || 0);
    }, 0);

    console.log('💰 Total sales from ledger:', totalSales);
    return totalSales;

  } catch (error) {
    console.error("Error getting sales from ledger:", error);
    return 0;
  }
}

// Calculate cost of goods sold from sales entries (fallback method)
async function calculateCostOfGoodsSold(clientId, companyId, startDate, endDate) {
  try {
    const baseFilter = {
      date: { $gte: startDate, $lte: endDate },
      client: new mongoose.Types.ObjectId(clientId)
    };

    if (companyId) {
      baseFilter.company = new mongoose.Types.ObjectId(companyId);
    }

    // Get all sales entries in the period
    const salesEntries = await SalesEntry.find(baseFilter)
      .populate('products.product', 'sellingPrice')
      .lean();

    let totalCOGS = 0;

    // Calculate COGS for each sales entry
    for (const entry of salesEntries) {
      for (const item of entry.products) {
        if (item.product && item.product.sellingPrice) {
          // COGS = quantity sold * cost price (using selling price as approximation)
          totalCOGS += (item.quantity || 0) * item.product.sellingPrice;
        }
      }
    }

    return totalCOGS;
  } catch (error) {
    console.error("Error calculating COGS:", error);
    return 0;
  }
}

// ✅ UPDATED: Main Profit & Loss function with Daily Stock Ledger integration
exports.getProfitLossStatement = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const { companyId, fromDate, toDate } = req.query;

    // Validate date range
    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate and toDate are required"
      });
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);

    console.log('📅 Profit & Loss Period:', { startDate, endDate, companyId });

    // ✅ UPDATED: Get stock values from Daily Stock Ledger
    const [openingStock, closingStock, ledgerPurchases, ledgerSales] = await Promise.all([
      getOpeningStock(req.auth.clientId, companyId, startDate),
      getClosingStock(req.auth.clientId, companyId, endDate),
      getPurchasesFromLedger(req.auth.clientId, companyId, startDate, endDate),
      getSalesFromLedger(req.auth.clientId, companyId, startDate, endDate)
    ]);

    console.log('📊 Stock Values from Ledger:', {
      openingStock,
      closingStock,
      ledgerPurchases,
      ledgerSales
    });

    // Build base filter for other transactions
    const baseFilter = {
      date: { $gte: startDate, $lte: endDate },
      client: new mongoose.Types.ObjectId(req.auth.clientId)
    };

    // Add company filter if specified
    if (companyId) {
      if (!companyAllowedForUser(req, companyId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this company"
        });
      }
      baseFilter.company = new mongoose.Types.ObjectId(companyId);
    } else {
      // Filter by allowed companies for non-privileged users
      if (!userIsPriv(req) && Array.isArray(req.auth.allowedCompanies)) {
        baseFilter.company = { $in: req.auth.allowedCompanies.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    // Fetch other financial data in parallel
    const [
      receiptResult,
      paymentResult
    ] = await Promise.all([
      // Receipts aggregation
      ReceiptEntry.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]),
      
      // Payments aggregation with expense type breakdown
      PaymentEntry.aggregate([
        { $match: baseFilter },
        {
          $lookup: {
            from: 'paymentexpenses',
            localField: 'expense',
            foreignField: '_id',
            as: 'expenseDetails'
          }
        },
        {
          $unwind: {
            path: '$expenseDetails',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: {
              isExpense: "$isExpense",
              expenseName: { $ifNull: ["$expenseDetails.name", "Vendor Payment"] }
            },
            total: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    console.log('💰 Other Financial Data:', { receiptResult, paymentResult });

    // Extract totals
    const totalReceipts = receiptResult[0]?.total || 0;
    
    // Process payment results
    const vendorPaymentsTotal = paymentResult
      .filter(p => p._id.isExpense === false)
      .reduce((sum, p) => sum + (p.total || 0), 0);

    const expensePaymentsBreakdown = paymentResult
      .filter(p => p._id.isExpense === true)
      .map(p => ({
        amount: p.total || 0,
        label: p._id.expenseName,
        count: p.count || 0
      }));

    const totalExpensePayments = expensePaymentsBreakdown.reduce((sum, exp) => sum + exp.amount, 0);

    // ✅ UPDATED: Trading Account Calculations using ledger data
    const costOfGoodsSold = openingStock + ledgerPurchases - closingStock;
    const grossProfit = ledgerSales - costOfGoodsSold;
    
    const totalIncome = ledgerSales + totalReceipts;
    const totalExpenses = costOfGoodsSold + vendorPaymentsTotal + totalExpensePayments;
    const netProfit = totalIncome - totalExpenses;

    // Calculate percentages with safe division
    const profitMargin = ledgerSales > 0 ? (grossProfit / ledgerSales) * 100 : 0;
    const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

    // ✅ UPDATED: Prepare the complete P&L data structure
    const profitLossData = {
      success: true,
      period: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        company: companyId || 'All Companies'
      },
      
      // Trading Account Section (from Daily Stock Ledger)
      trading: {
        openingStock: openingStock,
        purchases: ledgerPurchases,
        closingStock: closingStock,
        costOfGoodsSold: costOfGoodsSold,
        grossProfit: grossProfit,
        grossLoss: grossProfit < 0 ? Math.abs(grossProfit) : 0,
        sales: ledgerSales // ✅ ADDED: Sales from ledger
      },
      
      // Two-side P&L structure
      income: {
        total: totalIncome,
        breakdown: {
          sales: {
            amount: ledgerSales,
            label: "Sales",
            count: 0 // We don't have count from ledger yet
          },
          receipts: {
            amount: totalReceipts,
            label: "Receipts",
            count: receiptResult[0]?.count || 0
          }
        }
      },
      
      expenses: {
        total: totalExpenses,
        breakdown: {
          costOfGoodsSold: {
            amount: costOfGoodsSold,
            label: "Cost of Goods Sold",
            components: {
              openingStock: openingStock,
              purchases: ledgerPurchases,
              closingStock: closingStock
            }
          },
          vendorPayments: {
            amount: vendorPaymentsTotal,
            label: "Vendor Payments",
            count: paymentResult.filter(p => p._id.isExpense === false).reduce((sum, p) => sum + (p.count || 0), 0)
          },
          expenseBreakdown: expensePaymentsBreakdown
        }
      },
      
      // Summary section
      summary: {
        grossProfit,
        netProfit,
        totalIncome,
        totalExpenses,
        profitMargin: Math.round(profitMargin * 100) / 100,
        netMargin: Math.round(netMargin * 100) / 100,
        expenseRatio: Math.round(expenseRatio * 100) / 100,
        isProfitable: netProfit > 0
      },
      
      // Data source information
      dataSource: {
        stockData: "daily_stock_ledger",
        financialData: "transaction_entries",
        lastUpdated: new Date().toISOString()
      }
    };

    console.log('✅ Final P&L Data:', {
      grossProfit,
      netProfit,
      totalIncome,
      totalExpenses
    });

    res.status(200).json(profitLossData);

  } catch (err) {
    console.error("getProfitLossStatement error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate profit & loss statement",
      error: err.message
    });
  }
};

// ✅ UPDATED: Get simplified P&L for dashboard with Daily Stock Ledger
exports.getProfitLossSummary = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const { companyId, fromDate, toDate } = req.query;

    // Default to current month if no dates provided
    const startDate = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    console.log('📊 P&L Summary Period:', { startDate, endDate, companyId });

    // ✅ UPDATED: Get data from Daily Stock Ledger
    const [openingStock, closingStock, ledgerPurchases, ledgerSales] = await Promise.all([
      getOpeningStock(req.auth.clientId, companyId, startDate),
      getClosingStock(req.auth.clientId, companyId, endDate),
      getPurchasesFromLedger(req.auth.clientId, companyId, startDate, endDate),
      getSalesFromLedger(req.auth.clientId, companyId, startDate, endDate)
    ]);

    // Build base filter for other transactions
    const baseFilter = {
      date: { $gte: startDate, $lte: endDate },
      client: req.auth.clientId
    };

    if (companyId) {
      if (!companyAllowedForUser(req, companyId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this company"
        });
      }
      baseFilter.company = companyId;
    }

    // Get receipts and payments
    const [
      receiptResult,
      paymentResult
    ] = await Promise.all([
      ReceiptEntry.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      PaymentEntry.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const totalReceipts = receiptResult[0]?.total || 0;
    const totalPayments = paymentResult[0]?.total || 0;

    // ✅ UPDATED: Calculations using ledger data
    const costOfGoodsSold = openingStock + ledgerPurchases - closingStock;
    const totalIncome = ledgerSales + totalReceipts;
    const totalExpenses = costOfGoodsSold + totalPayments;
    const netProfit = totalIncome - totalExpenses;

    res.status(200).json({
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netProfit,
        grossProfit: ledgerSales - costOfGoodsSold,
        period: {
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0]
        },
        isProfitable: netProfit > 0,
        dataSource: "daily_stock_ledger"
      }
    });

  } catch (err) {
    console.error("getProfitLossSummary error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate profit & loss summary",
      error: err.message
    });
  }
};