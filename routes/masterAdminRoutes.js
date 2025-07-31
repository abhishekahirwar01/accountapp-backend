const express = require("express");
const router = express.Router();
const {
  registerMasterAdmin,
  loginMasterAdmin
} = require("../controllers/masterAdminController");

// For initial setup only
router.post("/register", registerMasterAdmin);

// Login with username/password
router.post("/login", loginMasterAdmin);

module.exports = router;
