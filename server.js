const express = require("express");
const mongoose = require('mongoose'); // Add this at the top
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
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
const serviceRoutes = require('./routes/serviceRoutes')
const { loginClient , requestClientOtp, loginClientWithOtp} = require("./controllers/clientController");
const integrationsRoutes = require("./routes/integrationsRoutes");
const invoiceNumberRoutes = require("./routes/invoiceNumberRoutes")
const AccountValidityRoutes = require("./routes/accountValidityRoutes");
const roleRoutes = require('./routes/roleRoutes')
const userPermissionsRoutes = require("./routes/userPermissionsRoutes");
const bankDetailRoutes = require("./routes/bankDetailRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const updateNotificationRoutes = require("./routes/updateNotificationRoutes");
const templateRouter = require('./routes/templateRoutes');

dotenv.config();
connectDB();




// Enhanced CORS configuration
const allowedOrigins = [
  'https://accountapp-theta.vercel.app',
  'http://localhost:3000',
  'http://localhost:8678'
];



const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Make io globally available for controllers
global.io = io;



app.use(cors({ origin: "*" }));

// app.use(express.json());
app.use(express.json({ limit: "15mb" }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
app.use("/api/integrations", integrationsRoutes);

app.use("/api/master-admin", masterAdminRoutes);
app.post("/api/clients/:slug/login", loginClient);
app.post("/api/clients/:slug/request-otp", requestClientOtp);
app.post("/api/clients/:slug/login-otp",   loginClientWithOtp);
app.use("/api/clients", clientRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/products", productRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/users", userRoutes);
app.use("/api", permissionRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/invoices", invoiceNumberRoutes)
app.use("/api/account", AccountValidityRoutes);
app.use("/api/user-permissions", userPermissionsRoutes);
app.use("/api/bank-details", bankDetailRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/update-notifications", updateNotificationRoutes);
app.use('/api', templateRouter);


app.get('/', (req, res) => {
  res.send("Account App CI/CD is working...error fixes in getJournalsByClient");
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





// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

module.exports = app;

// This should only run locally
if (require.main === module) {
  const PORT = process.env.PORT || 8745;
  server.listen(PORT, () => {
    console.log(`🚀 Server running locally at http://localhost:${PORT}`);
  });
}

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ message: "Something went wrong", error: err.message });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Join user-specific rooms for targeted notifications
  socket.on('joinRoom', (data) => {
    const { userId, role, clientId } = data;
    if (role === 'master') {
      socket.join(`master-${userId}`);
    } else if (role === 'client' || role === 'user') {
      socket.join(`client-${clientId}`);
      socket.join(`user-${userId}`);
    }
    console.log(`👤 User ${userId} joined room(s)`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

