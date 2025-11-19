const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const vendorController = require("../controllers/vendorController");
const { route } = require("./userRoutes");

// Create Product
router.post("/", verifyClientOrAdmin, vendorController.createVendor);
router.get("/", verifyClientOrAdmin, vendorController.getVendors);
<<<<<<< HEAD
=======
router.get("/:vendorId/balance", verifyClientOrAdmin, vendorController.getVendorBalance);
router.get("/balances", verifyClientOrAdmin, vendorController.getVendorBalancesBulk); // bulk
router.get("/:id", verifyClientOrAdmin, vendorController.getVendor);
>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02
router.put("/:id", verifyClientOrAdmin, vendorController.updateVendor);
router.delete("/:id", verifyClientOrAdmin, vendorController.deleteVendor);


module.exports = router;
