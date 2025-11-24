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
    const todayIST = this.getTodayIST(date);
    const yesterdayIST = this.getYesterdayIST(date);

    // Get yesterday ledger
    const yesterdayLedger = await DailyStockLedger.findOne({
      companyId,
      clientId,
      date: yesterdayIST
    });

    let openingStock = { quantity: 0, amount: 0 };

    if (yesterdayLedger) {
      openingStock = {
        quantity: yesterdayLedger.closingStock.quantity,
        amount: yesterdayLedger.closingStock.amount
      };
    }

    // Create today's ledger (ONLY CRON CAN CALL THIS)
    const todayLedger = new DailyStockLedger({
      companyId,
      clientId,
      date: todayIST,
      openingStock,
      closingStock: openingStock,
      totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
      totalSalesOfTheDay: { quantity: 0, amount: 0 },
      totalCOGS: 0
    });

    await todayLedger.save();
    console.log("✨ DSL Created for:", todayIST);

    return todayLedger;

  } catch (err) {
    console.error("❌ carryForwardStock error:", err);
  }
}

static async createInitialDailyLedger({ companyId, clientId, date }) {
    const todayIST = this.getTodayIST(date);

    const exists = await DailyStockLedger.findOne({
        companyId,
        clientId,
        date: todayIST
    });

    if (exists) return exists;

    return await DailyStockLedger.create({
        companyId,
        clientId,
        date: todayIST,
        openingStock: { quantity: 0, amount: 0 },
        closingStock: { quantity: 0, amount: 0 },
        totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
        totalSalesOfTheDay: { quantity: 0, amount: 0 },
        totalCOGS: 0
    });
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