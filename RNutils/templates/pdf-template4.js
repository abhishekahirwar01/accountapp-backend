// backend/templates/template4.js
const {
  renderNotes,
  getUnifiedLines,
  invNo,
  getCompanyGSTIN,
  getBillingAddress,
  getShippingAddress,
  formatCurrency,
} = require("../pdf-utils");

const generatePdfForTemplate4 = async (
  pdfDoc,
  transaction,
  company,
  party,
  serviceNameById,
  shippingAddress
) => {
  // --- helpers (same as frontend) ---
  const _getCompanyGSTIN = (c) => {
    const x = c;
    return (
      x?.gstin ||
      x?.gstIn ||
      x?.gstNumber ||
      x?.gst_no ||
      x?.gst ||
      x?.gstinNumber ||
      x?.tax?.gstin ||
      null
    );
  };

  const _deriveTotals = (tx, co, svcNameById) => {
    const lines = getUnifiedLines(tx, svcNameById);
    const subtotal = lines.reduce(
      (s, it) => s + (Number(it.amount) || 0),
      0
    );
    const totalTax = lines.reduce(
      (s, it) => s + (Number(it.lineTax) || 0),
      0
    );
    const invoiceTotal = lines.reduce(
      (s, it) => s + (Number(it.lineTotal) || 0),
      0
    );
    const gstEnabled = totalTax > 0 && !!_getCompanyGSTIN(co)?.trim();
    return { lines, subtotal, tax: totalTax, invoiceTotal, gstEnabled };
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const m = 20; // margin

  // Palette (exact same as frontend)
  const PRIMARY = [59, 130, 246];
  const SECONDARY = [107, 114, 128];
  const TEXT = [31, 41, 55];
  const LIGHT_BG = [249, 250, 251];

  const { lines, subtotal, tax, invoiceTotal, gstEnabled } = _deriveTotals(
    transaction,
    company,
    serviceNameById
  );
  const companyGSTIN = _getCompanyGSTIN(company);

  // ✅ Same currency style as frontend
  const money = (n) =>
    `Rs ${new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n || 0))}`;

  // Build rows (exact same logic as frontend)
  const itemsForTable = (
    lines.length
      ? lines
      : [
          {
            name: transaction.description || "Item",
            description: "",
            quantity: 1,
            pricePerUnit: transaction.amount ?? 0,
            amount: transaction.amount ?? 0,
            gstPercentage: transaction?.gstPercentage ?? 0,
            lineTax:
              (Number(transaction.amount ?? 0) *
                Number(transaction?.gstPercentage ?? 0)) /
                100 || 0,
            lineTotal:
              Number(transaction.amount ?? 0) +
              ((Number(transaction.amount ?? 0) *
                Number(transaction?.gstPercentage ?? 0)) /
                100 || 0),
          },
        ]
  ).map((l, i) => ({
    sno: (i + 1).toString(),
    description: `${l.name}${l.description ? " — " + l.description : ""}`,
    quantity: l.quantity || 1,
    pricePerUnit: Number(l.pricePerUnit ?? l.amount ?? 0),
    gstPercentage: Number(l.gstPercentage ?? 0),
    lineTax: Number(l.lineTax ?? 0),
    lineTotal: Number(l.lineTotal ?? l.amount ?? 0),
  }));

  const billingAddress = getBillingAddress(party);
  const shippingAddressStr = getShippingAddress(shippingAddress, billingAddress);

  // ---------- Layout constants (exact same as frontend) ----------
  const headerY = 20;
  const billToY = headerY + 40;

  const tableTopY = billToY + 60;
  const tableW = pageWidth - m * 2;

  // Columns (exact same as frontend)
  const colSNo = m + 5;
  const colItem = colSNo + 12;
  const colQty = colSNo + 50;
  const colPrice = pageWidth - m - 80;
  const colGST = pageWidth - m - 60;
  const colTax = pageWidth - m - 30;
  const colTotal = pageWidth - m - 5;

  // Row geometry (exact same as frontend)
  const ROW_H = 14;
  const firstRowY = tableTopY + 15;

  // Footer geometry
  const footerH = 28;
  const bottomSafeY = pageHeight - (m + footerH);

  // Pagination: exactly 8 rows per page (exact same logic as frontend)
  const ITEMS_PER_PAGE = 8;
  const chunks = [];
  for (let i = 0; i < itemsForTable.length; i += ITEMS_PER_PAGE) {
    chunks.push(itemsForTable.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push(itemsForTable);

  const approxTotalsHeight = gstEnabled ? 34 : 24;
  const lastChunkCount = chunks[chunks.length - 1].length;
  const lastRowsBottom = firstRowY + ROW_H * lastChunkCount;
  const needsExtraTotalsPage =
    lastRowsBottom + approxTotalsHeight > bottomSafeY;
  const totalPages = chunks.length + (needsExtraTotalsPage ? 1 : 0);

  // ---------- painters (exact same as frontend) ----------
  const drawHeader = () => {
    // Company (left)
    pdfDoc.font("Helvetica-Bold").fontSize(16).fillColor(PRIMARY);
    pdfDoc.text(company?.businessName || "Your Company", m, headerY);

    pdfDoc.font("Helvetica").fontSize(9).fillColor(SECONDARY);
    pdfDoc.text(company?.address || "Company Address", m, headerY + 7);
    if (companyGSTIN) pdfDoc.text(`GSTIN: ${companyGSTIN}`, m, headerY + 14);

    // Invoice (right)
    pdfDoc.font("Helvetica-Bold").fillColor(PRIMARY).fontSize(20);
    pdfDoc.text("INVOICE", pageWidth - m, headerY, { align: "right" });

    pdfDoc.font("Helvetica").fillColor(SECONDARY).fontSize(10);
    pdfDoc.text(`No. ${invNo(transaction)}`, pageWidth - m, headerY + 8, {
      align: "right",
    });

    const dateStr = transaction.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "";
    pdfDoc.fontSize(9);
    pdfDoc.text(`Date: ${dateStr}`, pageWidth - m, headerY + 15, {
      align: "right",
    });

    // Divider
    pdfDoc.strokeColor(229, 231, 235).lineWidth(0.6);
    pdfDoc
      .moveTo(m, headerY + 25)
      .lineTo(pageWidth - m, headerY + 25)
      .stroke();

    // Bill To (left)
    pdfDoc.font("Helvetica-Bold").fillColor(TEXT).fontSize(11);
    pdfDoc.text("BILL TO:", m, billToY);

    pdfDoc.font("Helvetica-Bold").fontSize(12);
    pdfDoc.text(party?.name || "Client Name", m, billToY + 8);

    pdfDoc.font("Helvetica").fillColor(SECONDARY).fontSize(10);
    const addrLines = pdfDoc.splitTextToSize(billingAddress, 120);
    pdfDoc.text(addrLines, m, billToY + 16);

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("SHIP TO:", m, billToY + 25);
    pdfDoc.font("Helvetica");
    const shipLines = pdfDoc.splitTextToSize(shippingAddressStr, 120);
    pdfDoc.text(shipLines, m, billToY + 33);
  };

  const drawTableHead = () => {
    // Header band
    pdfDoc.fillColor(LIGHT_BG).rect(m, tableTopY, tableW, 10).fill();

    // Top/bottom crisp borders
    pdfDoc.strokeColor(206, 212, 222).lineWidth(0.6);
    pdfDoc
      .moveTo(m, tableTopY)
      .lineTo(m + tableW, tableTopY)
      .stroke();
    pdfDoc
      .moveTo(m, tableTopY + 10)
      .lineTo(m + tableW, tableTopY + 10)
      .stroke();

    // Labels
    pdfDoc.font("Helvetica-Bold").fillColor(TEXT).fontSize(10);
    pdfDoc.text("#", colSNo, tableTopY + 7);
    pdfDoc.text("DESCRIPTION", colItem, tableTopY + 7);
    pdfDoc.text("QTY", colQty, tableTopY + 7, { align: "right" });
    pdfDoc.text("PRICE", colPrice, tableTopY + 7, { align: "right" });
    pdfDoc.text("GST%", colGST, tableTopY + 7, { align: "right" });
    pdfDoc.text("TAX", colTax, tableTopY + 7, { align: "right" });
    pdfDoc.text("TOTAL", colTotal, tableTopY + 7, { align: "right" });
  };

  const drawRows = (rows) => {
    let y = firstRowY;
    const maxDescW = colQty - colItem - 4;

    rows.forEach((it, i) => {
      // Alternating row fill (exact same logic as frontend)
      if (i % 2 === 0) {
        pdfDoc.fillColor(LIGHT_BG).rect(m, y - (ROW_H - 10), tableW, ROW_H).fill();
      }

      // Clamp description to single line for fixed row height (exact same logic)
      let desc = it.description || "";
      while (pdfDoc.widthOfString(desc) > maxDescW && desc.length > 0) {
        desc = desc.slice(0, -1);
      }
      if (desc !== it.description) desc = desc.trimEnd() + "...";

      pdfDoc.font("Helvetica").fillColor(TEXT).fontSize(9);

      pdfDoc.text(it.sno, colSNo, y);
      pdfDoc.text(desc, colItem, y);
      pdfDoc.text(String(it.quantity), colQty, y, { align: "right" });
      pdfDoc.text(money(it.pricePerUnit), colPrice, y, { align: "right" });
      pdfDoc.text(`${it.gstPercentage}%`, colGST, y, { align: "right" });
      pdfDoc.text(money(it.lineTax), colTax, y, { align: "right" });
      pdfDoc.text(money(it.lineTotal), colTotal, y, { align: "right" });

      // Row divider
      pdfDoc.strokeColor(220, 224, 230).lineWidth(0.5);
      pdfDoc
        .moveTo(m, y + 3)
        .lineTo(pageWidth - m, y + 3)
        .stroke();

      y += ROW_H;
    });

    return y; // bottom y after last row
  };

  const drawFooter = (pageNum, total) => {
    const footerY = pageHeight - m - 20;
    
    // Render notes (exact same as frontend)
    if (transaction.notes) {
      const notesLines = pdfDoc.splitTextToSize(transaction.notes, pageWidth - 2 * m);
      pdfDoc.font("Helvetica").fontSize(8);
      pdfDoc.text(notesLines, m, footerY);
    }

    const contact = [
      company?.address || "",
      company?.emailId || "",
      company?.mobileNumber || "",
    ]
      .filter(Boolean)
      .join(" • ");
    
    pdfDoc.font("Helvetica").fontSize(8).fillColor(SECONDARY);
    pdfDoc.text(contact || "", m, footerY + 12);
    pdfDoc.text(`Page ${pageNum} of ${total}`, pageWidth - m, footerY + 12, {
      align: "right",
    });
  };

  // ---------- render pages (exact same logic as frontend) ----------
  chunks.forEach((rows, i) => {
    if (i > 0) {
      pdfDoc.addPage();
    }
    drawHeader();
    drawTableHead();
    drawRows(rows);
    drawFooter(i + 1, totalPages);
  });

  // ---------- totals (exact same logic as frontend) ----------
  let totalsY;
  if (needsExtraTotalsPage) {
    pdfDoc.addPage();
    drawHeader();
    drawFooter(totalPages, totalPages);
    totalsY = firstRowY; // fresh area on new page
  } else {
    totalsY = lastRowsBottom + 10; // under the last table
  }

  // Totals block (exact same as frontend)
  pdfDoc.font("Helvetica-Bold").fillColor(TEXT).fontSize(10);

  // Line above totals
  pdfDoc.strokeColor(209, 213, 219).lineWidth(0.5);
  pdfDoc
    .moveTo(pageWidth - m - 120, totalsY - 5)
    .lineTo(pageWidth - m, totalsY - 5)
    .stroke();

  pdfDoc.text("Subtotal:", pageWidth - m - 30, totalsY, { align: "right" });
  pdfDoc.text(money(subtotal), pageWidth - m - 5, totalsY, { align: "right" });

  if (gstEnabled) {
    pdfDoc.text("GST:", pageWidth - m - 30, totalsY + 8, { align: "right" });
    pdfDoc.text(money(tax), pageWidth - m - 5, totalsY + 8, { align: "right" });
  }

  pdfDoc.fontSize(12).fillColor(PRIMARY);
  pdfDoc.text("Total:", pageWidth - m - 38, totalsY + 20, { align: "right" });
  pdfDoc.text(money(invoiceTotal), pageWidth - m - 5, totalsY + 20, { align: "right" });
};

module.exports = { generatePdfForTemplate4 };