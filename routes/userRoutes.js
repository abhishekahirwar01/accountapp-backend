const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const  verifyClientOrAdmin  = require("../middleware/verifyClientOrAdmin");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");

router.post("/", verifyClientOrAdmin, userController.createUser);
router.get("/", verifyClientOrAdmin, userController.getUsers);
router.put("/:id", verifyClientOrAdmin, userController.updateUser);
router.delete("/:id", verifyClientOrAdmin, userController.deleteUser);
router.get("/by-client/:clientId",verifyMasterAdmin, userController.getUsersByClient);


module.exports = router;
