//RedisCache.js

const Redis = require('ioredis');


// Create a new Redis instance with default settings (localhost, port 6379)
const redis = new Redis({
  host: '127.0.0.1',  // Redis server hostname (default: 127.0.0.1)
  port: 6379,         // Redis server port (default: 6379)
  // password: 'yourpassword',  // Uncomment this if your Redis server requires authentication
  db: 0,              // Redis database to use (default is 0)
});

// Connect to Redis
redis.on('connect', () => {
  console.log('Connected to Redis');
});

// Handle Redis errors
redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Function to get data from Redis cache
const getFromCache = async (key) => {
  try {
    const cachedData = await redis.get(key);

    if (cachedData) {
      console.log('data fetched from redis');
      return JSON.parse(cachedData);  // Return parsed data from Redis cache
    }
    return null;  // If data not found in cache, return null
  } catch (error) {
    console.error('Error getting data from Redis cache:', error);
    return null;
  }
};

// Function to set data in Redis cache
const setToCache = async (key, value, ttl = 300) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));  // Cache data for 'ttl' seconds
    console.log(`Data cached with key: ${key}`);
  } catch (error) {
    console.error('Error setting data to Redis cache:', error);
  }
};

// Function to delete data from Redis cache
const deleteFromCache = async (key) => {
  try {
    await redis.del(key);  // Delete the cache entry by key
    console.log(`Cache deleted for key: ${key}`);
  } catch (error) {
    console.error('Error deleting data from Redis cache:', error);
  }
};

// Function to refresh the cache (update cached data)
const refreshCache = async (key, value, ttl = 3600) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));  // Update cache with new value and ttl
    console.log(`Cache refreshed for key: ${key}`);
  } catch (error) {
    console.error('Error refreshing cache in Redis:', error);
  }
};

module.exports = {
  redis,
  getFromCache,
  setToCache,
  deleteFromCache,
  refreshCache,
};
