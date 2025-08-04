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

exports.updateProducts = async(req, res) => {
  try {
      const productId = req.params.id;
      const { name } = req.body;
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "product not found" });
      }
  
      // Authorization check: only creator client or admin
      if (req.user.role !== "admin" && product.createdByClient.toString() !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this product" });
      }
  
      if (name) product.name = name;
     
  
      await product.save();
      res.status(200).json({ message: "product updated", product});
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: "Duplicate product details" });
      }
      res.status(500).json({ message: "Server error", error: err.message });
    }
}

exports.deleteProducts = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Party not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && product.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this product" });
    }

    await product.deleteOne();
    res.status(200).json({ message: "product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

