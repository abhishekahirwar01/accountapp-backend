// services/invoiceIssuer.js
// const Company = require("../models/Company");
// const InvoiceCounter = require("../models/InvoiceCounter");
// const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
// const { deriveThreeLetterPrefix } = require("../utils/prefix");

// function yearYYFromDate(atDate = new Date()) {
//   return Number(String(atDate.getFullYear()).slice(-2));
// }

// function buildNumber(prefix, series, yearYY, seq) {
//   const seriesCode = series === "purchase" ? "P" : "S"; // S = sales, P = purchase
//   return `${prefix}${seriesCode}${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;
// }

// // core that enforces odd/even via `base` and increments by 2 atomically
// async function issueNumberCore(companyId, atDate, { session, series, base }) {
//   if (!session) throw new Error("issueInvoiceNumber requires a session");

//   const company = await Company.findById(companyId).lean().session(session);
//   if (!company) throw new Error("Company not found");

//   const prefix = deriveThreeLetterPrefix(company.businessName || company.name || "");
//   const yearYY = yearYYFromDate(atDate);

//   // Atomic pipeline: seq := (ifNull(seq, base - 2)) + 2
//   // => first time => base; thereafter +2 (keeps odd/even forever)
//   const counter = await InvoiceCounter.findOneAndUpdate(
//     { company: companyId, series, yearYY },
//     [
//       {
//         $set: {
//           company: companyId,
//           series,
//           yearYY,
//           seq: { $add: [ { $ifNull: ["$seq", base - 2] }, 2 ] },
//         }
//       }
//     ],
//     { upsert: true, new: true, session, returnDocument: "after" }
//   );

//   const seq = counter.seq;
//   const invoiceNumber = buildNumber(prefix, series, yearYY, seq);

//   // Persist issued number (unique index on (company,series,yearYY,seq) protects races)
//   try {
//     await IssuedInvoiceNumber.create(
//       [{ company: companyId, series, invoiceNumber, yearYY, seq, prefix }],
//       { session }
//     );
//   } catch (e) {
//     if (e?.code === 11000) {
//       // Another writer won this seq; bubble up so the caller retries the txn.
//       throw new Error("Invoice number race; please retry the transaction.");
//     }
//     throw e;
//   }

//   return { invoiceNumber, yearYY, seq };
// }

// // PUBLIC: Sales = odd (1,3,5,...)
// exports.issueSalesInvoiceNumber = function issueSalesInvoiceNumber(
//   companyId,
//   atDate = new Date(),
//   { session } = {}
// ) {
//   return issueNumberCore(companyId, atDate, { session, series: "sales", base: 1 });
// };

// // PUBLIC: Purchase = even (2,4,6,...)
// exports.issuePurchaseInvoiceNumber = function issuePurchaseInvoiceNumber(
//   companyId,
//   atDate = new Date(),
//   { session } = {}
// ) {
//   return issueNumberCore(companyId, atDate, { session, series: "purchase", base: 2 });
// };






//////////////////////////////////////////////////////////////////////////////

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

