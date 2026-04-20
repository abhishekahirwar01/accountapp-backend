const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    registrationNo: {
      type: String,
      required: [true, "Registration number is required"],
      uppercase: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      enum: ["Truck", "Container", "Pickup", "Trailer", "Lorry", "Mini Truck"],
      required: [true, "Vehicle type is required"],
    },
    brand: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
    },
    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      description: "Capacity in tons",
    },
    fuelType: {
      type: String,
      enum: ["Diesel", "Petrol", "CNG", "Electric"],
      default: "Diesel",
    },
    fuelEfficiency: {
      type: Number,
      description: "km per liter",
    },

    // Financial Details
    purchaseDate: {
      type: Date,
    },
    purchasePrice: {
      type: Number,
    },
    insuranceValidTill: {
      type: Date,
    },
    fitnessValidTill: {
      type: Date,
    },
    permitValidTill: {
      type: Date,
    },
    pollutionValidTill: {
      type: Date,
    },

    // Status
    status: {
      type: String,
      enum: ["Active", "Under Maintenance", "Retired", "On Trip"],
      default: "Active",
    },

    // Statistics (auto-calculated from trips)
    totalTrips: {
      type: Number,
      default: 0,
    },
    totalDistance: {
      type: Number,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    totalExpenses: {
      type: Number,
      default: 0,
    },
    lastTripDate: {
      type: Date,
    },

    // Documents
    documents: {
      rcCopy: String,
      insuranceCopy: String,
      fitnessCopy: String,
      permitCopy: String,
      pollutionCopy: String,
    },

    // Owner Details
    ownerName: String,
    ownerContact: String,

    notes: String,

    // 🔗 MULTI-TENANCY: Following Service module pattern
    // Legacy single-company mapping (kept for backward compatibility)
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },

    // New multi-company mapping. Empty/missing means global (all companies)
    companies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Company" }],

    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Unique per client: registration number must be unique within a client
vehicleSchema.index({ registrationNo: 1, createdByClient: 1 }, { unique: true });

module.exports = mongoose.model("Vehicle", vehicleSchema);