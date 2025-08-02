const Product = require("../models/Product");

exports.createProduct = async (req, res) => {
  try {
    const { name } = req.body;

    const product = new Product({
      name,
      createdByClient: req.user.id
    });

    await product.save();
    res.status(201).json({ message: "Product created", product });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Product already exists for this client" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find({ createdByClient: req.user.id });
    res.json(products);
  } catch (err) {
    res.status(500).json({message: "Server error", error:err.message})
  }
}