// controllers/proformaController.js
const mongoose = require("mongoose");
const ProformaEntry = require("../models/ProformaEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const User = require("../models/User");
const BankDetail = require("../models/BankDetail");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { issueProformaInvoiceNumber } = require("../services/proformaInvoiceIssuer");
const {
  deleteSalesEntryCache,
} = require("../utils/cacheHelpers");
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");
const normalizeTravelServices = require("../utils/normalizeTravelServices");
const { normalizeCourierServices } = require("../utils/normalizeCourierServices");
const PRIV_ROLES = new Set(["master", "client", "admin"]);

async function ensureAuthCaps(req) {
  if (!req.auth && req.user)
    req.auth = {
      clientId: req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      caps: req.user.caps,
      allowedCompanies: req.user.allowedCompanies,
      userName: req.user.userName || "Unknown",
      clientName: req.user.contactName,
    };

  if (!req.auth) throw new Error("Unauthorized (no auth context)");

  if (!req.auth.caps || !Array.isArray(req.auth.allowedCompanies)) {
    const { caps, allowedCompanies } = await getEffectivePermissions({
      clientId: req.auth.clientId,
      userId: req.auth.userId,
    });
    req.auth.caps = req.auth.caps || caps;
    req.auth.allowedCompanies = req.auth.allowedCompanies || allowedCompanies;
  }

  if (req.auth.role !== "client" && !req.auth.userName && req.auth.userId) {
    const user = await User.findById(req.auth.userId)
      .select("displayName fullName name userName username email")
      .lean();
    req.auth.userName =
      user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.userName ||
      user?.username ||
      user?.email ||
      undefined;
  }
}

function userIsPriv(req) {
  return PRIV_ROLES.has(req.auth.role);
}

function companyAllowedForUser(req, companyId) {
  if (req.auth?.role === "master" || req.auth?.role === "client") return true;
  const allowed = Array.isArray(req.auth.allowedCompanies)
    ? req.auth.allowedCompanies.map(String)
    : [];
  return allowed.includes(String(companyId));
}

function buildProformaNotificationMessage(
  action,
  { actorName, partyName, invoiceNumber, amount }
) {
  const pName = partyName || "Unknown Party";
  switch (action) {
    case "create":
      return (
        `New proforma entry created by ${actorName} for party ${pName}` +
        (amount != null ? ` of ₹${amount}.` : ".")
      );
    case "update":
      return `Proforma entry updated by ${actorName} for party ${pName}.`;
    case "delete":
      return `Proforma entry deleted by ${actorName} for party ${pName}.`;
    default:
      return `Proforma entry ${action} by ${actorName} for party ${pName}.`;
  }
}

async function notifyAdminOnProformaAction({
  req,
  action,
  partyName,
  entryId,
  companyId,
  amount,
}) {
  const actor = await resolveActor(req);
  const adminUser = await findAdminUser(companyId);
  if (!adminUser) {
    console.warn("notifyAdminOnProformaAction: no admin user found");
    return;
  }

  const message = buildProformaNotificationMessage(action, {
    actorName: actor.name,
    partyName,
    amount,
  });

  await createNotification(
    message,
    adminUser._id,
    actor.id,
    action,
    "proforma",
    entryId,
    req.auth.clientId
  );
}
// Yeh function add karo
exports.getProformaEntryById = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const entry = await ProformaEntry.findById(req.params.id)
      .populate("party", "name email phoneNumber")
      .populate("products.product", "name unitType hsn pricePerUnit")
      .populate({ path: "services.service", select: "serviceName sac pricePerUnit", strictPopulate: false })
      .populate({ path: "travelServices.service", select: "serviceName sac", strictPopulate: false })
      .populate({
        path: "courierServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({ path: "additionalServices.service", select: "serviceName", strictPopulate: false })
      .populate("company", "businessName address gstin")
      .populate("bank")
      .lean();

    if (!entry) {
      return res.status(404).json({ message: "Proforma entry not found" });
    }

    // Tenant check
    if (req.auth.role !== "master" && String(entry.client) !== String(req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({ ...entry, type: "proforma" });
  } catch (err) {
    console.error("Error fetching proforma entry:", err);
    res.status(500).json({ error: err.message });
  }
};
// controllers/proformaController.js - WORKING VERSION WITH PAGINATION
exports.getProformaEntries = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const filter = {};

    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });

    // Scope all non-master roles to their tenant
    if (req.auth.role !== "master") {
      filter.client = req.auth.clientId;
    }
    if (!userIsPriv(req)) {
      const canShowAll = req.auth.caps?.canShowProformaEntries === true;
      if (!canShowAll) {
        // Restrict to entries created by this user only
        filter.createdByUser = req.auth.userId;
      }
    }
    // If companyId is provided, validate the user has access to it
    if (
      req.query.companyId &&
      req.query.companyId !== "all" &&
      req.query.companyId !== "undefined"
    ) {
      const companyId = req.query.companyId;

      if (!companyAllowedForUser(req, companyId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this company",
        });
      }

      filter.company = companyId;
    } else {
      if (req.auth.role !== "client" && req.auth.role !== "master") {
        const allowedCompanies = req.auth.allowedCompanies || [];

        if (allowedCompanies.length > 0) {
          filter.company = { $in: allowedCompanies.map(String) };
        } else {
          return res.status(200).json({
            success: true,
            total: 0,
            count: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
            data: [],
            message: "No companies assigned to this user",
          });
        }
      }
    }

    // Date range filtering
    const { startDate, endDate, dateFrom, dateTo } = req.query;
    const finalStart = startDate || dateFrom;
    const finalEnd = endDate || dateTo;

    if (finalStart || finalEnd) {
      filter.date = {};
      if (finalStart) filter.date.$gte = new Date(`${finalStart}T00:00:00`);
      if (finalEnd) filter.date.$lte = new Date(`${finalEnd}T23:59:59`);
    }
    // Search filtering
    if (req.query.q) {
      const searchTerm = String(req.query.q);
      filter.$or = [
        { description: { $regex: searchTerm, $options: "i" } },
        { proformaNumber: { $regex: searchTerm, $options: "i" } },
        { "party.name": { $regex: searchTerm, $options: "i" } },
      ];
    }

    console.log("Proforma filter:", JSON.stringify(filter, null, 2));

    // --- SERVER-SIDE PAGINATION ---
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;
    if (limit < 1 || limit > 5000) limit = 20;

    const total = await ProformaEntry.countDocuments(filter);

    let effectiveLimit = limit;
    if (total > 10000 && !req.query.limit) {
      console.log(`Large proforma dataset detected: ${total} entries. Auto-adjusting limit to 200.`);
      effectiveLimit = Math.min(200, limit);
    }

    const skip = (page - 1) * effectiveLimit;
    const totalPages = Math.ceil(total / effectiveLimit);

    let effectivePage = page;
    if (totalPages > 0 && page > totalPages) {
      effectivePage = totalPages;
    }

    const query = ProformaEntry.find(filter)
      .populate("party", "name email phoneNumber")
      .populate("products.product", "name unitType hsn pricePerUnit")
      .populate({
        path: "services.service",
        select: "serviceName sac pricePerUnit",
        strictPopulate: false,
      })
      .populate({
        path: "travelServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({
        path: "courierServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({
        path: "additionalServices.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate({
        path: "services.serviceName",
        select: "serviceName sac pricePerUnit",
        strictPopulate: false,
      })
      .populate("company", "businessName address gstin")
      .populate("shippingAddress", "addressLine1 city state postalCode")
      .populate("bank")
      .sort({ date: -1, createdAt: -1, _id: -1 });

    let entries;
    if (total <= 10000 && !req.query.page && !req.query.limit) {
      // Small dataset without pagination — return all (backward compatible)
      entries = await query.lean();
      effectivePage = 1;
      effectiveLimit = total;
    } else {
      entries = await query.skip(skip).limit(effectiveLimit).lean();
    }

    const typedEntries = entries.map((entry) => ({ ...entry, type: "proforma" }));

    res.status(200).json({
      success: true,
      total,
      count: typedEntries.length,
      page: effectivePage,
      limit: effectiveLimit,
      totalPages,
      data: typedEntries,
    });
  } catch (err) {
    console.error("Error fetching proforma entries:", err.message);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// GET Proforma Entries by clientId (for master admin)
exports.getProformaEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const entries = await ProformaEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate({
        path: "travelServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({
        path: "courierServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({
        path: "additionalServices.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("company", "businessName")
      .populate("shippingAddress")
      .populate("bank")
      .sort({ date: -1, createdAt: -1, _id: -1 });

    res.status(200).json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch entries", error: err.message });
  }
};

exports.createProformaEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let entry, companyDoc, partyDoc, selectedBank;

  try {
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateProformaEntries) {
      return res
        .status(403)
        .json({ message: "Not allowed to create proforma entries" });
    }

    const {
      company: companyId,
      paymentMethod,
      party,
      totalAmount,
      bank,
      shippingAddress,
    } = req.body;

    if (!party) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (!companyAllowedForUser(req, companyId)) {
      return res
        .status(403)
        .json({ message: "You are not allowed to use this company" });
    }

    await session.withTransaction(async () => {
      const {
        party,
        company: companyId,
        date,
        dueDate,
        products,
        services,
        travelServices,
        courierServices,
        additionalServices,
        totalAmount,
        description,
        referenceNumber,
        gstRate,
        discountPercentage,
        invoiceType,
        taxAmount: taxAmountIn,
        invoiceTotal: invoiceTotalIn,
        notes,
        shippingAddress,
        bank,
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

      let normalizedProducts = [], productsTotal = 0, productsTax = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeProducts(
          products, req.auth.clientId, req.auth.userId
        );
        normalizedProducts = items;
        productsTotal = computedTotal;
        productsTax = computedTax;
      }

      let normalizedServices = [], servicesTotal = 0, servicesTax = 0;
      if (Array.isArray(services) && services.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeServices(
          services, req.auth.clientId
        );
        normalizedServices = items;
        servicesTotal = computedTotal;
        servicesTax = computedTax;
      }

      let normalizedTravelServices = [], travelServicesTotal = 0, travelServicesTax = 0;
      if (Array.isArray(travelServices) && travelServices.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeTravelServices(
          travelServices, req.auth.clientId
        );
        normalizedTravelServices = items;
        travelServicesTotal = computedTotal;
        travelServicesTax = computedTax;
      }

      // After travelServices normalization block, add:

      // ✅ NEW: Normalize courier services
      let normalizedCourierServices = [],
        courierServicesTotal = 0,
        courierServicesTax = 0;

      if (Array.isArray(courierServices) && courierServices.length > 0) {
        // Process each courier service entry separately
        for (const courierService of courierServices) {
          const normalizedData = await normalizeCourierServices({
            courierServiceDetails: {
              service: courierService.service,
              serviceName: courierService.serviceName,
              sac: courierService.sac,
              bookingDate: courierService.bookingDate,
              description: courierService.description,
              trackingNumber: courierService.trackingNumber,
              status: courierService.status
            },
            senderDetails: courierService.senderDetails || {},
            receiverDetails: courierService.receiverDetails || {},
            courierItems: courierService.items || []
          });

          normalizedCourierServices.push(normalizedData);
          courierServicesTotal += normalizedData.totalTaxableAmount;
          courierServicesTax += normalizedData.totalTaxAmount;
        }
      }

      let normalizedAdditionalServices = [], additionalServicesTotal = 0;
      if (Array.isArray(additionalServices) && additionalServices.length > 0) {
        normalizedAdditionalServices = additionalServices.map(s => {
          const amount = Number(s.amount) || 0;
          additionalServicesTotal += amount;
          return {
            service: s.service,
            serviceName: s.serviceName || "",
            amount,
            description: s.description || "",
            serviceStartDate: s.serviceStartDate || null,
            serviceDueDate: s.serviceDueDate || null,
          };
        });
      }

      const computedSubtotal = (productsTotal || 0) + (servicesTotal || 0) +
        (travelServicesTotal || 0) + (courierServicesTotal || 0) + (additionalServicesTotal || 0);

        const computedTaxAmount = (productsTax || 0) + (servicesTax || 0) +
  (travelServicesTax || 0) + (courierServicesTax || 0);

      const finalTotal =
        typeof totalAmount === "number"
          ? totalAmount
          : typeof invoiceTotalIn === "number"
            ? invoiceTotalIn
            : +(computedSubtotal + computedTaxAmount).toFixed(2);

      const finalTaxAmount =
        typeof taxAmountIn === "number" ? taxAmountIn : computedTaxAmount;

      const atDate = date ? new Date(date) : new Date();

      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } =
          await issueProformaInvoiceNumber(companyDoc._id, atDate, { session });

        try {
          const docs = await ProformaEntry.create(
            [
              {
                party: partyDoc._id,
                company: companyDoc._id,
                client: req.auth.clientId,
                date,
                dueDate,
                products: normalizedProducts,
                services: normalizedServices,
                travelServices: normalizedTravelServices,
                courierServices: normalizedCourierServices,
                additionalServices: normalizedAdditionalServices,
                totalAmount: finalTotal,
                taxAmount: finalTaxAmount,
                subTotal: computedSubtotal,
                description,
                referenceNumber,
                gstPercentage:
                  computedTaxAmount > 0
                    ? +((computedTaxAmount / computedSubtotal) * 100).toFixed(2)
                    : 0,
                discountPercentage,
                invoiceType,
                gstin: companyDoc.gstin || null,
                invoiceNumber,
                invoiceYearYY: yearYY,
                paymentMethod,
                createdByUser: req.auth.userId,
                notes: notes || "",
                shippingAddress: shippingAddress,
                bank: bank,
              },
            ],
            { session }
          );

          entry = docs[0];

          if (!res.headersSent) {
            await notifyAdminOnProformaAction({
              req,
              action: "create",
              partyName: partyDoc?.name,
              entryId: entry._id,
              companyId: companyDoc?._id?.toString(),
              amount: entry?.totalAmount,
            });

            await IssuedInvoiceNumber.create(
              [
                {
                  company: companyDoc._id,
                  series: "proforma",
                  invoiceNumber,
                  yearYY,
                  seq,
                  prefix,
                },
              ],
              { session }
            );

            try {
              if (global.io) {
                console.log("📡 Emitting transaction-update (create proforma)...");

                const socketPayload = {
                  message: "New Proforma Entry",
                  type: "proforma",
                  action: "create",
                  entryId: entry._id,
                  amount: entry.totalAmount,
                  partyName: partyDoc?.name,
                };

                global.io
                  .to(`client-${req.auth.clientId}`)
                  .emit("transaction-update", socketPayload);

                global.io
                  .to("all-transactions-updates")
                  .emit("transaction-update", {
                    ...socketPayload,
                    clientId: req.auth.clientId,
                  });
              }
            } catch (socketError) {
              console.error(
                "⚠️ Socket Emit Failed (Proforma Create):",
                socketError.message
              );
            }

            return res
              .status(201)
              .json({ message: "Proforma entry created successfully", entry });
          }
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) continue;
          throw e;
        }
      }
    });

    const clientId = entry.client.toString();
    await deleteSalesEntryCache(clientId, companyId);
  } catch (err) {
    console.error("createProformaEntry error:", err);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: err.message });
  } finally {
    session.endSession();
  }
};

const sameTenant = (entryClientId, userClientId) => {
  return entryClientId.toString() === userClientId.toString();
};

// UPDATE a proforma entry
exports.updateProformaEntry = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateProformaEntries) {
      return res
        .status(403)
        .json({ message: "Not allowed to update proforma entries" });
    }

    const entry = await ProformaEntry.findById(req.params.id);
    if (!entry)
      return res.status(404).json({ message: "Proforma entry not found" });

    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const {
      products,
      services,
      travelServices,
      courierServices,
      additionalServices,
      paymentMethod,
      totalAmount,
      party,
      shippingAddress,
      bank,
      ...otherUpdates
    } = req.body;


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
    let travelServicesTotal = 0;
    let additionalServicesTotal = 0;
    let courierServicesTotal = 0;

    if (Array.isArray(products)) {
      const { items: normalizedProducts, computedTotal } =
        await normalizeProducts(products, req.auth.clientId);
      entry.products = normalizedProducts;
      productsTotal = computedTotal;
    }

    if (Array.isArray(services)) {
      const { items: normalizedServices, computedTotal } =
        await normalizeServices(services, req.auth.clientId);
      entry.services = normalizedServices;
      servicesTotal = computedTotal;
    }

    if (Array.isArray(travelServices)) {
      const { items: normalizedTravelServices, computedTotal } =
        await normalizeTravelServices(travelServices, req.auth.clientId);
      entry.travelServices = normalizedTravelServices;
      travelServicesTotal = computedTotal;
    }

    if (Array.isArray(courierServices)) {
      let normalizedCourierServices = [];
      let totalCourierAmount = 0;

      for (const courierService of courierServices) {
        const normalizedData = await normalizeCourierServices({
          courierServiceDetails: {
            service: courierService.service,
            serviceName: courierService.serviceName,
            sac: courierService.sac,
            bookingDate: courierService.bookingDate,
            description: courierService.description,
            trackingNumber: courierService.trackingNumber,
            status: courierService.status
          },
          senderDetails: courierService.senderDetails || {},
          receiverDetails: courierService.receiverDetails || {},
          courierItems: courierService.items || []
        });

        normalizedCourierServices.push(normalizedData);
        totalCourierAmount += normalizedData.totalTaxableAmount;
      }

      entry.courierServices = normalizedCourierServices;
      courierServicesTotal = totalCourierAmount;
    }

    if (Array.isArray(additionalServices)) {
      entry.additionalServices = additionalServices.map(s => {
        const amount = Number(s.amount) || 0;
        additionalServicesTotal += amount;
        return {
          service: s.service,
          serviceName: s.serviceName || "",
          amount,
          description: s.description || "",
          serviceStartDate: s.serviceStartDate || null,
          serviceDueDate: s.serviceDueDate || null,
        };
      });
    }

    const { invoiceNumber, invoiceYearYY, gstRate, notes, ...rest } = otherUpdates;
    if (typeof gstRate === "number") entry.gstPercentage = gstRate;
    if (notes !== undefined) entry.notes = notes;
    if (shippingAddress !== undefined) entry.shippingAddress = shippingAddress;
    if (bank !== undefined) entry.bank = bank;
    Object.assign(entry, rest);

    if (paymentMethod !== undefined) entry.paymentMethod = paymentMethod;
    if (party !== undefined) entry.party = party;

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
      const sumTravelServices =
        travelServicesTotal ||
        (Array.isArray(entry.travelServices)
          ? entry.travelServices.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      const sumAdditionalServices =
        additionalServicesTotal ||
        (Array.isArray(entry.additionalServices)
          ? entry.additionalServices.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      const sumCourierServices =
        courierServicesTotal ||
        (Array.isArray(entry.courierServices)
          ? entry.courierServices.reduce((s, it) => s + (Number(it.amount) || 0), 0)
          : 0);
      entry.totalAmount = sumProducts + sumServices + sumTravelServices + sumAdditionalServices + sumCourierServices;
    }

    await notifyAdminOnProformaAction({
      req,
      action: "update",
      partyName:
        (partyDoc ? partyDoc.name : null) ||
        entry?.party?.name ||
        "Unknown Party",
      entryId: entry._id,
      companyId: entry.company?.toString(),
    });

    await entry.save();
    const populatedEntry = await ProformaEntry.findById(entry._id)
      .populate("party", "name email phoneNumber")
      .populate("products.product", "name unitType hsn pricePerUnit")
      .populate({ path: "services.service", select: "serviceName sac pricePerUnit", strictPopulate: false })
      .populate({ path: "travelServices.service", select: "serviceName sac", strictPopulate: false })
      .populate({
        path: "courierServices.service",
        select: "serviceName sac",
        strictPopulate: false,
      })
      .populate({ path: "additionalServices.service", select: "serviceName", strictPopulate: false })
      .populate("company", "businessName address gstin")
      .populate("bank")
      .lean();
    const companyId = entry.company.toString();
    const clientId = entry.client.toString();
    await deleteSalesEntryCache(clientId, companyId);

    try {
      if (global.io) {
        console.log("📡 Emitting transaction-update (update proforma)...");

        const socketPayload = {
          message: "Proforma Entry Updated",
          type: "proforma",
          action: "update",
          entryId: entry._id,
          amount: entry.totalAmount,
          partyName:
            (partyDoc ? partyDoc.name : null) ||
            entry?.party?.name ||
            "Unknown Party",
        };

        global.io
          .to(`client-${req.auth.clientId}`)
          .emit("transaction-update", socketPayload);

        global.io
          .to("all-transactions-updates")
          .emit("transaction-update", {
            ...socketPayload,
            clientId: req.auth.clientId,
          });
      }
    } catch (socketError) {
      console.error(
        "⚠️ Socket Emit Failed (Proforma Update):",
        socketError.message
      );
    }

    res.json({ message: "Proforma entry updated successfully", entry: { ...populatedEntry, type: "proforma" } });
  } catch (err) {
    console.error("Error updating proforma entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

exports.deleteProformaEntry = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await ensureAuthCaps(req);

    const entry = await ProformaEntry.findById(req.params.id);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Proforma entry not found" });
    }

    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const partyDoc = await Party.findById(entry.party);
    if (!partyDoc) {
      console.error("Party not found");
      return res
        .status(400)
        .json({ success: false, message: "Party not found" });
    }

    await session.withTransaction(async () => {
      await ProformaEntry.deleteOne({ _id: entry._id }).session(session);

      await notifyAdminOnProformaAction({
        req,
        action: "delete",
        partyName: partyDoc?.name,
        entryId: entry._id,
        companyId: entry.company?.toString(),
      });

      const companyId = entry.company.toString();
      const clientId = entry.client.toString();
      await deleteSalesEntryCache(clientId, companyId);

      try {
        if (global.io) {
          console.log("📡 Emitting transaction-update (delete proforma)...");

          const socketPayload = {
            message: "Proforma Entry Deleted",
            type: "proforma",
            action: "delete",
            entryId: entry._id,
            partyName: partyDoc?.name,
          };

          global.io
            .to(`client-${req.auth.clientId}`)
            .emit("transaction-update", socketPayload);

          global.io
            .to("all-transactions-updates")
            .emit("transaction-update", {
              ...socketPayload,
              clientId: req.auth.clientId,
            });
        }
      } catch (socketError) {
        console.error(
          "⚠️ Socket Emit Failed (Proforma Delete):",
          socketError.message
        );
      }

      res
        .status(200)
        .json({ success: true, message: "Proforma entry deleted successfully" });
    });
  } catch (err) {
    console.error("Error deleting proforma entry:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
};


// exports.uploadTempPdf = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const chunks = [];
//     req.on('data', chunk => chunks.push(chunk));
//     req.on('end', async () => {
//       const pdfBuffer = Buffer.concat(chunks);

//       const entry = await ProformaEntry.findById(id)
//         .populate('company', 'businessName')
//         .lean();

//       if (!entry) {
//         return res.status(404).json({ message: 'Entry not found' });
//       }

//       const invoiceNo = entry.invoiceNumber || id;
//       const companyName = (entry.company?.businessName || 'Company')
//         .replace(/\s+/g, '_')
//         .replace(/[^a-zA-Z0-9_-]/g, '');
//       const fileName = `Proforma-${invoiceNo}-${companyName}.pdf`;

//       pdfStore.set(id, { buffer: pdfBuffer, fileName });
//       setTimeout(() => pdfStore.delete(id), 5 * 60 * 1000);

//       res.json({ success: true, pdfId: id });
//     });

//     req.on('error', (err) => {
//       res.status(500).json({ message: 'Upload failed', error: err.message });
//     });

//   } catch (err) {
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// };

// exports.serveTempPdf = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const stored = pdfStore.get(id);

//     if (!stored) {
//       return res.status(404).json({ message: 'PDF not found or expired' });
//     }

//     const { buffer, fileName } = stored;
//     res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Length', buffer.length);
//     res.send(buffer);

//   } catch (err) {
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// };