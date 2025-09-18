// Script to clean up test update notifications and regular notifications
// Run with: node scripts/cleanupTestNotifications.js

const mongoose = require('mongoose');
const UpdateNotification = require('../models/UpdateNotification');
const Notification = require('../models/Notification');
require('dotenv').config();

async function cleanupTestNotifications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clean up regular notifications created by the old script
    console.log('Cleaning up regular notifications...');
    const regularNotifications = await Notification.find({
      type: 'system',
      action: 'update',
      entityType: 'UpdateNotification'
    });

    console.log(`Found ${regularNotifications.length} regular update notifications to clean up`);

    for (const notification of regularNotifications) {
      await Notification.findByIdAndDelete(notification._id);
      console.log(`Deleted regular notification: ${notification._id}`);
    }

    // Clean up UpdateNotification records
    console.log('Cleaning up UpdateNotification records...');
    const allNotifications = await UpdateNotification.find({});
    console.log(`Found ${allNotifications.length} update notifications`);

    // Group by recipient
    const byRecipient = {};
    allNotifications.forEach(notification => {
      const recipientId = notification.recipient.toString();
      if (!byRecipient[recipientId]) {
        byRecipient[recipientId] = [];
      }
      byRecipient[recipientId].push(notification);
    });

    // For each recipient, keep only the most recent notification
    for (const [recipientId, notifications] of Object.entries(byRecipient)) {
      if (notifications.length > 1) {
        console.log(`Recipient ${recipientId} has ${notifications.length} notifications`);

        // Sort by createdAt descending
        notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Keep the first (most recent), delete the rest
        const toDelete = notifications.slice(1);
        for (const notification of toDelete) {
          await UpdateNotification.findByIdAndDelete(notification._id);
          console.log(`Deleted duplicate notification: ${notification._id}`);
        }
      }
    }

    // Final count
    const remaining = await UpdateNotification.find({});
    console.log(`Remaining UpdateNotification records: ${remaining.length}`);

    const remainingRegular = await Notification.find({
      type: 'system',
      action: 'update',
      entityType: 'UpdateNotification'
    });
    console.log(`Remaining regular notifications: ${remainingRegular.length}`);

  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

cleanupTestNotifications();