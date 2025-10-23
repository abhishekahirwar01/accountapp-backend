const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const vendorController = require("../controllers/vendorController");
const { route } = require("./userRoutes");

// Create Product
router.post("/", verifyClientOrAdmin, vendorController.createVendor);
router.get("/", verifyClientOrAdmin, vendorController.getVendors);
router.get("/:vendorId/balance", verifyClientOrAdmin, vendorController.getVendorBalance);
router.get("/balances", verifyClientOrAdmin, vendorController.getVendorBalancesBulk); // bulk
router.put("/:id", verifyClientOrAdmin, vendorController.updateVendor);
router.delete("/:id", verifyClientOrAdmin, vendorController.deleteVendor);


module.exports = router;
