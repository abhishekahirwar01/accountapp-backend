// const mongoose = require("mongoose");
// require("dotenv").config();

// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("✅ MongoDB Connected");
//   } catch (err) {
//     console.error("❌ DB Connection Error:", err.message);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;






// const mongoose = require("mongoose");

// // Serverless connection caching
// let cachedDb = null;
// let connectionPromise = null;

// const connectDB = async () => {
//   if (cachedDb) {
//     console.log("♻️ Using existing DB connection");
//     return cachedDb;
//   }

//   if (!connectionPromise) {
//     console.log("💡 MONGO_URI:", process.env.MONGO_URI ? "exists" : "missing");
    
//     connectionPromise = mongoose.connect(process.env.MONGO_URI, {
//       dbName: "accountingSoftware",
//       serverSelectionTimeoutMS: 10000, // 10 seconds
//       socketTimeoutMS: 45000,
//       maxPoolSize: 5,
//       retryWrites: true,
//       w: "majority"
//     }).then(conn => {
//       console.log(`✅ MongoDB Connected to ${conn.connection.host}`);
//       cachedDb = conn;
//       return conn;
//     }).catch(err => {
//       console.error("❌ Connection Error:", err);
//       connectionPromise = null; // Allow retries
//       throw err;
//     });
//   }

//   return connectionPromise;
// };

// // Event listeners for debugging
// mongoose.connection.on('connecting', () => console.log("🔄 Connecting to DB..."));
// mongoose.connection.on('connected', () => console.log("✅ DB Connection Established"));
// mongoose.connection.on('disconnected', () => console.log("❌ DB Disconnected"));

// module.exports = connectDB;












const mongoose = require("mongoose");

// Serverless connection handling
let cachedDb = null;

const connectDB = async () => {
  if (cachedDb && cachedDb.connection.readyState === 1) {
    console.log("♻️ Using existing DB connection");
    return cachedDb;
  }

  try {
    console.log("🔄 Creating new DB connection");
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: "accountingSoftware",
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 1, // Maintain at least 1 connection
      retryWrites: true,
      w: "majority",
      connectTimeoutMS: 10000 // Added connection timeout
    });

    console.log(`✅ MongoDB Connected to ${conn.connection.host}`);
    
    // Close connection on process termination
    process.on('SIGTERM', async () => {
      await conn.disconnect();
      console.log('MongoDB connection closed');
    });

    cachedDb = conn;
    return conn;

  } catch (err) {
    console.error("❌ Connection Error:", err);
    
    // Specific error handling for Vercel
    if (err.message.includes("ECONNREFUSED")) {
      console.error("Vercel Tip: Check if MongoDB IP is whitelisted");
    }
    
    throw err;
  }
};

// Enhanced event listeners
mongoose.connection.on('connecting', () => console.log("🔄 Connecting to DB..."));
mongoose.connection.on('connected', () => console.log("✅ DB Connection Established"));
mongoose.connection.on('disconnected', () => {
  console.log("❌ DB Disconnected");
  cachedDb = null; // Clear cache on disconnect
});

module.exports = connectDB;