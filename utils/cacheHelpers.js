

// utils/cacheHelpers.js

const { redis } = require('../RedisCache');  // Assuming you have Redis client in RedisCache.js

// Reusable function to delete sales entry cache
const deleteSalesEntryCache = async (clientId, companyId) => {
  try {
    // Cache keys
    const clientCacheKey = `salesEntriesByClient:${clientId}`;
    const companyCacheKey = `salesEntries:${JSON.stringify({ client: clientId, company: companyId })}`;

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache for client: ${clientCacheKey}`);
    console.log(`Attempting to delete cache for company: ${companyCacheKey}`);

    // Delete cached data from Redis for both client and company
    const clientDelResponse = await redis.del(clientCacheKey);
    const companyDelResponse = await redis.del(companyCacheKey);

    // Log if deletion was successful or not
    if (clientDelResponse === 1) {
      console.log(`Cache for client ${clientCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for client ${clientCacheKey}`);
    }

    if (companyDelResponse === 1) {
      console.log(`Cache for company ${companyCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for company ${companyCacheKey}`);
    }
  } catch (error) {
    console.error('Error deleting cache in deleteSalesEntryCache:', error);
  }
};


// Reusable function to delete purchase entry cache
const deletePurchaseEntryCache = async (clientId, companyId) => {
  try {
    // Cache keys - now only using clientId and companyId
    const clientCacheKey = `purchaseEntriesByClient:${clientId}`;
    const companyCacheKey = `purchaseEntries:${JSON.stringify({ 
      clientId,  // only clientId and companyId
      companyId 
    })}`;

    console.log(`Attempting to delete cache for client: ${clientCacheKey}`);
    console.log(`Attempting to delete cache for company: ${companyCacheKey}`);

    // Delete cached data from Redis for both client and company
    const clientDelResponse = await redis.del(clientCacheKey);
    const companyDelResponse = await redis.del(companyCacheKey);

    if (clientDelResponse === 1) {
      console.log(`Cache for client ${clientCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for client ${clientCacheKey}`);
    }

    if (companyDelResponse === 1) {
      console.log(`Cache for company ${companyCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for company ${companyCacheKey}`);
    }
  } catch (error) {
    console.error('Error deleting cache in deletePurchaseEntryCache:', error);
  }
};


// Reusable function to delete Receipt entry cache
const deleteReceiptEntryCache = async (clientId, companyId) => {
  try {
    // Cache keys
    const clientCacheKey = `receiptEntriesByClient:${clientId}`;
    const companyCacheKey = `receiptEntries:${JSON.stringify({ client: clientId, company: companyId })}`;

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache for client: ${clientCacheKey}`);
    console.log(`Attempting to delete cache for company: ${companyCacheKey}`);

    // Delete cached data from Redis for both client and company
    const clientDelResponse = await redis.del(clientCacheKey);
    const companyDelResponse = await redis.del(companyCacheKey);

    // Log if deletion was successful or not
    if (clientDelResponse === 1) {
      console.log(`Cache for client ${clientCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for client ${clientCacheKey}`);
    }

    if (companyDelResponse === 1) {
      console.log(`Cache for company ${companyCacheKey} deleted successfully`);
    } else {
      console.log(`No cache found for company ${companyCacheKey}`);
    }
  } catch (error) {
    console.error('Error deleting cache in deleteReceiptEntryCache:', error);
  }
};




const deletePaymentEntryCache = async (clientId, companyId) => {
  try {
    const keys = [
      // per-client list (if you use it)
      `paymentEntriesByClient:${clientId}`,

      // colon format (your new attempt)
      `paymentEntries:${clientId}:${companyId}`,

      // JSON formats you've actually stored
      `paymentEntries:${JSON.stringify({ clientId, companyId })}`,
      `paymentEntries:${JSON.stringify({ companyId, clientId })}`, // just in case order was reversed somewhere

      // legacy JSON field names (if used earlier in code)
      `paymentEntries:${JSON.stringify({ client: clientId, company: companyId })}`,
      `paymentEntries:${JSON.stringify({ company: companyId, client: clientId })}`,
    ];

    // Check & delete each explicitly (EXISTS per key gives you a clear log)
    for (const k of keys) {
      const exists = await redis.exists(k);
      console.log(exists ? `Will delete ${k}` : `Not present ${k}`);
      if (exists) {
        const del = await redis.del(k);
        console.log(del ? `Deleted ${k}` : `Failed to delete ${k}`);
      }
    }
  } catch (error) {
    console.error("Error deleting cache in deletePaymentEntryCache:", error);
  }
};



const deleteJournalEntryCache = async (clientId, companyId) => {
  try {
    const keys = [
      // per-client list (if you use it)
      `journalEntriesByClient:${clientId}`,

      // colon format (your new attempt)
      `journalEntries:${clientId}:${companyId}`,

      // JSON formats you've actually stored
      `journalEntries:${JSON.stringify({ clientId, companyId })}`,
      `journalEntries:${JSON.stringify({ companyId, clientId })}`, // just in case order was reversed somewhere

      // legacy JSON field names (if used earlier in code)
      `journalEntries:${JSON.stringify({ client: clientId, company: companyId })}`,
      `journalEntries:${JSON.stringify({ company: companyId, client: clientId })}`,
    ];

    // Check & delete each explicitly (EXISTS per key gives you a clear log)
    for (const k of keys) {
      const exists = await redis.exists(k);
      console.log(exists ? `Will delete ${k}` : `Not present ${k}`);
      if (exists) {
        const del = await redis.del(k);
        console.log(del ? `Deleted ${k}` : `Failed to delete ${k}`);
      }
    }
  } catch (error) {
    console.error("Error deleting cache in deleteJournalEntryCache:", error);
  }
};




module.exports = {
  deleteSalesEntryCache,
  deletePurchaseEntryCache,
  deleteReceiptEntryCache,
  deletePaymentEntryCache,
  deleteJournalEntryCache
};
