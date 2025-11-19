// deploy-notification.js
// Run with: node deploy-notification.js <master_token> <base_url> [version]

const axios = require('axios');
require('dotenv').config();

async function notifyUpdate() {
  // Accept command line arguments with fallbacks to environment variables
  const masterToken = process.argv[2] || process.env.MASTER_TOKEN;
  const baseURL = process.argv[3] || process.env.BASE_URL || 'http://localhost:8745';
  const version = process.argv[4] || process.env.VERSION || require('./package.json').version || '2.1.0';

  if (!masterToken) {
    console.error('❌ MASTER_TOKEN is required (as argument or env var)');
    console.error('Usage: node deploy-notification.js <MASTER_TOKEN> [BASE_URL] [VERSION]');
    process.exit(1);
  }

  const updateData = {
    title: `Version ${version} Deployed`,
    description: "New financial management features and improvements are now available",
    version: version,
    features: [
      {
        name: "Receivable Sheet",
        sectionUrl: "/app/receivables",
        gifUrl: "https://example.com/receivables-demo.gif",
        description: "Track all money owed to your business with detailed customer receivable reports"
      },
      {
        name: "Payables Sheet",
        sectionUrl: "/app/payables",
        gifUrl: "https://example.com/payables-demo.gif",
        description: "Manage all your outstanding payments to vendors and suppliers efficiently"
      },
      {
        name: "Enhanced Dashboard",
        sectionUrl: "/admin/dashboard",
        gifUrl: "https://example.com/dashboard-demo.gif",
        description: "Improved analytics and new KPI cards for better financial insights"
      },
      {
        name: "Advanced Reporting",
        sectionUrl: "/app/reports",
        gifUrl: "https://example.com/reports-demo.gif",
        description: "Generate detailed financial reports with custom filters and export options"
      }
    ]
  };

  try {
    console.log('🚀 Creating update notification...');
    console.log('📊 Version:', version);
    console.log('🌐 API URL:', `${baseURL}/api/update-notifications`);
    console.log('🔑 Using token:', masterToken ? '***provided***' : '***missing***');
    console.log('🆕 New Features: Receivable Sheet, Payables Sheet');

    // FIRST: Try to delete ALL notifications (not just for this version)
    console.log('🧹 Cleaning up ALL existing notifications...');
    try {
      const cleanupResponse = await axios.delete(`${baseURL}/api/update-notifications`, {
        headers: {
          Authorization: `Bearer ${masterToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      console.log('✅ Cleanup completed:', cleanupResponse.data.message || 'All existing notifications removed');
    } catch (cleanupError) {
      if (cleanupError.response && cleanupError.response.status === 404) {
        console.log('ℹ️  No existing notifications to clean up');
      } else {
        console.log('⚠️  API cleanup failed, but continuing...');
        // If API cleanup fails, try the database cleanup script as fallback
        try {
          console.log('🔄 Trying database cleanup as fallback...');
          const { execSync } = require('child_process');
          execSync('node scripts/cleanupTestNotifications.js', { stdio: 'inherit' });
        } catch (dbCleanupError) {
          console.log('⚠️  Database cleanup also failed, but continuing deployment...');
        }
      }
    }

    // THEN: Create new notifications
    const response = await axios.post(`${baseURL}/api/update-notifications`, updateData, {
      headers: {
        Authorization: `Bearer ${masterToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('✅ Update notification created successfully!');
    
    // Verify the response structure
    if (response.data && response.data.notifications && Array.isArray(response.data.notifications)) {
      console.log(`📢 Notifications created for ${response.data.notifications.length} master admin(s)`);
      
      // Log recipient IDs to help debug duplicates
      const recipientIds = response.data.notifications.map(n => n.recipient).filter(Boolean);
      console.log(`👥 Recipients: ${recipientIds.join(', ')}`);
    }

    // Additional success message highlighting new features
    console.log('\n🎉 New Financial Features Available:');
    console.log('   📈 Receivable Sheet - Track customer payments');
    console.log('   📉 Payables Sheet - Manage vendor payments');
    console.log('   📊 Enhanced financial reporting and analytics');

  } catch (error) {
    console.error('❌ Failed to create update notification:');
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📝 Response:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🌐 Connection refused - server may not be running');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🌐 Host not found - check the BASE_URL');
    } else {
      console.error('❓ Error:', error.message);
    }

    // Don't exit with error in CI/CD to prevent deployment failure
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      console.log('⚠️  Continuing deployment despite notification failure...');
      console.log('🆕 New features will still be available: Receivable Sheet, Payables Sheet');
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

// If this is the main module, run the function
if (require.main === module) {
  notifyUpdate();
}

module.exports = notifyUpdate;
