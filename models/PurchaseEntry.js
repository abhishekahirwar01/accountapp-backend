const mongoose = require("mongoose");

const UNIT_TYPES = ["Kg", "Litre", "Piece", "Box", "Meter", "Dozen", "Pack", "Other"];

const purchaseItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  unitType: { type: String, enum: UNIT_TYPES, default: "Piece" },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const purchaseServiceSchema = new mongoose.Schema({
  serviceName: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  amount: { type: Number, required: true, min: 1 },
  description: { type: String },
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  date: { type: Date, required: true },
  products: {
    type: [purchaseItemSchema],
    required: false,
    validate: {
      validator: function (v) {
        return !(this.products.length === 0 && this.services.length === 0);
      },
      message: 'At least one product or service is required'
    }
  },
  services: {
    type: [purchaseServiceSchema],
    required: false,
    validate: {
      validator: function (v) {
        return !(this.products.length === 0 && this.services.length === 0);
      },
      message: 'At least one product or service is required'
    }
  },
  totalAmount: { type: Number, required: true, min: 0 },

  description: { type: String },
  referenceNumber: { type: String },

  gstPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"] },
  gstin: { type: String },
  invoiceNumber: { type: String, index: true },   // e.g. "25-000123"
  invoiceYearYY: { type: Number, index: true },   // e.g. 25
}, { timestamps: true });

module.exports = mongoose.model("PurchaseEntry", purchaseSchema);