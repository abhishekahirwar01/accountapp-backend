const Party = require("../models/Party");

exports.createParty = async (req, res) => {
  try {
    const { name } = req.body;

    const party = new Party({
      name,
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
