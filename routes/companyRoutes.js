const express = require("express");
const router = express.Router();
const {
  createCompany,
  getClientCompanies,
  getAllCompanies,
    updateCompany,
    deleteCompany,
    getCompaniesByClientId
} = require("../controllers/companyController");

const verifyClient = require("../middleware/verifyClient");
const verifyMasterAdmin = require("../middleware/verifyMasterAdmin");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");

// Client creates company
router.post("/", verifyClient, createCompany);

// // Client views own companies
router.get("/my", verifyClientOrAdmin, getClientCompanies);

// // Master Admin views all companies
router.get("/all", verifyMasterAdmin, getAllCompanies);
// router.get("/", verifyClientOrAdmin, getCompanies);

// Update company (client or master)
router.put("/:id", verifyClientOrAdmin, updateCompany);

// Delete company (client or master)
router.delete("/:id", verifyClientOrAdmin, deleteCompany);

router.get("/by-client/:clientId", verifyClientOrAdmin, getCompaniesByClientId);



module.exports = router;
