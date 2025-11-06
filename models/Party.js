const mongoose = require("mongoose");

const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: true,  trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    gstRegistrationType: {
      type: String,
      enum: [
        "Regular",
        "Composition",
        "Unregistered",
        "Consumer",
        "Overseas",
        "Special Economic Zone",
        "Unknown"
      ],
      default: "Unregistered",
    },
    pan: { type: String, uppercase: true, trim: true },
    isTDSApplicable: { type: Boolean, default: false },
    tdsRate: { type: Number },
    tdsSection: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
     balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);
partySchema.path('contactNumber').validate(async function (value) {
  if (!value) return true; // skip empty values
  const count = await mongoose.models.Party.countDocuments({
    contactNumber: value,
    createdByClient: this.createdByClient,
    _id: { $ne: this._id } // ignore self on update
  });
  return count === 0;
}, 'Contact number already exists for this client');

partySchema.path('email').validate(async function (value) {
  if (!value) return true; // skip empty values
  const count = await mongoose.models.Party.countDocuments({
    email: value,
    createdByClient: this.createdByClient,
    _id: { $ne: this._id }
  });
  return count === 0;
}, 'Email already exists for this client');;

module.exports = mongoose.model("Party", partySchema);
