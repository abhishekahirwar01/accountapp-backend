const express = require("express");
const router = express.Router();
const { createClient, getClients, loginClient, updateClient, deleteClient, resetPassword , getClientById, setUserLimit , checkUsername} = require("../controllers/clientController");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
const verifyClient = require("../middleware/verifyClient")
const rateLimit = require("express-rate-limit");
const usernameCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 checks/min/IP
  standardHeaders: true,
  legacyHeaders: false,
});
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

//PUT set user limit

router.put("/:clientId/user-limit",verifyMasterAdmin, setUserLimit)

//client login
// PUBLIC: no middleware here
router.post("/:slug/login", loginClient);

router.get("/check-username", usernameCheckLimiter, checkUsername);

// router.post('/login-debug', loginClient);
module.exports = router;
