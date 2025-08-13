const express = require("express");
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
app.use(cors());
app.use(express.json());

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


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
