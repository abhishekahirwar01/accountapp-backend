const MasterAdmin = require("../models/MasterAdmin");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// Register (for initial setup — can disable in production)
exports.registerMasterAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingAdmin = await MasterAdmin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new MasterAdmin({
      username,
      password: hashedPassword,
      role: "master", // optional, since schema sets default
    });

    await newAdmin.save();
    res.status(201).json({ message: "Master admin created successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Login
exports.loginMasterAdmin = async (req, res) => {
  try {
    console.log("🔍 loginMasterAdmin called");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
        details: {
          missingFields: [
            ...(!username ? ["username"] : []),
            ...(!password ? ["password"] : []),
          ],
        },
      });
    }

    // Validate input types
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Invalid input format",
        details: "Username and password must be strings",
      });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Validate username is not empty after normalization
    if (!normalizedUsername) {
      return res.status(400).json({
        message: "Invalid username",
        details: "Username cannot be empty or contain only whitespace",
      });
    }

    // Find master admin
    const admin = await MasterAdmin.findOne({ username: normalizedUsername });

    if (!admin) {
      return res.status(401).json({
        message: "Authentication failed",
        details: "Invalid username or password",
      });
    }

    // Check if password exists for the admin
    if (!admin.password) {
      return res.status(401).json({
        message: "Account configuration error",
        details:
          "Account not properly configured. Please contact system administrator.",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Authentication failed",
        details: "Invalid username or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, role: "master" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Successful login response
    res.status(200).json({
      message: "Login successful",
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: "master",
      },
    });
  } catch (err) {
    console.error("❌ MasterAdmin login error:", err);

    // Handle specific error types
    if (err.name === "MongoError" || err.name === "MongoNetworkError") {
      return res.status(503).json({
        message: "Service temporarily unavailable",
        details: "Database connection error. Please try again later.",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(500).json({
        message: "Authentication service error",
        details: "Token generation failed",
      });
    }

    // Generic server error
    res.status(500).json({
      message: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Please try again later",
    });
  }
};

exports.getMasterAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id;
    const admin = await MasterAdmin.findById(adminId).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      admin,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
