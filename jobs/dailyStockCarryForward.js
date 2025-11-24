// jobs/dailyStockCarryForward.js
const cron = require('node-cron');
const mongoose = require('mongoose');
const StockCarryForwardService = require('../services/stockCarryForwardService');

async function runDailyCarryForward() {
  try {
    console.log('🔄 Starting daily stock carry forward job...', new Date().toISOString());
    
    // Get yesterday's date for carry forward
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    console.log('📅 Processing carry forward for date:', yesterday.toISOString());

    // Dynamically get all active company-client combinations
    const combinations = await getActiveCompanyClientCombinations();
    
    console.log(`🏢 Found ${combinations.length} active combinations to process`);

    if (combinations.length === 0) {
      console.log('ℹ️ No active companies found to process');
      return;
    }

    for (const combo of combinations) {
      try {
        console.log(`🔍 Processing company: ${combo.companyId}, client: ${combo.clientId}`);
        
        const result = await StockCarryForwardService.ensureCarryForward({
          companyId: combo.companyId,
          clientId: combo.clientId,
          date: yesterday
        });
        
        console.log(`✅ Carry forward completed for company: ${combo.companyId}`);
      } catch (error) {
        console.error(`❌ Carry forward failed for company ${combo.companyId}:`, error.message);
        // Continue with other companies even if one fails
      }
    }
    
    console.log('✅ Daily stock carry forward job completed');
  } catch (error) {
    console.error('❌ Daily stock carry forward job failed:', error);
  }
}

async function getActiveCompanyClientCombinations() {
  try {
    const Company = mongoose.model('Company');

   const activeCompanies = await Company.find({})
  .select('_id client clientId selectedClient')
  .lean();


    return activeCompanies.map(company => {
      const resolvedClientId =
        company.clientId || company.client || company.selectedClient || null;

      return {
        companyId: company._id.toString(),
        clientId: resolvedClientId ? resolvedClientId.toString() : null,
      };
    });

  } catch (error) {
    console.error('❌ Error fetching active companies:', error);
    
    // Fallback - Get from existing carry forward records
    try {
      const StockCarryForward = mongoose.model('StockCarryForward');
      const uniqueCombinations = await StockCarryForward.aggregate([
        {
          $group: {
            _id: {
              companyId: "$companyId",
              clientId: "$clientId"
            }
          }
        },
        {
          $project: {
            companyId: "$_id.companyId",
            clientId: "$_id.clientId",
            _id: 0
          }
        }
      ]);

      console.log('🔍 Fallback: Found combinations from existing records:', uniqueCombinations.length);
      return uniqueCombinations;

    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      return [];
    }
  }
}


// Manual trigger for testing
async function manualRun() {
  console.log('🔄 Manually triggering carry forward job...');
  await runDailyCarryForward();
}

// Schedule to run every day at 00:05 AM
cron.schedule('05 00 * * *', runDailyCarryForward, {
  timezone: "Asia/Kolkata"
});

console.log('⏰ Daily stock carry forward cron job scheduled (00:05 IST)');

module.exports = { 
  runDailyCarryForward, 
  getActiveCompanyClientCombinations,
  manualRun 
};