

const { redis } = require('../RedisCache');  // Assuming you have Redis client in RedisCache.js

// Reusable function to delete sales entry cache
const deleteSalesEntryCache = async (clientId, companyId) => {
  try {
    // Get all sales-related cache keys using patterns
    const patterns = ['salesEntries:*', 'salesEntriesByClient:*'];
    let allKeys = [];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys = allKeys.concat(keys);
    }

    // Filter keys that are relevant to this client/company
    const relevantKeys = allKeys.filter(key => {
      try {
        let keyData;
        if (key.startsWith('salesEntries:')) {
          keyData = JSON.parse(key.replace('salesEntries:', ''));
          // For master admin cache keys (client: "all"), invalidate all relevant keys
          return keyData.client === "all" ||
                 keyData.client === clientId ||
                 (companyId && keyData.company === companyId);
        } else if (key.startsWith('salesEntriesByClient:')) {
          keyData = JSON.parse(key.replace('salesEntriesByClient:', ''));
          return keyData.clientId === clientId ||
                 (companyId && keyData.companyId === companyId);
        }
      } catch (e) {
        // If parsing fails, check if the key contains clientId as string
        return key.includes(clientId);
      }
      return false;
    });

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache keys: ${relevantKeys.join(', ')}`);

    // Delete cached data from Redis for all relevant keys
    for (const key of relevantKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const delResponse = await redis.del(key);
        if (delResponse === 1) {
          console.log(`Cache for ${key} deleted successfully`);
        } else {
          console.log(`Failed to delete cache for ${key}`);
        }
      } else {
        console.log(`No cache found for ${key}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cache in deleteSalesEntryCache:', error);
  }
};


// Reusable function to delete purchase entry cache
const deletePurchaseEntryCache = async (clientId, companyId) => {
  try {
    // Get all purchase-related cache keys using patterns
    const patterns = ['purchaseEntries:*', 'purchaseEntriesByClient:*'];
    let allKeys = [];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys = allKeys.concat(keys);
    }

    // Filter keys that are relevant to this client/company
    const relevantKeys = allKeys.filter(key => {
      try {
        let keyData;
        if (key.startsWith('purchaseEntries:')) {
          keyData = JSON.parse(key.replace('purchaseEntries:', ''));
          // For master admin cache keys (client: "all"), invalidate all relevant keys
          return keyData.client === "all" ||
                 keyData.client === clientId ||
                 (companyId && keyData.company === companyId);
        } else if (key.startsWith('purchaseEntriesByClient:')) {
          keyData = JSON.parse(key.replace('purchaseEntriesByClient:', ''));
          return keyData.clientId === clientId ||
                 (companyId && keyData.companyId === companyId);
        }
      } catch (e) {
        // If parsing fails, check if the key contains clientId as string
        return key.includes(clientId);
      }
      return false;
    });

    console.log(`Attempting to delete cache keys: ${relevantKeys.join(', ')}`);

    // Delete cached data from Redis for all relevant keys
    for (const key of relevantKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const delResponse = await redis.del(key);
        if (delResponse === 1) {
          console.log(`Cache for ${key} deleted successfully`);
        } else {
          console.log(`Failed to delete cache for ${key}`);
        }
      } else {
        console.log(`No cache found for ${key}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cache in deletePurchaseEntryCache:', error);
  }
};


// Reusable function to delete Receipt entry cache
const deleteReceiptEntryCache = async (clientId, companyId) => {
  try {
    // Get all receipt-related cache keys
    const patterns = ['receiptEntries:*', 'receiptEntriesByClient:*'];
    let allKeys = [];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys = allKeys.concat(keys);
    }

    // Filter keys that are relevant to this client/company
    const relevantKeys = allKeys.filter(key => {
      try {
        let keyData;
        if (key.startsWith('receiptEntries:')) {
          keyData = JSON.parse(key.replace('receiptEntries:', ''));
          return keyData.client === clientId ||
                 (companyId && keyData.company === companyId);
        } else if (key.startsWith('receiptEntriesByClient:')) {
          keyData = JSON.parse(key.replace('receiptEntriesByClient:', ''));
          return keyData.clientId === clientId ||
                 (companyId && keyData.companyId === companyId);
        }
      } catch (e) {
        // If parsing fails, check if the key contains clientId as string
        return key.includes(clientId);
      }
      return false;
    });

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache keys: ${relevantKeys.join(', ')}`);

    // Delete cached data from Redis for all relevant keys
    for (const key of relevantKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const delResponse = await redis.del(key);
        if (delResponse === 1) {
          console.log(`Cache for ${key} deleted successfully`);
        } else {
          console.log(`Failed to delete cache for ${key}`);
        }
      } else {
        console.log(`No cache found for ${key}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cache in deleteReceiptEntryCache:', error);
  }
};




const deletePaymentEntryCache = async (clientId, companyId) => {
  try {
    // Get all payment-related cache keys
    const patterns = ['paymentEntries:*', 'paymentEntriesByClient:*'];
    let allKeys = [];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys = allKeys.concat(keys);
    }

    // Filter keys that are relevant to this client/company
    const relevantKeys = allKeys.filter(key => {
      try {
        let keyData;
        if (key.startsWith('paymentEntries:')) {
          keyData = JSON.parse(key.replace('paymentEntries:', ''));
          return keyData.client === clientId ||
                 (companyId && keyData.company === companyId);
        } else if (key.startsWith('paymentEntriesByClient:')) {
          keyData = JSON.parse(key.replace('paymentEntriesByClient:', ''));
          return keyData.clientId === clientId ||
                 (companyId && keyData.companyId === companyId);
        }
      } catch (e) {
        // If parsing fails, check if the key contains clientId as string
        return key.includes(clientId);
      }
      return false;
    });

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache keys: ${relevantKeys.join(', ')}`);

    // Delete cached data from Redis for all relevant keys
    for (const key of relevantKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const delResponse = await redis.del(key);
        if (delResponse === 1) {
          console.log(`Cache for ${key} deleted successfully`);
        } else {
          console.log(`Failed to delete cache for ${key}`);
        }
      } else {
        console.log(`No cache found for ${key}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cache in deletePaymentEntryCache:', error);
  }
};



const deleteJournalEntryCache = async (clientId, companyId) => {
  try {
    // Get all journal-related cache keys
    const patterns = ['journalEntries:*', 'journalEntriesByClient:*'];
    let allKeys = [];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys = allKeys.concat(keys);
    }

    // Filter keys that are relevant to this client/company
    const relevantKeys = allKeys.filter(key => {
      try {
        let keyData;
        if (key.startsWith('journalEntries:')) {
          keyData = JSON.parse(key.replace('journalEntries:', ''));
          // For master admin cache keys (client: "all"), invalidate all relevant keys
          // For regular users, only invalidate their client/company specific keys
          return keyData.client === "all" ||
                 keyData.client === clientId ||
                 (companyId && keyData.company === companyId);
        } else if (key.startsWith('journalEntriesByClient:')) {
          keyData = JSON.parse(key.replace('journalEntriesByClient:', ''));
          return keyData.clientId === clientId ||
                 (companyId && keyData.companyId === companyId);
        }
      } catch (e) {
        // If parsing fails, check if the key contains clientId as string
        return key.includes(clientId);
      }
      return false;
    });

    // Log the cache keys to be deleted
    console.log(`Attempting to delete cache keys: ${relevantKeys.join(', ')}`);

    // Delete cached data from Redis for all relevant keys
    for (const key of relevantKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const delResponse = await redis.del(key);
        if (delResponse === 1) {
          console.log(`Cache for ${key} deleted successfully`);
        } else {
          console.log(`Failed to delete cache for ${key}`);
        }
      } else {
        console.log(`No cache found for ${key}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cache in deleteJournalEntryCache:', error);
  }
};


async function flushAllCache(reason = "manual") {
  try {
    const useAsync = process.env.REDIS_FLUSH_ASYNC === "true";
    console.log(`[Redis] FLUSHALL ${useAsync ? "ASYNC " : ""}requested (${reason})`);

    // node-redis (v4) supports .flushAll() / ioredis uses .flushall()
    if (typeof redis.flushAll === "function") {
      await redis.flushAll(useAsync ? "ASYNC" : undefined);
    } else if (typeof redis.flushall === "function") {
      await redis.flushall(useAsync ? "ASYNC" : undefined);
    } else {
      // Fallback to raw command
      await redis.sendCommand(["FLUSHALL", useAsync ? "ASYNC" : ""].filter(Boolean));
    }

    console.log("[Redis] FLUSHALL done");
  } catch (err) {
    console.error("[Redis] FLUSHALL error:", err);
  }
}


module.exports = {
  deleteSalesEntryCache,
  deletePurchaseEntryCache,
  deleteReceiptEntryCache,
  deletePaymentEntryCache,
  deleteJournalEntryCache,
  flushAllCache,
};