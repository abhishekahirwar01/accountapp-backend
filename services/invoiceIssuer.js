// services/invoiceIssuer.js
const Company = require("../models/Company");
const InvoiceCounter = require("../models/InvoiceCounter");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { deriveThreeLetterPrefix } = require("../utils/prefix");

function yearYYFromDate(atDate = new Date()) {
  return Number(String(atDate.getFullYear()).slice(-2));
}

function buildNumber(prefix, series, yearYY, seq) {
  const seriesCode = series === "purchase" ? "P" : "S"; // S = sales, P = purchase
  return `${prefix}${seriesCode}${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;
}

// core that enforces odd/even via `base` and increments by 2 atomically
async function issueNumberCore(companyId, atDate, { session, series, base }) {
  if (!session) throw new Error("issueInvoiceNumber requires a session");

  const company = await Company.findById(companyId).lean().session(session);
  if (!company) throw new Error("Company not found");

  const prefix = deriveThreeLetterPrefix(company.businessName || company.name || "");
  const yearYY = yearYYFromDate(atDate);

  // Atomic pipeline: seq := (ifNull(seq, base - 2)) + 2
  // => first time => base; thereafter +2 (keeps odd/even forever)
  const counter = await InvoiceCounter.findOneAndUpdate(
    { company: companyId, series, yearYY },
    [
      {
        $set: {
          company: companyId,
          series,
          yearYY,
          seq: { $add: [ { $ifNull: ["$seq", base - 2] }, 2 ] },
        }
      }
    ],
    { upsert: true, new: true, session, returnDocument: "after" }
  );

  const seq = counter.seq;
  const invoiceNumber = buildNumber(prefix, series, yearYY, seq);

  // Persist issued number (unique index on (company,series,yearYY,seq) protects races)
  try {
    await IssuedInvoiceNumber.create(
      [{ company: companyId, series, invoiceNumber, yearYY, seq, prefix }],
      { session }
    );
  } catch (e) {
    if (e?.code === 11000) {
      // Another writer won this seq; bubble up so the caller retries the txn.
      throw new Error("Invoice number race; please retry the transaction.");
    }
    throw e;
  }

  return { invoiceNumber, yearYY, seq };
}

// PUBLIC: Sales = odd (1,3,5,...)
exports.issueSalesInvoiceNumber = function issueSalesInvoiceNumber(
  companyId,
  atDate = new Date(),
  { session } = {}
) {
  return issueNumberCore(companyId, atDate, { session, series: "sales", base: 1 });
};

// PUBLIC: Purchase = even (2,4,6,...)
exports.issuePurchaseInvoiceNumber = function issuePurchaseInvoiceNumber(
  companyId,
  atDate = new Date(),
  { session } = {}
) {
  return issueNumberCore(companyId, atDate, { session, series: "purchase", base: 2 });
};
