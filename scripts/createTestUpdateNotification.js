// Script to create a test update notification for master admins (they can then propagate to clients)
// Run with: node scripts/createTestUpdateNotification.js

const mongoose = require('mongoose');
const UpdateNotification = require('../models/UpdateNotification');
const MasterAdmin = require('../models/MasterAdmin');
const Client = require('../models/Client');
const User = require('../models/User');
const Notification = require('../models/Notification');
require('dotenv').config();

async function createTestNotification() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all master admins
    const masterAdmins = await MasterAdmin.find({});
    console.log(`Found ${masterAdmins.length} master admins`);

    if (masterAdmins.length === 0) {
      console.log('No master admins found. Creating a test one...');

      // Create a test master admin (remove this in production)
      const testAdmin = new MasterAdmin({
        userName: 'testmaster',
        email: 'master@test.com',
        // Add other required fields based on your MasterAdmin schema
      });
      await testAdmin.save();
      masterAdmins.push(testAdmin);
    }

    // Create test update notification
    const testNotification = {
      title: "New Dashboard Features Available",
      description: "Stay informed with the latest updates to your dashboard. Here's what’s new in version v2.0.0:",
      version: "v2.0.0",
      features: [
        {
          name: "New Update Notifications",
          sectionUrl: "/dashboard",
          gifUrl: "https://via.placeholder.com/400x200?text=Dashboard+Demo",
          description: `
        - **Instant Alerts**: Get notified as soon as new updates are available for the dashboard.
        - **Easy Access**: Click on the notification to directly access the latest features and enhancements.
        - **Stay Updated**: Ensure you never miss out on the latest improvements and optimizations.
      `
        },
      ]
    };


    // Create UpdateNotification for each master admin
    const createdNotifications = [];
    for (const admin of masterAdmins) {
      const notification = new UpdateNotification({
        ...testNotification,
        recipient: admin._id
      });
      await notification.save();
      createdNotifications.push(notification);
      console.log(`Created UpdateNotification for master admin: ${admin.userName}`);
    }

    console.log(`Created ${createdNotifications.length} UpdateNotification records for master admins.`);
    console.log('Master admins can now propagate these to clients using the API endpoint:');
    console.log('POST /api/update-notifications/propagate/:notificationId');

    console.log(`Test update notifications created for ${createdNotifications.length} master admins successfully!`);
    console.log('Use the master admin interface to propagate these notifications to clients when ready.');
  } catch (error) {
    console.error('Error creating test notification:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createTestNotification();