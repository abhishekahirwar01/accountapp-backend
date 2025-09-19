const UpdateNotification = require("../models/UpdateNotification");
const MasterAdmin = require("../models/MasterAdmin");
const Client = require("../models/Client");
const User = require("../models/User");
const Notification = require("../models/Notification"); // For propagating to clients

// Create a new update notification for master admins
exports.createUpdateNotification = async (req, res) => {
  try {
    const { title, description, version, features } = req.body;

    // Validate required fields
    if (!title || !description || !version || !features || !Array.isArray(features)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get all master admins
    const masterAdmins = await MasterAdmin.find({});

    if (masterAdmins.length === 0) {
      return res.status(404).json({ message: "No master admins found" });
    }

    // Create notification for each master admin
    const notifications = [];
    for (const admin of masterAdmins) {
      const notification = new UpdateNotification({
        title,
        description,
        version,
        features,
        recipient: admin._id,
        visibility: 'all' // Explicitly set default visibility
      });
      await notification.save();
      notifications.push(notification);
    }

    // Emit real-time update via WebSocket (assuming io is available globally)
    if (global.io) {
      for (const admin of masterAdmins) {
        global.io.to(`master-${admin._id}`).emit('newUpdateNotification', {
          message: 'New update available',
          notification: notifications.find(n => n.recipient.toString() === admin._id.toString())
        });
      }
    }

    res.status(201).json({
      message: `Update notification created for ${notifications.length} master admin(s)`,
      notifications
    });
  } catch (err) {
    console.error("Error creating update notification:", err);
    res.status(500).json({ message: "Failed to create update notification" });
  }
};

// Get update notifications for a specific master admin
exports.getUpdateNotificationsForMaster = async (req, res) => {
  try {
    const { masterId } = req.params;

    const notifications = await UpdateNotification.find({
      recipient: masterId,
      dismissed: false
    })
    .sort({ createdAt: -1 })
    .lean();

    res.status(200).json({ notifications });
  } catch (err) {
    console.error("Error fetching update notifications:", err);
    res.status(500).json({ message: "Failed to fetch update notifications" });
  }
};

// Mark a section as explored
exports.markSectionAsExplored = async (req, res) => {
  try {
    const { notificationId, sectionUrl } = req.body;

    const notification = await UpdateNotification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Update notification not found" });
    }

    // Check if section exists in features
    const featureExists = notification.features.some(f => f.sectionUrl === sectionUrl);
    if (!featureExists) {
      return res.status(400).json({ message: "Invalid section URL" });
    }

    // Add to explored sections if not already there
    if (!notification.exploredSections.includes(sectionUrl)) {
      notification.exploredSections.push(sectionUrl);
      await notification.save();
    }

    // Removed auto-dismissal - dismissal is now manual via "Remove Notification" button

    res.status(200).json({ notification });
  } catch (err) {
    console.error("Error marking section as explored:", err);
    res.status(500).json({ message: "Failed to mark section as explored" });
  }
};

// Manually dismiss an update notification
exports.dismissUpdateNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.auth?.userId || req.user?.id || req.body.userId; // Get user ID from auth or body


    if (!userId) {
      console.log("User ID not found");
      return res.status(400).json({ message: "User ID not found" });
    }


    const notification = await UpdateNotification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Update notification not found" });
    }


    // Check if user is the recipient (master admin)
    if (notification.recipient.toString() === userId) {
      // Master admin dismissing their own notification
      notification.dismissed = true;
    } else {
      // Client dismissing the notification
      if (!notification.dismissedUsers.includes(userId)) {
        notification.dismissedUsers.push(userId);
      }
    }

    await notification.save();

    // Emit dismissal event to the appropriate user
    if (global.io) {
      if (notification.recipient.toString() === userId) {
        global.io.to(`master-${notification.recipient}`).emit('updateNotificationDismissed', {
          notificationId: notification._id
        });
      } else {
        global.io.to(`user-${userId}`).emit('updateNotificationDismissed', {
          notificationId: notification._id
        });
      }
    }

    res.status(200).json({ notification });
  } catch (err) {
    console.error("Error dismissing update notification:", err);
    res.status(500).json({ message: "Failed to dismiss update notification" });
  }
};

// Propagate update notification to clients and their users based on visibility
exports.propagateToClients = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { visibility = 'all', force = false } = req.body; // Default to 'all' for backward compatibility

    const updateNotification = await UpdateNotification.findById(notificationId);

    if (!updateNotification) {
      return res.status(404).json({ message: "Update notification not found" });
    }

    if (updateNotification.propagatedToClients && !force) {
      return res.status(400).json({ message: "Already propagated to clients. Use force=true to re-propagate." });
    }

    // Get all clients and users first
    const clients = await Client.find({});
    const allUsers = await User.find({}).populate('role');

    // Set visibility
    updateNotification.visibility = visibility;
    await updateNotification.save();

    // If force re-propagation, handle existing notifications
    if (force) {
      const existingNotifications = await Notification.find({
        entityId: updateNotification._id,
        type: 'system',
        action: 'update',
        entityType: 'UpdateNotification'
      });

      for (const existingNotif of existingNotifications) {
        // Check if it's a user notification (not client)
        const user = allUsers.find(u => u._id.toString() === existingNotif.recipient.toString());
        if (user) {
          const userRoleName = (user.role?.name || '').toLowerCase();
          const shouldNotify = visibility === 'all' || (visibility === 'admins' && userRoleName === 'admin');

          if (!shouldNotify) {
            // Remove notification from user who shouldn't see it
            await Notification.findByIdAndDelete(existingNotif._id);
          } else {
            // Update visibility in metadata
            existingNotif.metadata.visibility = visibility;
            await existingNotif.save();
          }
        } else {
          // For client notifications, just update visibility
          existingNotif.metadata.visibility = visibility;
          await existingNotif.save();
        }
      }
    }

    // Create regular notifications for clients and users based on visibility
    const propagatedNotifications = [];

    // Notify clients based on visibility
    if (visibility === 'all') {
      for (const client of clients) {
        const clientNotification = new Notification({
          title: `New Update Available: ${updateNotification.title}`,
          message: `Version ${updateNotification.version} is now available. Check out the new features!`,
          type: 'system',
          action: 'update',
          entityId: updateNotification._id,
          entityType: 'UpdateNotification',
          recipient: client._id,
          triggeredBy: updateNotification.recipient,
          client: client._id,
          read: false,
          metadata: {
            updateVersion: updateNotification.version,
            featuresCount: updateNotification.features.length,
            features: updateNotification.features,
            visibility: visibility,
            propagatedAt: new Date().toISOString()
          }
        });
        await clientNotification.save();
        propagatedNotifications.push(clientNotification);
      }
    }

    // Notify users based on visibility
    for (const user of allUsers) {
      const userRoleName = (user.role?.name || '').toLowerCase();
      const shouldNotify = visibility === 'all' ||
        (visibility === 'admins' && userRoleName === 'admin');

      if (shouldNotify) {
        const userNotification = new Notification({
          title: `New Update Available: ${updateNotification.title}`,
          message: `Version ${updateNotification.version} is now available for your account.`,
          type: 'system',
          action: 'update',
          entityId: updateNotification._id,
          entityType: 'UpdateNotification',
          recipient: user._id,
          triggeredBy: updateNotification.recipient,
          client: user.createdByClient || null,
          read: false,
          metadata: {
            updateVersion: updateNotification.version,
            featuresCount: updateNotification.features.length,
            features: updateNotification.features,
            visibility: visibility,
            propagatedAt: new Date().toISOString()
          }
        });
        await userNotification.save();
        propagatedNotifications.push(userNotification);
      }
    }

    // Mark as propagated
    updateNotification.propagatedToClients = true;
    updateNotification.propagatedAt = new Date();
    await updateNotification.save();

    // Emit propagation event to clients
    if (global.io) {
      for (const notification of propagatedNotifications) {
        global.io.to(`client-${notification.client}`).emit('newNotification', {
          message: 'New update notification',
          notification
        });
        global.io.to(`user-${notification.recipient}`).emit('newNotification', {
          message: 'New update notification',
          notification
        });
      }
    }

    res.status(200).json({
      message: `Propagated to ${propagatedNotifications.length} recipients`,
      propagatedCount: propagatedNotifications.length,
      visibility: visibility
    });
  } catch (err) {
    console.error("Error propagating to clients:", err);
    res.status(500).json({ message: "Failed to propagate to clients" });
  }
};

// Propagate to all users (clients, users, admins)
exports.propagateToAllUsers = async (req, res) => {
  req.body.visibility = 'all';
  return exports.propagateToClients(req, res);
};

// Propagate to admins only (clients and admins)
exports.propagateToAdminsOnly = async (req, res) => {
  req.body.visibility = 'admins';
  return exports.propagateToClients(req, res);
};

// Get update notifications for clients based on visibility
exports.getUpdateNotificationsForClient = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.user?.id;
    const userRole = (req.auth?.role || req.user?.role || "").toLowerCase();

    if (!userId) {
      return res.status(400).json({ message: "User ID not found" });
    }

    // Find update notifications that have been propagated to clients and not dismissed by this user
    const notifications = await UpdateNotification.find({
      propagatedToClients: true,
      dismissedUsers: { $ne: userId }, // Not dismissed by this user
      $or: [
        { visibility: 'all' },
        { visibility: 'admins' }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();

    // Filter based on visibility and user role
    const filteredNotifications = notifications.filter(notification => {
      if (notification.visibility === 'all') {
        return true;
      } else if (notification.visibility === 'admins') {
        // For admins visibility, show to clients and admins
        return ['client', 'admin', 'manager'].includes(userRole);
      }
      return false;
    });

    res.status(200).json({ notifications: filteredNotifications });
  } catch (err) {
    console.error("Error fetching update notifications for client:", err);
    res.status(500).json({ message: "Failed to fetch update notifications" });
  }
};

// Get all update notifications (for admin dashboard)
exports.getAllUpdateNotifications = async (req, res) => {
  try {
    const notifications = await UpdateNotification.find({})
      .populate('recipient', 'userName email')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ notifications });
  } catch (err) {
    console.error("Error fetching all update notifications:", err);
    res.status(500).json({ message: "Failed to fetch update notifications" });
  }
};
