// services/tripInvoiceIssuer.js
const TripCounter = require('../models/Transporter/TripCounter');
const Company = require("../models/Company");
const { deriveThreeLetterPrefix } = require("../utils/prefix");

/**
 * Issue a unique trip ID and trip sheet number for a company
 * Similar to sales invoice number generation
 */
async function issueTripNumbers(companyId, date = new Date()) {
  const year = date.getFullYear();
  const yearYY = Number(String(year).slice(-2));
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const company = await Company.findById(companyId).lean();
  const prefix = ("T" + deriveThreeLetterPrefix(company?.businessName || company?.name || "")).slice(0, 4);
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Find and update counter atomically
    const counter = await TripCounter.findOneAndUpdate(
      { 
        companyId: companyId,
        year: year,
        month: parseInt(month)
      },
      { $inc: { sequence: 1 } },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    const sequence = String(counter.sequence).padStart(4, '0');
    const tripId = `${prefix}${month}${String(yearYY).padStart(2, "0")}${sequence}`.toUpperCase();
    const tripSheetNo = tripId; // keep in sync with trip number
    
    // Check if this ID already exists (very unlikely but safe)
    const Trip = require('../models/Transporter/Trip');
    const existing = await Trip.findOne({ tripId });
    
    if (!existing) {
      return { tripId, tripSheetNo, sequence: counter.sequence };
    }
    
    // If somehow duplicate, continue loop (will increment counter again)
    console.warn(`Duplicate trip ID detected: ${tripId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique trip number after multiple attempts');
}

/**
 * Reset counter for a company (optional - for admin use)
 */
async function resetTripCounter(companyId, year, month) {
  return await TripCounter.findOneAndUpdate(
    { companyId, year, month },
    { sequence: 0 },
    { upsert: true }
  );
}

/**
 * Get current sequence for a company without incrementing
 */
async function getCurrentTripSequence(companyId, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  const counter = await TripCounter.findOne({ companyId, year, month });
  return counter ? counter.sequence : 0;
}

module.exports = {
  issueTripNumbers,
  resetTripCounter,
  getCurrentTripSequence
};
