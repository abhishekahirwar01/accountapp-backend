const Client = require("../models/Client");
const bcrypt = require("bcryptjs");

// Create Client (Only Master Admin)
exports.createClient = async (req, res) => {
  try {
    const {
      clientUsername,
      password,
      contactName,
      phone,
      email
    } = req.body;

    // Check for duplicates
    const existingUsername = await Client.findOne({ clientUsername });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const existingEmail = await Client.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingPhone = await Client.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const client = new Client({
      clientUsername,
      password: hashedPassword,
      contactName,
      phone,
      email,
      role: "client",                    // optional, will default from schema
      masterAdmin: req.user.id          // from JWT middleware
    });

    await client.save();
    res.status(201).json({ message: "Client created successfully", client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get All Clients (Only Master Admin)
exports.getClients = async (req, res) => {
  try {
    const clients = await Client.find({ masterAdmin: req.user.id }).select("-password");
    res.status(200).json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
