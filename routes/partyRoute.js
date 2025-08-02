const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const partyController = require("../controllers/partyController");

// Create Product
router.post("/", verifyClientOrAdmin, partyController.createParty);


router.get("/", verifyClientOrAdmin, partyController.getParties);

router.put("/:id", verifyClientOrAdmin, partyController.updateParty);
router.delete("/:id", verifyClientOrAdmin, partyController.deleteParty);

module.exports = router;
