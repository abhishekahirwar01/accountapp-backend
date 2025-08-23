const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const salesController = require("../controllers/salesController");

// Create Sales Entry
router.post("/", verifyClientOrAdmin, salesController.createSalesEntry);

// Get All Sales Entries of Logged-in Client
router.get("/", verifyClientOrAdmin, salesController.getSalesEntries);
router.delete("/:id", verifyClientOrAdmin, salesController.deleteSalesEntry);
router.put("/:id", verifyClientOrAdmin, salesController.updateSalesEntry);
router.get("/by-client/:clientId",verifyClientOrAdmin , salesController.getSalesEntriesByClient);


module.exports = router;
