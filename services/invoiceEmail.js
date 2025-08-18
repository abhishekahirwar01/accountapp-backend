// services/invoiceEmail.js
const { _internal } = require("../controllers/integrations/gmailController"); // uses sendWithClientGmail()
const EmailIntegration = require("../models/EmailIntegration");
const Party = require("../models/Party");
const Company = require("../models/Company");

// // very simple HTML; replace with your template later
// function renderInvoiceHtml({ sale, party, company }) {
//   const productRows = (sale.products || [])
//     .map((it) => {
//       const name =
//         (it.product && (it.product.name || it.product.productName)) ||
//         it.description ||
//         "Item";
//       const qty = it.quantity ?? "";
//       const price = it.pricePerUnit ?? "";
//       const amt = it.amount ?? 0;
//       return `<tr><td>${name}</td><td>${qty}</td><td>${price}</td><td style="text-align:right">${amt}</td></tr>`;
//     })
//     .join("");

//   const serviceRows = (sale.service || [])
//     .map((it) => {
//       const name =
//         (it.service && (it.service.serviceName || it.service.name)) ||
//         it.description ||
//         "Service";
//       const amt = it.amount ?? 0;
//       return `<tr><td>${name}</td><td></td><td></td><td style="text-align:right">${amt}</td></tr>`;
//     })
//     .join("");

//   const rows = productRows + serviceRows;

//   return `
//   <div style="font-family:system-ui,Segoe UI,Arial,sans-serif">
//     <h2 style="margin:0 0 6px">${company?.businessName || "Your Business"}</h2>
//     <p style="margin:0 0 12px;color:#666">Invoice ${sale.referenceNumber || sale._id}</p>
//     <p>Hello ${party?.name || "Customer"},</p>
//     <p>Thank you for your business. Please find your invoice details below.</p>
//     <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #eee">
//       <thead>
//         <tr style="background:#fafafa">
//           <th align="left">Item</th><th>Qty</th><th>Price</th><th align="right">Amount</th>
//         </tr>
//       </thead>
//       <tbody>${rows}</tbody>
//       <tfoot>
//         <tr>
//           <td colspan="3" align="right" style="border-top:1px solid #eee"><b>Total</b></td>
//           <td align="right" style="border-top:1px solid #eee"><b>${sale.totalAmount ?? sale.amount}</b></td>
//         </tr>
//       </tfoot>
//     </table>
//     <p style="color:#666">If you have any questions, just reply to this email.</p>
//   </div>`;
// }


// ---- invoice email template (email-safe) ----
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const money = (n, cur = INR) => cur.format(Number(n || 0));
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => {
    const dt = d ? new Date(d) : new Date();
    return `${pad2(dt.getDate())} ${dt.toLocaleString("en-US", { month: "short" })} ${dt.getFullYear()}`;
};
const rn = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const invNo = (sale) =>
    sale?.referenceNumber?.trim()
        ? sale.referenceNumber
        : `INV-${String(sale?._id || "").slice(-6).toUpperCase()}`;

// Defensive name/code helpers for different doc shapes
const productName = (p) => (p && typeof p === "object" ? (p.name || p.productName || "Item") : "Item");
const productCode = (p) => (p && typeof p === "object" ? (p.hsn || p.code || p.sku || "") : "");
const serviceName = (row) => {
    // supports: { service: {...} } OR { serviceName: ObjectId|string, description }
    if (row?.service && typeof row.service === "object") return row.service.serviceName || row.service.name || "Service";
    if (row?.serviceName && typeof row.serviceName === "object") return row.serviceName.serviceName || row.serviceName.name || "Service";
    if (typeof row?.serviceName === "string") return row.description || "Service";
    return row?.description || "Service";
};
const serviceCode = (row) => {
    if (row?.service && typeof row.service === "object") return row.service.sac || "";
    if (row?.serviceName && typeof row.serviceName === "object") return row.serviceName.sac || "";
    return "";
};


function renderInvoiceHtml({ sale, party, company, currency = "INR", logoUrl, heroUrl }) {
    // 1) Merge product + service lines
    const lines = [];

    (sale.products || []).forEach((it) => {
        const p = it.product;
        lines.push({
            type: "product",
            name: productName(p),
            code: productCode(p),
            unit: it.unitType || "",
            qty: it.quantity ?? "",
            rate: it.pricePerUnit ?? "",
            amount: it.amount ?? 0,
            desc: it.description || "",
        });
    });

    (sale.service || []).forEach((it) => {
        lines.push({
            type: "service",
            name: serviceName(it),
            code: serviceCode(it),
            unit: "",
            qty: "",
            rate: "",
            amount: it.amount ?? 0,
            desc: it.description || "",
        });
    });

    // 2) Totals (subtotal → discount → GST → grand total)
    const subTotal = rn(lines.reduce((a, b) => a + Number(b.amount || 0), 0));
    const discountPct = Number(sale.discountPercentage || 0);
    const discountAmt = rn(subTotal * (discountPct / 100));
    const taxable = rn(subTotal - discountAmt);
    const gstPct = Number(sale.gstPercentage || 0);
    const gstAmt = rn(taxable * (gstPct / 100));
    const grandTotal = sale.totalAmount != null ? rn(sale.totalAmount) : rn(taxable + gstAmt);

    const issuedOn = fmtDate(sale.date);
    const dueOn = sale.dueDate ? fmtDate(sale.dueDate) : fmtDate(new Date(new Date(sale.date || Date.now()).getTime() + 30 * 24 * 3600 * 1000));

    // 3) Build table rows
    const rowsHtml = lines.map((l, i) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;">${i + 1}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">
          <div style="font-weight:600">${l.name}</div>
          ${l.code ? `<div style="color:#6b7280;font-size:12px">Code: ${l.code}</div>` : ""}
          ${l.desc && l.type === "service" ? `<div style="color:#6b7280;font-size:12px">${l.desc}</div>` : ""}
        </td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${l.unit || "—"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${l.qty || "—"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${l.rate !== "" ? money(l.rate) : "—"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${money(l.amount)}</td>
      </tr>
  `).join("");

    // 4) HTML (email-safe, no external fonts, mostly inline CSS)
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
    <div style="max-width:720px;margin:0 auto;padding:24px;">
      ${heroUrl ? `<div style="height:160px;background:url('${heroUrl}') center/cover no-repeat;border-radius:12px 12px 0 0;"></div>` : ""}

      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

        <!-- Top -->
        <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;gap:16px;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:12px;align-items:center;">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo" width="48" height="48" style="border-radius:8px;display:block;">` : ""}
            <div>
              <div style="font-size:18px;font-weight:700">${company?.businessName || "Your Business"}</div>
              ${company?.gstin ? `<div style="font-size:12px;color:#6b7280">GSTIN: ${company.gstin}</div>` : ""}
              ${company?.email ? `<div style="font-size:12px;color:#6b7280">${company.email}</div>` : ""}
            </div>
          </div>

          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700">Invoice</div>
            <div style="font-size:12px;color:#6b7280">#${invNo(sale)}</div>
            <div style="font-size:12px;color:#6b7280">Issued: ${issuedOn}</div>
            <div style="font-size:12px;color:#6b7280">Due: ${dueOn}</div>
          </div>
        </div>

        <!-- Mid: Bill To / From -->
        <div style="padding:16px 24px;display:flex;gap:24px;">
          <div style="flex:1">
            <div style="font-weight:700;margin-bottom:4px">Bill To</div>
            <div>${party?.name || "Customer"}</div>
            ${party?.email ? `<div style="color:#6b7280;font-size:12px">${party.email}</div>` : ""}
            ${party?.address ? `<div style="color:#6b7280;font-size:12px">${party.address}</div>` : ""}
          </div>
          <div style="flex:1">
            <div style="font-weight:700;margin-bottom:4px">From</div>
            <div>${company?.businessName || ""}</div>
            ${company?.address ? `<div style="color:#6b7280;font-size:12px">${company.address}</div>` : ""}
          </div>
        </div>

        <!-- Items -->
        <div style="padding:8px 24px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
            <thead>
              <tr>
                <th align="left" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">#</th>
                <th align="left" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">Item / Service</th>
                <th align="left" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">Unit</th>
                <th align="right" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">Qty</th>
                <th align="right" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">Rate</th>
                <th align="right" style="padding:10px;border:1px solid #e5e7eb;background:#f1f5f9;font-size:12px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" style="padding:12px;border:1px solid #e5e7eb;color:#6b7280;text-align:center">No lines</td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div style="padding:8px 24px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
            <tr>
              <td style="width:60%"></td>
              <td style="width:40%">
                <table width="100%" cellpadding="6" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                  <tr>
                    <td>Subtotal</td>
                    <td align="right">${money(subTotal)}</td>
                  </tr>
                  ${discountPct ? `<tr><td>Discount (${discountPct}%)</td><td align="right">-${money(discountAmt)}</td></tr>` : ""}
                  ${gstPct ? `<tr><td>GST (${gstPct}%)</td><td align="right">${money(gstAmt)}</td></tr>` : ""}
                  <tr>
                    <td style="border-top:1px solid #e5e7eb;font-weight:700;padding-top:8px;">Grand Total</td>
                    <td align="right" style="border-top:1px solid #e5e7eb;font-weight:700;padding-top:8px;">${money(grandTotal)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
          <strong>Thank you for your business!</strong> If you have any questions, just reply to this email.
        </div>
      </div>
    </div>
  </body>
</html>`;
}



/**
 * Sends the sales invoice FROM the client’s connected Gmail TO the party’s email.
 * Throws only if you call it directly; in controllers, call inside setImmediate to avoid blocking.
 */
async function sendSalesInvoiceEmail({ clientId, sale, partyId, companyId }) {
    // ensure client actually connected Gmail
    const integ = await EmailIntegration.findOne({ client: clientId, connected: true }).lean();
    if (!integ?.refreshToken) {
        throw new Error("Client has not connected Gmail");
    }

    // fetch party & company info (or you can pass them in if you already have them)
    const [party, company] = await Promise.all([
        Party.findById(partyId || sale.party).lean(),
        Company.findById(companyId || sale.company).lean(),
    ]);

    if (!party?.email) throw new Error("Party has no email");

    const subject = `Invoice ${sale.referenceNumber || sale._id} - ${company?.businessName || "Invoice"}`;
    const html = renderInvoiceHtml({ sale, party, company });

    await _internal.sendWithClientGmail({
        clientId,
        fromName: company?.businessName || undefined,
        to: party.email,
        subject,
        html,
        // attachments: [{ filename: 'Invoice.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
    });
}

module.exports = { sendSalesInvoiceEmail };
