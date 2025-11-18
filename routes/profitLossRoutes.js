// routes/profitLossRoutes.js
const express = require('express');
const router = express.Router();
const profitLossController = require('../controllers/profitLossController');

// Profit & Loss statement with detailed breakdown
router.get('/statement', profitLossController.getProfitLossStatement);

// Simplified P&L summary for dashboards
router.get('/summary', profitLossController.getProfitLossSummary);

module.exports = router;