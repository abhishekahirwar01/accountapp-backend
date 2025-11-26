// routes/profitLossRoutes.js
const express = require('express');
const router = express.Router();
const profitLossController = require('../controllers/profitLossController');
const DailyStockLedgerService = require('../services/stockLedgerService');
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");


// routes/profitLossRoutes.js
const ensureTodayLedger = async (req, res, next) => {
  try {
    const { companyId } = req.query;

    // ✅ HANDLE "all" CASE - Skip ledger check for consolidated data
    if (companyId === "all") {
      console.log('📊 Consolidated data requested for all companies');
      return next();
    }

    // ✅ ALLOW CONSOLIDATED DATA - No companyId means all allowed companies
    if (!companyId) {
      console.log('📊 Consolidated data requested for all allowed companies');
      return next();
    }

    // 🎯 Ensure today's ledger exists for specific company
    await DailyStockLedgerService.ensureTodayLedgerExists(companyId, req.auth.clientId);

    next();
  } catch (error) {
    console.error('Ensure today ledger middleware error:', error);
    return res.status(500).json({
      message: "Failed to initialize today's ledger",
      error: error.message
    });
  }
};
// ✅ ADD AUTHENTICATION MIDDLEWARE to all routes
router.use(verifyClientOrAdmin);

// Profit & Loss statement with detailed breakdown
router.get('/statement', ensureTodayLedger, profitLossController.getProfitLossStatement);

// Simplified P&L summary for dashboards
router.get('/summary', ensureTodayLedger, profitLossController.getProfitLossSummary);

module.exports = router;