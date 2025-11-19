const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const partyController = require("../controllers/partyController");
<<<<<<< HEAD

=======
const multer = require("multer");

// Set up multer storage for file handling (same as products)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});
>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02

// Create Product
router.post("/", verifyClientOrAdmin, partyController.createParty);


router.get("/", verifyClientOrAdmin, partyController.getParties);

<<<<<<< HEAD
router.get("/:id", verifyClientOrAdmin, partyController.getParty);

router.get("/:partyId/balance",verifyClientOrAdmin, partyController.getPartyBalance);

router.get("/balances", verifyClientOrAdmin, partyController.getPartyBalancesBulk); // bulk
router.get("/:id", verifyClientOrAdmin, partyController.getPartyById);
router.put("/:id", verifyClientOrAdmin, partyController.updateParty);
router.delete("/:id", verifyClientOrAdmin, partyController.deleteParty);


=======
// Specific routes before generic :id
router.get("/balances", verifyClientOrAdmin, partyController.getPartyBalancesBulk); // bulk
router.get("/:partyId/balance",verifyClientOrAdmin, partyController.getPartyBalance);
router.put('/:partyId/balance', partyController.updatePartyBalance);
router.get("/:id", verifyClientOrAdmin, partyController.getParty);
router.put("/:id", verifyClientOrAdmin, partyController.updateParty);
router.delete("/:id", verifyClientOrAdmin, partyController.deleteParty);

router.post("/import", verifyClientOrAdmin, upload.single("file"), partyController.importParties);
>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02
module.exports = router;
