// services/invoiceIssuer.js
const mongoose = require("mongoose");
const Company = require("../models/Company");
const InvoiceCounter = require("../models/InvoiceCounter");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { deriveThreeLetterPrefix } = require("../utils/prefix");

// If you prefer Indian FY (Apr–Mar), compute yearYY from FY start; else keep calendar year.
function yearYYFromDate(atDate = new Date()) {
  // Calendar year (your current behavior):
  return Number(String(atDate.getFullYear()).slice(-2));

  // If you want FY instead, use this:
  // const y = atDate.getFullYear();
  // const m = atDate.getMonth(); // 0=Jan
  // const fyStart = (m >= 3) ? y : (y - 1);
  // return (fyStart + 1) % 100;
}

function buildNumber(prefix, yearYY, seq) {
  // You can keep your current format; or add a series marker if you like (e.g., S/P)
  return `${prefix}${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;
}

// services/invoiceIssuer.js
exports.issueInvoiceNumber = async function issueInvoiceNumber(
  companyId,
  atDate = new Date(),
  { session, series = "sales" } = {}
) {
  if (!session) {
    throw new Error("issueInvoiceNumber requires a session");
  }

  const company = await Company.findById(companyId).lean().session(session);
  if (!company) throw new Error("Company not found");

  const prefix = deriveThreeLetterPrefix(company.businessName || company.name || "");
  const yearYY = yearYYFromDate(atDate);

  let retries = 5; // Add retry mechanism for race conditions
  let counter;

  while (retries > 0) {
    try {
      // Try to find and update existing counter
      counter = await InvoiceCounter.findOneAndUpdate(
        { company: companyId, series, yearYY },
        { $inc: { seq: 1 } },
        { new: true, session, returnDocument: 'after' }
      );

      // If counter doesn't exist, create it
      if (!counter) {
        counter = await InvoiceCounter.findOneAndUpdate(
          { company: companyId, series, yearYY },
          { $setOnInsert: { seq: 1 } },
          { 
            upsert: true, 
            new: true, 
            session, 
            setDefaultsOnInsert: true,
            returnDocument: 'after'
          }
        );
      }

      break; // Success, exit retry loop
    } catch (error) {
      if (error.code === 11000 && retries > 0) {
        // Duplicate key error, retry
        retries--;
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        continue;
      }
      throw error; // Re-throw if not a duplicate key or out of retries
    }
  }

  if (!counter) {
    throw new Error("Failed to get invoice counter after retries");
  }

  const seq = counter.seq;
  const invoiceNumber = buildNumber(prefix, yearYY, seq);

  // Check for existing invoice number (your existing logic)
  const existingInvoice = await IssuedInvoiceNumber.findOne({ invoiceNumber }).session(session);

  if (existingInvoice) {
    console.log(`Invoice number ${invoiceNumber} already exists. Incrementing sequence.`);
    return await issueInvoiceNumber(companyId, atDate, { session, series });
  }

  // Create the issued invoice record
  await IssuedInvoiceNumber.create(
    [{ company: companyId, series, invoiceNumber, yearYY, seq, prefix }],
    { session }
  );

  return { invoiceNumber, yearYY, seq };
};
