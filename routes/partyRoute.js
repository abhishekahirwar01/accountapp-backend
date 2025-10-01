const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const partyController = require("../controllers/partyController");


// Create Product
router.post("/", verifyClientOrAdmin, partyController.createParty);


router.get("/", verifyClientOrAdmin, partyController.getParties);

router.get("/:partyId/balance",verifyClientOrAdmin, partyController.getPartyBalance);

router.get("/balances", verifyClientOrAdmin, partyController.getPartyBalancesBulk); // bulk
router.get("/:id", verifyClientOrAdmin, partyController.getPartyById);
router.put("/:id", verifyClientOrAdmin, partyController.updateParty);
router.delete("/:id", verifyClientOrAdmin, partyController.deleteParty);


module.exports = router;
