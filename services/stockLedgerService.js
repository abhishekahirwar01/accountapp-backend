// services/dailyStockLedgerService.js
const DailyStockLedger = require("../models/DailyStockLedger");

class DailyStockLedgerService {
  /**
   * Get standardized date (IST 00:00 as UTC)
   */
  static getStandardizedDate(date = new Date()) {
    const standardized = new Date(date);
    standardized.setUTCHours(18, 30, 0, 0); // IST 00:00
    return standardized;
  }

  /**
   * Update daily stock ledger when products are added/updated
   */
  static async updateStockLedgerOnProductChange({ 
    companyId, 
    clientId, 
    oldStocks, 
    newStocks, 
    costPrice, 
    date = new Date()
  }) {
    try {
      const standardizedDate = this.getStandardizedDate(date);

      // Calculate stock difference and value difference
      const stockDifference = newStocks - oldStocks;
      const valueDifference = stockDifference * costPrice;

      // If no change in stock, do nothing
      if (stockDifference === 0) {
        return;
      }

      // Find or create ledger for the standardized date
      let ledger = await DailyStockLedger.findOne({
        companyId: companyId,
        clientId: clientId,
        date: standardizedDate
      });

      if (!ledger) {
        // Get previous day's closing stock
        const previousDay = new Date(standardizedDate);
        previousDay.setDate(previousDay.getDate() - 1);
        previousDay.setUTCHours(18, 30, 0, 0); // IST 00:00
        
        const previousLedger = await DailyStockLedger.findOne({
          companyId: companyId,
          clientId: clientId,
          date: previousDay
        });

        ledger = new DailyStockLedger({
          companyId: companyId,
          clientId: clientId,
          date: standardizedDate,
          openingStock: previousLedger ? { 
            quantity: previousLedger.closingStock.quantity, 
            amount: previousLedger.closingStock.amount 
          } : { quantity: 0, amount: 0 },
          closingStock: previousLedger ? { 
            quantity: previousLedger.closingStock.quantity, 
            amount: previousLedger.closingStock.amount 
          } : { quantity: 0, amount: 0 },
          totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
          totalSalesOfTheDay: { quantity: 0, amount: 0 }
        });
      }

      // Update opening stock (for direct product edits)
      ledger.openingStock.quantity += stockDifference;
      ledger.openingStock.amount += valueDifference;
      
      // Also update closing stock to maintain consistency
      ledger.closingStock.quantity += stockDifference;
      ledger.closingStock.amount += valueDifference;

      await ledger.save();
      console.log(`Stock ledger updated for ${standardizedDate}: ${stockDifference} units`);
      return ledger;
    } catch (error) {
      console.error('Error updating daily stock ledger:', error);
      throw error;
    }
  }

  /**
   * Handle product creation with opening stock
   */
  static async handleProductCreation({ companyId, clientId, stocks, costPrice }) {
    if (stocks > 0 && costPrice > 0) {
      return await this.updateStockLedgerOnProductChange({
        companyId,
        clientId,
        oldStocks: 0,
        newStocks: stocks,
        costPrice,
        date: new Date()
      });
    }
  }

  /**
   * Handle product stock update
   */
  static async handleProductUpdate({ companyId, clientId, oldStocks, newStocks, costPrice }) {
    return await this.updateStockLedgerOnProductChange({
      companyId,
      clientId,
      oldStocks,
      newStocks,
      costPrice,
      date: new Date()
    });
  }

  /**
   * Handle product deletion (remove stock from ledger)
   */
  static async handleProductDeletion({ companyId, clientId, stocks, costPrice }) {
    if (stocks > 0 && costPrice > 0) {
      return await this.updateStockLedgerOnProductChange({
        companyId,
        clientId,
        oldStocks: stocks,
        newStocks: 0,
        costPrice,
        date: new Date()
      });
    }
  }
}

module.exports = DailyStockLedgerService;