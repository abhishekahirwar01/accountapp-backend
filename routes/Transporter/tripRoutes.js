const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../../middleware/verifyClientOrAdmin");
const tripController = require("../../controllers/Transporter/tripController");

// ==================== FIXED ROUTES FIRST ====================
router.post("/", verifyClientOrAdmin, tripController.createTrip);
router.get("/", verifyClientOrAdmin, tripController.getTrips);

// Dropdown routes (for select inputs) - MUST come before /:id routes
router.get("/dropdown/vehicles", verifyClientOrAdmin, tripController.getVehiclesByCompany);
router.get("/dropdown/drivers", verifyClientOrAdmin, tripController.getDriversByCompany);
router.get("/dropdown/customers", verifyClientOrAdmin, tripController.getCustomersByCompany);

// Stats routes
router.get("/stats/summary", verifyClientOrAdmin, tripController.getTripStats);

// Company-specific routes
router.get("/company/:companyId", verifyClientOrAdmin, tripController.getTripsByCompany);

// Status update
router.patch("/:id/status", verifyClientOrAdmin, tripController.updateTripStatus);



// ==================== PARAM ROUTES AFTER FIXED ROUTES ====================
router.put("/:id", verifyClientOrAdmin, tripController.updateTrip);
router.delete("/:id", verifyClientOrAdmin, tripController.deleteTrip);
router.get("/:id", verifyClientOrAdmin, tripController.getTripById);


router.post('/:id/expenses', tripController.addTripExpense);
router.delete('/:id/expenses/:expenseId', tripController.removeTripExpense);
router.put('/:id/expenses/:expenseId', tripController.updateTripExpense);

module.exports = router;