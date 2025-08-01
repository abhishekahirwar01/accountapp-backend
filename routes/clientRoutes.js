const express = require("express");
const router = express.Router();
const { createClient, getClients, loginClient, updateClient, deleteClient, resetPassword , getClientById} = require("../controllers/clientController");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");

// Create a client
router.post("/", verifyMasterAdmin, createClient);

// Get all clients created by logged-in master admin
router.get("/", verifyMasterAdmin, getClients);

// PATCH /api/clients/:id
router.patch("/:id", verifyMasterAdmin, updateClient);

// DELETE /api/clients/:id
router.delete("/:id", verifyMasterAdmin, deleteClient);


router.put("/reset-password/:id", verifyMasterAdmin, resetPassword);


// Get company by ID (client or master)
router.get("/:id", verifyMasterAdmin, getClientById);

//client login
router.post("/login", loginClient);
module.exports = router;
