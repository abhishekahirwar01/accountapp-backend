// controllers/profitLossController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const PurchaseEntry = require("../models/PurchaseEntry");
const ReceiptEntry = require("../models/ReceiptEntry");
const PaymentEntry = require("../models/PaymentEntry");
const Product = require("../models/Product");
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

// controllers/profitLossController.js

// Calculate stock values at a specific date
async function calculateStockValues(clientId, companyId, targetDate) {
  try {
    // Get all products for this client
    const products = await Product.find({ 
      createdByClient: new mongoose.Types.ObjectId(clientId) 
    });

    // For now, we're using current stock values
    // In a real system, you'd need to track stock changes over time
    const totalStockValue = products.reduce((total, product) => {
      return total + (product.stocks * product.sellingPrice);
    }, 0);

    return totalStockValue;
  } catch (error) {
    console.error("Error calculating stock values:", error);
    return 0;
  }
}

// Get opening stock (stock value at the beginning of the period)
async function getOpeningStock(clientId, companyId, startDate) {
  try {
    // For now, we'll use the current stock value as opening stock
    // In production, you need to implement historical stock tracking
    const currentStock = await calculateStockValues(clientId, companyId, startDate);
    
    // Temporary: Assume opening stock is current stock minus purchases made during period
    // This is a simplification - you need proper stock tracking
    const baseFilter = {
      date: { $gte: startDate },
      client: new mongoose.Types.ObjectId(clientId)
    };
    
    if (companyId) {
      baseFilter.company = new mongoose.Types.ObjectId(companyId);
    }
    
    const purchasesDuringPeriod = await PurchaseEntry.aggregate([
      { $match: baseFilter },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    
    const totalPurchases = purchasesDuringPeriod[0]?.total || 0;
    
    // Rough estimate: Opening stock = Current stock - Purchases during period
    return Math.max(0, currentStock - totalPurchases);
    
  } catch (error) {
    console.error("Error getting opening stock:", error);
    return 0;
  }
}

// Get closing stock (stock value at the end of the period)
async function getClosingStock(clientId, companyId, endDate) {
  try {
    // For now, using current stock value as closing stock
    // In production, you need to implement historical stock tracking
    return await calculateStockValues(clientId, companyId, endDate);
  } catch (error) {
    console.error("Error getting closing stock:", error);
    return 0;
  }
}

// Calculate cost of goods sold from sales entries
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
          // In real system, you'd track actual cost price
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


// Main Profit & Loss function
// Main Profit & Loss function with Trading Account
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

    // ✅ ADDED: Calculate stock values for Trading Account
    const openingStock = await getOpeningStock(req.auth.clientId, companyId, startDate);
    const closingStock = await getClosingStock(req.auth.clientId, companyId, endDate);

    // Build base filter
    const baseFilter = {
      date: { $gte: startDate, $lte: endDate },
      client: new mongoose.Types.ObjectId(req.auth.clientId)
    };

    console.log('Base filter:', baseFilter);
    console.log('Date range:', { startDate, endDate });
    console.log('Stock values:', { openingStock, closingStock }); // ✅ ADDED

    // Debug: Check total count of documents in collections
    const salesCount = await SalesEntry.countDocuments();
    const purchaseCount = await PurchaseEntry.countDocuments();
    const receiptCount = await ReceiptEntry.countDocuments();
    const paymentCount = await PaymentEntry.countDocuments();
    console.log('Total documents in collections:', { salesCount, purchaseCount, receiptCount, paymentCount });

    // Debug: Try simple find query
    const salesDocs = await SalesEntry.find({ ...baseFilter, paymentMethod: { $ne: "Credit" } }).limit(5);
    console.log('Sample sales documents found:', salesDocs.length, salesDocs.map(doc => ({ id: doc._id, totalAmount: doc.totalAmount, paymentMethod: doc.paymentMethod, date: doc.date })));

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

    // Fetch all data in parallel with aggregation for better performance
    const [
      salesResult,
      purchaseResult,
      receiptResult,
      paymentResult
    ] = await Promise.all([
      // Sales aggregation (only non-credit for immediate income)
      SalesEntry.aggregate([
        { $match: { ...baseFilter, paymentMethod: { $ne: "Credit" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
      ]),
      
      // Purchases aggregation (only non-credit for immediate expenses)
      PurchaseEntry.aggregate([
        { $match: { ...baseFilter, paymentMethod: { $ne: "Credit" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
      ]),
      
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

    console.log('Raw aggregation results:', { salesResult, purchaseResult, receiptResult, paymentResult });

    // Extract totals from aggregation results
    const totalSales = salesResult[0]?.total || 0;
    const totalPurchases = purchaseResult[0]?.total || 0;
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

    // ✅ CORRECTED: Trading Account Calculations
    const costOfGoodsSold = openingStock + totalPurchases - closingStock;
    const grossProfit = totalSales - costOfGoodsSold; // ✅ Correct gross profit formula
    
    const totalIncome = totalSales + totalReceipts;
    const totalExpenses = costOfGoodsSold + vendorPaymentsTotal + totalExpensePayments; // ✅ Include COGS in expenses
    const netProfit = totalIncome - totalExpenses;

    // Calculate percentages with safe division
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

    // ✅ UPDATED: Prepare the complete P&L data structure with Trading Account
    const profitLossData = {
      success: true,
      period: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        company: companyId || 'All Companies'
      },
      
      // ✅ ADDED: Trading Account Section
      trading: {
        openingStock: openingStock,
        purchases: totalPurchases,
        closingStock: closingStock,
        costOfGoodsSold: costOfGoodsSold,
        grossProfit: grossProfit,
        grossLoss: grossProfit < 0 ? Math.abs(grossProfit) : 0
      },
      
      // Two-side P&L structure
      income: {
        total: totalIncome,
        breakdown: {
          sales: {
            amount: totalSales,
            label: "Sales",
            count: salesResult[0]?.count || 0
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
          // ✅ UPDATED: Replace "purchases" with "costOfGoodsSold"
          costOfGoodsSold: {
            amount: costOfGoodsSold,
            label: "Cost of Goods Sold",
            components: {
              openingStock: openingStock,
              purchases: totalPurchases,
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
        profitMargin: Math.round(profitMargin * 100) / 100,
        netMargin: Math.round(netMargin * 100) / 100,
        expenseRatio: Math.round(expenseRatio * 100) / 100,
        isProfitable: netProfit > 0
      },
      
      // Quick stats
      quickStats: {
        totalTransactions: (salesResult[0]?.count || 0) + (purchaseResult[0]?.count || 0) +
                          (receiptResult[0]?.count || 0) + paymentResult.reduce((sum, p) => sum + (p.count || 0), 0),
        averageSale: (salesResult[0]?.count || 0) > 0 ? totalSales / (salesResult[0]?.count || 1) : 0,
        averageExpense: paymentResult.reduce((sum, p) => sum + (p.count || 0), 0) > 0 ?
          totalExpenses / paymentResult.reduce((sum, p) => sum + (p.count || 0), 0) : 0
      }
    };

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

// Get simplified P&L for dashboard (lightweight)
exports.getProfitLossSummary = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const { companyId, fromDate, toDate } = req.query;

    // Default to current month if no dates provided
    const startDate = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

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

    // Use aggregation for better performance
    const [
      salesResult,
      purchaseResult,
      receiptResult,
      paymentResult
    ] = await Promise.all([
      SalesEntry.aggregate([
        { $match: { ...baseFilter, paymentMethod: { $ne: "Credit" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ]),
      PurchaseEntry.aggregate([
        { $match: { ...baseFilter, paymentMethod: { $ne: "Credit" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ]),
      ReceiptEntry.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      PaymentEntry.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const totalSales = salesResult[0]?.total || 0;
    const totalPurchases = purchaseResult[0]?.total || 0;
    const totalReceipts = receiptResult[0]?.total || 0;
    const totalPayments = paymentResult[0]?.total || 0;

    const totalIncome = totalSales + totalReceipts;
    const totalExpenses = totalPurchases + totalPayments;
    const netProfit = totalIncome - totalExpenses;

    res.status(200).json({
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netProfit,
        grossProfit: totalSales - totalPurchases,
        period: {
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0]
        },
        isProfitable: netProfit > 0
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
