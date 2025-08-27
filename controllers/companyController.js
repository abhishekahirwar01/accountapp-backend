const path = require("path");
const fs = require("fs");
const Company = require("../models/Company");
const Client = require("../models/Client");

// Helper to convert absolute file path to a public URL under /uploads
const toPublicUrl = (absPath) => {
  // absPath ends with .../uploads/company-logos/xyz.png
  const rel = path.relative(path.join(process.cwd(), "uploads"), absPath); // company-logos/xyz.png
  return `/uploads/${rel.replace(/\\/g, "/")}`;
};

// Optional: delete a file if it exists
const safeUnlink = (absPath) => {
  if (!absPath) return;
  fs.promises.unlink(absPath).catch(() => {});
};

// Create Company (Client Only)
exports.createCompany = async (req, res) => {
  try {
    const {
      registrationNumber,
      businessName,
      businessType,
      address,
      City,
      addressState,
      Country,
      Pincode,
      Telephone,
      mobileNumber,
      emailId,
      Website,
      PANNumber,
      IncomeTaxLoginPassword,
      gstin,
      gstState,
      RegistrationType,
      PeriodicityofGSTReturns,
      GSTUsername,
      GSTPassword,
      ewayBillApplicable,
      EWBBillUsername,
      EWBBillPassword,
      TANNumber,
      TAXDeductionCollectionAcc,
      DeductorType,
      TDSLoginUsername,
      TDSLoginPassword,
      selectedClient,
      logo,
    } = req.body;

    const existing = await Company.findOne({ registrationNumber });
    if (existing) {
      return res
        .status(400)
        .json({
          message: "Company with this registration number already exists",
        });
    }
    // Validate selectedClient if provided
    let assignedClientId = req.user.id;
    if (
      (req.user.role === "client" || req.user.role === "master") &&
      selectedClient
    ) {
      const assignedClient = await Client.findById(selectedClient);
      if (!assignedClient) {
        return res.status(404).json({ message: "Selected client not found" });
      }
      assignedClientId = selectedClient;
    }

    // Logo URL resolution: uploaded file takes priority
    let logoUrl = null;
    if (req.file && req.file.path) {
      logoUrl = toPublicUrl(req.file.path);
    } else if (typeof logo === "string" && logo.trim()) {
      logoUrl = logo.trim();
    }

    const company = new Company({
      registrationNumber,
      businessName,
      businessType,
      address,
      City,
      addressState,
      Country,
      Pincode,
      Telephone,
      mobileNumber,
      emailId,
      Website,
      PANNumber,
      IncomeTaxLoginPassword,
      gstin,
      gstState,
      RegistrationType,
      PeriodicityofGSTReturns,
      GSTUsername,
      GSTPassword,
      ewayBillApplicable,
      EWBBillUsername,
      EWBBillPassword,
      TANNumber,
      TAXDeductionCollectionAcc,
      DeductorType,
      TDSLoginUsername,
      TDSLoginPassword,
      client: assignedClientId,
      selectedClient: assignedClientId,
      logo: logoUrl,
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
    const companies = await Company.find().populate(
      "client",
      "clientUsername email"
    );
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Company (Client or Master Admin)
exports.updateCompany = async (req, res) => {
  try {
    const companyId = req.params.id;
    const {
      businessName,
      businessType,
      address,
      City,
      addressState,
      Country,
      Pincode,
      Telephone,
      mobileNumber,
      emailId,
      Website,
      PANNumber,
      IncomeTaxLoginPassword,
      gstin,
      gstState,
      RegistrationType,
      PeriodicityofGSTReturns,
      GSTUsername,
      GSTPassword,
      ewayBillApplicable,
      EWBBillUsername,
      EWBBillPassword,
      TANNumber,
      TAXDeductionCollectionAcc,
      DeductorType,
      TDSLoginUsername,
      TDSLoginPassword,
      selectedClient,
      logo,
    } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Allow only the client who owns the company or master admin
    if (
      req.user.role === "client" &&
      company.client.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Update fields
    company.businessName = businessName || company.businessName;
    company.businessType = businessType || company.businessType;
    company.address = address || company.address;
    company.City = City || company.City;
    company.addressState = addressState || company.addressState;
    company.Country = Country || company.Country;
    company.Pincode = Pincode || company.Pincode;
    company.Telephone = Telephone || company.Telephone;
    company.mobileNumber = mobileNumber || company.mobileNumber;
    company.emailId = emailId || company.emailId;
    company.Website = Website || company.Website;
    company.PANNumber = PANNumber || company.PANNumber;
    company.IncomeTaxLoginPassword =
      IncomeTaxLoginPassword || company.IncomeTaxLoginPassword;
    company.gstin = gstin || company.gstin;
    company.gstState = gstState || company.gstState;
    company.RegistrationType = RegistrationType || company.RegistrationType;
    company.PeriodicityofGSTReturns =
      PeriodicityofGSTReturns || company.PeriodicityofGSTReturns;
    company.GSTUsername = GSTUsername || company.GSTUsername;
    company.GSTPassword = GSTPassword || company.GSTPassword;
    company.ewayBillApplicable =
      ewayBillApplicable || company.ewayBillApplicable;
    company.EWBBillUsername = EWBBillUsername || company.EWBBillUsername;
    company.EWBBillPassword = EWBBillPassword || company.EWBBillPassword;
    company.TANNumber = TANNumber || company.TANNumber;
    company.TAXDeductionCollectionAcc =
      TAXDeductionCollectionAcc || company.TAXDeductionCollectionAcc;
    company.DeductorType = DeductorType || company.DeductorType;
    company.TDSLoginUsername = TDSLoginUsername || company.TDSLoginUsername;
    company.TDSLoginPassword = TDSLoginPassword || company.TDSLoginPassword;

    // Logo update logic
    if (req.file && req.file.path) {
      // New file uploaded → optionally delete previous local file (if it was local)
      const wasLocal = company.logo?.startsWith("/uploads/");
      if (wasLocal) {
        const prevAbs = path.join(
          process.cwd(),
          company.logo.replace(/^\/uploads\//, "uploads/")
        );
        safeUnlink(prevAbs);
      }
      company.logo = toPublicUrl(req.file.path);
    } else if (logo !== undefined) {
      // Allow URL set or clear (null)
      if (logo === null) {
        const wasLocal = company.logo?.startsWith("/uploads/");
        if (wasLocal) {
          const prevAbs = path.join(
            process.cwd(),
            company.logo.replace(/^\/uploads\//, "uploads/")
          );
          safeUnlink(prevAbs);
        }
        company.logo = null;
      } else if (typeof logo === "string") {
        company.logo = logo.trim();
      }
    }

    // If master admin, allow updating the assigned client
    if (req.user.role === "master" && selectedClient) {
      company.client = selectedClient;
    }

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
    if (
      req.user.role === "client" &&
      company.client.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (company.logo?.startsWith("/uploads/")) {
      const prevAbs = path.join(
        process.cwd(),
        company.logo.replace(/^\/uploads\//, "uploads/")
      );
      safeUnlink(prevAbs);
    }

    await Company.findByIdAndDelete(companyId);
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Companies by Client ID (Master Admin Only)
exports.getCompaniesByClientId = async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Only allow:
    // - masterAdmin to view any client
    // - OR the same client to view their own companies
    if (req.user.role !== "master" && req.user.id !== clientId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const companies = await Company.find({ client: clientId }).populate(
      "client",
      "clientUsername email"
    );

    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// NEW: unified "my" endpoint for all roles
// controllers/companyController.js (or wherever getMyCompanies lives)
exports.getMyCompanies = async (req, res) => {
  try {
    const { role, companies = [], createdByClient } = req.user || {};
    let query;

    // Employees (including admin) → only explicitly assigned companies
    if (["user", "manager", "admin"].includes(role)) {
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.json([]);
      }
      query = { _id: { $in: companies } };
    }
    // Tenant owners
    else if (["client", "customer"].includes(role)) {
      query = { client: req.user.id };
    }
    // Master (optional: constrain to tenant if you want)
    else if (role === "master") {
      query = createdByClient ? { client: createdByClient } : {};
    }
    else {
      return res.status(403).json({ message: "Forbidden" });
    }

    const list = await Company.find(query).lean();
    return res.json(list);
  } catch (err) {
    console.error("getMyCompanies error:", err);
    res.status(500).json({ message: "Failed to load companies" });
  }
};
