const mongoose = require("mongoose");

const UNIT_TYPES = ["Kg", "Litre", "Piece", "Box", "Meter", "Dozen", "Pack", "Other"];

const salesItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  unitType: { type: String, enum: UNIT_TYPES, default: "Piece" },
  amount: { type: Number, required: true, min: 0 },     // quantity * pricePerUnit
}, { _id: false });

const salesServiceSchema = new mongoose.Schema({
  serviceName: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  amount: { type: Number, required: true, min: 1 },
  description: { type: String },
}, { _id: false });

const salesSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  date: { type: Date, required: true },
  products: {
    type: [salesItemSchema],
    required: false,
    validate: {
      validator: function (v) {
        return !(this.products.length === 0 && this.service.length === 0);
      },
      message: 'At least one product or service is required'
    }
  },
  service: {
    type: [salesServiceSchema],
    required: false,
    validate: {
      validator: function (v) {
        return !(this.products.length === 0 && this.service.length === 0);
      },
      message: 'At least one product or service is required'
    }
  },
  totalAmount: { type: Number, required: true, min: 0 },

  description: { type: String },
  referenceNumber: { type: String },

  // optional/legacy
  gstPercentage: { type: Number },
  discountPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"] },
  gstin: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("SalesEntry", salesSchema);
