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
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Redis Cache check took too long')), 50)
    );
    
    // Race the cache fetch against the timeout
    const cachedData = await Promise.race([
      redis.get(key).then((data) => (data ? JSON.parse(data) : null)),
      timeout,
    ]);

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

// Function to set data in Redis cache with a timeout of 50ms
const setToCache = async (key, value, ttl = 3600) => {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Redis Cache set took too long')), 50)
    );

    // Race the Redis set operation against the timeout
    await Promise.race([
      redis.setex(key, ttl, JSON.stringify(value)),
      timeout,
    ]);

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
