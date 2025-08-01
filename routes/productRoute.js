const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const productController = require("../controllers/productController");

// Create Product
router.post("/", verifyClientOrAdmin, productController.createProduct);


module.exports = router;
