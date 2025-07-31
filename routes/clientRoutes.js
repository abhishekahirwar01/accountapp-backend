const express = require("express");
const router = express.Router();
const { createClient, getClients } = require("../controllers/clientController");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");

// Create a client
router.post("/", verifyMasterAdmin, createClient);

// Get all clients created by logged-in master admin
router.get("/", verifyMasterAdmin, getClients);

module.exports = router;
