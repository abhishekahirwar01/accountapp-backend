const User = require("../models/User");
const Company = require("../models/Company");
const bcrypt = require("bcryptjs");
const Client = require("../models/Client");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
// 👇 NEW
const Role = require("../models/Role");
// already there
const ALL_ROLES = User.schema.path("role").enumValues; // ["admin","manager","user"]


async function getActorRoleDoc(req) {
  if (req.user?.roleId && mongoose.Types.ObjectId.isValid(req.user.roleId)) {
    const r = await Role.findById(req.user.roleId);
    if (r) return r;
  }
  if (req.user?.role) {
    const r = await Role.findOne({ name: String(req.user.role).toLowerCase() });
    if (r) return r;
  }
  return null;
}

// Default rule: actor can assign any role with lower rank
// (or use actor.canAssign override if you add that field)
function canAssignRole(actorRoleDoc, targetRoleDoc) {
  if (!actorRoleDoc || !targetRoleDoc) return false;
  // If you later add canAssign override:
  // if (Array.isArray(actorRoleDoc.canAssign) && actorRoleDoc.canAssign.length) {
  //   return actorRoleDoc.canAssign.some(id => String(id) === String(targetRoleDoc._id));
  // }
  return (targetRoleDoc.rank || 0) < (actorRoleDoc.rank || 0);
}


// NEW: map whoever is logged in to an effective role for assignment checks
async function getEffectiveActorRole(req) {
  // If the token has a valid app role, use it
  if (req.user && ALL_ROLES.includes(req.user.role)) return req.user.role;

  // If this token is for a Client (tenant owner), treat as admin
  // (adjust these checks to match your auth payload)
  if (req.user && (req.user.accountType === "client" || req.user.isClientOwner === true || req.user.type === "client")) {
    return "admin";
  }

  // Fallback: does a Client with this id exist? If yes, treat as admin.
  try {
    if (req.user?.id && await Client.exists({ _id: req.user.id })) return "admin";
  } catch (_) { }

  return "user";
}

function assignableRolesFor(currentRole) {
  if (currentRole === "admin") return ALL_ROLES;
  if (currentRole === "manager") return ["user"]; // or ["manager","user"] if you prefer
  return ["user"];
}


exports.createUser = async (req, res) => {
  try {
    const {
      userName,
      userId,
      password,
      contactNumber,
      address,
      companies = [],
      roleId,        // 👈 prefer this from UI
      roleName,      // or this (e.g., "user")
      permissions = []
    } = req.body;

    // 1) resolve target role
    let targetRole = null;
    if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
      targetRole = await Role.findById(roleId);
    } else if (roleName) {
      targetRole = await Role.findOne({ name: String(roleName).toLowerCase() });
    }
    if (!targetRole) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // 2) check actor can assign
    const actorRole = await getActorRoleDoc(req);
    if (!canAssignRole(actorRole, targetRole)) {
      return res.status(403).json({ message: "Not allowed to assign this role" });
    }

    // 3) companies belong to same tenant
    const clientId = req.user.createdByClient || req.user.id; // works for client/admin tokens
    const validCompanies = await Company.find({ _id: { $in: companies }, client: clientId });
    if ((companies?.length || 0) !== validCompanies.length) {
      return res.status(400).json({ message: "Invalid companies selected" });
    }

    // 4) user limit
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const userCount = await User.countDocuments({ createdByClient: clientId });
    if (userCount >= client.userLimit) {
      return res.status(403).json({ message: "User creation limit reached. Please contact admin." });
    }

    // 5) create
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      userName,
      userId,
      password: hashedPassword,
      contactNumber,
      address,
      role: targetRole._id,     // 👈 store role ref
      permissions,              // optional per-user grants
      companies,
      createdByClient: clientId
    });

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
    const actorRoleName = String(req.user.role || "").toLowerCase();
    const clientId = req.user.createdByClient || req.user.id;

    const query =
      actorRoleName === "admin" || actorRoleName === "master"
        ? { createdByClient: clientId } // or {} if you want admin to see all tenants
        : { createdByClient: clientId };

    const users = await User.find(query).populate("companies").populate("role");

    res.status(200).json(users);
  } catch (err) {
    console.error("🔥 Error in /api/users:", err);
    res.status(500).json({ error: err.message });
  }
};



exports.updateUser = async (req, res) => {
  try {
    const { userName, contactNumber, address, companies, password, roleId, roleName, permissions } = req.body;
    const userId = req.params.id;

    const doc = await User.findById(userId);
    if (!doc) return res.status(404).json({ message: "User not found" });

    const actorRole = await getActorRoleDoc(req);
    const clientId = req.user.createdByClient || req.user.id;

    // Only allow updates by same client or high-privileged roles as you wish
    if (String(doc.createdByClient) !== String(clientId) &&
        (String(req.user.role).toLowerCase() !== "admin" && String(req.user.role).toLowerCase() !== "master")) {
      return res.status(403).json({ message: "Not authorized to update this user" });
    }

    // Role change
    if (roleId || roleName) {
      let targetRole = null;
      if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
        targetRole = await Role.findById(roleId);
      } else if (roleName) {
        targetRole = await Role.findOne({ name: String(roleName).toLowerCase() });
      }
      if (!targetRole) return res.status(400).json({ message: "Invalid role" });

      if (!canAssignRole(actorRole, targetRole)) {
        return res.status(403).json({ message: "Not allowed to assign this role" });
      }
      doc.role = targetRole._id;
    }

    // Companies validation
    if (Array.isArray(companies)) {
      const validCompanies = await Company.find({ _id: { $in: companies }, client: clientId });
      if (validCompanies.length !== companies.length) {
        return res.status(400).json({ message: "Invalid companies selected" });
      }
      doc.companies = companies;
    }

    if (typeof userName === "string") doc.userName = userName;
    if (typeof contactNumber === "string") doc.contactNumber = contactNumber;
    if (typeof address === "string") doc.address = address;
    if (Array.isArray(permissions)) doc.permissions = permissions;

    if (password) {
      doc.password = await bcrypt.hash(password, 10);
    }

    await doc.save();
    res.status(200).json({ message: "User updated", user: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const doc = await User.findById(userId);
    if (!doc) return res.status(404).json({ message: "User not found" });

    const actorRoleName = String(req.user.role || "").toLowerCase();
    const clientId = req.user.createdByClient || req.user.id;

    const isSameTenant = String(doc.createdByClient) === String(clientId);
    const isPrivileged = actorRoleName === "admin" || actorRoleName === "master";

    if (!isSameTenant && !isPrivileged) {
      return res.status(403).json({ message: "Not authorized to delete this user" });
    }

    await doc.deleteOne();
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


exports.getUsersByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client id" });
    }

    const actorRoleName = String(req.user.role || "").toLowerCase();
    const myTenant = req.user.createdByClient || req.user.id;

    if (actorRoleName !== "admin" && actorRoleName !== "master" && String(myTenant) !== String(clientId)) {
      return res.status(403).json({ message: "Not authorized to view users for this client" });
    }

    const clientExists = await Client.exists({ _id: clientId });
    if (!clientExists) return res.status(404).json({ message: "Client not found" });

    const users = await User.find({ createdByClient: clientId })
      .populate({ path: "companies", select: "_id businessName" })
      .populate("role")
      .lean();

    return res.status(200).json(users);
  } catch (err) {
    console.error("getUsersByClient error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};




exports.loginUser = async (req, res) => {
  try {
    const { userId, password } = req.body;

    const user = await User.findOne({ userId })
      .populate("companies")
      .populate("role"); // 👈 important

    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // permissions = role.permissions ∪ user.permissions
    const perms = Array.from(new Set([...(user.role?.permissions || []), ...(user.permissions || [])]));

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role?.name || "user",      // 👈 role NAME for convenience
        roleId: user.role?._id,               // 👈 role id
        perms,                                // 👈 capabilities
        companies: user.companies.map(c => c._id),
        createdByClient: user.createdByClient
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        userName: user.userName,
        role: user.role?.name || "user",     // 👈 send name, not ObjectId
        companies: user.companies,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
