const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const vendorController = require("../controllers/vendorController");
const { route } = require("./userRoutes");

// Create Product
router.post("/", verifyClientOrAdmin, vendorController.createVendor);
router.get("/", verifyClientOrAdmin, vendorController.getVendors);
router.put("/:id", verifyClientOrAdmin, vendorController.updateVendor);
router.delete("/:id", verifyClientOrAdmin, vendorController.deleteVendor);


module.exports = router;
