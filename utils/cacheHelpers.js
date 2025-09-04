

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


module.exports = {
  deleteSalesEntryCache,
  deletePurchaseEntryCache
};
