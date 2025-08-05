const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");

router.post("/", verifyClientOrAdmin, paymentController.createPayment);
router.get("/", verifyClientOrAdmin, paymentController.getPayments);
router.put("/:id", verifyClientOrAdmin, paymentController.updatePayment);
router.delete("/:id", verifyClientOrAdmin, paymentController.deletePayment);
router.get("/by-client/:clientId", verifyClientOrAdmin, paymentController.getPaymentsByClient);

module.exports = router;
