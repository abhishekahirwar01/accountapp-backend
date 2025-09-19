const express = require("express");
const router = express.Router();
const updateNotificationController = require("../controllers/updateNotificationController");

const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const auth = require("../middleware/auth");

// Create a new update notification (only master admin can create)
router.post("/", verifyMasterAdmin, updateNotificationController.createUpdateNotification);

// Get update notifications for a specific master admin
router.get("/master/:masterId", verifyMasterAdmin, updateNotificationController.getUpdateNotificationsForMaster);

// Mark a section as explored
router.patch("/explore-section", verifyMasterAdmin, updateNotificationController.markSectionAsExplored);

// Dismiss an update notification (allow both master and clients)
router.patch("/dismiss/:notificationId", verifyClientOrAdmin, updateNotificationController.dismissUpdateNotification);

// Propagate update notification to clients
router.post("/propagate/:notificationId", verifyMasterAdmin, updateNotificationController.propagateToClients);

// Propagate to all users (clients, users, admins)
router.post("/propagate-all/:notificationId", verifyMasterAdmin, updateNotificationController.propagateToAllUsers);

// Propagate to admins only (clients and admins)
router.post("/propagate-admins/:notificationId", verifyMasterAdmin, updateNotificationController.propagateToAdminsOnly);

// Get update notifications for clients
router.get("/client/:userId", verifyClientOrAdmin, updateNotificationController.getUpdateNotificationsForClient);

// Get all update notifications (for admin dashboard)
router.get("/", verifyMasterAdmin, updateNotificationController.getAllUpdateNotifications);

module.exports = router;