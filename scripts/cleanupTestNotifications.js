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

    // Delete all UpdateNotification records
    const deleteResult = await UpdateNotification.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} UpdateNotification records`);

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