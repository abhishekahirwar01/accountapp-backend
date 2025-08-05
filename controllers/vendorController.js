const Vendor = require("../models/Vendor");

exports.createVendor = async (req, res) => {
  try {
    const {
      vendorName,
      contactNumber,
      email,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable
    } = req.body;

    const vendor = new Vendor({
      vendorName,
      contactNumber,
      email,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable,
      createdByClient: req.user.id,
    });

    await vendor.save();
    res.status(201).json({ message: "Vendor created", vendor });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Vendor already exists for this client (duplicate name or contact/email)" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.getVendors = async (req, res) => {
  try {
    const filter = req.user.role === "admin"
      ? {} // admin sees all
      : { createdByClient: req.user.id }; // client sees only their vendors

    const vendors = await Vendor.find(filter).sort({ createdAt: -1 });

    res.status(200).json({ vendors });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const {
      vendorName,
      contactNumber,
      email,
      address,
      city,
      state,
      gstin,
      gstRegistrationType,
      pan,
      isTDSApplicable
    } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Authorization: only creator client or admin
    if (req.user.role !== "admin" && vendor.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this vendor" });
    }

    if (vendorName) vendor.vendorName = vendorName;
    if (contactNumber) vendor.contactNumber = contactNumber;
    if (email) vendor.email = email;
    if (address) vendor.address = address;
    if (city) vendor.city = city;
    if (state) vendor.state = state;
    if (gstin) vendor.gstin = gstin;
    if (gstRegistrationType) vendor.gstRegistrationType = gstRegistrationType;
    if (pan) vendor.pan = pan;
    if (typeof isTDSApplicable === 'boolean') vendor.isTDSApplicable = isTDSApplicable;

    await vendor.save();
    res.status(200).json({ message: "Vendor updated", vendor });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Duplicate vendor details" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.deleteVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && vendor.createdByClient.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this vendor" });
    }

    await vendor.deleteOne();
    res.status(200).json({ message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

