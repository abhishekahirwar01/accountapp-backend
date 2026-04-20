const mongoose = require("mongoose");

const UNIT_TYPES = ["Kg", "Litre", "Piece", "Box", "Meter", "Dozen", "Pack", "Other"];

const proformaItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  unitType: { type: String, enum: UNIT_TYPES, default: "Piece" },
  otherUnit: { type: String },
  amount: { type: Number, required: true, min: 0 },
  // New fields to store GST-related information
  gstPercentage: { type: Number, default: 18 },  // Default GST percentage can be set here
  lineTax: { type: Number, required: true, min: 0 }, // GST amount for this product line
  lineTotal: { type: Number, required: true, min: 0 }, // Final total with GST
  hsn: { type: String, trim: true },
}, { _id: false });

const proformaServiceSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  amount: { type: Number, required: true, min: 0 },  // ← change min: 1 to min: 0
  description: { type: String },
  quantity: { type: Number, default: 1 },
  unitType: { type: String, default: "Hours" },
  pricePerUnit: { type: Number, default: 0 },
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },
  gstPercentage: { type: Number, default: 18 },
  lineTax: { type: Number, default: 0, min: 0 },
  lineTotal: { type: Number, default: 0, min: 0 },
  sac: { type: String, trim: true },
  serviceStartDate: { type: Date },
  serviceDueDate: { type: Date },
  travelDate: { type: Date },
  travelFrom: { type: String },
  travelTo: { type: String },
  vehicleType: { type: String },
  vehicleNumber: { type: String },
  fixedCharges: { type: Number, default: 0 },
  variableQty: { type: Number, default: 0 },
  variableUnit: { type: String, default: "Km" },
  variableRate: { type: Number, default: 0 },
  variableCharges: { type: Number, default: 0 },
}, { _id: false });

const proformaTravelServiceSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
  serviceName: { type: String },
  amount: { type: Number, default: 0 },
  description: { type: String },
  quantity: { type: Number, default: 1 },
  unitType: { type: String, default: "Km" },
  pricePerUnit: { type: Number, default: 0 },

  // Travel-specific fields
  travelDate: { type: Date },
  travelFrom: { type: String },
  travelTo: { type: String },
  vehicleType: { type: String },
  vehicleNumber: { type: String },
  driverName: { type: String },
  driverContact: { type: String },
  totalDistance: { type: Number, default: 0 },
  returnTrip: { type: Boolean, default: false },

  // Billing structure
  fixedCharges: { type: Number, default: 0 },
  variableQty: { type: Number, default: 0 },
  variableUnit: { type: String, default: "Km" },
  variableRate: { type: Number, default: 0 },
  variableCharges: { type: Number, default: 0 },

  // Additional charges
  waitingCharges: { type: Number, default: 0 },
  overnightCharges: { type: Number, default: 0 },
  tollTax: { type: Number, default: 0 },
  parkingCharges: { type: Number, default: 0 },

  // GST fields
  gstPercentage: { type: Number, default: 18 },
  lineTax: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
  sac: { type: String, trim: true },

  // Discount
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },

  // Dates
  serviceStartDate: { type: Date },
  serviceDueDate: { type: Date },
}, { _id: false });

// Courier item schema - for individual items within a courier service
const courierItemSchema = new mongoose.Schema({
  // Item billing details
  weight: { type: Number, default: 0, min: 0 },
  // noOfPackages: { type: Number, default: 1, min: 1 },
  length: { type: Number, default: 0, min: 0 },
  breadth: { type: Number, default: 0, min: 0 },
  height: { type: Number, default: 0, min: 0 },
  volumeWeight: { type: Number, default: 0, min: 0 },
  rate: { type: Number, default: 0, min: 0 },
  extraCharges: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 }, // pre-discount gross amount

  // Discount fields
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 }, // calculated discount amount

  // GST fields
  gstPercentage: { type: Number, default: 18 },
  lineTax: { type: Number, default: 0, min: 0 },
  lineTotal: { type: Number, default: 0, min: 0 },

  // Item specific details
  description: { type: String, trim: true, default: "" },
  trackingNumber: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Pending" },
  itemName: { type: String, trim: true, default: "" },

  // Optional: item reference if you have a product/catalog
  itemReference: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  destination: { type: String, trim: true, default: "" },
}, { _id: false });

// Updated courier service schema - now contains items array
const courierServiceSchema = new mongoose.Schema({
  // Service-level details
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  serviceName: { type: String, trim: true, default: "" },
  sac: { type: String, trim: true, default: "996812" },
  description: { type: String, trim: true, default: "" },

  // Service dates and tracking
  bookingDate: { type: Date },
  trackingNumber: { type: String, trim: true, default: "" }, // Master tracking number
  status: { type: String, trim: true, default: "Pending" },

  // Sender details (common for all items in this service)
  senderDetails: {
    name: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, default: "" },
  },

  // Receiver details (common for all items in this service)
  receiverDetails: {
    name: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
     gstin: { type: String, trim: true, default: "" },
  },

  // Items array - THIS IS THE KEY CHANGE
  items: {
    type: [courierItemSchema],
    default: [],
    required: false,
  },

  // Service-level totals (sum of all items)
  totalTaxableAmount: { type: Number, default: 0, min: 0 },
  totalTaxAmount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, default: 0, min: 0 },

  // Optional: store discount at service level if needed
  serviceDiscountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  serviceDiscountValue: { type: Number, default: 0 },
}, { _id: false });



const proformaAdditionalServiceSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: "AdditionalService" },
  serviceName: { type: String },
  amount: { type: Number, default: 0 },
  description: { type: String },
  serviceStartDate: { type: Date },
  serviceDueDate: { type: Date },
}, { _id: false });

const proformaSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date },

  bank: { type: mongoose.Schema.Types.ObjectId, ref: "BankDetail" },
  shippingAddress: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingAddress" },

  products: {
    type: [proformaItemSchema],
    required: false,
    validate: {
      validator: function () {
        const p = Array.isArray(this.products) ? this.products.length : 0;
        const s = Array.isArray(this.services) ? this.services.length : 0;
        const t = Array.isArray(this.travelServices) ? this.travelServices.length : 0;
        const a = Array.isArray(this.additionalServices) ? this.additionalServices.length : 0;
        const c = Array.isArray(this.courierServices) ? this.courierServices.length : 0;
        return !(p === 0 && s === 0 && t === 0 && a === 0 && c === 0);
      },
      message: "At least one product or service is required",
    },
  },

  services: {
    type: [proformaServiceSchema],
    required: false,
    validate: {
      validator: function () {
        const p = Array.isArray(this.products) ? this.products.length : 0;
        const s = Array.isArray(this.services) ? this.services.length : 0;
        const t = Array.isArray(this.travelServices) ? this.travelServices.length : 0;
        const a = Array.isArray(this.additionalServices) ? this.additionalServices.length : 0;
        const c = Array.isArray(this.courierServices) ? this.courierServices.length : 0;
        return !(p === 0 && s === 0 && t === 0 && a === 0 && c === 0);
      },
      message: "At least one product or service is required",
    },
  },

  travelServices: {
    type: [proformaTravelServiceSchema],
    default: [],
  },

  courierServices: { 
    type: [courierServiceSchema],
    default: [],
  },

  additionalServices: {
    type: [proformaAdditionalServiceSchema],
    default: [],
  },

  totalAmount: { type: Number, required: true, min: 0 },

  description: { type: String },
  referenceNumber: { type: String },

  gstPercentage: { type: Number },
  discountPercentage: { type: Number },
  invoiceType: { type: String, enum: ["Tax", "Invoice"] },
  gstin: { type: String },
  invoiceNumber: { type: String, index: true },
  invoiceYearYY: { type: Number, index: true },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Credit", "UPI", "Bank Transfer", "Cheque"]
  },
  taxAmount: { type: Number, default: 0 },
  subTotal: { type: Number, default: 0 },
  notes: {
    type: String,
    default: ""
  },
}, { timestamps: true });

// Unique per company + year + number (ignore when not set)
proformaSchema.index(
  { company: 1, invoiceYearYY: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $exists: true, $type: "string" } } }
);

module.exports = mongoose.model("ProformaEntry", proformaSchema);