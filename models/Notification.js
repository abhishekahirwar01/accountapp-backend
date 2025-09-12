// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",  // Assuming Client model
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",  // Assuming User model for the person who triggered the action
    required: true,
  },
  actionType: {
    type: String,
    enum: ["create", "update", "delete"],
    required: true,
  },
  entryType: {
    type: String,
    enum: ["transaction", "company", "user"], // You can extend this to other entry types
    required: true,
  },
  entryId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "entryType",
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
