const Client = require("../models/Client");
const bcrypt = require("bcryptjs");

// Create Client (Only Master Admin)
exports.createClient = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const existingClient = await Client.findOne({ username });
    if (existingClient) {
      return res.status(400).json({ message: "Client username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const client = new Client({
      username,
      password: hashedPassword,
      masterAdmin: req.user.id // from JWT middleware
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
