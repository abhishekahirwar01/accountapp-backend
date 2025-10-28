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
    title: `Version ${version} Released`,
    description: "New financial management features and improvements are now available",
    version: version,
    features: [
      {
        name: "Receivable Sheet",
        description: "Track all money owed to your business with detailed customer receivable reports"
      },
      {
        name: "Payables Sheet", 
        description: "Manage all your outstanding payments to vendors and suppliers efficiently"
      },
      {
        name: "Enhanced Dashboard",
        description: "Improved analytics and new KPI cards for better financial insights"
      },
      {
        name: "Advanced Reporting",
        description: "Generate detailed financial reports with custom filters and export options"
      }
    ]
  };

  try {
    console.log('🚀 Creating update notification...');
    console.log('📊 Version:', version);
    console.log('🌐 API URL:', `${baseURL}/api/update-notifications`);
    console.log('🔑 Using token:', masterToken ? '***provided***' : '***missing***');
    
    console.log('\n🆕 New Features Being Notified:');
    updateData.features.forEach(feature => {
      console.log(`   • ${feature.name} - ${feature.description}`);
    });

    const response = await axios.post(`${baseURL}/api/update-notifications`, updateData, {
      headers: {
        Authorization: `Bearer ${masterToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('\n✅ Update notification created successfully!');
    
    // Verify the response structure
    if (response.data && response.data.notifications && Array.isArray(response.data.notifications)) {
      console.log(`📢 Notifications created for ${response.data.notifications.length} master admin(s)`);
    }

    // Success summary
    console.log('\n🎉 Deployment Complete - New Financial Features Available:');
    console.log('   📈 Receivable Sheet - Track customer payments and money owed to your business');
    console.log('   📉 Payables Sheet - Manage vendor payments and outstanding obligations');
    console.log('   📊 Enhanced Dashboard - Improved analytics and financial KPIs');
    console.log('   📋 Advanced Reporting - Detailed financial reports with export capabilities');

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
      console.log('\n⚠️  Continuing deployment despite notification failure...');
      console.log('🆕 New features are still deployed and available:');
      console.log('   • Receivable Sheet - Track customer payments');
      console.log('   • Payables Sheet - Manage vendor payments'); 
      console.log('   • Enhanced Dashboard - Better financial insights');
      console.log('   • Advanced Reporting - Detailed financial reports');
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

notifyUpdate();