// Script to clean up test update notifications
// Run with: node scripts/cleanupTestNotifications.js

const mongoose = require('mongoose');
const UpdateNotification = require('../models/UpdateNotification');
require('dotenv').config();

async function cleanupTestNotifications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all update notifications
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
    console.log(`Remaining notifications: ${remaining.length}`);

  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

cleanupTestNotifications();