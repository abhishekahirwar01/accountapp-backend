const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const partyController = require("../controllers/partyController");

// Create Product
router.post("/", verifyClientOrAdmin, partyController.createParty);


module.exports = router;
