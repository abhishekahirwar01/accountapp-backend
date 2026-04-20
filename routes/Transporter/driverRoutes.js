const express = require('express');
const router = express.Router();
const {
  createDriver,
  getAllDrivers,
  getDriverById,
  getDriverByName,
  getDriverTrips,
  getDriverMonthlyReport,
  getDriverStatsSummary,
  updateDriver,
  updateDriverStatus,
  syncDriverStats,
  deleteDriver
} = require('../../controllers/Transporter/driverController');
const verifyClientOrAdmin = require("../../middleware/verifyClientOrAdmin");

// Apply middleware to ALL routes in this router
router.use(verifyClientOrAdmin);

// Stats routes (must be before /:id routes)
router.get('/stats/summary', getDriverStatsSummary);

// Search routes
router.get('/name/:name', getDriverByName);

// Driver trips
router.get('/:id/trips', getDriverTrips);
router.get('/:id/monthly-report', getDriverMonthlyReport);

// Sync & status
router.post('/:id/sync-stats', syncDriverStats);
router.patch('/:id/status', updateDriverStatus);

// CRUD routes
router.route('/')
  .post(createDriver)
  .get(getAllDrivers);

router.route('/:id')
  .get(getDriverById)
  .put(updateDriver)
  .delete(deleteDriver);

module.exports = router;