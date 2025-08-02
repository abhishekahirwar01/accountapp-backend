const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const  verifyClientOrAdmin  = require("../middleware/verifyClientOrAdmin");

router.post("/", verifyClientOrAdmin, userController.createUser);
router.get("/", verifyClientOrAdmin, userController.getUsers);
router.put("/:id", verifyClientOrAdmin, userController.updateUser);
router.delete("/:id", verifyClientOrAdmin, userController.deleteUser);


module.exports = router;
