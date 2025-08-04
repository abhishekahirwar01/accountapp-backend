const JournalEntry = require("../models/JournalEntry");

exports.createJournal = async (req, res) => {
  try {
    const { debitAccount, creditAccount, date, amount, narration, company } = req.body;

    const journal = new JournalEntry({
      debitAccount,
      creditAccount,
      date,
      amount,
      narration,
      company,
      client: req.user.id,
    });

    await journal.save();
    res.status(201).json({ message: "Journal entry created", journal });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getJournals = async (req, res) => {
  try {
    const journals = await JournalEntry.find({ client: req.user.id }).populate("company");
    res.json(journals);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateJournal = async (req, res) => {
  try {
    const journal = await JournalEntry.findById(req.params.id);
    if (!journal) return res.status(404).json({ message: "Journal not found" });

    if (req.user.role !== "admin" && journal.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    Object.assign(journal, req.body);
    await journal.save();
    res.json({ message: "Journal updated", journal });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteJournal = async (req, res) => {
  try {
    const journal = await JournalEntry.findById(req.params.id);
    if (!journal) return res.status(404).json({ message: "Journal not found" });

    if (req.user.role !== "admin" && journal.client.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await journal.deleteOne();
    res.json({ message: "Journal deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



exports.getJournalsByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const journals = await JournalEntry.find({ client: clientId }).populate("company");
    res.json(journals);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
