// services/stockCarryForwardService.js
const DailyStockLedger = require("../models/DailyStockLedger");

class StockCarryForwardService {
  /**
   * Convert date to IST format (18:30:00 UTC = 00:00 IST next day)
   * This is the STANDARD format used throughout the system
   */
  static convertToISTDate(date) {
    const istDate = new Date(date);
    // Set to 18:30:00 UTC to represent 00:00 IST next day
    istDate.setUTCHours(18, 30, 0, 0);
    return istDate;
  }

  /**
   * Get yesterday's date in IST format
   */
  static getYesterdayIST(date) {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return this.convertToISTDate(yesterday);
  }

  /**
   * Get today's date in IST format  
   */
  static getTodayIST(date) {
    return this.convertToISTDate(date);
  }

  /**
   * Carry forward yesterday's closing stock to today's opening stock
   */
  static async carryForwardStock({ companyId, clientId, date }) {
    try {
      // Convert to IST dates (18:30 UTC format)
      const todayIST = this.getTodayIST(date);
      const yesterdayIST = this.getYesterdayIST(date);

      console.log(`📅 Carry forward:`);
      console.log(`   Input date: ${date.toISOString()}`);
      console.log(`   Yesterday (IST): ${yesterdayIST.toISOString()}`);
      console.log(`   Today (IST): ${todayIST.toISOString()}`);

      // Find yesterday's ledger
      const yesterdayLedger = await DailyStockLedger.findOne({
        companyId: companyId,
        clientId: clientId,
        date: yesterdayIST
      });

      // If no yesterday data, start with zero opening
      let openingStock = { quantity: 0, amount: 0 };
      
      if (yesterdayLedger && yesterdayLedger.closingStock) {
        openingStock = {
          quantity: yesterdayLedger.closingStock.quantity || 0,
          amount: yesterdayLedger.closingStock.amount || 0
        };
        console.log(`✅ Found yesterday's closing: ${openingStock.quantity} units, ₹${openingStock.amount}`);
      } else {
        console.log(`⚠️ No yesterday data found, starting with zero opening`);
      }

      // Find or create today's ledger with carried forward opening stock
      const todayLedger = await DailyStockLedger.findOneAndUpdate(
        {
          companyId: companyId,
          clientId: clientId,
          date: todayIST
        },
        {
          $set: {
            openingStock: openingStock,
            // Also update closing stock if it's a new document or needs correction
            closingStock: openingStock
          },
          $setOnInsert: {
            totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
            totalSalesOfTheDay: { quantity: 0, amount: 0 }
          }
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      );

      console.log(`✅ Today's opening set to: ${todayLedger.openingStock.quantity} units, ₹${todayLedger.openingStock.amount}`);
      
      return todayLedger;
    } catch (error) {
      console.error('❌ Error in stock carry forward:', error);
      throw error;
    }
  }

  /**
   * Ensure carry forward happens for a specific company/date
   * This should be called before any stock operations for the day
   */
  static async ensureCarryForward({ companyId, clientId, date = new Date() }) {
    try {
      console.log(`🔄 Ensuring carry forward for ${date.toISOString()}`);
      return await this.carryForwardStock({
        companyId,
        clientId, 
        date
      });
    } catch (error) {
      console.error('Error ensuring carry forward:', error);
      throw error;
    }
  }

  /**
   * Manual trigger to fix missing carry forwards
   */
  static async fixMissingCarryForwards({ companyId, clientId, fromDate, toDate }) {
    try {
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      const results = [];

      console.log(`🔧 Fixing missing carry forwards from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
        try {
          console.log(`📅 Processing: ${currentDate.toISOString()}`);
          const result = await this.carryForwardStock({
            companyId,
            clientId,
            date: new Date(currentDate)
          });
          results.push({ 
            date: new Date(currentDate), 
            success: true, 
            openingStock: result.openingStock 
          });
          console.log(`✅ Success for ${currentDate.toISOString()}`);
        } catch (error) {
          console.error(`❌ Failed for ${currentDate.toISOString()}:`, error.message);
          results.push({ 
            date: new Date(currentDate), 
            success: false, 
            error: error.message 
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error fixing missing carry forwards:', error);
      throw error;
    }
  }

  /**
   * Verify carry forward worked correctly
   */
  static async verifyCarryForward({ companyId, clientId, date = new Date() }) {
    try {
      const todayIST = this.getTodayIST(date);
      const yesterdayIST = this.getYesterdayIST(date);

      console.log(`🔍 Verifying carry forward for ${date.toISOString()}`);
      console.log(`   Yesterday IST: ${yesterdayIST.toISOString()}`);
      console.log(`   Today IST: ${todayIST.toISOString()}`);

      const [yesterdayLedger, todayLedger] = await Promise.all([
        DailyStockLedger.findOne({
          companyId: companyId,
          clientId: clientId,
          date: yesterdayIST
        }),
        DailyStockLedger.findOne({
          companyId: companyId,
          clientId: clientId,
          date: todayIST
        })
      ]);

      const verification = {
        yesterday: {
          exists: !!yesterdayLedger,
          closingStock: yesterdayLedger?.closingStock || null,
          date: yesterdayIST.toISOString()
        },
        today: {
          exists: !!todayLedger,
          openingStock: todayLedger?.openingStock || null,
          date: todayIST.toISOString()
        },
        carryForwardCorrect: false
      };

      if (yesterdayLedger && todayLedger) {
        verification.carryForwardCorrect = 
          yesterdayLedger.closingStock.quantity === todayLedger.openingStock.quantity &&
          yesterdayLedger.closingStock.amount === todayLedger.openingStock.amount;
      }

      console.log('📊 Verification Result:', verification);
      return verification;

    } catch (error) {
      console.error('Error verifying carry forward:', error);
      throw error;
    }
  }
}

module.exports = StockCarryForwardService;