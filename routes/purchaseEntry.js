const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const purchaseController = require("../controllers/purchaseController");

// Create Purchase Entry
router.post("/", verifyClientOrAdmin, purchaseController.createPurchaseEntry);


// // Get All Purchase Entries of Logged-in Client
router.get("/", verifyClientOrAdmin, purchaseController.getPurchaseEntries);

// // Get Purchase Entry by ID
// router.get("/:id", verifyClientOrMaster, purchaseController.getPurchaseEntryById);

// // Update Purchase Entry
// router.put("/:id", verifyClientOrMaster, purchaseController.updatePurchaseEntry);

// // Delete Purchase Entry
// router.delete("/:id", verifyClientOrMaster, purchaseController.deletePurchaseEntry);

module.exports = router;
