const mongoose = require("mongoose");
const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", unitSchema);