const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../../middleware/verifyClientOrAdmin");
const vehicleController = require("../../controllers/Transporter/vehicleController");

// ==================== FIXED ROUTES FIRST ====================
router.post("/", verifyClientOrAdmin, vehicleController.createVehicle);
router.get("/", verifyClientOrAdmin, vehicleController.getVehicles);

// Dropdown route (for select inputs)
router.get("/dropdown", verifyClientOrAdmin, vehicleController.getVehicleDropdown);

// Stats summary
router.get("/stats/summary", verifyClientOrAdmin, vehicleController.getVehicleStatsSummary);

// Company-specific routes
router.get("/company/:companyId", verifyClientOrAdmin, vehicleController.getVehiclesByCompany);

// Vehicle trips and revenue
router.get("/:id/trips", verifyClientOrAdmin, vehicleController.getVehicleTrips);
router.get("/:id/revenue", verifyClientOrAdmin, vehicleController.getVehicleRevenue);

// Sync stats
router.post("/:id/sync-stats", verifyClientOrAdmin, vehicleController.syncVehicleStats);
router.patch("/:id/status", verifyClientOrAdmin, vehicleController.updateVehicleStatus);

// ==================== PARAM ROUTES AFTER FIXED ROUTES ====================
router.put("/:id", verifyClientOrAdmin, vehicleController.updateVehicle);
router.delete("/:id", verifyClientOrAdmin, vehicleController.deleteVehicle);
router.get("/:id", verifyClientOrAdmin, vehicleController.getVehicleById);

module.exports = router;