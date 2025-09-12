// controllers/notificationController.js
const Notification = require("../models/Notification");

// Create a new notification
exports.createNotification = async (message, recipientId, senderId, actionType, entryType, entryId) => {
  try {
    const notification = new Notification({
      message,
      recipient: recipientId,
      sender: senderId,
      actionType,
      entryType,
      entryId,
    });

    await notification.save();
    return notification;
  } catch (err) {
    console.error("Error creating notification:", err);
    throw new Error("Failed to create notification");
  }
};

// Fetch all notifications for a client
exports.getClientNotifications = async (clientId) => {
  try {
    const notifications = await Notification.find({ recipient: clientId })
      .populate("sender", "contactName email")
      .populate("entryId")
      .lean();
    return notifications;
  } catch (err) {
    console.error("Error fetching notifications:", err);
    throw new Error("Failed to fetch notifications");
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (notificationId) => {
  try {
    const notification = await Notification.findByIdAndUpdate(notificationId, { read: true }, { new: true });
    return notification;
  } catch (err) {
    console.error("Error marking notification as read:", err);
    throw new Error("Failed to mark notification as read");
  }
};
