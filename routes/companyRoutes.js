const express = require("express");
const router = express.Router();
const { uploadLogo } = require("../middleware/uploadLogo");
const {
  createCompany,
  getClientCompanies,
  getAllCompanies,
    updateCompany,
    deleteCompany,
    getCompaniesByClientId,
    getMyCompanies 
} = require("../controllers/companyController");

const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");



// Client creates company
router.post("/", verifyClientOrAdmin,uploadLogo, createCompany);

// // Client views own companies
// router.get("/my", verifyClientOrAdmin, getClientCompanies);


// // Master Admin views all companies
router.get("/all", verifyMasterAdmin, getAllCompanies);
// router.get("/", verifyClientOrAdmin, getCompanies);

// Update company (client or master)
router.put("/:id", verifyClientOrAdmin,uploadLogo, updateCompany);

// Delete company (client or master)
router.delete("/:id", verifyClientOrAdmin, deleteCompany);

router.get("/by-client/:clientId", verifyClientOrAdmin, getCompaniesByClientId);


// ✅ NEW: role-agnostic “my companies”
// Usage
router.get(
  "/my",
  verifyClientOrAdmin,
  getMyCompanies
);



module.exports = router;
