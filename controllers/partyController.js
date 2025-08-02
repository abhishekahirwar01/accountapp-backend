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
