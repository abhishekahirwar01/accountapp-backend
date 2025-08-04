const Party = require("../models/Party");

exports.createParty = async (req, res) => {
  try {
    const {
      name, address, city, state,
      gstin, gstRegistrationType,
      pan, isTDSApplicable,
      contactNumber, email
    } = req.body;

    const party = new Party({
      name, address, city, state,
      gstin, gstRegistrationType,
      pan, isTDSApplicable,
      contactNumber, email,
      createdByClient: req.user.id
    });

    await party.save();
    res.status(201).json({ message: "Party created", party });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Party already exists for this client" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};




exports.getParties = async (req, res) => {
  try {
    const parties = await Party.find({ createdByClient: req.user.id }).sort({ createdAt: -1 });
    res.json(parties);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.updateParty = async (req, res) => {
  try {
    const partyId = req.params.id;
    const updateData = req.body;

    const party = await Party.findById(partyId);
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    if (req.user.role !== "admin" && party.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this party" });
    }

    Object.assign(party, updateData);

    await party.save();
    res.status(200).json({ message: "Party updated", party });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate party details" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.deleteParty = async (req, res) => {
  try {
    const partyId = req.params.id;

    const party = await Party.findById(partyId);
    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && party.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this party" });
    }

    await party.deleteOne();
    res.status(200).json({ message: "party deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

