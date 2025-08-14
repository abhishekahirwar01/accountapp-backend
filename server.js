const express = require("express");
const mongoose = require('mongoose'); // Add this at the top
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const masterAdminRoutes = require("./routes/masterAdminRoutes");
const clientRoutes = require("./routes/clientRoutes");
const companyRoutes = require("./routes/companyRoutes");
const salesRoutes = require("./routes/salesEntry");
const purchaseRoutes = require("./routes/purchaseEntry");
const productRoutes = require("./routes/productRoute");
const partyRoutes = require("./routes/partyRoute");
const vendorRoutes = require("./routes/vendorRoute");
const userRoutes = require("./routes/userRoutes");
const receiptRoutes = require("./routes/receiptRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const journalRoutes = require("./routes/journalRoutes");
const permissionRoutes = require('./routes/permission.routes')

dotenv.config();
connectDB();

const app = express();


// app.use(cors());
// Enhanced CORS configuration
const allowedOrigins = [
  'https://accountapp-theta.vercel.app',
  'http://localhost:3000',
   'http://localhost:8678'
];

// app.use(cors({
//   origin: function(origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       console.log('CORS blocked for origin:', origin);
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
//   credentials: true
// }));


app.use(cors({ origin: "*" }));

app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Database middleware error:", err);
    res.status(500).json({ 
      error: "Database connection failed",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.use("/api/master-admin", masterAdminRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/products", productRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/users", userRoutes);

app.use("/api", permissionRoutes);


// Test endpoints with better error handling
app.get("/api/test-env", (req, res) => {
  res.json({
    MONGO_URI: process.env.MONGO_URI ? 'exists' : 'missing',
    JWT_SECRET: process.env.JWT_SECRET ? 'exists' : 'missing',
    NODE_ENV: process.env.NODE_ENV
  });
});

app.get('/api/db-status', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not initialized');
    
    const status = {
      readyState: mongoose.connection.readyState,
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
      dbName: db.databaseName,
      collections: await db.listCollections().toArray(),
      models: mongoose.modelNames(),
      ping: await db.command({ ping: 1 })
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      connectionState: mongoose.connection.readyState,
      env: {
        MONGO_URI: !!process.env.MONGO_URI,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  }
});

app.get('/api/check-collections', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    res.json({
      exists: collections.some(c => c.name === 'clients'), // Change to your collection name
      allCollections: collections.map(c => c.name)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this test endpoint
app.get('/api/check-data', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionCounts = {};
    
    for (const coll of collections) {
      collectionCounts[coll.name] = await mongoose.connection.db
        .collection(coll.name)
        .countDocuments();
    }
    
    res.json({
      counts: collectionCounts,
      sampleClients: await mongoose.connection.db.collection('clients').find().limit(2).toArray()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// server.js
app.get('/api/debug/clients', async (req, res) => {
  try {
    const clients = await mongoose.connection.db.collection('clients').find().limit(5).toArray();
    res.json({
      count: await mongoose.connection.db.collection('clients').countDocuments(),
      sampleClients: clients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

module.exports = app;

// This should only run locally
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally at http://localhost:${PORT}`);
  });
}

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ message: "Something went wrong", error: err.message });
});

