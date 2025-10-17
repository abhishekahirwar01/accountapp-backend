const express = require("express");
const router = express.Router();

const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const serviceController = require("../controllers/serviceController");

// ---- Fixed routes FIRST ----
router.post("/", verifyClientOrAdmin, serviceController.createService);
router.get("/", verifyClientOrAdmin, serviceController.getServices);

// Optional bulk amount update (only if you added this in controller)
// router.post("/bulk-amount", verifyClientOrAdmin, serviceController.updateServiceRatesBulk);

// ---- Param routes AFTER fixed routes ----
router.put("/:id", verifyClientOrAdmin, serviceController.updateService);
router.delete("/:id", verifyClientOrAdmin, serviceController.deleteService);

router.get("/:id", verifyClientOrAdmin, serviceController.getServiceById);

module.exports = router;
