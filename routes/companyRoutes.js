const express = require("express");
const router = express.Router();
const { uploadLogo } = require("../middleware/uploadLogo");
const {
  createCompany,
  createCompanyByClient,
  getClientCompanies,
  getAllCompanies,
    updateCompany,
    deleteCompany,
    getCompaniesByClientId,
    getMyCompanies,
    getCompany
} = require("../controllers/companyController");

const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const verifyClient = require("../middleware/verifyClient");
const Company = require("../models/Company");

// Check duplicate registration number
router.get('/check-duplicate', verifyClientOrAdmin, async (req, res) => {
  try {
    const { registrationNumber } = req.query;
    
    if (!registrationNumber) {
      return res.status(400).json({ message: 'Registration number is required' });
    }
    
    const existing = await Company.findOne({ 
      registrationNumber: registrationNumber 
    });
    
    res.json({ exists: !!existing });
  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({ message: 'Error checking duplicate' });
  }
});

// Master Admin views all companies
router.get("/all", verifyMasterAdmin, getAllCompanies);

// Get my companies (role-agnostic)
router.get("/my", verifyClientOrAdmin, getMyCompanies);

// Get companies by client ID
router.get("/by-client/:clientId", verifyMasterAdmin, getCompaniesByClientId);

// ✅ POST ROUTES


// Master Admin creates company
router.post("/", verifyMasterAdmin,uploadLogo, createCompany);

// Client creates company
router.post("/create", verifyClient,uploadLogo, createCompanyByClient);

// // Client views own companies
// router.get("/my", verifyClientOrAdmin, getClientCompanies);


// // Master Admin views all companies
router.get("/all", verifyMasterAdmin, getAllCompanies);
// router.get("/", verifyClientOrAdmin, getCompanies);

// Update company (client or master)
router.put("/:id", verifyClientOrAdmin, uploadLogo, updateCompany);

// Delete company (client or master)
router.delete("/:id", verifyClientOrAdmin, deleteCompany);

// Get single company by ID - YE SABSE LAST MEIN!
router.get("/:id", verifyClientOrAdmin, getCompany);



module.exports = router;