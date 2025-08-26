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

function buildNumber(prefix, series, yearYY, seq) {
  const seriesCode = series === "purchase" ? "P" : "S";
  return `${prefix}${seriesCode}${String(yearYY).padStart(2, "0")}${String(seq).padStart(4, "0")}`;
}

// core that enforces odd/even via `base` and increments by 2 atomically
async function issueNumberCore(companyId, atDate, { session, series, base }) {
  if (!session) throw new Error("issueInvoiceNumber requires a session");

  const company = await Company.findById(companyId).lean().session(session);
  if (!company) throw new Error("Company not found");

  const prefix = deriveThreeLetterPrefix(company.businessName || company.name || "");
  const yearYY = yearYYFromDate(atDate);

  const filter = { company: companyId, series, yearYY };

  // First try: atomic upsert with $inc and $setOnInsert.
  // On first insert, seq = (base - 2) and then +2 => base (odd/even anchored).
  const update = {
    $inc: { seq: 2 },
    $setOnInsert: { company: companyId, series, yearYY, seq: base - 2 },
  };
  const opts = { new: true, upsert: true, session };

  let counter;
  try {
    counter = await InvoiceCounter.findOneAndUpdate(filter, update, opts);
  } catch (e) {
    if (e && e.code === 11000) {
      // Another writer inserted the doc in parallel; increment again without upsert.
      counter = await InvoiceCounter.findOneAndUpdate(
        filter,
        { $inc: { seq: 2 } },
        { new: true, session }
      );
    } else {
      throw e;
    }
  }

  const seq = counter.seq;
  const invoiceNumber = buildNumber(prefix, series, yearYY, seq);

  // Persist the issued number; unique index on (company, series, yearYY, seq) prevents duplicates.
  try {
    await IssuedInvoiceNumber.create(
      [{ company: companyId, series, invoiceNumber, yearYY, seq, prefix }],
      { session }
    );
  } catch (e) {
    if (e?.code === 11000) {
      // Extremely rare second race: let caller retry the whole transaction.
      throw new Error("Invoice number race; please retry the transaction.");
    }
    throw e;
  }

  return { invoiceNumber, yearYY, seq };
}

exports.issueSalesInvoiceNumber = function (companyId, atDate = new Date(), { session } = {}) {
  return issueNumberCore(companyId, atDate, { session, series: "sales", base: 1 });   // odd
};

exports.issuePurchaseInvoiceNumber = function (companyId, atDate = new Date(), { session } = {}) {
  return issueNumberCore(companyId, atDate, { session, series: "purchase", base: 2 }); // even
};
