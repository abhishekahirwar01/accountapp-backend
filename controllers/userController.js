const User = require("../models/User");
const Company = require("../models/Company");
const bcrypt = require("bcryptjs");

exports.createUser = async (req, res) => {
  try {
    const {
      userName,
      userId,
      password,
      contactNumber,
      address,
      companies // array of company IDs selected by the client
    } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    // Verify companies are valid and belong to the client
    const validCompanies = await Company.find({
      _id: { $in: companies },
      client: req.user.id
    });

    if (validCompanies.length !== companies.length) {
      return res.status(400).json({ message: "Invalid companies selected" });
    }

      // ✅ Step 2: Fetch Client to get userLimit
    const client = await Client.findById(req.user.id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // ✅ Step 3: Count existing users created by this client
    const userCount = await User.countDocuments({ createdByClient: req.user.id });

    // ✅ Step 4: Check against limit
    if (userCount >= client.userLimit) {
      return res.status(403).json({ message: "User creation limit reached. Please contact admin." });
    }

    const newUser = new User({
      userName,
      userId,
      password: hashedPassword,
      contactNumber,
      address,
      companies,
      createdByClient: req.user.id
    });

    await newUser.save();

    res.status(201).json({ message: "User created", user: newUser });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "User ID already exists" });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {}
        : { createdByClient: req.user.id };

    const users = await User.find(query).populate("companies");

    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.updateUser = async (req, res) => {
  try {
    const { userName, contactNumber, address, companies, password } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only allow updates by the same client or admin
    if (req.user.role !== "admin" && user.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this user" });
    }

    // Validate companies belong to the same client
    if (companies && companies.length > 0) {
      const validCompanies = await Company.find({
        _id: { $in: companies },
        client: req.user.id
      });

      if (validCompanies.length !== companies.length) {
        return res.status(400).json({ message: "Invalid companies selected" });
      }

      user.companies = companies;
    }

    if (userName) user.userName = userName;
    if (contactNumber) user.contactNumber = contactNumber;
    if (address) user.address = address;

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    res.status(200).json({ message: "User updated", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only allow deletion by the same client or admin
    if (req.user.role !== "admin" && user.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this user" });
    }

    await user.deleteOne();

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Old password is incorrect." });

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedNewPassword;
    await user.save();

    res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};
