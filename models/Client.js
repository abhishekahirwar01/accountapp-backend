const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  masterAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "MasterAdmin" }, // who created
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema);
