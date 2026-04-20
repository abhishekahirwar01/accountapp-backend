
// controllers/salesController.js
const mongoose = require("mongoose");
const SalesEntry = require("../models/SalesEntry");
const Company = require("../models/Company");
const Party = require("../models/Party");
const User = require("../models/User");
const normalizeProducts = require("../utils/normalizeProducts");
const normalizeServices = require("../utils/normalizeServices");
const normalizeTravelServices = require("../utils/normalizeTravelServices");
const { normalizeCourierServices } = require("../utils/normalizeCourierServices");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { issueSalesInvoiceNumber } = require("../services/invoiceIssuer");
// at top of controllers/salesController.js..
const { getEffectivePermissions } = require("../services/effectivePermissions");
const { sendCreditReminderEmail } = require("../services/emailService");
const { createNotification } = require("./notificationController");
const { resolveActor, findAdminUser } = require("../utils/actorUtils");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const DailyStockLedger = require("../models/DailyStockLedger");
const pdfStore = new Map();

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
      userName: req.user.userName || "Unknown", // Ensure userName is set here
      clientName: req.user.contactName,
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
  // if (!req.auth.userName) {
  //   const user = await User.findById(req.auth.userId);  // Assuming the userId is correct
  //   req.auth.userName = user ? user.userName : 'Unknown';  // Fallback to 'Unknown' if user is not found
  // }

  // updated: only for staff (non-client) logins
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
      undefined; // no "Unknown" fallback here
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



// Build message text per action
function buildSalesNotificationMessage(
  action,
  { actorName, partyName, invoiceNumber, amount }
) {
  const pName = partyName || "Unknown Party";
  switch (action) {
    case "create":
      return (
        `New sales entry created by ${actorName} for customer ${pName}` +
        (amount != null ? ` of ₹${amount}.` : ".")
      );
    case "update":
      return `Sales entry updated by ${actorName} for customer ${pName}.`;
    case "delete":
      return `Sales entry deleted by ${actorName} for customer ${pName}.`;
    default:
      return `Sales entry ${action} by ${actorName} for customer ${pName}.`;
  }
}

// Unified notifier for sales module
async function notifyAdminOnSalesAction({
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
    console.warn("notifyAdminOnSalesAction: no admin user found");
    return;
  }

  const message = buildSalesNotificationMessage(action, {
    actorName: actor.name,
    partyName,
    amount,
  });

  await createNotification(
    message,
    adminUser._id, // recipient (admin)
    actor.id, // actor id (user OR client)
    action, // "create" | "update" | "delete"
    "sales", // entry type / category
    entryId, // sales entry id
    req.auth.clientId
  );
}

/**
 * Consume stock from batches for sales (FIFO) with Legacy Stock Fallback
 * * NOTE: This function relies on Mongoose models: StockBatch, Product
 */
async function consumeStockForSales(salesEntry, products, session = null) {
  try {
    const consumptionResults = [];
    let totalCOGS = 0;

    for (const item of products) {
      const productId = item.product;
      const quantityToConsume = Number(item.quantity) || 0;

      if (!quantityToConsume) continue;
      // 1. Attempt to consume from active Stock Batches (FIFO)
      const activeBatches = await StockBatch.find({
        product: productId,
        companyId: salesEntry.company,
        clientId: salesEntry.client,
        status: { $in: ["active", "partial", "sold"] }, // Include sold/partial for remainingQty > 0 logic
        remainingQuantity: { $gt: 0 }
      })
        .sort({ purchaseDate: 1 })
        .session(session);
      let remainingQty = quantityToConsume;
      const consumedBatches = [];
      let itemCOGS = 0;

      // --- Consume from existing batches ---
      for (const batch of activeBatches) {
        if (remainingQty <= 0) break;
        const consumeQty = Math.min(remainingQty, batch.remainingQuantity);
        if (consumeQty <= 0) continue;

        batch.remainingQuantity -= consumeQty;
        remainingQty -= consumeQty;
        const batchCOGS = consumeQty * batch.costPrice;
        itemCOGS += batchCOGS;
        totalCOGS += batchCOGS;
        // push log into batch
        batch.consumedBySales.push({
          salesEntry: salesEntry._id,
          consumedQty: consumeQty,
          consumedAt: new Date()
        });

        consumedBatches.push({
          batchId: batch._id,
          consumedQty: consumeQty,
          costPrice: batch.costPrice,
          cogs: batchCOGS
        });

        if (batch.remainingQuantity === 0) {
          batch.status = "sold";
          batch.isActive = false;
        }

        await batch.save({ session });
      }
      // 2.  LEGACY STOCK FALLBACK (CRITICAL FIX) 
      if (remainingQty > 0) {
        // Get product master stock
        const productMaster = await Product.findById(productId).session(session);
        const masterStock = (productMaster && productMaster.stocks) || 0;

        // Calculate the quantity already consumed from *anywhere* (master or batches)
        const consumedPrior = quantityToConsume - remainingQty;
        // Calculate stock remaining in Product Master that hasn't been tracked by batches yet
        const availableInBatches = activeBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0) + consumedPrior;

        const currentBatchedStock = activeBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0);



        // Allow negative stock - consume even if masterStock is less than quantityToConsume
        const neededFromLegacy = remainingQty;
        const costPrice = productMaster.costPrice || 0;

        const newLegacyBatch = await StockBatch.create([{
          product: productId,
          companyId: salesEntry.company,
          clientId: salesEntry.client,
          remainingQuantity: 0,
          initialQuantity: neededFromLegacy,
          costPrice: costPrice,
          purchaseDate: new Date("2000-01-01"),
          type: 'LEGACY_MIGRATION',
          status: 'sold',
          isActive: false
        }], { session });

        const batchCOGS = neededFromLegacy * costPrice;
        itemCOGS += batchCOGS;
        totalCOGS += batchCOGS;

        // Add consumption log
        newLegacyBatch[0].consumedBySales.push({
          salesEntry: salesEntry._id,
          consumedQty: neededFromLegacy,
          consumedAt: new Date()
        });
        await newLegacyBatch[0].save({ session });

        // Mark consumption complete
        remainingQty = 0;

        consumedBatches.push({
          batchId: newLegacyBatch[0]._id,
          consumedQty: neededFromLegacy,
          costPrice: costPrice,
          cogs: batchCOGS
        });
        console.log(`[SUCCESS LEGACY] Consumed ${neededFromLegacy} units via new LEGACY batch creation. Master Stock was ${masterStock}.`);
      }
      // 3. --- No error thrown for negative stock - allow it ---
      // If remainingQty > 0, it means we need to allow negative stock
      if (remainingQty > 0) {
        console.log(`🟠 Allowing negative stock: Available: ${masterStock}, Requested: ${quantityToConsume}, Shortage: ${remainingQty}`);
        // The shortage will be handled by the product stock going negative
      }
      // 4. --- Update Product Master Stock (allow negative values) ---
      const product = await Product.findById(productId).session(session);
      if (product) {
        product.stocks = (product.stocks || 0) - quantityToConsume;
        await product.save({ session });
      }
      consumptionResults.push({
        productId,
        quantity: quantityToConsume,
        cogs: itemCOGS,
        batches: consumedBatches
      });
    }
    return { consumptionResults, totalCOGS };
  } catch (error) {
    console.error("Error consuming stock for sales:", error);
    throw error;
  }
}



async function updateDailyStockLedgerForSales(salesEntry, products, currentSaleCOGS, session = null) {
  try {
    const salesDate = new Date(salesEntry.date);
    salesDate.setUTCHours(18, 30, 0, 0);

    // 1. Calculate Totals for THIS specific sale
    const salesQuantity = products.reduce((sum, item) => sum + item.quantity, 0);
    const salesAmount = products.reduce((sum, item) => sum + (item.quantity * item.pricePerUnit), 0);

    // 2. Fetch Latest Ledger (Opening Stock ke liye) - regardless of date gap
    const latestLedger = await DailyStockLedger.findOne({
      companyId: salesEntry.company,
      clientId: salesEntry.client,
      date: { $lt: salesDate }   // Any date before sales date
    })
      .sort({ date: -1 })           // Sort by date descending to get latest
      .session(session);

    const openingStockDefaults = latestLedger ? latestLedger.closingStock : { quantity: 0, amount: 0 };

    // ------------------------------------------------------------------
    // STEP 1: FIND OR CREATE LEDGER (FIXED FOR UNIQUE INDEX)
    // ------------------------------------------------------------------

    // First, try to find existing ledger using the unique index fields
    let ledger = await DailyStockLedger.findOne({
      companyId: salesEntry.company,
      clientId: salesEntry.client,
      date: salesDate
    }).session(session);

    if (!ledger) {
      // Create new ledger document
      ledger = new DailyStockLedger({
        clientId: salesEntry.client,
        companyId: salesEntry.company,
        date: salesDate,
        openingStock: openingStockDefaults,
        totalPurchaseOfTheDay: { quantity: 0, amount: 0 },
        totalSalesOfTheDay: { quantity: 0, amount: 0 },
        totalCOGS: 0,
        closingStock: { quantity: 0, amount: 0 }
      });
      await ledger.save({ session });
    }

    // ------------------------------------------------------------------
    // STEP 2: UPDATE THE LEDGER VALUES
    // ------------------------------------------------------------------

    // Update with simple increments
    ledger.totalSalesOfTheDay.quantity += salesQuantity;
    ledger.totalSalesOfTheDay.amount += salesAmount;
    ledger.totalCOGS += currentSaleCOGS;

    // ------------------------------------------------------------------
    // STEP 3: RECALCULATE CLOSING STOCK
    // ------------------------------------------------------------------

    const totalOpeningQty = ledger.openingStock.quantity;
    const totalOpeningAmt = ledger.openingStock.amount;

    const totalPurchaseQty = ledger.totalPurchaseOfTheDay.quantity;
    const totalPurchaseAmt = ledger.totalPurchaseOfTheDay.amount;

    const totalSalesQty = ledger.totalSalesOfTheDay.quantity;
    const totalCOGS = ledger.totalCOGS;

    // Calculation Formula: (Opening + Purchase) - Sales/COGS
    const finalClosingQty = (totalOpeningQty + totalPurchaseQty) - totalSalesQty;
    const finalClosingAmt = (totalOpeningAmt + totalPurchaseAmt) - totalCOGS;

    // Allow negative values for closing stock
    ledger.closingStock.quantity = finalClosingQty;
    ledger.closingStock.amount = finalClosingAmt;

    // Save final state
    await ledger.save({ session });

    console.log('✅ Daily Stock Ledger Updated Successfully');
    console.log('   Closing Stock:', ledger.closingStock.quantity, 'units');

    return ledger;

  } catch (error) {
    console.error('Error updating daily stock ledger:', error);
    throw error;
  }
}




async function reverseStockForSales(salesEntry, session = null) {
  try {
    const saleId = salesEntry._id.toString();
    const stockImpact = Array.isArray(salesEntry.stockImpact)
      ? salesEntry.stockImpact
      : [];

    if (!stockImpact.length) {
      console.log(
        `ℹ️ No stockImpact stored for sale entry ${saleId}. Skipping stock reversal.`
      );
      return { hadStockImpact: false, originalCOGS: 0 };
    }

    let originalCOGS = 0;
    const qtyByProduct = new Map();

    for (const impact of stockImpact) {
      const productId =
        (impact.productId && impact.productId.toString()) ||
        (impact.product && impact.product.toString());

      for (const b of impact.batches || []) {
        const batchId = b.batchId || b._id;
        const qty = Number(b.consumedQty) || 0;
        if (!batchId || !qty) continue;

        const batch = await StockBatch.findById(batchId).session(session);
        if (!batch) continue;

        batch.remainingQuantity = (batch.remainingQuantity || 0) + qty;

        // clean logs for this sale
        batch.consumedBySales = (batch.consumedBySales || []).filter(
          log =>
            !(
              log.salesEntry &&
              log.salesEntry.toString() === saleId &&
              Number(log.consumedQty) === qty
            )
        );

        if (batch.remainingQuantity > 0 && batch.status === "sold") {
          batch.status = "active";
          batch.isActive = true;
        }

        await batch.save({ session });

        originalCOGS += qty * (b.costPrice || batch.costPrice || 0);

        if (productId) {
          qtyByProduct.set(
            productId,
            (qtyByProduct.get(productId) || 0) + qty
          );
        }

        console.log(
          `🔁 Reversed batch ${batch._id}: +${qty} units @ ₹${b.costPrice || batch.costPrice
          }`
        );
      }
    }

    // restore product.stocks
    for (const [productId, qty] of qtyByProduct.entries()) {
      const product = await Product.findById(productId).session(session);
      if (product) {
        product.stocks = (product.stocks || 0) + qty;
        await product.save({ session });
        console.log(
          `🔁 Restored product stock: ${product.name} += ${qty} → ${product.stocks}`
        );
      }
    }

    console.log(
      `✅ Stock reversal done for sale entry ${saleId}. Restored COGS: ₹${originalCOGS}`
    );

    return { hadStockImpact: true, originalCOGS };
  } catch (error) {
    console.error("Error reversing stock for sales:", error);
    throw error;
  }
}




/**
 * Reverse the daily stock ledger impact for a sales entry
 * using the ORIGINAL products & ORIGINAL COGS.
 */
async function reverseDailyStockLedgerForSales(
  salesEntry,
  originalProducts,
  originalSaleCOGS,
  session = null
) {
  if (!Array.isArray(originalProducts) || !originalProducts.length) {
    console.log("ℹ️ No original products to reverse in ledger.");
    return;
  }

  // Build "negative" products so updateDailyStockLedgerForSales subtracts them
  const reversedProducts = originalProducts.map(p => {
    const obj = p.toObject ? p.toObject() : p;
    const qty = Number(obj.quantity) || 0;

    let pricePerUnit = 0;
    if (obj.pricePerUnit != null) {
      pricePerUnit = Number(obj.pricePerUnit) || 0;
    } else if (qty !== 0 && obj.amount != null) {
      pricePerUnit = (Number(obj.amount) || 0) / qty;
    }

    return {
      quantity: -Math.abs(qty),
      pricePerUnit
    };
  });

  const negativeCOGS = -Math.abs(originalSaleCOGS || 0);

  console.log(
    `🔁 Reversing ledger for sale ${salesEntry._id} with negative qty and COGS: ₹${negativeCOGS}`
  );

  return updateDailyStockLedgerForSales(
    salesEntry,
    reversedProducts,
    negativeCOGS,
    session
  );
}




// exports.getSalesEntries = async (req, res) => {
//   try {
//     await ensureAuthCaps(req);

//     const filter = {};
//     const user = req.user;

//     console.log("User role:", user.role);
//     console.log("User ID:", user.id);
//     console.log("Query companyId:", req.query.companyId);

//     // Handle company filtering properly
//     if (req.query.companyId) {
//       // Validate company access
//       if (!companyAllowedForUser(req, req.query.companyId)) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied to this company"
//         });
//       }
//       filter.company = req.query.companyId;
//     } else {
//       // If no specific company requested, filter by user's accessible companies
//       if (req.auth.allowedCompanies && req.auth.allowedCompanies.length > 0) {
//         filter.company = { $in: req.auth.allowedCompanies };
//       } else if (user.role === "user") {
//         // Regular users should only see data from their assigned companies
//         return res.status(200).json({
//           success: true,
//           count: 0,
//           data: [],
//         });
//       }
//       // For master/admin, no company filter = see all data
//     }

//     // For client users, also filter by client ID
//     if (user.role === "client") {
//       filter.client = user.id;
//     }

//     console.log("Final filter for sales entries:", JSON.stringify(filter, null, 2));

//     const entries = await SalesEntry.find(filter)
//       .populate("party", "name")
//       .populate("products.product", "name")
//       .populate({
//         path: "services.service",
//         select: "serviceName",
//         strictPopulate: false,
//       })
//       .populate("company", "businessName")
//       .populate("shippingAddress")
//       .populate("bank")
//       .sort({ date: -1 });

//     console.log(`Found ${entries.length} sales entries for user ${user.role}/${user.id}`);

//     res.status(200).json({
//       success: true,
//       count: entries.length,
//       data: entries,
//     });
//   } catch (err) {
//     console.error("Error fetching sales entries:", err.message);
//     res.status(500).json({
//       success: false,
//       error: err.message,
//     });
//   }
// };


exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // // Check if the data is cached in Redis
    // const cachedEntries = await getFromCache(cacheKey);
    // if (cachedEntries) {
    //   // If cached, return the data directly
    //   return res.status(200).json({
    //     success: true,
    //     count: cachedEntries.length,
    //     data: cachedEntries,
    //   });
    // }
    // Fetch data from database if not cached
    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
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
      .sort({ date: -1 });

    res.status(200).json({ entries });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch entries", error: err.message });
  }
};


exports.getSalesEntries = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const filter = {};
    const user = req.user;
    const { clientId, role, allowedCompanies, caps, userId } = req.auth;
    console.log("User role:", user.role);
    console.log("User ID:", user.id);
    console.log("Query companyId:", req.query.companyId);


    if (role === "user") {

      const canShowAllSales = caps?.canShowSaleEntries === true;

      console.log("User permissions - canShowAllSales:", canShowAllSales);
      console.log("User caps:", caps);

      if (!canShowAllSales) {

        // console.log("User can only see their own entries. User ID:", userId);
        filter.createdByUser = userId;
      } else {
        console.log("User can see ALL sales entries");
      }

    }

    // --- Company Filter Logic ---
    if (req.query.companyId && req.query.companyId !== "all") {
      if (!companyAllowedForUser(req, req.query.companyId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }
      filter.company = req.query.companyId;
    } else {
      if (role === "admin" || role === "user") {
        if (allowedCompanies && allowedCompanies.length > 0) {
          filter.company = { $in: allowedCompanies.map(String) };
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            data: []
          });
        }
      }
    }

    if (req.auth.clientId) {
      filter.client = req.auth.clientId;
    }

    // Date filters
    const { startDate, endDate } = req.query;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(`${startDate}T00:00:00`);
      if (endDate) filter.date.$lte = new Date(`${endDate}T23:59:59`);
    }

    // --- Dashboard Logic (no pagination) ---
    const isDashboard = req.query.isDashboard === 'true';

    if (isDashboard) {
      const entries = await SalesEntry.find(filter)
        .populate("party", "name")
        .populate("products.product", "name productName")
        .populate("party", "name")
        .sort({ date: -1, createdAt: -1, _id: -1 });

      return res.status(200).json({
        success: true,
        count: entries.length,
        data: entries,
      });
    }

    // --- Normal Pagination Logic ---
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await SalesEntry.countDocuments(filter);

    // Get paginated data
    const entries = await SalesEntry.find(filter)
      .skip(skip)
      .limit(limit)
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate({
        path: "additionalServices.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("additionalServices.service", "serviceName")
      .populate("company", "businessName")
      .populate("shippingAddress")
      .populate("bank")
      .sort({ date: -1, createdAt: -1, _id: -1 });

    const totalPages = Math.ceil(totalCount / limit);
    // console.log(`Found ${entries.length} entries. Filter used:`, JSON.stringify(filter));

    return res.status(200).json({
      success: true,
      count: entries.length,
      total: totalCount,
      data: entries,
      pagination: {
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      }
    });
  } catch (err) {
    console.error("Error fetching sales entries:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
// 

// GET Sales Entries by clientId (for master admin)
exports.getSalesEntriesByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // // Construct a cache key based on clientId
    // const cacheKey = `salesEntriesByClient:${clientId}`;

    // // Check if the data is cached in Redis
    // const cachedEntries = await getFromCache(cacheKey);
    // if (cachedEntries) {
    //   // If cached, return the data directly
    //   return res.status(200).json({
    //     success: true,
    //     count: cachedEntries.length,
    //     data: cachedEntries,
    //   });
    // }

    // Fetch data from database if not cached
    const entries = await SalesEntry.find({ client: clientId })
      .populate("party", "name")
      .populate("products.product", "name")
      .populate({
        path: "services.service",
        select: "serviceName",
        strictPopulate: false,
      })
      .populate("additionalServices.service", "serviceName")
      .populate("company", "businessName")
      .populate("shippingAddress")
      .populate("bank")
      .sort({ date: -1, createdAt: -1, _id: -1 });

    // Cache the fetched data in Redis for future requests
    // await setToCache(cacheKey, entries);

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
  let entry, companyDoc, partyDoc;

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res
        .status(403)
        .json({ message: "Not allowed to create sales entries" });
    }

    // Destructure the request body
    const { company: companyId, paymentMethod, party } = req.body;

    // Normalize paymentMethod to handle empty strings
    const normalizedPaymentMethod = paymentMethod || undefined;

    if (!party) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (!companyAllowedForUser(req, companyId)) {
      return res
        .status(403)
        .json({ message: "You are not allowed to use this company" });
    }

    await session.withTransaction(async () => {
      // Handle transaction logic here
      const {
        party,
        company: companyId,
        date,
        dueDate,
        products,
        services,
        travelServices, // ✅ NEW
        courierServices, // ✅ NEW
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
        advanceReceived,
        extraDiscount,
        extraDiscountType,
        customRemark,
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

      // Normalize products with GST calculations
      let normalizedProducts = [],
        productsTotal = 0,
        productsTax = 0;
      if (Array.isArray(products) && products.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeProducts(
          products,
          req.auth.clientId,
          req.auth.userId
        );
        normalizedProducts = items;
        productsTotal = computedTotal;
        productsTax = computedTax;
      }

      // Normalize regular services
      let normalizedRegularServices = [],
        servicesTotal = 0,
        servicesTax = 0;
      if (Array.isArray(services) && services.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeServices(
          services,
          req.auth.clientId
        );
        normalizedRegularServices = items;
        servicesTotal = computedTotal;
        servicesTax = computedTax;
      }

      // ✅ NEW: Normalize travel services
      let normalizedTravelServices = [],
        travelServicesTotal = 0,
        travelServicesTax = 0;
      if (Array.isArray(travelServices) && travelServices.length > 0) {
        const { items, computedTotal, computedTax } = await normalizeTravelServices(
          travelServices,
          req.auth.clientId
        );
        normalizedTravelServices = items;
        travelServicesTotal = computedTotal;
        travelServicesTax = computedTax;
      }

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
            courierItems: courierService.items || [] // Each service has its own items array
          });

          normalizedCourierServices.push(normalizedData);
          courierServicesTotal += normalizedData.totalTaxableAmount;
          courierServicesTax += normalizedData.totalTaxAmount;
        }
      }

      // Normalize additional services
      // Handle additional services (no normalization needed - they have simple schema)
      // Handle additional services (no normalization needed - they have simple schema)
      let normalizedAdditionalServices = [];
      let additionalServicesTotal = 0;
      let additionalServicesTax = 0; // Additional services typically have 0% GST

      if (Array.isArray(additionalServices) && additionalServices.length > 0) {
        normalizedAdditionalServices = additionalServices.map(s => {
          const amount = Number(s.amount) || 0;
          additionalServicesTotal += amount;
          // If additional services have GST, uncomment this:
          // const gstRate = Number(s.gstPercentage) || 0;
          // additionalServicesTax += (amount * gstRate) / 100;

          return {
            service: s.service,
            serviceName: s.serviceName || "",
            amount: amount,
            description: s.description || "",
            serviceStartDate: s.serviceStartDate || null,
            serviceDueDate: s.serviceDueDate || null,
          };
        });
      }

      // Calculate totals including all service types
      const computedSubtotal = (productsTotal || 0) +
        (servicesTotal || 0) +
        (travelServicesTotal || 0) +
        (courierServicesTotal || 0) +
        (additionalServicesTotal || 0);

      const computedTaxAmount = (productsTax || 0) +
        (servicesTax || 0) +
        (travelServicesTax || 0) +
        (courierServicesTax || 0) +
        (additionalServicesTax || 0);

      const finalTotal =
        typeof totalAmount === "number"
          ? totalAmount
          : typeof invoiceTotalIn === "number"
            ? invoiceTotalIn
            : +(computedSubtotal + computedTaxAmount).toFixed(2);

      const finalTaxAmount =
        typeof taxAmountIn === "number" ? taxAmountIn : computedTaxAmount;

      // ✅ derive net payable including advance and extra discount
      const advance = Number(advanceReceived) || 0;
      const extraDiscAmt =
        extraDiscountType === "percentage"
          ? +(finalTotal * (Number(extraDiscount) / 100)).toFixed(2)
          : Number(extraDiscount) || 0;
      const netPayable = +Math.max(0, finalTotal - extraDiscAmt - advance).toFixed(
        2,
      );

      const atDate = date ? new Date(date) : new Date();

      let attempts = 0;
      while (true) {
        attempts++;
        const { invoiceNumber, yearYY, seq, prefix } =
          await issueSalesInvoiceNumber(companyDoc._id, atDate, { session });

        try {
          const docs = await SalesEntry.create(
            [
              {
                party: partyDoc._id,
                company: companyDoc._id,
                client: req.auth.clientId,
                date,
                dueDate,
                products: normalizedProducts,
                services: normalizedRegularServices,
                travelServices: normalizedTravelServices, // ✅ NEW
                courierServices: normalizedCourierServices, // ✅ This should be array of normalized service objects
                additionalServices: normalizedAdditionalServices,
                totalAmount: finalTotal,
                taxAmount: finalTaxAmount,
                subTotal: computedSubtotal,
                discountType: req.body.discountType || "fixed",
                discountValue: Number(req.body.discountValue) || 0,
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
                paymentMethod: normalizedPaymentMethod,
                createdByUser: req.auth.userId,
                notes: notes || "",
                shippingAddress: shippingAddress,
                bank: bank,
                advanceReceived: Number(advanceReceived) || 0,
                extraDiscount: Number(extraDiscount) || 0,
                extraDiscountType: extraDiscountType || "fixed",
                invoiceTotal: finalTotal, // keep invoiceTotal in sync with totalAmount
                netPayable,
                customRemark: customRemark || "",
              },
            ],
            { session }
          );

          entry = docs[0];

          if (normalizedProducts && normalizedProducts.length > 0) {
            try {
              // Consume stock from batches (FIFO) - get both results and COGS
              const { consumptionResults, totalCOGS } = await consumeStockForSales(entry, normalizedProducts, session);

              // 🔥 SAVE THE IMPACT SO UPDATE CAN REVERSE IT PERFECTLY
              entry.stockImpact = consumptionResults;
              await entry.save({ session });

              // Update daily stock ledger AFTER stockImpact is saved
              await updateDailyStockLedgerForSales(entry, normalizedProducts, totalCOGS, session);

              console.log(`✅ Stock consumed for sales: ${consumptionResults.length} products, Total COGS: ₹${totalCOGS}`);

              // Socket emit for sale creation
              try {
                if (global.io) {
                  console.log('📡 Emitting transaction-update (create sale)...');

                  const customerName = partyDoc?.name || 'Unknown Customer';

                  const socketPayload = {
                    message: 'New Sale Entry',
                    type: 'sale',
                    action: 'create',
                    entryId: entry._id,
                    amount: entry.totalAmount,
                    customerName: customerName
                  };

                  // Emit to Client Room
                  global.io.to(`client-${req.auth.clientId}`).emit('transaction-update', socketPayload);

                  // Emit to Global/Admin Room
                  global.io.to('all-transactions-updates').emit('transaction-update', {
                    ...socketPayload,
                    clientId: req.auth.clientId
                  });

                  // Optional: Emit for inventory updates
                  if (entry.company) {
                    global.io.to(`company-${entry.company.toString()}`).emit('inventory-update', {
                      message: 'Sale entry created',
                      entryId: entry._id,
                      companyId: entry.company.toString(),
                      clientId: req.auth.clientId,
                      type: 'sale'
                    });
                  }
                }
              } catch (socketError) {
                console.error("⚠️ Socket Emit Failed (Sale Create):", socketError.message);
              }

            } catch (stockError) {
              console.error('Error in stock consumption:', stockError);
              throw new Error(`Stock consumption failed: ${stockError.message}`);
            }
          }

          // ✅ UPDATE PARTY BALANCE FOR COMPANY
          if (normalizedPaymentMethod === "Credit") {
            await Party.findByIdAndUpdate(
              partyDoc._id,
              {
                $inc: {
                  [`balances.${companyDoc._id}`]: entry.netPayable
                }
              },
              { session }
            );
            console.log(`✅ Updated party balance for company ${companyDoc._id}: +${entry.totalAmount}`);
          }

          // Ensure only one response is sent
          if (!res.headersSent) {
            // After sales entry is created, notify the admin
            await notifyAdminOnSalesAction({
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
            return res
              .status(201)
              .json({ message: "Sales entry created successfully", entry });
          }
        } catch (e) {
          if (e?.code === 11000 && attempts < 20) continue;
          throw e;
        }
      }
    });
  } catch (err) {
    console.error("createSalesEntry error:", err);
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



exports.updateSalesEntry = async (req, res) => {
  const session = await mongoose.startSession();
  let updatedEntry;

  try {
    // Ensure the user has permission
    await ensureAuthCaps(req);
    if (!userIsPriv(req) && !req.auth.caps?.canCreateSaleEntries) {
      return res
        .status(403)
        .json({ message: "Not allowed to update sales entries" });
    }

    // Find the sales entry by ID (outside transaction, basic auth checks)
    const existingEntry = await SalesEntry.findById(req.params.id);
    if (!existingEntry) {
      return res.status(404).json({ message: "Sales entry not found" });
    }

    // Tenant auth: allow privileged roles or same tenant only
    if (!userIsPriv(req) && !sameTenant(existingEntry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Snapshot original data for reversal
    const originalProducts = Array.isArray(existingEntry.products)
      ? existingEntry.products.map(p =>
        p.toObject ? p.toObject() : { ...p }
      )
      : [];

    const {
      products,
      services,
      travelServices, // ✅ NEW
      courierServices, // ✅ NEW
      additionalServices,
      paymentMethod,
      totalAmount,
      party,
      shippingAddress,
      bank,
      discountType,
      discountValue,
      advanceReceived,
      extraDiscount,
      extraDiscountType,
      customRemark,
      ...otherUpdates
    } = req.body;

    // Normalize paymentMethod
    const normalizedPaymentMethod = paymentMethod || undefined;

    const originalPaymentMethod = existingEntry.paymentMethod;
    const originalTotalAmount = existingEntry.totalAmount;
    const originalNetPayable = existingEntry.netPayable ?? existingEntry.totalAmount; // ✅ ADD THIS
    const originalPartyId = existingEntry.party.toString();
    const originalCompanyId = existingEntry.company.toString();

    // If company is being changed, check permission + existence
    if (otherUpdates.company) {
      if (!companyAllowedForUser(req, otherUpdates.company)) {
        return res
          .status(403)
          .json({ message: "You are not allowed to use this company" });
      }
      const company = await Company.findOne({
        _id: otherUpdates.company,
        client: req.auth.clientId
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
        createdByClient: req.auth.clientId
      });
      if (!partyDoc) {
        return res
          .status(400)
          .json({ message: "Customer not found or unauthorized" });
      }
    }

    await session.withTransaction(async () => {
      // Reload entry under this session to ensure transactional writes
      const entry = await SalesEntry.findById(req.params.id).session(session);
      if (!entry) {
        throw new Error("Sales entry not found during transactional update");
      }

      // 1️⃣ REVERSE OLD STOCK + LEDGER (use only existing data)
      let originalCOGS = 0;
      const { hadStockImpact, originalCOGS: restoredCOGS } =
        await reverseStockForSales(entry, session);

      if (hadStockImpact && originalProducts.length > 0) {
        originalCOGS = restoredCOGS;
        await reverseDailyStockLedgerForSales(
          entry,
          originalProducts,
          originalCOGS,
          session
        );
      }

      // 2️⃣ APPLY NEW LINE ITEMS (products/services/travelServices) & OTHER FIELDS
      let productsTotal = 0;
      let servicesTotal = 0;
      let travelServicesTotal = 0; // ✅ NEW
      let courierServicesTotal = 0; // ✅ NEW

      // Normalize product lines only if provided
      if (Array.isArray(products)) {
        const { items: normalizedProducts, computedTotal } =
          await normalizeProducts(products, req.auth.clientId, req.auth.userId);
        entry.products = normalizedProducts;
        productsTotal = computedTotal;
      }

      // Normalize regular service lines only if provided
      if (Array.isArray(services)) {
        const { items: normalizedServices, computedTotal } =
          await normalizeServices(services, req.auth.clientId);
        entry.services = normalizedServices;
        servicesTotal = computedTotal;
      }

      // ✅ NEW: Normalize travel service lines only if provided
      if (Array.isArray(travelServices)) {
        const { items: normalizedTravelServices, computedTotal } =
          await normalizeTravelServices(travelServices, req.auth.clientId);
        entry.travelServices = normalizedTravelServices;
        travelServicesTotal = computedTotal;
      }


      if (Array.isArray(courierServices)) {
        let normalizedCourierServices = [];
        let totalCourierAmount = 0;

        // Process each courier service entry
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

      // Normalize additional services
      // Normalize additional services
      if (Array.isArray(additionalServices)) {
        // Map directly without filtering, since these ARE additional services
        entry.additionalServices = additionalServices.map(s => ({
          service: s.service,
          serviceName: s.serviceName || "",
          amount: s.amount || 0,
          description: s.description || "",
          serviceStartDate: s.serviceStartDate || null,
          serviceDueDate: s.serviceDueDate || null,
        }));
      }
      // Don't allow changing invoiceNumber/year from payload
      const { invoiceNumber, invoiceYearYY, gstRate, notes, ...rest } =
        otherUpdates;

      if (typeof gstRate === "number") {
        entry.gstPercentage = gstRate;
      }
      if (discountType) entry.discountType = discountType;
      if (discountValue !== undefined) entry.discountValue = discountValue;
      if (advanceReceived !== undefined) entry.advanceReceived = Number(advanceReceived) || 0;
      if (extraDiscount !== undefined) entry.extraDiscount = Number(extraDiscount) || 0;
      if (extraDiscountType !== undefined) entry.extraDiscountType = extraDiscountType || "fixed";
      if (customRemark !== undefined) entry.customRemark = customRemark || "";
      if (notes !== undefined) {
        entry.notes = notes;
      }
      if (shippingAddress !== undefined) {
        entry.shippingAddress = shippingAddress;
      }
      if (bank !== undefined) {
        entry.bank = bank;
      }
      Object.assign(entry, rest);

      // Handle payment method and party changes for credit adjustment
      if (paymentMethod !== undefined) {
        entry.paymentMethod = normalizedPaymentMethod;
      }

      if (party !== undefined) {
        entry.party = party;
      }

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
        const sumTravelServices =
          travelServicesTotal ||
          (Array.isArray(entry.travelServices)
            ? entry.travelServices.reduce((s, it) => s + (Number(it.amount) || 0), 0)
            : 0);

        const sumCourierServices =
          courierServicesTotal ||
          (Array.isArray(entry.courierServices)
            ? entry.courierServices.reduce((s, it) => s + (Number(it.totalAmount) || 0), 0) // ✅ Changed from it.amount to it.totalAmount
            : 0);
        const sumAdditionalServices =
          Array.isArray(entry.additionalServices)
            ? entry.additionalServices.reduce((s, it) => s + (Number(it.amount) || 0), 0)
            : 0;

        entry.totalAmount = sumProducts + sumServices + sumTravelServices + sumAdditionalServices + sumCourierServices;
      }

      // Keep invoiceTotal aligned unless explicitly provided
      entry.invoiceTotal =
        typeof rest?.invoiceTotal === "number"
          ? rest.invoiceTotal
          : entry.totalAmount;

      // Recalculate netPayable based on extra discount
      // AFTER (correct - subtracts both extraDiscount AND advanceReceived)
      const base = entry.totalAmount;
      const extraDiscAmt = entry.extraDiscountType === "percentage"
        ? +(base * (Number(entry.extraDiscount) / 100)).toFixed(2)
        : Number(entry.extraDiscount) || 0;
      const advance = Number(entry.advanceReceived) || 0;
      entry.netPayable = +Math.max(0, base - extraDiscAmt - advance).toFixed(2);

      // 3️⃣ CONSUME NEW STOCK + UPDATE LEDGER FOR NEW STATE
      let newCOGS = 0;
      if (Array.isArray(entry.products) && entry.products.length > 0) {
        const { consumptionResults, totalCOGS } = await consumeStockForSales(
          entry,
          entry.products,
          session
        );

        // 🔐 Save fresh stock impact for this updated sale
        entry.stockImpact = consumptionResults;
        newCOGS = totalCOGS || 0;

        await updateDailyStockLedgerForSales(
          entry,
          entry.products,
          newCOGS,
          session
        );
      } else {
        // no products → clear any old impact
        entry.stockImpact = [];
      }

      // 4️⃣ CREDIT BALANCE ADJUSTMENT (company-specific balances) INSIDE SAME TXN
      const currentPartyId = party || originalPartyId;
      const currentPaymentMethod = normalizedPaymentMethod || originalPaymentMethod;
      const currentNetPayable = entry.netPayable; // ✅ use netPayable, not totalAmount
      const currentCompanyId = otherUpdates.company || originalCompanyId;

      if (
        originalPaymentMethod === "Credit" &&
        currentPaymentMethod === "Credit"
      ) {
        if (
          originalPartyId === currentPartyId &&
          originalCompanyId === currentCompanyId
        ) {
          // Same party and same company - adjust by netPayable difference
          const amountDifference = currentNetPayable - originalNetPayable; // ✅ fixed
          await Party.findByIdAndUpdate(
            currentPartyId,
            { $inc: { [`balances.${currentCompanyId}`]: amountDifference } },
            { session }
          );
          console.log(`✅ Updated party balance: difference: ${amountDifference}`);
        } else {
          // Different party or company - reverse old, apply new
          await Party.findByIdAndUpdate(
            originalPartyId,
            { $inc: { [`balances.${originalCompanyId}`]: -originalNetPayable } }, // ✅ fixed
            { session }
          );
          await Party.findByIdAndUpdate(
            currentPartyId,
            { $inc: { [`balances.${currentCompanyId}`]: currentNetPayable } }, // ✅ fixed
            { session }
          );
        }
      } else if (
        originalPaymentMethod === "Credit" &&
        currentPaymentMethod !== "Credit"
      ) {
        // Credit → non-credit: reverse original netPayable
        await Party.findByIdAndUpdate(
          originalPartyId,
          { $inc: { [`balances.${originalCompanyId}`]: -originalNetPayable } }, // ✅ fixed
          { session }
        );
      } else if (
        originalPaymentMethod !== "Credit" &&
        currentPaymentMethod === "Credit"
      ) {
        // non-credit → Credit: apply new netPayable
        await Party.findByIdAndUpdate(
          currentPartyId,
          { $inc: { [`balances.${currentCompanyId}`]: currentNetPayable } }, // ✅ fixed
          { session }
        );
      } else {
        console.log(`ℹ️ No balance adjustment needed`);
      }

      await entry.save({ session });
      updatedEntry = entry;

      // Socket emit for sale update
      try {
        if (global.io) {
          console.log('📡 Emitting transaction-update (update sale)...');

          // Get customer name
          const customerDoc = await Party.findById(updatedEntry.party);
          const customerName = customerDoc?.name || 'Unknown Customer';

          const socketPayload = {
            message: 'Sale Entry Updated',
            type: 'sale',
            action: 'update',
            entryId: updatedEntry._id,
            amount: updatedEntry.totalAmount,
            customerName: customerName
          };

          global.io.to(`client-${req.auth.clientId}`).emit('transaction-update', socketPayload);
          global.io.to('all-transactions-updates').emit('transaction-update', {
            ...socketPayload,
            clientId: req.auth.clientId
          });
        }
      } catch (socketError) {
        console.error("⚠️ Socket Emit Failed (Sale Update):", socketError.message);
      }
    });

    // OUTSIDE TRANSACTION: notifications, cache, response

    // Fetch party name for notification
    let partyName = "Unknown Party";
    if (partyDoc) {
      partyName = partyDoc.name;
    } else {
      const fetchedParty = await Party.findById(updatedEntry.party);
      if (fetchedParty) partyName = fetchedParty.name;
    }

    await notifyAdminOnSalesAction({
      req,
      action: "update",
      partyName,
      entryId: updatedEntry._id,
      companyId: updatedEntry.company?.toString()
    });

    res.json({
      message: "Sales entry updated successfully",
      entry: updatedEntry
    });
  } catch (err) {
    console.error("Error updating sales entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};



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

    // Store values for reversal
    const companyId = entry.company.toString();
    const paymentMethod = entry.paymentMethod;
    const totalAmount = entry.totalAmount;

    // Start the transaction
    await session.withTransaction(async () => {
      // 🟢🟢🟢 ADD FIFO STOCK REVERSAL LOGIC HERE 🟢🟢🟢
      if (entry.stockImpact && entry.stockImpact.length > 0) {

        console.log("🟡 Starting FIFO stock reversal for DELETE using stockImpact...");

        // Reverse exact batch-wise consumption
        const { hadStockImpact, originalCOGS } = await reverseStockForSales(entry, session);

        if (hadStockImpact) {
          // Build original products WITH NEGAIVE QUANTITIES from stockImpact
          const originalProducts = entry.stockImpact.map(p => ({
            quantity: p.quantity, // this is original consumed qty
            pricePerUnit: p.cogs / p.quantity
          }));

          await reverseDailyStockLedgerForSales(
            entry,
            entry.products,   // <-- use the real sales line items
            originalCOGS,
            session
          );

        }

        console.log("✅ Stock & ledger reversal successful for DELETE.");
      }
      // Retrieve companyId and clientId from the sales entry to delete related cache
      const companyId = entry.company.toString();

      // 🟢🟢🟢 REVERSE CREDIT BALANCE IF PAYMENT WAS CREDIT 🟢🟢🟢
      if (paymentMethod === "Credit") {
        try {
          await Party.findByIdAndUpdate(
            entry.party,
            {
              $inc: {
                [`balances.${companyId}`]: -(entry.netPayable ?? totalAmount)
              }
            },
            { session }
          );
          console.log(`✅ Reversed credit balance for customer ${entry.party}: -${totalAmount}`);
        } catch (creditError) {
          console.error("❌ Error reversing credit balance:", creditError);
          throw creditError; // Re-throw to ensure transaction rolls back
        }
      }

      // Delete the sales entry
      await entry.deleteOne();



      // Socket emit for sale deletion
      try {
        if (global.io) {
          console.log('📡 Emitting transaction-update (delete sale)...');

          const customerDoc = await Party.findById(entry.party);
          const customerName = customerDoc?.name || 'Unknown Customer';

          const socketPayload = {
            message: 'Sale Entry Deleted',
            type: 'sale',
            action: 'delete',
            entryId: entry._id,
            customerName: customerName
          };

          global.io.to(`client-${req.auth.clientId}`).emit('transaction-update', socketPayload);
          global.io.to('all-transactions-updates').emit('transaction-update', {
            ...socketPayload,
            clientId: req.auth.clientId
          });
        }
      } catch (socketError) {
        console.error("⚠️ Socket Emit Failed (Sale Delete):", socketError.message);
      }

      // ⬆️⬆️⬆️ END OF ADDED CODE ⬆️⬆️⬆️



      await notifyAdminOnSalesAction({
        req,
        action: "delete",
        partyName: partyDoc?.name,
        entryId: entry._id,
        companyId,
      });
      // Invalidate cache next
      // await deleteSalesEntryCache(clientId, companyId);
      // Respond
      res.status(200).json({ message: "Sales entry deleted successfully" });
    });
  } catch (err) {
    console.error("Error deleting sales entry:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};



exports.getSalesEntryById = async (req, res) => {
  try {
    await ensureAuthCaps(req);

    const entry = await SalesEntry.findById(req.params.id)
      .populate({ path: "party", select: "name" })
      .populate({ path: "products.product", select: "name unitType" })
      .populate({ path: "services.service", select: "serviceName" })
      .populate({ path: "travelServices.service", select: "serviceName" })
      .populate({ path: "courierServices.service", select: "serviceName" })
      .populate({ path: "company", select: "businessName" });

    if (!entry) return res.status(404).json({ message: "Sales entry not found" });

    if (!userIsPriv(req) && !sameTenant(entry.client, req.auth.clientId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({ entry });
  } catch (err) {
    console.error("getSalesEntryById error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.sendCreditReminder = async (req, res) => {
  try {
    const {
      transactionId,
      partyId,
      daysOverdue,
      pendingAmount,
      emailSubject,
      emailContent,
      isHtml = false
    } = req.body;

    // Get transaction details with populated data
    const transaction = await SalesEntry.findById(transactionId)
      .populate('party', 'name email contactNumber')
      .populate('company', 'businessName emailId owner')
      .populate('client');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Get party details
    const party = await Party.findById(partyId);
    if (!party) {
      return res.status(404).json({ message: 'Party not found' });
    }

    // Check if party has email
    if (!party.email) {
      return res.status(400).json({
        message: 'Customer does not have an email address'
      });
    }

    // Use custom content if provided, otherwise generate default
    const subject = emailSubject || `Payment Reminder - Invoice ${transaction.invoiceNumber}`;
    const content = emailContent || generateDefaultEmailContent(transaction, party, daysOverdue, pendingAmount);

    // Determine the client ID for sending email
    let senderClientId = null;

    // 1. Try to get from company owner
    if (transaction.company?.owner) {
      senderClientId = transaction.company.owner;
      console.log('🔧 Using company owner as sender client:', senderClientId);
    }
    // 2. Fallback to authenticated client
    else if (req.auth?.clientId) {
      senderClientId = req.auth.clientId;
      console.log('🔧 Using authenticated client as sender:', senderClientId);
    }
    // 3. Fallback to transaction client
    else if (transaction.client) {
      senderClientId = transaction.client._id || transaction.client;
      console.log('🔧 Using transaction client as sender:', senderClientId);
    }

    if (!senderClientId) {
      return res.status(400).json({
        message: 'Unable to determine sender. Please connect Gmail integration.'
      });
    }

    // Send credit reminder email using client's Gmail
    await sendCreditReminderEmail({
      to: party.email,
      customerName: party.name,
      companyName: transaction.company.businessName,
      invoiceNumber: transaction.invoiceNumber || transaction.referenceNumber || 'N/A',
      invoiceDate: transaction.date,
      daysOverdue: daysOverdue,
      pendingAmount: pendingAmount,
      companyEmail: transaction.company.emailId,
      companyId: transaction.company?._id, // Pass company ID
      clientId: senderClientId, // Pass determined client ID
      customSubject: subject,
      customContent: content,
      isHtml: isHtml
    });

    // Create notification for the reminder
    // await createNotification(
    //   `Credit reminder sent to ${party.name} for ₹${pendingAmount} (Invoice: ${transaction.invoiceNumber})`,
    //   req.auth.userId,
    //   req.auth.userId,
    //   'reminder',
    //   'sales',
    //   transactionId,
    //   req.auth.clientId
    // );

    res.json({
      message: 'Credit reminder sent successfully',
      sentTo: party.email,
      customerName: party.name,
      amount: pendingAmount,
      sentFrom: 'Client Gmail' // Indicate it was sent from client's email
    });

    console.log(`✅ Credit reminder sent from client Gmail to ${party.email} for ${party.name}`);

  } catch (error) {
    console.error('Error in sendCreditReminder:', error);

    // Handle specific Gmail connection errors
    if (error.message.includes('Gmail is not connected') ||
      error.message.includes('No client Gmail available') ||
      error.message.includes('Gmail access was revoked')) {
      return res.status(400).json({
        message: 'Gmail not connected. Please connect your Gmail account in settings to send emails.',
        error: error.message
      });
    }

    res.status(500).json({
      message: 'Failed to send credit reminder',
      error: error.message
    });
  }
};

function generateDefaultEmailContent(transaction, party, daysOverdue, pendingAmount) {
  const invoiceNumber = transaction.invoiceNumber || transaction.referenceNumber || 'N/A';
  const invoiceDate = new Date(transaction.date).toLocaleDateString();
  const formattedAmount = new Intl.NumberFormat('en-IN').format(pendingAmount);

  const overdueNotice = daysOverdue > 30
    ? `<p style="color: #d32f2f; font-weight: bold;">This invoice is ${daysOverdue - 30} days overdue. Please process the payment immediately to avoid any disruption in services.</p>`
    : '<p>Please process this payment at your earliest convenience.</p>';

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      max-width: 600px; 
      margin: 0 auto; 
      padding: 20px;
      background-color: #f9f9f9;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .amount {
      font-size: 24px;
      font-weight: bold;
      color: #d32f2f;
      margin: 15px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Payment Reminder</h2>
    </div>
    
    <p>Dear <strong>${party.name}</strong>,</p>
    
    <p>This is a friendly reminder regarding your outstanding payment. The following invoice is currently pending:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Invoice Number:</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Invoice Date:</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${invoiceDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Days Outstanding:</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${daysOverdue} days</td>
      </tr>
      <tr>
        <td style="padding: 8px;"><strong>Pending Amount:</strong></td>
        <td style="padding: 8px;" class="amount">₹${formattedAmount}</td>
      </tr>
    </table>
    
    ${overdueNotice}
    
    <p>If you have already made the payment, please disregard this reminder. For any queries regarding this invoice, please contact us.</p>
    
    <p>Thank you for your business!</p>
    
    <div class="footer">
      <p><strong>Best regards,</strong><br>
      ${transaction.company.businessName}<br>
      ${transaction.company.emailId ? `Email: ${transaction.company.emailId}` : ''}</p>
    </div>
  </div>
</body>a
</html>`;
}


// exports.uploadTempPdf = async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     // PDF buffer receive karo
//     const chunks = [];
//     req.on('data', chunk => chunks.push(chunk));
//     req.on('end', async () => {
//       const pdfBuffer = Buffer.concat(chunks);
      
//       // Fetch invoice details for filename
//       const entry = await SalesEntry.findById(id)
//         .populate('company', 'businessName')
//         .lean();
      
//       if (!entry) {
//         return res.status(404).json({ message: 'Entry not found' });
//       }

//       const invoiceNo = entry.invoiceNumber || id;
//       const companyName = (entry.company?.businessName || 'Company')
//         .replace(/\s+/g, '_')
//         .replace(/[^a-zA-Z0-9_-]/g, '');
//       const fileName = `Invoice-${invoiceNo}-${companyName}.pdf`;

//       // Memory mein store karo (5 min ke liye)
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

// // GET: PDF serve karo with correct filename header
// exports.serveTempPdf = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const stored = pdfStore.get(id);

//     if (!stored) {
//       return res.status(404).json({ message: 'PDF not found or expired' });
//     }

//     const { buffer, fileName } = stored;

//     // Ye line browser ke native save button ko bhi sahi naam deta hai ✅
//     res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Length', buffer.length);
//     res.send(buffer);

//   } catch (err) {
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// };