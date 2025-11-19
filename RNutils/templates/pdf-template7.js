// backend/templates/template7.js
const {
  renderNotes,
  getUnifiedLines,
  invNo,
  getBillingAddress,
  getShippingAddress,
  formatCurrency,
} = require("../pdf-utils");

const generatePdfForTemplate7 = async (
  pdfDoc,
  transaction,
  company,
  party,
  serviceNameById,
  shippingAddress
) => {
  // ------ local helpers ------
  const _getCompanyGSTIN = (c) => {
    const x = c;
    return (
      x?.gstin ??
      x?.gstIn ??
      x?.gstNumber ??
      x?.gst_no ??
      x?.gst ??
      x?.gstinNumber ??
      x?.tax?.gstin ??
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

  // -------------------------------------------------------------------------

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const m = 20; // Margin

  // New Palette - Professional, cool-toned, and clean
  const PRIMARY_BLUE = [38, 70, 83]; // Dark Teal/Blue - primary accent
  const SECONDARY_GRAY = [108, 117, 125]; // Muted dark gray for secondary info
  const TEXT_COLOR = [52, 58, 64]; // Near black for main text
  const LIGHT_BORDER = [206, 212, 218]; // Light gray for borders/dividers
  const BG_LIGHT = [248, 249, 250]; // Very light background for sections
  const WHITE = [255, 255, 255];

  const { lines, subtotal, tax, invoiceTotal, gstEnabled } = _deriveTotals(
    transaction,
    company,
    serviceNameById
  );
  const companyGSTIN = _getCompanyGSTIN(company);

  const money = (n) => `Rs ${Number(n || 0).toLocaleString("en-IN")}`;

  const billingAddress = getBillingAddress(party);
  const shippingAddressStr = getShippingAddress(shippingAddress, billingAddress);

  // Data scaffold
  const invoiceData = {
    invoiceNumber: invNo(transaction),
    date: transaction.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "01 / 10 / 2024",
    company: {
      name: company?.businessName || "Your Company Name",
      address: company?.address || "123 Business Lane, City, State - 123456",
      email: company?.emailId || "contact@yourcompany.com",
      phone: company?.mobileNumber || "+91 98765 43210",
    },
    invoiceTo: {
      name: party?.name || "Client Name",
      billingAddress,
      shippingAddress: shippingAddressStr,
      email: party?.email || "",
      gstin: _getCompanyGSTIN(party) || "",
    },
  };

  // Convert to table rows
  const itemsForTable = lines.map((l, index) => ({
    sno: (index + 1).toString(),
    description: `${l.name}${l.description ? " — " + l.description : ""}`,
    quantity: l.quantity || 1,
    pricePerUnit: Number(l.pricePerUnit || l.amount || 0),
    amount: Number(l.amount || 0),
    gstPercentage: l.gstPercentage || 0,
    lineTax: Number(l.lineTax || 0),
    lineTotal: Number(l.lineTotal || l.amount || 0),
  }));

  if (itemsForTable.length === 0) {
    const amount = Number(transaction.amount ?? 0);
    const gstPct = Number(transaction?.gstPercentage ?? 0);
    const lineTax = (amount * gstPct) / 100;
    const lineTotal = amount + lineTax;
    itemsForTable.push({
      sno: "1",
      description: transaction.description || "Service Rendered",
      quantity: 1,
      pricePerUnit: amount,
      amount,
      gstPercentage: gstPct,
      lineTax,
      lineTotal,
    });
  }

  // Base font
  pdfDoc.font("Helvetica");
  pdfDoc.fillColor(TEXT_COLOR);

  // ---------- Layout constants (used across pages) ----------
  const headerBlockH = 35; // Height for the top area with company name and "INVOICE"
  const infoBlockY = headerBlockH + 20; // Y position for invoice/client info
  const tableStartY = infoBlockY + 80; // Y position where the item table starts
  const ROW_H = 10; // Table row height
  const ITEMS_PER_PAGE = 10; // Items per page
  const TABLE_HEADER_HEIGHT = 10; // Height of the table header row

  const tableX = m;
  const tableW = pageWidth - 2 * m;

  // Columns for the new table style
  const colSNo = m + 2;
  const colItem = colSNo + 12;
  const colQty = colItem + 65;
  const colRate = colQty + 20;
  const colGST = colRate + 25;
  const colTax = colGST + 20;
  const colTotal = pageWidth - m - 2;

  const footerSectionH = 30;
  const footerSectionY = pageHeight - footerSectionH - m;

  // ---------- painters ----------

  const drawHeaderSection = () => {
    // Background for header
    pdfDoc.rect(0, 0, pageWidth, headerBlockH + 10).fill(BG_LIGHT);

    // Company Name
    pdfDoc.fontSize(16).font("Helvetica-Bold");
    pdfDoc.fillColor(PRIMARY_BLUE);
    pdfDoc.text(invoiceData.company.name.toUpperCase(), m + 0, m + 10);

    // "INVOICE" title
    pdfDoc.fontSize(28).font("Helvetica-Bold");
    pdfDoc.fillColor(TEXT_COLOR);
    pdfDoc.text("INVOICE", pageWidth - m, m + 12, { align: "right" });

    // Subtle line below header
    pdfDoc.strokeColor(LIGHT_BORDER);
    pdfDoc.lineWidth(0.8);
    pdfDoc
      .moveTo(m, headerBlockH + 10)
      .lineTo(pageWidth - m, headerBlockH + 10)
      .stroke();
  };

  const drawInfoBlocks = () => {
    // Company contact info (Left - more structured)
    pdfDoc.fillColor(SECONDARY_GRAY);
    pdfDoc.fontSize(8);

    let currentY = infoBlockY;
    pdfDoc.text(invoiceData.company.address, m, currentY);
    currentY += 4;
    pdfDoc.text(`Email: ${invoiceData.company.email}`, m, currentY);
    currentY += 4;
    pdfDoc.text(`Phone: ${invoiceData.company.phone}`, m, currentY);
    currentY += 4;
    if (companyGSTIN) {
      pdfDoc.text(`GSTIN: ${companyGSTIN}`, m, currentY);
    }

    // Invoice details & Bill To (Right - in a structured block)
    const infoBlockWidth = 70;
    const infoBlockX = pageWidth - m - infoBlockWidth;
    let rightY = infoBlockY;

    // Invoice Details
    pdfDoc.rect(infoBlockX, rightY - 5, infoBlockWidth, 18).fill(BG_LIGHT);
    pdfDoc.strokeColor(LIGHT_BORDER);
    pdfDoc.lineWidth(0.2);
    pdfDoc.rect(infoBlockX, rightY - 5, infoBlockWidth, 18).stroke();

    pdfDoc.fillColor(PRIMARY_BLUE);
    pdfDoc.fontSize(9).font("Helvetica-Bold");
    pdfDoc.text("INVOICE NO:", infoBlockX + 2, rightY);
    pdfDoc.text("DATE:", infoBlockX + 2, rightY + 5);

    pdfDoc.fillColor(TEXT_COLOR);
    pdfDoc.font("Helvetica");
    pdfDoc.text(
      invoiceData.invoiceNumber,
      infoBlockX + infoBlockWidth - 2,
      rightY,
      { align: "right" }
    );
    pdfDoc.text(invoiceData.date, infoBlockX + infoBlockWidth - 2, rightY + 5, {
      align: "right",
    });

    // Bill To
    rightY += 25; // Space between blocks
    pdfDoc.fillColor(PRIMARY_BLUE);
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    pdfDoc.text("BILL TO:", infoBlockX, rightY);

    pdfDoc.fillColor(TEXT_COLOR);
    pdfDoc.fontSize(9);
    pdfDoc.text(invoiceData.invoiceTo.name, infoBlockX, rightY + 5);
    pdfDoc.fillColor(SECONDARY_GRAY);
    const maxAddressWidth = infoBlockWidth - 2;
    const addressLines = pdfDoc.splitTextToSize(
      invoiceData.invoiceTo.billingAddress,
      maxAddressWidth + 10
    );
    pdfDoc.text(addressLines, infoBlockX, rightY + 9);
    let addressYOffset = 4 + (addressLines.length - 1) * 5;

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("SHIP TO:", infoBlockX, rightY + 9 + addressYOffset);
    pdfDoc.font("Helvetica");
    const shipLines = pdfDoc.splitTextToSize(
      invoiceData.invoiceTo.shippingAddress,
      maxAddressWidth + 10
    );
    pdfDoc.text(shipLines, infoBlockX, rightY + 9 + addressYOffset + 5);
    let shipYOffset = addressYOffset + 5 + (shipLines.length - 1) * 5;

    if (invoiceData.invoiceTo.email)
      pdfDoc.text(invoiceData.invoiceTo.email, infoBlockX, rightY + 9 + shipYOffset + 4);
    if (invoiceData.invoiceTo.gstin)
      pdfDoc.text(
        `GSTIN: ${invoiceData.invoiceTo.gstin}`,
        infoBlockX,
        rightY + 9 + shipYOffset + 4 + (invoiceData.invoiceTo.email ? 4 : 0)
      );
  };

  const drawTableHead = () => {
    let y = tableStartY;

    // Table Header with a fill and bottom border
    pdfDoc.rect(tableX, y, tableW, TABLE_HEADER_HEIGHT).fill(PRIMARY_BLUE);

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.fillColor(WHITE);
    pdfDoc.fontSize(8);

    pdfDoc.text("S.No.", colSNo, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("ITEM DESCRIPTION", colItem, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("QTY", colQty, y + TABLE_HEADER_HEIGHT / 2 + 1, {
      align: "right",
    });
    pdfDoc.text("RATE", colRate, y + TABLE_HEADER_HEIGHT / 2 + 1, {
      align: "right",
    });
    pdfDoc.text("GST%", colGST, y + TABLE_HEADER_HEIGHT / 2 + 1, {
      align: "right",
    });
    pdfDoc.text("TAX", colTax, y + TABLE_HEADER_HEIGHT / 2 + 1, {
      align: "right",
    });
    pdfDoc.text("TOTAL", colTotal, y + TABLE_HEADER_HEIGHT / 2 + 1, {
      align: "right",
    });

    pdfDoc.strokeColor(LIGHT_BORDER);
    pdfDoc.lineWidth(0.2);
    pdfDoc
      .moveTo(tableX, y + TABLE_HEADER_HEIGHT)
      .lineTo(tableX + tableW, y + TABLE_HEADER_HEIGHT)
      .stroke();

    return y + TABLE_HEADER_HEIGHT;
  };

  const drawRow = (it, y, isLast) => {
    pdfDoc.font("Helvetica");
    pdfDoc.fillColor(TEXT_COLOR);
    pdfDoc.fontSize(8);

    // Alternating row background for readability
    if (parseInt(it.sno) % 2 === 0) {
      pdfDoc.rect(tableX, y, tableW, ROW_H).fill(BG_LIGHT);
    }

    pdfDoc.text(it.sno, colSNo, y + ROW_H / 2 + 1);

    const maxDescWidth = colQty - colItem - 5;
    let description = it.description;
    const descLines = pdfDoc.splitTextToSize(description, maxDescWidth);
    pdfDoc.text(
      descLines,
      colItem,
      y + ROW_H / 2 + 1 - (descLines.length - 1) * 2
    );

    pdfDoc.text(String(it.quantity), colQty, y + ROW_H / 2 + 1, {
      align: "right",
    });
    pdfDoc.text(money(it.pricePerUnit), colRate, y + ROW_H / 2 + 1, {
      align: "right",
    });
    pdfDoc.text(`${it.gstPercentage}%`, colGST, y + ROW_H / 2 + 1, {
      align: "right",
    });
    pdfDoc.text(money(it.lineTax), colTax, y + ROW_H / 2 + 1, { align: "right" });
    pdfDoc.text(money(it.lineTotal), colTotal, y + ROW_H / 2 + 1, {
      align: "right",
    });

    // Draw bottom border for the row
    pdfDoc.strokeColor(LIGHT_BORDER);
    pdfDoc.lineWidth(0.1);
    pdfDoc
      .moveTo(tableX, y + ROW_H)
      .lineTo(tableX + tableW, y + ROW_H)
      .stroke();
  };

  const drawTotals = (currentY) => {
    const totalsBlockWidth = 70;
    const totalsBlockX = pageWidth - m - totalsBlockWidth;
    let yTotals = currentY + 10;

    // Subtotal
    pdfDoc.font("Helvetica");
    pdfDoc.fillColor(TEXT_COLOR);
    pdfDoc.fontSize(9);
    pdfDoc.text("SUBTOTAL", totalsBlockX, yTotals);
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(money(subtotal), totalsBlockX + totalsBlockWidth, yTotals, {
      align: "right"
    });

    if (gstEnabled) {
      yTotals += 6;
      // GST Total
      pdfDoc.font("Helvetica");
      pdfDoc.text("GST TOTAL", totalsBlockX, yTotals);
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text(money(tax), totalsBlockX + totalsBlockWidth, yTotals, {
        align: "right",
      });
    }

    yTotals += 10; // Space before grand total

    // Grand Total - Highlighted
    pdfDoc.rect(totalsBlockX - 5, yTotals - 7, totalsBlockWidth + 5, 10).fill(PRIMARY_BLUE);

    pdfDoc.fontSize(12);
    pdfDoc.fillColor(WHITE);
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("GRAND TOTAL", totalsBlockX - 2, yTotals);
    pdfDoc.text(
      money(invoiceTotal),
      totalsBlockX + totalsBlockWidth - 2,
      yTotals,
      {
        align: "right",
      }
    );
  };

  const drawFooterSection = () => {
    // Solid line at the bottom
    pdfDoc.strokeColor(PRIMARY_BLUE);
    pdfDoc.lineWidth(1);
    pdfDoc
      .moveTo(m, footerSectionY)
      .lineTo(pageWidth - m, footerSectionY)
      .stroke();

    // Render notes if present
    const notesEndY = renderNotes(
      pdfDoc,
      transaction.notes || "",
      m,
      footerSectionY + 8,
      pageWidth - 2 * m,
      pageWidth,
      pageHeight
    );

    pdfDoc.font("Helvetica");
    pdfDoc.fontSize(8);
    pdfDoc.fillColor(SECONDARY_GRAY);

    pdfDoc.text(
      `${invoiceData.company.address} | ${invoiceData.company.email} | ${invoiceData.company.phone}`,
      m,
      notesEndY + 4
    );

    const pageCount = pdfDoc.bufferedPageRange().count;
    // Page number (if multiple pages)
    pdfDoc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - m, notesEndY + 6, {
      align: "right",
    });
  };

  // ---------- paginate rows ----------
  const chunks = [];
  for (let i = 0; i < itemsForTable.length; i += ITEMS_PER_PAGE) {
    chunks.push(itemsForTable.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]); // Ensure at least one page

  let lastRowY = tableStartY;

  chunks.forEach((rows, pageIndex) => {
    if (pageIndex > 0) pdfDoc.addPage();

    drawHeaderSection();
    drawInfoBlocks();
    let y = drawTableHead();

    rows.forEach((it, idx) => {
      drawRow(it, y, idx === rows.length - 1);
      y += ROW_H;
    });

    lastRowY = y;

    // Draw footer content on every page (page number will be updated)
    drawFooterSection();
  });

  // ---------- Totals (only once, at the end) ----------
  const totalsBlockHeight = gstEnabled ? 40 : 30; // Estimate height needed for totals
  const bottomSafeY = pageHeight - footerSectionH - m - totalsBlockHeight - 10;

  // Check if there's enough space for totals on the current page
  if (lastRowY + totalsBlockHeight + 10 <= bottomSafeY) {
    drawTotals(lastRowY);
  } else {
    // If not enough space, add a new page and then draw the totals
    pdfDoc.addPage();
    drawHeaderSection(); // Redraw header on new page
    drawInfoBlocks(); // Redraw info on new page
    drawTotals(tableStartY); // Draw totals starting from tableStartY on new page
    drawFooterSection(); // Redraw footer to update page number
  }

  return pdfDoc;
};

module.exports = { generatePdfForTemplate7 };