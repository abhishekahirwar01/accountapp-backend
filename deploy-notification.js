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
    description: "New features and improvements are now available",
    version: version,
    features: [
      {
        name: "Enhanced Dashboard",
        sectionUrl: "/dashboard",
        gifUrl: "https://example.com/dashboard-demo.gif",
        description: "Improved analytics and new KPI cards"
      },
      {
        name: "Advanced Reports",
        sectionUrl: "/reports",
        gifUrl: "https://example.com/reports-demo.gif",
        description: "Generate detailed reports with custom filters"
      },
      {
        name: "Transaction Management",
        sectionUrl: "/transactions",
        gifUrl: "https://example.com/transactions-demo.gif",
        description: "Enhanced transaction tracking and management"
      },
      {
        name: "User Management",
        sectionUrl: "/users",
        gifUrl: "https://example.com/users-demo.gif",
        description: "Improved user administration and permissions"
      }
      // Add more features as needed for each deployment
    ]
  };

  // Health check function
  async function checkServerHealth() {
    try {
      const healthResponse = await axios.get(`${baseURL}/health`, {
        timeout: 5000
      });
      return healthResponse.status === 200;
    } catch (error) {
      return false;
    }
  }

  // Wait for server to be ready
  async function waitForServer(maxRetries = 10, delay = 5000) {
    console.log('⏳ Waiting for server to be ready...');

    for (let i = 1; i <= maxRetries; i++) {
      console.log(`🔄 Health check attempt ${i}/${maxRetries}...`);

      if (await checkServerHealth()) {
        console.log('✅ Server is ready!');
        return true;
      }

      if (i < maxRetries) {
        console.log(`⏰ Waiting ${delay/1000} seconds before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log('❌ Server health check failed after maximum retries');
    return false;
  }

  try {
    console.log('🚀 Creating update notification...');
    console.log('📊 Version:', version);
    console.log('🌐 API URL:', `${baseURL}/api/update-notifications`);
    console.log('🔑 Using token:', masterToken ? '***provided***' : '***missing***');

    // Wait for server to be ready before making API call
    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('Server is not responding after health checks');
    }

    const response = await axios.post(`${baseURL}/api/update-notifications`, updateData, {
      headers: {
        Authorization: `Bearer ${masterToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('✅ Update notification created successfully!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));

    // Verify the response structure
    if (response.data && response.data.notifications && Array.isArray(response.data.notifications)) {
      console.log(`📢 Notifications created for ${response.data.notifications.length} master admin(s)`);
    }

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
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

notifyUpdate();