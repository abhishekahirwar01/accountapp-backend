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

let isConnecting = false;

const connectDB = async () => {

  // Already connected — just return
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return connectDB();
  }

  isConnecting = true;

  try {
    console.log("🔄 Creating new DB connection");

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "test",
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 1, // Maintain at least 1 connection
      retryWrites: true,
      w: "majority",
      connectTimeoutMS: 10000 ,
       heartbeatFrequencyMS: 10000,
      serverMonitoringMode: "stream",
    });

    console.log(`✅ MongoDB Connected to ${mongoose.connection.host}`);
    return mongoose;
 } catch (err) {
    console.error("❌ Connection Error:", err);
    throw err;
  } finally {
    isConnecting = false;
  }
};


// Reconnect automatically on disconnect (handles Atlas maintenance)
mongoose.connection.on('disconnected', () => {
  console.log("❌ DB Disconnected — attempting reconnect in 5s...");
  setTimeout(() => {
    connectDB().catch(err => console.error("Reconnect failed:", err));
  }, 5000);
});


mongoose.connection.on('connecting', () => console.log("🔄 Connecting to DB..."));
mongoose.connection.on('connected', () => console.log("✅ DB Connected"));
mongoose.connection.on('error', (err) => console.error("❌ DB Error:", err));


process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed on SIGTERM');
  process.exit(0);
});

// Health check method
connectDB.checkHealth = async () => {
  try {
    if (cachedDb && cachedDb.connection.readyState === 1) {
      await cachedDb.connection.db.admin().ping();
      return { status: 'connected', readyState: 1 };
    }
    return { status: 'disconnected', readyState: 0 };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
};

module.exports = connectDB;