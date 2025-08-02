const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    contactNumber: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: ["user"],
      default: "user"
    },
    permissions: {
      type: [String], 
      default: []
    },
    companies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company"
      }
    ],
    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
