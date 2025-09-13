// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const BankDetail = require("../models/BankDetail");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { issueSalesInvoiceNumber } = require("../services/invoiceIssuer");
const { getFromCache, setToCache } = require('../RedisCache');
const { deleteSalesEntryCache, deleteSalesEntryCacheByUser } = require('../utils/cacheHelpers');
// at top of controllers/salesController.js
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const User = require("../models/User");
const Client = require("../models/Client");
const Role = require("../models/Role")


const PRIV_ROLES = new Set(["master", "client", "admin"]);

async function ensureAuthCaps(req) {
  // Normalize: support old middlewares that used req.user
  if (!req.auth && req.user)
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      userName: req.user.userName || 'Unknown',  // Ensure userName is set here
    };

  // If there's no auth context, throw error
  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  // If caps or allowedCompanies are missing, load them
  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }

  // If userName is still not set, query the database for user details
  if (!req.auth.userName) {
    const user = await User.findById(req.auth.userId);  // Assuming the userId is correct
    req.auth.userName = user ? user.userName : 'Unknown';  // Fallback to 'Unknown' if user is not found
  }
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth.role);
}

function companyAllowedForUser(req, companyId) {
  if (userIsPriv(req)) return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  return allowed.length === 0 || allowed.includes(String(companyId));
}


// In your getSalesEntries controller
exports.getSalesEntries = async (req, res) => {
  try {
    const filter = {};

    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role === "client") {
      filter.client = req.user.id;
    }
    if (req.query.companyId) {
      filter.company = req.query.companyId;
    }

    // Construct a cache key based on the filter
    const cacheKey = `salesEntries:${JSON.stringify(filter)}`;

    // Check if the data is cached in Redis
    const cachedEntries = await getFromCache(cacheKey);
    if (cachedEntries) {
      // If cached, return the data directly
      return res.status(200).json({
        success: true,
        count: cachedEntries.length,
        data: cachedEntries,
      });
    }

    // If not cached, fetch the data from the database
    const entries = await SalesEntry.find(filter)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      }) // ✅
      .populate("company", "businessName")
      .sort({ date: -1 });
    // Return consistent format

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

    res.status(200).json({
      success: true,
      count: entries.length,
      data: entries, // Use consistent key
    });
  } catch (err) {
    console.error("Error fetching sales entries:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};


// GET Sales Entries by clientId (for master admin)
exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Construct a cache key based on clientId
    const cacheKey = `salesEntriesByClient:${clientId}`;

    // Check if the data is cached in Redis
    const cachedEntries = await getFromCache(cacheKey);
    if (cachedEntries) {
      // If cached, return the data directly
      return res.status(200).json({
        success: true,
        count: cachedEntries.length,
        data: cachedEntries,
      });
    }

    // Fetch data from database if not cached
    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("company", "businessName")
      .sort({ date: -1 });

    // Cache the fetched data in Redis for future requests
    await setToCache(cacheKey, entries);

    // Return the fetched data
    res.status(200).json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch entries", error: err.message });
  }
};





exports.createSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let entry, companyDoc, partyDoc, selectedBank;

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res.status(403).json({ message: "Not allowed to create sales entries" });
    }

    // Destructure the request body
    const { company: companyId, paymentMethod, party, totalAmount, bank } = req.body;

    if (!party) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    // Handle Credit Payment
    if (paymentMethod === "Credit") {
      partyDoc = await Party.findById(party);
      if (!partyDoc) {
        return res.status(404).json({ message: "Customer not found" });
      }
      partyDoc.balance += totalAmount;
      await partyDoc.save();
    }

    // Validate company
    if (!companyAllowedForUser(req, companyId)) {
      return res.status(403).json({ message: "You are not allowed to use this company" });
    }

    await session.withTransaction(async () => {
      // Handle transaction logic here
      const {
        party,
        company: companyId,
        date,
        products,
        services,
        totalAmount,
        description,
        referenceNumber,
        gstPercentage,
        gstRate,
        discountPercentage,
        invoiceType,
        taxAmount: taxAmountIn,
        invoiceTotal: invoiceTotalIn,
      } = req.body;

      companyDoc = await Company.findOne({
        _id: companyId,
        client: req.auth.clientId,
      }).session(session);

      if (!companyDoc) throw new Error("Invalid company selected");

      partyDoc = await Party.findOne({
        _id: party,
        createdByClient: req.auth.clientId,
      }).session(session);

      if (!partyDoc) throw new Error("Customer not found or unauthorized");

      // Handle bank selection if available
      if (bank) {
        selectedBank = await BankDetail.findById(bank);
        if (!selectedBank || !selectedBank.company.equals(companyId)) {
          throw new Error("Invalid bank selected for this company");
        }
      }

      // Normalize products and services
      let normalizedProducts = [], productsTotal = 0, productsTax = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeProducts(products, req.auth.clientId);
        normalizedProducts = items;
        productsTotal = computedTotal;
        productsTax = computedTax;
      }

      let normalizedServices = [], servicesTotal = 0, servicesTax = 0;
      if (Array.isArray(services) && services.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeServices(services, req.auth.clientId);
        normalizedServices = items;
        servicesTotal = computedTotal;
        servicesTax = computedTax;
      }

      const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0);
      const computedTaxAmount = (productsTax || 0) + (servicesTax || 0);

      const finalTotal = typeof totalAmount === "number"
        ? totalAmount
        : typeof invoiceTotalIn === "number"
          ? invoiceTotalIn
          : +(computedSubtotal + computedTaxAmount).toFixed(2);

      const finalTaxAmount = typeof taxAmountIn === "number"
        ? taxAmountIn
        : computedTaxAmount;

      const atDate = date ? new Date(date) : new Date();

      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } = await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

        try {
          // Create sales entry
          const docs = await SalesEntry.create(
            [
              {
                party: partyDoc._id,
                company: companyDoc._id,
                client: req.auth.clientId,
                date,
                products: normalizedProducts,
                services: normalizedServices,
                totalAmount: finalTotal,
                taxAmount: finalTaxAmount,
                subTotal: computedSubtotal,
                description,
                referenceNumber,
                gstPercentage: computedTaxAmount > 0
                  ? +((computedTaxAmount / computedSubtotal) * 100).toFixed(2)
                  : 0,
                discountPercentage,
                invoiceType,
                gstin: companyDoc.gstin || null,
                invoiceNumber,
                invoiceYearYY: yearYY,
                paymentMethod,
                bank: selectedBank ? selectedBank._id : null,
                createdByUser: req.auth.userId,
              },
            ],
            { session }
          );

          entry = docs[0];

          // Ensure only one response is sent
          if (!res.headersSent) {
            // After sales entry is created, notify the admin
            const adminRole = await Role.findOne({ name: "admin" });
            console.log("Admin role:", adminRole);
            if (!adminRole) {
              console.error("Admin role not found");
              return;
            }

            const adminUser = await User.findOne({
              role: adminRole._id
            });

            console.log("Admin user lookup:", { companyId, adminUser: adminUser ? adminUser._id : "not found" });

            console.log("Creating notification for admin user...");
            if (adminUser) {
              console.log("req.auth:", req.auth);
              const notificationMessage = `New sales entry created by ${req.auth.userName} for party ${partyDoc.name}.`;
              await createNotification(
                notificationMessage,
                adminUser._id,
                req.auth.userId,
                "create", // action type
                "sales", // entry type
                entry._id,
                req.auth.clientId
              );
              console.log("Notification created successfully.");
            }

            await IssuedInvoiceNumber.create(
              [
                {
                  company: companyDoc._id,
                  series: "sales",
                  invoiceNumber,
                  yearYY,
                  seq,
                  prefix,
                },
              ],
              { session }
            );

            // Send response after notification creation
            return res.status(201).json({ message: "Sales entry created successfully", entry });
          }
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) {
            continue;
          }
          throw e;
        }
      }
    });

  } catch (err) {
    console.error("createSalesEntry error:", err);
    return res.status(500).json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};




const sameTenant = (entryClientId, userClientId) => {
  return entryClientId.toString() === userClientId.toString();
};


// UPDATE a sales entry (replace your current function)
exports.updateSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res.status(403).json({ message: "Not allowed to update sales entries" });
    }

    // Find the sales entry by ID
    const entry = await SalesEntry.findById(req.params.id);
    if (!entry)
      return res.status(404).json({ message: "Sales entry not found" });

    // Tenant auth: allow privileged roles or same tenant only
    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { products, services, ...otherUpdates } = req.body;

    // If company is being changed, check permission + existence
    if (otherUpdates.company) {
      if (!companyAllowedForUser(req, otherUpdates.company)) {
        return res
          .status(403)
          .json({ message: "You are not allowed to use this company" });
      }
      const company = await Company.findOne({
        _id: otherUpdates.company,
        client: req.auth.clientId,
      });
      if (!company) {
        return res.status(400).json({ message: "Invalid company selected" });
      }
    }

    // If party is being changed, validate it belongs to the same tenant
    let partyDoc = null;
    if (otherUpdates.party) {
      partyDoc = await Party.findOne({
        _id: otherUpdates.party,
        createdByClient: req.auth.clientId,
      });
      if (!partyDoc) {
        return res
          .status(400)
          .json({ message: "Customer not found or unauthorized" });
      }
    }

    let productsTotal = 0;
    let servicesTotal = 0;

    // Normalize product lines only if provided (Array.isArray allows clearing with [])
    if (Array.isArray(products)) {
      const { items: normalizedProducts, computedTotal } =
        await normalizeProducts(products, req.auth.clientId);
      entry.products = normalizedProducts;
      productsTotal = computedTotal;
    }

    // Normalize service lines only if provided (Array.isArray allows clearing with [])
    if (Array.isArray(services)) {
      const { items: normalizedServices, computedTotal } =
        await normalizeServices(services, req.auth.clientId);
      entry.services = normalizedServices;
      servicesTotal = computedTotal;
    }

    // Don’t allow changing invoiceNumber/year from payload
    const { totalAmount, invoiceNumber, invoiceYearYY, gstRate, ...rest } =
      otherUpdates;
    if (typeof gstRate === "number") {
      entry.gstPercentage = gstRate;
    }
    Object.assign(entry, rest);

    // Recalculate total if not explicitly provided
    if (typeof totalAmount === "number") {
      entry.totalAmount = totalAmount;
    } else {
      const sumProducts =
        productsTotal ||
        (Array.isArray(entry.products)
          ? entry.products.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      const sumServices =
        servicesTotal ||
        (Array.isArray(entry.services)
          ? entry.services.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      entry.totalAmount = sumProducts + sumServices;
    }

    // After sales entry is updated, notify the admin and client
    const adminRole = await Role.findOne({ name: "admin" });
    if (!adminRole) {
      console.error("Admin role not found");
      return;
    }

    // Fetch admin user based on the company and admin role
    const adminUser = await User.findOne({
      role: adminRole._id,
      "companies": entry.company, // Use the company from the entry
    });

    console.log("Admin user lookup:", { adminUser: adminUser ? adminUser._id : "not found" });

    // Notify the admin if the adminUser is found
    if (adminUser) {
      const notificationMessage = `Sales entry updated by ${req.auth.userName || 'Unknown'} for party ${partyDoc ? partyDoc.name : 'Unknown Party'}.`;
      await createNotification(
        notificationMessage,
        adminUser._id,
        req.auth.userId,
        "update", // action type is update for this case
        "sales", // entry type
        entry._id,
        req.auth.clientId
      );
      console.log("Notification created successfully for admin.");
    }

    await entry.save();

    // Retrieve companyId and clientId from the sales entry to delete related cache
    const companyId = entry.company.toString();
    const clientId = entry.client.toString();  // Retrieve clientId from the entry

    // Call the reusable cache deletion function
    await deleteSalesEntryCache(clientId, companyId);

    res.json({ message: "Sales entry updated successfully", entry });
  } catch (err) {
    console.error("Error updating sales entry:", err);
    res.status(500).json({ error: err.message });
  }
};


// exports.deleteSalesEntry = async (req, res) => {
//   try {
//     // Find the sales entry by ID
//     const entry = await SalesEntry.findById(req.params.id);

//     if (!entry) {
//       return res.status(404).json({ message: "Sales entry not found" });
//     }

//     // Only allow clients to delete their own entries
//     if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     // Delete the sales entry
//     await entry.deleteOne();

//     // Retrieve companyId and clientId from the sales entry to delete related cache
//     const companyId = entry.company.toString();
//     const clientId = entry.client.toString();  // Retrieve clientId from the entry

//     // Check if the user field exists before trying to delete cache by user
//     const user = entry.user ? entry.user.toString() : null;

//     // Call the reusable cache deletion function
//     await deleteSalesEntryCache(clientId, companyId);

//     //  await deleteSalesEntryCacheByUser(clientId, companyId);


//     res.status(200).json({ message: "Sales entry deleted successfully" });
//   } catch (err) {
//     console.error("Error deleting sales entry:", err);
//     res.status(500).json({ error: err.message });
//   }
// };



exports.deleteSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
     await ensureAuthCaps(req);
    // Find the sales entry by ID
    const entry = await SalesEntry.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({ message: "Sales entry not found" });
    }

    // Only allow clients to delete their own entries
    if (req.user.role === "client" && entry.client.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Fetch the party document
    const partyDoc = await Party.findById(entry.party);
    if (!partyDoc) {
      console.error("Party not found");
      return res.status(400).json({ message: "Party not found" });
    }

    // Start the transaction
    await session.withTransaction(async () => {
      // Delete the sales entry
      await entry.deleteOne();

      // Retrieve companyId and clientId from the sales entry to delete related cache
      const companyId = entry.company.toString();
      const clientId = entry.client.toString();  // Retrieve clientId from the entry

      // Fetch admin user and client user
      const adminRole = await Role.findOne({ name: "admin" });
      if (!adminRole) {
        console.error("Admin role not found");
        return;
      }

      // Find the admin user by role
      const adminUser = await User.findOne({
        role: adminRole._id,
        "companies": companyId, // Ensure the admin is associated with the correct company
      });

      if (!adminUser) {
        console.error("Admin user not found");
        return;
      }

      // Create notification for admin
      const notificationMessageForAdmin = `Sales entry deleted by ${req.auth.userName || 'Unknown'} for party ${partyDoc.name}.`;
      await createNotification(
        notificationMessageForAdmin,
        adminUser._id,
        req.auth.userId,
        "delete", // action type
        "sales", // entry type
        entry._id,
        req.auth.clientId
      );
      console.log("Notification created successfully for admin.");
      // Call the reusable cache deletion function
      await deleteSalesEntryCache(clientId, companyId);

      // Send response after deletion and notification creation
      res.status(200).json({ message: "Sales entry deleted successfully" });
    });

  } catch (err) {
    console.error("Error deleting sales entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};




