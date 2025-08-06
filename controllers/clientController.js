const Client = require("../models/Client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// Create Client (Only Master Admin)
exports.createClient = async (req, res) => {
  try {
    const {
      clientUsername,
      password,
      contactName,
      phone,
      email,
      maxCompanies = 5,
      maxUsers = 10,
      canSendInvoiceEmail = true,
      canSendInvoiceWhatsapp = false
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
      maxCompanies,
      maxUsers,
      canSendInvoiceEmail,
      canSendInvoiceWhatsapp,
      role: "client",
      masterAdmin: req.user.id
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


// Client Login
// exports.loginClient = async (req, res) => {
//   try {
//     const { clientUsername, password } = req.body;

//     const client = await Client.findOne({ clientUsername });
//     if (!client) {
//       return res.status(404).json({ message: "Client not found" });
//     }

//     const isMatch = await bcrypt.compare(password, client.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid password" });
//     }

//     const token = jwt.sign(
//       { id: client._id, role: "client" },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" }
//     );

//     res.status(200).json({
//       message: "Login successful",
//       token,
//       client: {
//         id: client._id,
//         clientUsername: client.clientUsername,
//         contactName: client.contactName,
//         email: client.email,
//         phone: client.phone,
//         role: client.role
//       }
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
// controllers/clientController.js
exports.loginClient = async (req, res) => {
  try {
    console.log('Login request body:', req.body);
    
    // Normalize email input
    const email = req.body.email?.toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Debug: Check if any clients exist
    const clientCount = await Client.countDocuments();
    console.log(`Total clients in DB: ${clientCount}`);

    // Find client with case-insensitive search
    const client = await Client.findOne({ email });
    console.log('Found client:', client ? client.email : 'None');

    if (!client) {
      // List first 5 emails for debugging
      const sampleEmails = await Client.find().limit(5).select('email');
      return res.status(404).json({
        error: "Client not found",
        searchedEmail: email,
        availableEmails: sampleEmails.map(c => c.email),
        totalClients: clientCount
      });
    }

    // ... rest of your password verification logic ...

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update Client (Only Master Admin)
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contactName,
      email,
      phone,
      maxCompanies,
      maxUsers,
      canSendInvoiceEmail,
      canSendInvoiceWhatsapp
    } = req.body;

    const client = await Client.findOne({ _id: id, masterAdmin: req.user.id });
    if (!client) return res.status(404).json({ message: "Client not found" });

    // Check duplicates
    if (email && email !== client.email) {
      const existingEmail = await Client.findOne({ email });
      if (existingEmail) return res.status(400).json({ message: "Email already exists" });
      client.email = email;
    }

    if (phone && phone !== client.phone) {
      const existingPhone = await Client.findOne({ phone });
      if (existingPhone) return res.status(400).json({ message: "Phone already exists" });
      client.phone = phone;
    }

    if (contactName) client.contactName = contactName;
    if (typeof maxCompanies === "number") client.maxCompanies = maxCompanies;
    if (typeof maxUsers === "number") client.maxUsers = maxUsers;
    if (typeof canSendInvoiceEmail === "boolean") client.canSendInvoiceEmail = canSendInvoiceEmail;
    if (typeof canSendInvoiceWhatsapp === "boolean") client.canSendInvoiceWhatsapp = canSendInvoiceWhatsapp;

    await client.save();
    res.status(200).json({ message: "Client updated successfully", client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// Delete Client (Only Master Admin)
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if client belongs to the logged-in master admin
    const client = await Client.findOne({ _id: id, masterAdmin: req.user.id });
    if (!client) {
      return res.status(404).json({ message: "Client not found or unauthorized" });
    }

    await Client.deleteOne({ _id: id });

    res.status(200).json({ message: "Client deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// Reset Client Password (Only Master Admin or Client Themselves)
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newpassword } = req.body;
    if (!newpassword) {
      return res.status(400).json({ message: "New Password is required" });
    }
    if (req.user.role !== "master") {
      return res.status(403).json({ message: "Only master admin can reset password" });
    }
    // Find the client under this master admin
    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ message: "client not found" });
    }
    // Hash and update password
    const hashedPassword = await bcrypt.hash(newpassword, 10);
    client.password = hashedPassword;

    client.save();
    res.status(200).json({ message: "Password reset successfully" })
  }
  catch (err) {
    res.status(500).json({ error: err.message });
  }
}



// Get Single Client by ID (Only Master Admin)
exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findOne({ _id: id, masterAdmin: req.user.id }).select("-password");
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.status(200).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


//user limit update
// PUT /api/clients/:clientId/user-limit
exports.setUserLimit = async (req, res) => {
  const { clientId } = req.params;
  const { userLimit } = req.body;

  try {
    const client = await Client.findByIdAndUpdate(
      clientId,
      { userLimit },
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    res.json({ message: "User limit updated", client });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
