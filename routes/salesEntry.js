const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const salesController = require("../controllers/salesController");

// Create Sales Entry
router.post("/", verifyClientOrAdmin, salesController.createSalesEntry);

// Get All Sales Entries of Logged-in Client
router.get("/", verifyClientOrAdmin, salesController.getSalesEntries);


// // Get Sales Entry by ID
// router.get("/:id", verifyClientOrMaster, salesController.getSalesEntryById);

// // Update Sales Entry
// router.put("/:id", verifyClientOrMaster, salesController.updateSalesEntry);

// // Delete Sales Entry
// router.delete("/:id", verifyClientOrMaster, salesController.deleteSalesEntry);

module.exports = router;
