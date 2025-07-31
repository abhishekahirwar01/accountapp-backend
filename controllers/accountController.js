const Account = require("../models/Account");

exports.createAccount = async (req, res) => {
  try {
    const { name, email, balance } = req.body;
    const account = new Account({ name, email, balance });
    await account.save();
    res.status(201).json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find();
    res.status(200).json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
