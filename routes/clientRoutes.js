const express = require("express");
const router = express.Router();
const { createClient, getClients ,loginClient} = require("../controllers/clientController");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");

// Create a client
router.post("/", verifyMasterAdmin, createClient);

// Get all clients created by logged-in master admin
router.get("/", verifyMasterAdmin, getClients);

//client login
router.post("/login", loginClient);
module.exports = router;
