// services/invoiceIssuer.js
const Company = require("../models/Company");
const InvoiceCounter = require("../models/InvoiceCounter");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { deriveThreeLetterPrefix } = require("../utils/prefix");

function yearYYFromDate(atDate = new Date()) {
  return Number(String(atDate.getFullYear()).slice(-2));
}

function buildNumber(prefix, yearYY, seq) {
  // Sales only ⇒ series code is always 'S'
  return `${prefix}S${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;
}

async function getNextSalesInvoiceNumber(companyId, atDate, { session }) {
  if (!session) throw new Error("session is required");

  const company = await Company.findById(companyId).lean().session(session);
  if (!company) throw new Error("Company not found");

  const prefix = deriveThreeLetterPrefix(company.businessName || company.name || "");
  const yearYY = yearYYFromDate(atDate);
  const series = "sales";

  // Try a few times inside the SAME txn to skip any duplicate seq gracefully
  for (let tries = 0; tries < 5; tries++) {
    // atomic upsert + increment (no initial seq set)
    const counter = await InvoiceCounter.findOneAndUpdate(
      { company: companyId, yearYY },
      { $inc: { seq: 1 }, $setOnInsert: { company: companyId, yearYY } },
      { upsert: true, new: true, session }
    );

    const seq = counter.seq;
    const invoiceNumber = buildNumber(prefix, yearYY, seq);

    try {
      await IssuedInvoiceNumber.create(
        [{ company: companyId, series, invoiceNumber, yearYY, seq, prefix }],
        { session }
      );
      return { invoiceNumber, yearYY, seq };
    } catch (e) {
      // If that seq was already taken, loop to get the next one within this txn
      if (e?.code === 11000) continue;
      throw e;
    }
  }

  throw new Error("Allocator: exhausted retries while skipping duplicates");
}

// Public API (SALES ONLY)
exports.issueSalesInvoiceNumber = (companyId, atDate = new Date(), { session } = {}) =>
  getNextSalesInvoiceNumber(companyId, atDate, { session });

// Optional: keep a guarded generic export (rejects anything except 'sales')
exports.issueInvoiceNumber = async (companyId, atDate = new Date(), { session, series } = {}) => {
  if (series && series !== "sales") {
    throw new Error("Invoice issuing is enabled only for 'sales' series");
  }
  return getNextSalesInvoiceNumber(companyId, atDate, { session });
};

