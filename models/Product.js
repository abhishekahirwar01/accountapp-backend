const mongoose = require("mongoose");
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true,  trim: true },
    stocks: { type: Number, default: 0, min: 0 },
    unit: { type: String, trim: true },
    hsn: { type: String, trim: true },
    createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// ❌ remove global unique on name
// ✅ add compound unique per tenant
productSchema.index({ createdByClient: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

module.exports = mongoose.model("Product", productSchema);

