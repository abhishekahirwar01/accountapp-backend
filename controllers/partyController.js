const Party = require("../models/Party");

exports.createParty = async (req, res) => {
  try {
    const { name, contactNumber, email, address } = req.body;

    const party = new Party({
      name,
      contactNumber,
       email,
        address,
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
    const parties = await Party.find({ createdByClient: req.user.id });
    res.json(parties);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateParty = async(req, res) => {
  try {
      const partyId = req.params.id;
      const { name, contactNumber, email, address } = req.body;
  
      const party = await Party.findById(partyId);
      if (!party) {
        return res.status(404).json({ message: "Vendor not found" });
      }
  
      // Authorization check: only creator client or admin
      if (req.user.role !== "admin" && party.createdByClient.toString() !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this vendor" });
      }
  
      if (name) party.name = name;
      if (contactNumber) party.contactNumber = contactNumber;
      if (email) party.email = email;
      if (address) party.address = address;
  
      await party.save();
      res.status(200).json({ message: "Vendor updated", party});
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: "Duplicate vendor details" });
      }
      res.status(500).json({ message: "Server error", error: err.message });
    }
}

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