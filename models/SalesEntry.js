const mongoose = require("mongoose");

const UNIT_TYPES = ["Kg", "Litre", "Piece", "Box", "Meter", "Dozen", "Pack", "Other"];

const salesItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },
  unitType: { type: String, enum: UNIT_TYPES, default: "Piece" },
  otherUnit: { type: String },
  amount: { type: Number, required: true, min: 0 },
  // New fields to store GST-related information..
  gstPercentage: { type: Number, default: 18 },  // Default GST percentage can be set here
  lineTax: { type: Number, required: true, min: 0 }, // GST amount for this product line
  lineTotal: { type: Number, required: true, min: 0 }, // Final total with GST
  hsn: { type: String, trim: true },
}, { _id: false });

const salesServiceSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "serviceModel",
  },
  serviceModel: {
    type: String,
    enum: ["Service", "AdditionalService"],
    default: "Service",
  },
  isAdditionalService: { type: Boolean, default: false },
  quantity: { type: Number, default: 1, min: 0 },
  unitType: { type: String, default: "Hours" },
  pricePerUnit: { type: Number, default: 0, min: 0 },
  amount: { type: Number, required: true, min: 1 },
  description: { type: String },
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },

  // GST fields
  gstPercentage: { type: Number, default: 18 },
  lineTax: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  sac: { type: String, trim: true },

  // Service date fields (only basic ones)
  serviceStartDate: { type: Date },
  serviceDueDate: { type: Date },
}, { _id: false });


// New schema for travel services (all travel fields moved here)
const travelServiceSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Service", // or create separate "TravelService" model
  },
  serviceName: { type: String, trim: true },
  amount: { type: Number, required: true, min: 1 },
  description: { type: String, trim: true },

  // Travel-specific fields
  travelDate: { type: Date },
  travelFrom: { type: String, trim: true, default: "" },
  travelTo: { type: String, trim: true, default: "" },
  vehicleType: { type: String, trim: true, default: "" },
  vehicleNumber: { type: String, trim: true, default: "" },
  driverName: { type: String, trim: true, default: "" },
  driverContact: { type: String, trim: true, default: "" },
  serviceStartDate: { type: Date },
  serviceDueDate: { type: Date },

  // Trip details
  totalDistance: { type: Number, default: 0, min: 0 },
  returnTrip: { type: Boolean, default: false },

  // Billing structure
  fixedCharges: { type: Number, default: 0, min: 0 },
  variableQty: { type: Number, default: 0, min: 0 },
  variableUnit: { type: String, trim: true, default: "Km" },
  variableRate: { type: Number, default: 0, min: 0 },
  variableCharges: { type: Number, default: 0, min: 0 },

  // Quantity fields
  quantity: { type: Number, default: 1, min: 1 },
  unitType: { type: String, default: "Km" },
  pricePerUnit: { type: Number, default: 0, min: 0 },

  // GST fields
  gstPercentage: { type: Number, default: 18 },
  lineTax: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  sac: { type: String, trim: true },

  // Discount
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },

  // Additional travel info
  waitingCharges: { type: Number, default: 0, min: 0 },
  overnightCharges: { type: Number, default: 0, min: 0 },
  tollTax: { type: Number, default: 0, min: 0 },
  parkingCharges: { type: Number, default: 0, min: 0 },
}, { _id: false });

// Minimal stored shape for additional services on a sales entry
const additionalServiceLineSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdditionalService",
      required: true,
    },
    serviceName: { type: String, required: true }, // Store name for easy access without population
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    serviceStartDate: { type: Date },
    serviceDueDate: { type: Date },
    travelDate: { type: Date },
  },
  { _id: false },
);

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


const salesSchema = new mongoose.Schema({
  party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date },
  discountType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
  discountValue: { type: Number, default: 0 },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: "BankDetail" },
  shippingAddress: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingAddress" },

  products: {
    type: [salesItemSchema],
    required: false,
  },

  // Regular services
  services: {
    type: [salesServiceSchema],
    required: false,
  },

  // NEW: Travel services
  travelServices: {
    type: [travelServiceSchema],
    required: false,
    default: [],
  },

  // Courier services
  courierServices: {
    type: [courierServiceSchema],
    required: false,
    default: [],
  },

  // Additional services
  additionalServices: {
    type: [additionalServiceLineSchema],
    required: false,
    default: [],
  },

  totalAmount: { type: Number, required: true, min: 0 },

  advanceReceived: {
    type: Number,
    default: 0,
    min: 0
  },
  extraDiscount: {
    type: Number,
    default: 0
  },
  extraDiscountType: {
    type: String,
    enum: ["fixed", "percentage"],
    default: "fixed"
  },
  netPayable: {
    type: Number,
    default: 0
  },
  customRemark: {
    type: String,
    trim: true
  },
  invoiceTotal: {
    type: Number,
    required: true,
    default: 0
  },
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
    enum: ["Cash", "Credit", "UPI", "Bank Transfer", "Cheque", "Others"]
  },
  notes: {
    type: String,
    default: ""
  },

  stockImpact: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, required: true },
      cogs: { type: Number, required: true },
      batches: [
        {
          batchId: { type: mongoose.Schema.Types.ObjectId, ref: "StockBatch" },
          consumedQty: { type: Number, required: true },
          costPrice: { type: Number, required: true },
          cogs: { type: Number, required: true }
        }
      ]
    }
  ],

    subTotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
}, { timestamps: true });

// Update validation to include travelServices
salesSchema.pre("validate", function (next) {
  const p = Array.isArray(this.products) ? this.products.length : 0;
  const s = Array.isArray(this.services) ? this.services.length : 0;
  const t = Array.isArray(this.travelServices) ? this.travelServices.length : 0;
  const a = Array.isArray(this.additionalServices) ? this.additionalServices.length : 0;

  const c = Array.isArray(this.courierServices) ? this.courierServices.length : 0;

  if (p + s + t + a + c === 0) {
    return next(new Error("At least one product, service, travel service, courier service, or additional service is required"));
  }
  next();
});

// Keep the unique index
salesSchema.index(
  { company: 1, invoiceYearYY: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $exists: true, $type: "string" } } }
);


// Auto-calculate subtotal and tax amount before save
salesSchema.pre('save', function(next) {
  const isGstEnabled = this.gstin && this.gstin.trim() !== "";
  // Calculate subtotal (total before tax)
  const productsSubtotal = this.products?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
  const servicesSubtotal = this.services?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
  const travelSubtotal = this.travelServices?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
  const courierSubtotal = this.courierServices?.reduce((sum, c) => sum + (c.totalTaxableAmount || 0), 0) || 0;
  const additionalSubtotal = this.additionalServices?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0;
  
  this.subTotal = productsSubtotal + servicesSubtotal + travelSubtotal + courierSubtotal + additionalSubtotal;
  if (!isGstEnabled) {
    this.taxAmount = 0;
    
    if (this.travelServices && this.travelServices.length > 0) {
      this.travelServices.forEach(t => {
        t.lineTax = 0;
        t.lineTotal = t.amount;
        t.gstPercentage = 0; 
      });
    }
  } else {
  // Calculate total tax amount
  const productsTax = this.products?.reduce((sum, p) => sum + (p.lineTax || 0), 0) || 0;
  const servicesTax = this.services?.reduce((sum, s) => sum + (s.lineTax || 0), 0) || 0;
  const travelTax = this.travelServices?.reduce((sum, t) => sum + (t.lineTax || 0), 0) || 0;
  const courierTax = this.courierServices?.reduce((sum, c) => sum + (c.totalTaxAmount || 0), 0) || 0;
  
  this.taxAmount = productsTax + servicesTax + travelTax + courierTax;
  }
  // Ensure totalAmount is consistent
  const calculatedTotal = this.subTotal + this.taxAmount;
  if (Math.abs(this.totalAmount - calculatedTotal) > 0.01) {
    console.log(`⚠️ Total amount mismatch: ${this.totalAmount} vs calculated ${calculatedTotal}, using calculated value`);
    this.totalAmount = calculatedTotal;
  }
  
  next();
});

module.exports = mongoose.model("SalesEntry", salesSchema);
