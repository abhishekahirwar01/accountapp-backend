// routes/whatsappConnectionRoutes.js
const express = require('express');
const router = express.Router();
const whatsappConnectionController = require('../controllers/whatsappConnectionController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// @desc    Get active WhatsApp connection for client
// @route   GET /api/whatsapp/connection
// @access  Private (All authenticated users in client)
router.get('/connection', whatsappConnectionController.getClientConnection);

// @desc    Check connection status
// @route   GET /api/whatsapp/connection/status
// @access  Private (All authenticated users in client)
router.get('/connection/status', whatsappConnectionController.checkConnectionStatus);

// @desc    Create or update WhatsApp connection
// @route   POST /api/whatsapp/connection
// @access  Private (Customer role only - boss/admin)
router.post('/connection', (req, res, next) => {
  // Check if user is customer (boss/admin)
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only customer (admin) users can manage WhatsApp connections.'
    });
  }
  next();
}, whatsappConnectionController.createConnection);

// @desc    Delete (deactivate) WhatsApp connection
// @route   DELETE /api/whatsapp/connection
// @access  Private (Customer role only - boss/admin)
router.delete('/connection', (req, res, next) => {
  // Check if user is customer (boss/admin)
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only customer (admin) users can delete WhatsApp connections.'
    });
  }
  next();
}, whatsappConnectionController.deleteConnection);

// @desc    Get connection history
// @route   GET /api/whatsapp/connection/history
// @access  Private (Customer role only - boss/admin)
router.get('/connection/history', (req, res, next) => {
  // Check if user is customer (boss/admin)
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only customer (admin) users can view connection history.'
    });
  }
  next();
}, whatsappConnectionController.getConnectionHistory);

module.exports = router;