const Client = require("../models/Client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const slugifyUsername = require("../utils/slugify");
const Permission = require("../models/Permission");

// Create Client (Only Master Admin)
// Create Client (Only Master Admin)
exports.createClient = async (req, res) => {
  const session = await Client.startSession();
  session.startTransaction();

  try {
    const {
      clientUsername,
      password,
      contactName,
      phone,
      email,

      // If you want to seed Permission doc from request, keep these:
      maxCompanies = 5,
      maxUsers = 10,
      canSendInvoiceEmail = true,
      canSendInvoiceWhatsapp = false,
    } = req.body;

    const slug = slugifyUsername(clientUsername);
    if (!slug) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: "Invalid username/slug" });
    }

    // Duplicate checks (run outside transaction is also fine, but this is ok)
    const [existingUsername, existingSlug, existingEmail, existingPhone] = await Promise.all([
      Client.findOne({ clientUsername }).session(session),
      Client.findOne({ slug }).session(session),
      Client.findOne({ email }).session(session),
      Client.findOne({ phone }).session(session),
    ]);
    if (existingUsername) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Username already exists" }); }
    if (existingSlug)     { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Slug already exists" }); }
    if (existingPhone)    { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Phone already exists" }); }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 1) Create client
    const client = await Client.create([{
      clientUsername,
      slug,
      password: hashedPassword,
      contactName,
      phone,
      email,

      // You’re currently storing these on Client too; okay for now,
      // but consider keeping limits only on Permission to avoid duplication.
      maxCompanies,
      maxUsers,
      canSendInvoiceEmail,
      canSendInvoiceWhatsapp,

      role: "client",
      masterAdmin: req.user.id,
    }], { session });

    const createdClient = client[0];

    // 2) Create/Upsert default permissions for the new client
    // Anything you omit here will fall back to schema defaults
    await Permission.findOneAndUpdate(
      { client: createdClient._id },
      {
        $setOnInsert: {
          client: createdClient._id,
          maxCompanies,
          maxUsers,
          canSendInvoiceEmail,
          canSendInvoiceWhatsapp,
          // The rest will use Permission schema defaults:
          // canCreateUsers: false,
          // canCreateInventory: true,
          // canCreateCustomers: true,
          // canCreateVendors: true,
          // maxInventories: 20,
          // planCode: "FREE",
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        session,
      }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ message: "Client created successfully", client: createdClient });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ error: err.message });
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
exports.loginClient = async (req, res) => {
  try {
    // slug comes from URL: /api/:slug/login
    const { slug } = req.params;
    const { clientUsername, password } = req.body;

    const client = await Client.findOne({ slug });
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

     if (clientUsername && clientUsername !== client.clientUsername) {
     return res.status(403).json({ message: "Username mismatch for this tenant" });
   }

    const isMatch = await bcrypt.compare(password, client.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: client._id, role: "client", slug: client.slug },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      client: {
        id: client._id,
        clientUsername: client.clientUsername,
        slug: client.slug,
        contactName: client.contactName,
        email: client.email,
        phone: client.phone,
        role: client.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
