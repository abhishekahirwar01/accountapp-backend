const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    stocks: {
      type: Number,
      default: 0, // ✅ added stocks with default value
      min: 0,
    },
    createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client" }, // optional
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
