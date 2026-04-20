const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  driverId: { type: String, unique: true, required: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, lowercase: true },
  licenseNo: { type: String, required: true, unique: true, uppercase: true },
  licenseValidTill: Date,
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  aadharNo: { type: String, unique: true, sparse: true },
  joiningDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Active', 'Inactive', 'On Leave', 'Suspended'], default: 'Active' },

  // Salary & Payment Details
  salaryType: { type: String, enum: ['Per Trip', 'Per Day', 'Monthly', 'Percentage'], default: 'Per Trip' },
  salaryPerTrip: { type: Number, default: 0 },
  salaryPerDay: { type: Number, default: 0 },
  monthlySalary: { type: Number, default: 0 },
  profitPercentage: { type: Number, default: 0 },
  bataPerDay: { type: Number, default: 300 },

  // Statistics (auto-calculated from trips)
  totalTrips: { type: Number, default: 0 },
  totalDistance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalBata: { type: Number, default: 0 },
  lastTripDate: { type: Date },
  createdByClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  company: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  }],

  // Documents
  documents: {
    licenseCopy: String,
    aadharCopy: String,
    photo: String
  },

  bankDetails: {
    accountNo: String,
    ifscCode: String,
    bankName: String,
    upiId: String
  },

  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },

  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

driverSchema.virtual('experience').get(function () {
  const years = Math.floor((new Date() - this.joiningDate) / (1000 * 60 * 60 * 24 * 365));
  return years;
});

driverSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

driverSchema.index({ name: 1 });
driverSchema.index({ phone: 1 });
driverSchema.index({ status: 1 });


driverSchema.path('phone').validate(async function (value) {
  if (!value) return true; // skip empty values
  const count = await mongoose.models.Driver.countDocuments({
    phone: value,
    createdByClient: this.createdByClient,
    company: { $in: this.company },
    _id: { $ne: this._id } // ignore self on update
  });
  return count === 0;
}, 'Phone number already exists for this client');

driverSchema.path('email').validate(async function (value) {
  if (!value) return true; // skip empty values
  const count = await mongoose.models.Driver.countDocuments({
    email: value,
    createdByClient: this.createdByClient,
    company: { $in: this.company },
    _id: { $ne: this._id }
  });
  return count === 0;
}, 'Email already exists for this client');;


module.exports = mongoose.model('Driver', driverSchema);
