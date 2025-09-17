// deploy-notification.js
// Run with: node deploy-notification.js <master_token> <base_url> [version]

const axios = require('axios');
require('dotenv').config();

async function notifyUpdate() {
  // Accept command line arguments
  const masterToken = process.argv[2] || process.env.MASTER_TOKEN;
  const baseURL = process.argv[3] || process.env.BASE_URL || 'http://localhost:8745';
  const version = process.argv[4] || process.env.VERSION || '2.1.0';

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
        sectionUrl: "/admin/dashboard",
        gifUrl: "https://example.com/dashboard-demo.gif",
        description: "Improved analytics and new KPI cards"
      },
      {
        name: "Advanced Reporting",
        sectionUrl: "/app/reports",
        gifUrl: "https://example.com/reports-demo.gif",
        description: "Generate detailed reports with custom filters"
      }
      // Add more features as needed for each deployment
    ]
  };

  try {
    console.log('🚀 Creating update notification...');
    console.log('📊 Version:', version);
    console.log('🌐 API URL:', `${baseURL}/api/update-notifications`);

    const response = await axios.post(`${baseURL}/api/update-notifications`, updateData, {
      headers: {
        Authorization: `Bearer ${masterToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Update notification created successfully!');
    console.log('📊 Response:', response.data);
  } catch (error) {
    console.error('❌ Failed to create update notification:');
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

notifyUpdate();