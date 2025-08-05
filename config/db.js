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

// Cache the connection to reuse in serverless environment
let cachedDb = null;

const connectDB = async () => {
  console.log("💡 MONGO_URI from ENV:", process.env.MONGO_URI ? "exists" : "missing");

  // Check for required environment variable
  if (!process.env.MONGO_URI) {
    const error = new Error("❌ MONGO_URI is undefined");
    console.error(error.message);
    throw error;
  }

  // Return cached connection if available
  if (cachedDb) {
    console.log("♻️ Using existing database connection");
    return cachedDb;
  }

  try {
    console.log("🔄 Creating new database connection");
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: "accountingSoftware",
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxPoolSize: 10, // Maximum number of sockets
      minPoolSize: 1, // Minimum number of sockets
      retryWrites: true,
      w: "majority"
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database Name: ${conn.connection.name}`);
    console.log(`👥 Models: ${mongoose.modelNames().join(", ")}`);

    // Add event listeners for better debugging
    conn.connection.on("connected", () => {
      console.log("🔗 Mongoose default connection open");
    });

    conn.connection.on("error", (err) => {
      console.error(`❌ Mongoose connection error: ${err}`);
    });

    conn.connection.on("disconnected", () => {
      console.log("🔌 Mongoose default connection disconnected");
    });

    // Cache the connection
    cachedDb = conn;
    return conn;

  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error("Stack Trace:", error.stack);
    
    // More detailed error analysis
    if (error.message.includes("ECONNREFUSED")) {
      console.error("⚠️ Network connection refused. Check if MongoDB is running and accessible.");
    } else if (error.message.includes("ENOTFOUND")) {
      console.error("⚠️ DNS lookup failed. Check your MongoDB URI hostname.");
    } else if (error.message.includes("Authentication failed")) {
      console.error("⚠️ Authentication failed. Check your username/password.");
    } else if (error.message.includes("timed out")) {
      console.error("⚠️ Connection timed out. Check your network or increase timeout.");
    }

    process.exit(1);
  }
};

// Close the Mongoose connection when the Node process ends
process.on("SIGINT", async () => {
  if (cachedDb) {
    await cachedDb.connection.close();
    console.log("🛑 Mongoose default connection disconnected through app termination");
    process.exit(0);
  }
});

module.exports = connectDB;