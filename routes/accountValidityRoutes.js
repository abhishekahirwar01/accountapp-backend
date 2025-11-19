// routes/accountValidityRoutes.js
const express = require("express");
const router = express.Router();
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
<<<<<<< HEAD
const { setValidity, getValidity, disableValidity, updateValidityPartial} = require("../controllers/accountValidityController");

router.put("/:clientId/validity", verifyMasterAdmin, setValidity);      // create/update
=======
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin")
const { setValidity, getValidity, disableValidity, updateValidityPartial, getMyValidity} = require("../controllers/accountValidityController");

router.put("/:clientId/validity", verifyMasterAdmin, setValidity);      // create/update
router.get("/me/validity", verifyClientOrAdmin, getMyValidity);
>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02
router.get("/:clientId/validity", verifyMasterAdmin, getValidity);      // read
router.patch("/:clientId/validity", verifyMasterAdmin, updateValidityPartial); 
router.patch("/:clientId/validity/disable", verifyMasterAdmin, disableValidity);

<<<<<<< HEAD
=======

>>>>>>> a7756808d93daba6c776a5c3399b3d423d2d5b02
module.exports = router;
