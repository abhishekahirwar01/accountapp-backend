const express = require("express");
const router = express.Router();
<<<<<<< HEAD

const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const serviceController = require("../controllers/serviceController");
=======
const multer = require("multer");

const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const serviceController = require("../controllers/serviceController");
// Set up multer storage for file handling
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02

// ---- Fixed routes FIRST ----
router.post("/", verifyClientOrAdmin, serviceController.createService);
router.get("/", verifyClientOrAdmin, serviceController.getServices);

// Optional bulk amount update (only if you added this in controller)
// router.post("/bulk-amount", verifyClientOrAdmin, serviceController.updateServiceRatesBulk);

// ---- Param routes AFTER fixed routes ----
router.put("/:id", verifyClientOrAdmin, serviceController.updateService);
router.delete("/:id", verifyClientOrAdmin, serviceController.deleteService);

router.get("/:id", verifyClientOrAdmin, serviceController.getServiceById);

<<<<<<< HEAD
=======
router.get('/import/template',verifyClientOrAdmin, serviceController.downloadImportTemplate);


router.post('/import', verifyClientOrAdmin , upload.single('file'), serviceController.importServices);

>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02
module.exports = router;
