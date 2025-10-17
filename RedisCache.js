const Redis = require("ioredis");
require("dotenv").config();

let redis;

if (process.env.REDIS_URL) {
  // ✅ Use environment Redis (Render)
  redis = new Redis(process.env.REDIS_URL);
  console.log("Using Redis from environment URL");
} else {
  // ✅ Fallback to local Redis (for development)
  redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
  });
  console.log("Using local Redis instance");
}

// Event listeners
redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

// Cache functions (same as before)
const getFromCache = async (key) => {
  try {
    const cachedData = await redis.get(key);
    if (cachedData) {
      console.log("📦 Data fetched from Redis");
      return JSON.parse(cachedData);
    }
    return null;
  } catch (error) {
    console.error("Error getting data from Redis:", error);
    return null;
  }
};

const setToCache = async (key, value, ttl = 300) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    console.log(`📝 Data cached with key: ${key}`);
  } catch (error) {
    console.error("Error setting data to Redis:", error);
  }
};

const deleteFromCache = async (key) => {
  try {
    await redis.del(key);
    console.log(`🗑️ Cache deleted for key: ${key}`);
  } catch (error) {
    console.error("Error deleting cache:", error);
  }
};

const refreshCache = async (key, value, ttl = 3600) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    console.log(`♻️ Cache refreshed for key: ${key}`);
  } catch (error) {
    console.error("Error refreshing cache:", error);
  }
};

module.exports = {
  redis,
  getFromCache,
  setToCache,
  deleteFromCache,
  refreshCache,
};