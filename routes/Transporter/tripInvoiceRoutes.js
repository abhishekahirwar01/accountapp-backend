// routes/Transporter/tripInvoiceRoutes.js
const express = require('express');
const router = express.Router();
const verifyClientOrAdmin = require("../../middleware/verifyClientOrAdmin");
const tripInvoiceController = require('../../controllers/Transporter/tripInvoiceController');
const { authenticateToken } = require('../../middleware/auth');



// CRUD operations
router.post('/',verifyClientOrAdmin, tripInvoiceController.createTripInvoice);
router.get('/',verifyClientOrAdmin, tripInvoiceController.getTripInvoices);
router.get('/stats',verifyClientOrAdmin, tripInvoiceController.getInvoiceStats);
router.get('/:id',verifyClientOrAdmin, tripInvoiceController.getTripInvoiceById);
router.put('/:id',verifyClientOrAdmin, tripInvoiceController.updateTripInvoice);
router.delete('/:id',verifyClientOrAdmin, tripInvoiceController.deleteTripInvoice);

// Trip invoice generation and preview
router.post('/generate/:tripId',verifyClientOrAdmin, tripInvoiceController.generateTripInvoice);
router.get('/preview/:tripId',verifyClientOrAdmin, tripInvoiceController.previewTripInvoice);
router.get('/by-trip/:tripId',verifyClientOrAdmin, tripInvoiceController.getTripInvoiceByTripId);


// Additional operations- email invoice routes
router.post("/:id/send-email", verifyClientOrAdmin, tripInvoiceController.sendTripInvoiceEmail);
router.patch('/:id/mark-sent',verifyClientOrAdmin, tripInvoiceController.markInvoiceAsSent);
router.post('/:id/record-payment',verifyClientOrAdmin, tripInvoiceController.recordPayment);




module.exports = router;