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

// const connectDB = async () => {
//   console.log("💡 MONGO_URI from ENV:", process.env.MONGO_URI);

//   if (!process.env.MONGO_URI) {
//     console.error("❌ MONGO_URI is undefined");
//     return;
//   }

//   try {
//     const conn = await mongoose.connect(process.env.MONGO_URI, {
//   dbName: "accountingSoftware",
//  useNewUrlParser: true
// });
//     console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
//   } catch (error) {
//     console.error(`❌ MongoDB Connection Error: ${error.message}`);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;



const mongoose = require("mongoose");

// Serverless connection caching
let cachedDb = null;
let connectionPromise = null;

const connectDB = async () => {
  if (cachedDb) {
    console.log("♻️ Using existing DB connection");
    return cachedDb;
  }

  if (!connectionPromise) {
    console.log("💡 MONGO_URI:", process.env.MONGO_URI ? "exists" : "missing");
    
    connectionPromise = mongoose.connect(process.env.MONGO_URI, {
      dbName: "accountingSoftware",
      serverSelectionTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      retryWrites: true,
      w: "majority"
    }).then(conn => {
      console.log(`✅ MongoDB Connected to ${conn.connection.host}`);
      cachedDb = conn;
      return conn;
    }).catch(err => {
      console.error("❌ Connection Error:", err);
      connectionPromise = null; // Allow retries
      throw err;
    });
  }

  return connectionPromise;
};

// Event listeners for debugging
mongoose.connection.on('connecting', () => console.log("🔄 Connecting to DB..."));
mongoose.connection.on('connected', () => console.log("✅ DB Connection Established"));
mongoose.connection.on('disconnected', () => console.log("❌ DB Disconnected"));

module.exports = connectDB;