// controllers/bankDetailController.js
const BankDetail = require("../models/BankDetail");
const Company = require("../models/Company");
const Client = require("../models/Client");
const jwt = require('jsonwebtoken');

/** Build DB filter from query params & auth */
function buildFilter(req) {
  const f = {};
  // If you use req.user / req.auth, prefer limiting by client automatically
  // Example (align with your existing auth shape):
  if (req.user && req.user.role === "client") {
    f.client = req.user.id;
  }
  if (req.query.clientId) f.client = req.query.clientId;
  if (req.query.companyId) f.company = req.query.companyId;
  if (req.query.city) f.city = new RegExp(`^${req.query.city}$`, "i");
  if (req.query.bankName) f.bankName = new RegExp(req.query.bankName, "i");
  return f;
}

/** POST /api/bank-details */
exports.createBankDetail = async (req, res) => {
  try {
    // Extract client ID from the token
    const token = req.headers.authorization.split(" ")[1]; // Get the token from headers
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET); // Use your JWT secret key to verify the token

    // Create a new BankDetail with the client ID
    const { company, bankName, managerName, contactNumber, email, city, ifscCode, branchAddress } = req.body;
    
    const newBankDetail = new BankDetail({
      client:req.auth.clientId, // Assign the client from the token
      user:req.auth.userId,
      company,
      bankName,
      managerName,
      contactNumber,
      email,
      city,
      ifscCode,
      branchAddress,
      createdByUser: decodedToken.userId, // If you want to assign the user who is creating the bank detail
    });

    await newBankDetail.save();
    res.status(201).json({ message: "Bank detail created successfully", bankDetail: newBankDetail });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Error creating bank detail" });
  }
};

/** GET /api/bank-details (list with search, filters, pagination) */
// exports.getBankDetails = async (req, res) => {
//   try {
//     const page = Math.max(parseInt(req.query.page || "1", 10), 1);
//     const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
//     const skip = (page - 1) * limit;

//     const filter = buildFilter(req);

//     // simple text search
//     const search = (req.query.search || "").trim();
//     const findQuery = BankDetail.find(
//       search
//         ? {
//             $and: [
//               filter,
//               { $text: { $search: search } },
//             ],
//           }
//         : filter
//     )
//       .populate("client", "contactName email")
//       .populate("company", "businessName")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const [items, total] = await Promise.all([
//       findQuery.exec(),
//       BankDetail.countDocuments(search ? { $and: [filter, { $text: { $search: search } }] } : filter),
//     ]);

//     return res.status(200).json({
//       success: true,
//       page,
//       limit,
//       total,
//       data: items,
//     });
//   } catch (err) {
//     console.error("getBankDetails error:", err);
//     return res.status(500).json({ message: "Failed to fetch bank details", error: err.message });
//   }
// };


/** GET /api/bank-details */
exports.getBankDetails = async (req, res) => {
  try {
    const { role, companies = [], createdByClient } = req.user || {};
    let query;

    // Employees (including admin) → only explicitly assigned companies
    if (["user", "manager", "admin"].includes(role)) {
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.json([]);
      }
      query = { company: { $in: companies } };
    }
    // Tenant owners
    else if (["client", "customer"].includes(role)) {
      query = { client: req.user.id };
    }
    // Master (optional: constrain to tenant if you want)
    else if (role === "master") {
      query = createdByClient ? { client: createdByClient } : {};
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    const bankDetails = await BankDetail.find(query)
      .populate("client", "contactName email")
      .populate("company", "businessName")
      .lean();

    return res.json(bankDetails);
  } catch (err) {
    console.error("getMyBankDetails error:", err);
    return res.status(500).json({ message: "Failed to fetch bank details", error: err.message });
  }
};


/** GET /api/bank-details/:id */
exports.getBankDetailById = async (req, res) => {
  try {
    const doc = await BankDetail.findById(req.params.id)
      .populate("client", "contactName email")
      .populate("company", "businessName");
    if (!doc) return res.status(404).json({ message: "Bank detail not found" });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    console.error("getBankDetailById error:", err);
    return res.status(500).json({ message: "Failed to fetch bank detail", error: err.message });
  }
};

/** PUT /api/bank-details/:id */
exports.updateBankDetail = async (req, res) => {
  try {
    const update = {
      client: req.body.client,
      company: req.body.company,
      clientName: req.body.clientName,
      businessName: req.body.businessName,
      bankName: req.body.bankName,
      managerName: req.body.managerName,
      contactNumber: req.body.contactNumber,
      post: req.body.post,
      email: req.body.email,
      city: req.body.city,
      ifscCode: req.body.ifscCode,
      branchAddress: req.body.branchAddress,
    };

    // remove undefined keys to avoid overwriting with undefined
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    const doc = await BankDetail.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!doc) return res.status(404).json({ message: "Bank detail not found" });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    console.error("updateBankDetail error:", err);
    return res.status(500).json({ message: "Failed to update bank detail", error: err.message });
  }
};

/** DELETE /api/bank-details/:id */
exports.deleteBankDetail = async (req, res) => {
  try {
    const doc = await BankDetail.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bank detail not found" });
    return res.status(200).json({ success: true, message: "Bank detail deleted" });
  } catch (err) {
    console.error("deleteBankDetail error:", err);
    return res.status(500).json({ message: "Failed to delete bank detail", error: err.message });
  }
};
