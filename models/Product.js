const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true,lowercase: true, trim: true },
  createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client" }, // optional
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
