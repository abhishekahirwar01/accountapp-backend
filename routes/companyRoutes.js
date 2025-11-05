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
router.put("/:id", verifyClientOrAdmin,uploadLogo, updateCompany);

// Delete company (client or master)
router.delete("/:id", verifyClientOrAdmin, deleteCompany);

router.get("/by-client/:clientId", verifyMasterAdmin, getCompaniesByClientId);

// ✅ NEW: role-agnostic "my companies"
// Usage
router.get(
  "/my",
  verifyClientOrAdmin,
  getMyCompanies
);

// Get single company by ID
router.get("/:id", verifyClientOrAdmin, getCompany);



module.exports = router;
