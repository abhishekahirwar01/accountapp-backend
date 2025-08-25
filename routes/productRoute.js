const express = require("express");
const router = express.Router();
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const productController = require("../controllers/productController");
const verifyUser = require("../middleware/verifyUser");

// Create Product
router.post("/", verifyClientOrAdmin, productController.createProduct);

router.get("/", verifyClientOrAdmin, productController.getProducts);


router.put("/:id", verifyClientOrAdmin, productController.updateProducts);
router.delete("/:id", verifyClientOrAdmin, productController.deleteProducts);


router.post("/update-stock", verifyClientOrAdmin, productController.updateStockBulk);

module.exports = router;
