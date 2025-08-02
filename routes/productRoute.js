const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const productController = require("../controllers/productController");

// Create Product
router.post("/", verifyClientOrAdmin, productController.createProduct);

router.get("/", verifyClientOrAdmin , productController.getProducts);


module.exports = router;
