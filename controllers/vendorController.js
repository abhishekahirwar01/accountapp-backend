// controllers/vendor.controller.js
const Vendor = require("../models/Vendor");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");

const PRIV_ROLES = new Set(["master", "client", "admin"]);

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth?.role);
}

async function ensureAuthCaps(req) {
  // normalize legacy req.user → req.auth
  if (!req.auth && req.user) {
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      // do NOT force "Unknown" – let resolver fetch names correctly
      userName: req.user.userName,       // may be undefined for clients
      clientName: req.user.contactName,  // if your auth layer sets it for clients
    };
  }
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    if (!req.auth.caps) req.auth.caps = caps;
    if (!req.auth.allowedCompanies) req.auth.allowedCompanies = allowedCompanies;
  }
}


// Build message text per action
function buildVendorNotificationMessage(action, { actorName, vendorName }) {
  const vName = vendorName || "Unknown Vendor";
  switch (action) {
    case "create":
      return `New vendor created by ${actorName}: ${vName}`;
    case "update":
      return `Vendor updated by ${actorName}: ${vName}`;
    case "delete":
      return `Vendor deleted by ${actorName}: ${vName}`;
    default:
      return `Vendor ${action} by ${actorName}: ${vName}`;
  }
}

// Unified notifier for vendor module
async function notifyAdminOnVendorAction({ req, action, vendorName, entryId }) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser();
  if (!adminUser) {
    console.warn("notifyAdminOnVendorAction: no admin user found");
    return;
  }

  const message = buildVendorNotificationMessage(action, {
    actorName: actor.name,
    vendorName,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "vendor", // entry type / category
    entryId, // vendor id
    req.auth.clientId
  );
}

exports.createVendor = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    // permission gate (non-privileged must have explicit capability)
    if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateVendors) {
      return res.status(403).json({ message: "Not allowed to create vendors" });
    }


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
      isTDSApplicable,
    } = req.body;

    // Validation - ONLY vendorName is required
if (!vendorName || vendorName.trim().length < 2) {
  return res.status(400).json({ message: "Vendor name is required and must be at least 2 characters." });
}

// Optional validations - only check if value is provided
if (contactNumber && !/^[6-9]\d{9}$/.test(contactNumber)) {
  return res.status(400).json({ message: "Invalid mobile number. Must be 10 digits starting with 6-9." });
}

if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return res.status(400).json({ message: "Invalid email format." });
}



    const vendor = await Vendor.create({
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
      createdByClient: req.auth.clientId,
      createdByUser: req.auth.userId,
    });

    // Notify admin after vendor created
    await notifyAdminOnVendorAction({
      req,
      action: "create",
      vendorName: vendor.vendorName,
      entryId: vendor._id,
    });

    res.status(201).json({ message: "Vendor created", vendor });
  } catch (err) {
    if (err.code === 11000) {
      // Better error message extraction
      const keyPattern = err.keyPattern;
      let message = "Duplicate field error";
      
      if (keyPattern.contactNumber && keyPattern.createdByClient) {
        message = "Contact number already exists for this client";
      } else if (keyPattern.email && keyPattern.createdByClient) {
        message = "Email already exists for this client";
      } else {
        // Log the actual duplicate field for debugging
        console.log("Duplicate key error details:", err.keyValue);
        message = `Duplicate field: ${Object.keys(err.keyValue)[0]}`;
      }
      
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 100,
    } = req.query;

    const where = { createdByClient: req.auth.clientId };

    if (q) {
      // search by name / email / phone
      where.$or = [
        { vendorName: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { contactNumber: { $regex: String(q), $options: "i" } },
      ];
    }

    const perPage = Math.min(Number(limit) || 100, 500);
    const skip = (Number(page) - 1) * perPage;

    const [vendors, total] = await Promise.all([
      Vendor.find(where).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Vendor.countDocuments(where),
    ]);

    res.json({ vendors, total, page: Number(page), limit: perPage });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getVendorBalance = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Check if vendor belongs to the same client
    const sameTenant = String(vendor.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.json({ balance: vendor.balance });
  } catch (err) {
    console.error("Error fetching vendor balance:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/vendors/balances
exports.getVendorBalancesBulk = async (req, res) => {
  try {
    const where = { createdByClient: req.auth.clientId };

    const rows = await Vendor.find(where)
      .select({ _id: 1, balance: 1 })
      .lean();

    const balances = {};

    return res.json({ balances });
  } catch (err) {
    console.error("getVendorBalancesBulk error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const doc = await Vendor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Vendor not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const up = req.body;
    if (up.vendorName != null) doc.vendorName = up.vendorName;
    if (up.contactNumber != null) doc.contactNumber = up.contactNumber;
    if (up.email != null) doc.email = up.email;
    if (up.address != null) doc.address = up.address;
    if (up.city != null) doc.city = up.city;
    if (up.state != null) doc.state = up.state;
    if (up.gstin != null) doc.gstin = up.gstin;
    if (up.gstRegistrationType != null) doc.gstRegistrationType = up.gstRegistrationType;
    if (up.pan != null) doc.pan = up.pan;
    if (typeof up.isTDSApplicable === "boolean") doc.isTDSApplicable = up.isTDSApplicable;

    await doc.save();

    // Notify admin after vendor updated
    await notifyAdminOnVendorAction({
      req,
      action: "update",
      vendorName: doc.vendorName,
      entryId: doc._id,
    });

    res.json({ message: "Vendor updated", vendor: doc });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      let message = `Duplicate ${field}`;
      if (field === "contactNumber") {
        message = "Contact number already exists for this client";
      } else if (field === "email") {
        message = "Email already exists for this client";
      }
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const doc = await Vendor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Vendor not found" });

    const sameTenant = String(doc.createdByClient) === req.auth.clientId;
    if (!PRIV_ROLES.has(req.auth.role) && !sameTenant) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Notify admin before deleting
    await notifyAdminOnVendorAction({
      req,
      action: "delete",
      vendorName: doc.vendorName,
      entryId: doc._id,
    });

    await doc.deleteOne();
    res.json({ message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Download import template
exports.downloadImportTemplate = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    // permission gate (non-privileged must have explicit capability)
    if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateVendors) {
      return res.status(403).json({ message: "Not allowed to import vendors" });
    }

    // Create Excel template with headers
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Vendor Import Template');

    // Define columns
    worksheet.columns = [
      { header: 'Vendor Name*', key: 'vendorname*', width: 20 },
      { header: 'Contact Number', key: 'contactnumber', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'GSTIN', key: 'gstin', width: 15 },
      { header: 'GST Registration Type', key: 'gstregistrationtype', width: 20 },
      { header: 'PAN', key: 'pan', width: 15 },
      { header: 'TDS Applicable (Yes/No)', key: 'istdsapplicable', width: 20 },
      { header: 'TDS Section', key: 'tdssection', width: 15 }
    ];

    // Add sample data row
    worksheet.addRow({
      'vendorname*': 'ABC Suppliers',
      contactnumber: '9876543210',
      email: 'contact@abc.com',
      address: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      gstin: '22AAAAA0000A1Z5',
      gstregistrationtype: 'Regular',
      pan: 'AAAAA0000A',
      'istdsapplicable': 'Yes',
      tdssection: '194C'
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vendor_import_template.xlsx"');

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Error generating template:', err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Import vendors from Excel/CSV
exports.importVendors = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    // permission gate (non-privileged must have explicit capability)
    if (!PRIV_ROLES.has(req.auth.role) && !req.auth.caps?.canCreateVendors) {
      return res.status(403).json({ message: "Not allowed to import vendors" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    let worksheet;

    // Determine file type and read accordingly
    if (req.file.originalname.endsWith('.csv')) {
      // Handle CSV
      const csv = require('csv-parser');
      const results = [];

      const buffer = req.file.buffer;
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);

      await new Promise((resolve, reject) => {
        bufferStream
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });

      // Convert CSV data to worksheet format
      worksheet = workbook.addWorksheet('Data');
      if (results.length > 0) {
        worksheet.columns = Object.keys(results[0]).map(key => ({ header: key, key }));
        results.forEach(row => worksheet.addRow(row));
      }
    } else {
      // Handle Excel
      await workbook.xlsx.load(req.file.buffer);
      worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        return res.status(400).json({ message: "No worksheet found in Excel file" });
      }
    }

    // Check if file is empty or has no data rows
    if (worksheet.rowCount <= 1) {
      return res.status(400).json({ message: "File appears to be empty or contains no data rows" });
    }

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = worksheet.getRow(1).getCell(colNumber).value;
          if (header) {
            // Clean header name to match our mapping
            const cleanHeader = header.toString().toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '').replace(/[^\w]/g, '');

            // Handle hyperlink cells - extract the text value
            let cellValue = cell.value;
            if (cell.hyperlink) {
              // If it's a hyperlink, use the hyperlink address or display text
              cellValue = cell.hyperlink;
            } else if (cell.value && typeof cell.value === 'object' && cell.value.text) {
              // Some hyperlink cells store value as object with text property
              cellValue = cell.value.text;
            }

            rowData[cleanHeader] = cellValue;
          }
        });
        rows.push(rowData);
      }
    });

    // Limit the number of rows to prevent abuse
    if (rows.length > 1000) {
      return res.status(400).json({ message: "File contains too many rows. Maximum allowed is 1000 rows." });
    }

    let importedCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Map columns (handle variations in column names)
        const vendorData = {
          vendorName: row.vendorname || row['vendorname*'],
          contactNumber: row.contactnumber,
          email: row.email,
          address: row.address,
          city: row.city,
          state: row.state,
          gstin: row.gstin,
          gstRegistrationType: row.gstregistrationtype,
          pan: row.pan,
          isTDSApplicable: (row.istdsapplicable || '').toString().toLowerCase() === 'yes',
          tdsSection: row.tdssection,
          createdByClient: req.auth.clientId,
          createdByUser: req.auth.userId,
        };

        // Validate required fields
        if (!vendorData.vendorName || vendorData.vendorName.toString().trim().length < 2) {
          errors.push(`Row ${i + 2}: Vendor name is required and must be at least 2 characters`);
          continue;
        }

        // Optional validations
        if (vendorData.contactNumber && !/^[6-9]\d{9}$/.test(vendorData.contactNumber.toString())) {
          errors.push(`Row ${i + 2}: Invalid mobile number format`);
          continue;
        }

        if (vendorData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendorData.email.toString())) {
          errors.push(`Row ${i + 2}: Invalid email format`);
          continue;
        }

        // Check for duplicate vendor name within the file
        const duplicateInFile = rows.slice(0, i).some(prevRow => {
          const prevVendorName = prevRow.vendorname || prevRow['vendorname*'];
          return prevVendorName?.toString().toLowerCase().trim() === vendorData.vendorName.toString().toLowerCase().trim();
        });
        if (duplicateInFile) {
          errors.push(`Row ${i + 2}: Duplicate vendor name within the file`);
          continue;
        }

        // Create vendor
        const createdVendor = await Vendor.create(vendorData);
        importedCount++;

        // Notify admin
        await notifyAdminOnVendorAction({
          req,
          action: "create",
          vendorName: vendorData.vendorName,
          entryId: createdVendor._id,
        });

      } catch (err) {
        if (err.code === 11000) {
          const field = Object.keys(err.keyValue)[0];
          errors.push(`Row ${i + 2}: Duplicate ${field} - ${err.keyValue[field]}`);
        } else {
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      }
    }

    res.json({
      message: "Import completed",
      importedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
