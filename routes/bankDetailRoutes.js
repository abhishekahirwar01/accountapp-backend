// routes/bankDetailRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/bankDetailController");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");

// Use your real auth middlewares here
// Example placeholders:
// const { requireAuth } = require("../middleware/auth");
// router.use(requireAuth);

router.post("/", verifyClientOrAdmin, ctrl.createBankDetail);
router.get("/", verifyClientOrAdmin, ctrl.getBankDetails);
router.get("/:id", verifyClientOrAdmin, ctrl.getBankDetailById);
router.put("/:id", verifyClientOrAdmin, ctrl.updateBankDetail);
router.delete("/:id", verifyClientOrAdmin, ctrl.deleteBankDetail);
router.get("/options", verifyClientOrAdmin, ctrl.listBanksForCompany);

module.exports = router;
