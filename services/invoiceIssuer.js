// services/invoiceIssuer.js
const mongoose = require("mongoose");
const Company = require("../models/Company");
const InvoiceCounter = require("../models/InvoiceCounter");
const IssuedInvoiceNumber = require("../models/IssuedInvoiceNumber");
const { deriveThreeLetterPrefix } = require("../utils/prefix");

function buildNumber(prefix, yearYY, seq) {
  return `${prefix}-${String(yearYY).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

exports.issueInvoiceNumber = async function issueInvoiceNumber(companyId, atDate = new Date()) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const company = await Company.findById(companyId).lean().session(session);
    if (!company) throw new Error("Company not found");

    const prefix = deriveThreeLetterPrefix(company.name);
    const yearYY = Number(String(atDate.getFullYear()).slice(-2));

    // Atomic per-company+year increment
    const counter = await InvoiceCounter.findOneAndUpdate(
      { company: companyId, yearYY },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session, setDefaultsOnInsert: true }
    );

    const seq = counter.seq;
    const invoiceNumber = buildNumber(prefix, yearYY, seq);

    // Store only the number (minimal metadata)
    await IssuedInvoiceNumber.create([{
      company: companyId,
      invoiceNumber,
      yearYY,
      seq,
      prefix,
    }], { session });

    await session.commitTransaction();
    session.endSession();
    return { invoiceNumber };
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e; // let controller handle
  }
};
