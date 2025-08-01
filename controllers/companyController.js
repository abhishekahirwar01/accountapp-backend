const Company = require("../models/Company");

// Create Company (Client Only)
exports.createCompany = async (req, res) => {
  try {
    const {
      registrationNumber,
      companyName,
      address,
      companyOwner,
      contactNumber,
      gstin
    } = req.body;

    const existing = await Company.findOne({ registrationNumber });
    if (existing) {
      return res.status(400).json({ message: "Company with this registration number already exists" });
    }

    const company = new Company({
      registrationNumber,
      companyName,
      address,
      companyOwner,
      contactNumber,
      gstin,
      client: req.user.id
    });

    await company.save();
    res.status(201).json({ message: "Company created successfully", company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Companies of Client (Client Only)
exports.getClientCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ client: req.user.id });
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// // Get All Companies (Master Admin Only)
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find().populate("client", "clientUsername email");
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// exports.getCompanies = async (req, res) => {
//   try {
//     let companies;

//     if (req.user.role === "master") {
//       // Master Admin gets all companies
//       companies = await Company.find().populate("client", "clientUsername email");
//     } else if (req.user.role === "client") {
//       // Client gets only their companies
//       companies = await Company.find({ client: req.user.id });
//     } else {
//       return res.status(403).json({ message: "Unauthorized role" });
//     }

//     res.status(200).json(companies);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };


// Update Company (Client or Master Admin)
exports.updateCompany = async (req, res) => {
  try {
    const companyId = req.params.id;
    const {
      registrationNumber,
      companyName,
      address,
      companyOwner,
      contactNumber,
      gstin
    } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Allow only owner (client) or master admin
    if (req.user.role === "client" && company.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Update fields
    company.registrationNumber = registrationNumber || company.registrationNumber;
    company.companyName = companyName || company.companyName;
    company.address = address || company.address;
    company.companyOwner = companyOwner || company.companyOwner;
    company.contactNumber = contactNumber || company.contactNumber;
    company.gstin = gstin || company.gstin;

    await company.save();
    res.status(200).json({ message: "Company updated", company });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete Company (Client or Master Admin)
exports.deleteCompany = async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Allow only owner (client) or master admin
    if (req.user.role === "client" && company.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    await Company.findByIdAndDelete(companyId);
    res.status(200).json({ message: "Company deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

