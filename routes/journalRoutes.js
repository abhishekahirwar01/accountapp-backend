const express = require("express");
const router = express.Router();
const journalController = require("../controllers/journalController");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");

router.post("/", verifyClientOrAdmin, journalController.createJournal);
router.get("/", verifyClientOrAdmin, journalController.getJournals);
router.put("/:id", verifyClientOrAdmin, journalController.updateJournal);
router.delete("/:id", verifyClientOrAdmin, journalController.deleteJournal);
router.get("/by-client/:clientId", verifyClientOrAdmin, journalController.getJournalsByClient);

module.exports = router;
