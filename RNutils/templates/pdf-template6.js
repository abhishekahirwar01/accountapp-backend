// backend/templates/template6.js
const {
  renderNotes,
  getUnifiedLines,
  getBillingAddress,
  getShippingAddress,
  formatCurrency,
} = require("../pdf-utils");

const generatePdfForTemplate6 = (
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

  // New Palette - Earthy, modern, and subtle
  const DARK_TEXT = [50, 50, 50]; // Near black for main text
  const ACCENT_GOLD = [184, 151, 93]; // A refined gold/tan
  const LIGHT_GRAY_BG = [248, 248, 248]; // For subtle backgrounds
  const DIVIDER_LINE = [220, 220, 220]; // Light gray for dividers
  const MUTED_INFO = [120, 120, 120]; // Muted color for secondary info
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
    invoiceNumber: transaction.invoiceNumber || "N/A",
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
  pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);

  // ---------- Layout constants (used across pages) ----------
  const headerSectionH = 35; // Height for the top area with company name and "INVOICE"
  const detailBlockY = headerSectionH + 20; // Y position for invoice/client info
  const tableStartY = detailBlockY + 80; // Y position where the item table starts
  const ROW_H = 10; // Table row height
  const ITEMS_PER_PAGE = 10; // Items per page
  const TABLE_HEADER_HEIGHT = 8; // Height of the table header row

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

  const footerSectionH = 25;
  const footerSectionY = pageHeight - footerSectionH - m;

  // ---------- painters ----------

  const drawHeaderSection = () => {
    // Top company name and "INVOICE"
    pdfDoc.fontSize(18).font("Helvetica-Bold");
    pdfDoc.fillColor(ACCENT_GOLD[0], ACCENT_GOLD[1], ACCENT_GOLD[2]);
    pdfDoc.text(invoiceData.company.name.toUpperCase(), m, m + 0);

    pdfDoc.fontSize(10).font("Helvetica");
    pdfDoc.fillColor(MUTED_INFO[0], MUTED_INFO[1], MUTED_INFO[2]);

    pdfDoc.fontSize(24).font("Helvetica-Bold");
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    const invoiceWidth = pdfDoc.widthOfString("INVOICE");
    pdfDoc.text("INVOICE", pageWidth - m - invoiceWidth, m + 0);

    // Hairline divider under header
    pdfDoc
      .strokeColor(DIVIDER_LINE[0], DIVIDER_LINE[1], DIVIDER_LINE[2])
      .lineWidth(0.5)
      .moveTo(m, headerSectionH + 5)
      .lineTo(pageWidth - m, headerSectionH + 5)
      .stroke();
  };

  const drawDetailBlocks = () => {
    // Company contact info (Left)
    pdfDoc.fillColor(MUTED_INFO[0], MUTED_INFO[1], MUTED_INFO[2]);
    pdfDoc.fontSize(8).font("Helvetica");
    pdfDoc.text(invoiceData.company.address, m, detailBlockY);
    pdfDoc.text(`Email: ${invoiceData.company.email}`, m, detailBlockY + 4);
    pdfDoc.text(`Phone: ${invoiceData.company.phone}`, m, detailBlockY + 8);
    if (companyGSTIN) {
      pdfDoc.text(`GSTIN: ${companyGSTIN}`, m, detailBlockY + 12);
    }

    // Invoice details (Right)
    const rightColX = pageWidth - m;
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    pdfDoc.fontSize(9).font("Helvetica-Bold");
    
    const invoiceNoWidth = pdfDoc.widthOfString("Invoice No:");
    pdfDoc.text("Invoice No:", rightColX - invoiceNoWidth, detailBlockY);
    
    const dateWidth = pdfDoc.widthOfString("Date:");
    pdfDoc.text("Date:", rightColX - dateWidth, detailBlockY + 5);

    pdfDoc.font("Helvetica");
    const invoiceNumWidth = pdfDoc.widthOfString(invoiceData.invoiceNumber);
    pdfDoc.text(invoiceData.invoiceNumber, rightColX - invoiceNumWidth, detailBlockY);
    
    const dateStrWidth = pdfDoc.widthOfString(invoiceData.date);
    pdfDoc.text(invoiceData.date, rightColX - dateStrWidth, detailBlockY + 5);

    // Bill To (Below invoice details, aligned right)
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.fontSize(10);
    const billToWidth = pdfDoc.widthOfString("BILL TO:");
    pdfDoc.text("BILL TO:", rightColX - billToWidth, detailBlockY + 15);

    pdfDoc.font("Helvetica");
    pdfDoc.fontSize(9);
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    const clientNameWidth = pdfDoc.widthOfString(invoiceData.invoiceTo.name);
    pdfDoc.text(invoiceData.invoiceTo.name, rightColX - clientNameWidth, detailBlockY + 20);
    
    pdfDoc.fillColor(MUTED_INFO[0], MUTED_INFO[1], MUTED_INFO[2]);
    const billingLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.billingAddress, 150);
    billingLines.forEach((line, index) => {
      const lineWidth = pdfDoc.widthOfString(line);
      pdfDoc.text(line, rightColX - lineWidth, detailBlockY + 24 + (index * 4));
    });

    pdfDoc.font("Helvetica-Bold");
    const shipToWidth = pdfDoc.widthOfString("SHIP TO:");
    pdfDoc.text("SHIP TO:", rightColX - shipToWidth, detailBlockY + 30 + (billingLines.length * 4));
    
    pdfDoc.font("Helvetica");
    const shippingLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.shippingAddress, 150);
    shippingLines.forEach((line, index) => {
      const lineWidth = pdfDoc.widthOfString(line);
      pdfDoc.text(line, rightColX - lineWidth, detailBlockY + 35 + (billingLines.length * 4) + (index * 4));
    });

    if (invoiceData.invoiceTo.email) {
      const emailWidth = pdfDoc.widthOfString(invoiceData.invoiceTo.email);
      pdfDoc.text(invoiceData.invoiceTo.email, rightColX - emailWidth, detailBlockY + 40 + (billingLines.length * 4) + (shippingLines.length * 4));
    }
    if (invoiceData.invoiceTo.gstin) {
      const gstinText = `GSTIN: ${invoiceData.invoiceTo.gstin}`;
      const gstinWidth = pdfDoc.widthOfString(gstinText);
      pdfDoc.text(gstinText, rightColX - gstinWidth, detailBlockY + 44 + (billingLines.length * 4) + (shippingLines.length * 4));
    }
  };

  const drawTableHead = (y) => {
    // Table Header with a subtle bottom border
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    pdfDoc.fontSize(8);

    pdfDoc.text("S.No.", colSNo, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("ITEM DESCRIPTION", colItem, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("QTY", colQty, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("RATE", colRate, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("GST%", colGST, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("TAX", colTax, y + TABLE_HEADER_HEIGHT / 2 + 1);
    pdfDoc.text("TOTAL", colTotal, y + TABLE_HEADER_HEIGHT / 2 + 1);

    pdfDoc
      .strokeColor(DIVIDER_LINE[0], DIVIDER_LINE[1], DIVIDER_LINE[2])
      .lineWidth(0.2)
      .moveTo(tableX, y + TABLE_HEADER_HEIGHT)
      .lineTo(tableX + tableW, y + TABLE_HEADER_HEIGHT)
      .stroke();

    return y + TABLE_HEADER_HEIGHT + 2; // Small gap after header
  };

  const drawRow = (it, y, isLast) => {
    pdfDoc.font("Helvetica");
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    pdfDoc.fontSize(8);

    pdfDoc.text(it.sno, colSNo, y + ROW_H / 2);

    const maxDescWidth = colQty - colItem - 5;
    const descLines = pdfDoc.splitTextToSize(it.description, maxDescWidth);
    pdfDoc.text(descLines, colItem, y + ROW_H / 2 - (descLines.length - 1) * 2);

    pdfDoc.text(String(it.quantity), colQty, y + ROW_H / 2);
    pdfDoc.text(money(it.pricePerUnit), colRate, y + ROW_H / 2);
    pdfDoc.text(`${it.gstPercentage}%`, colGST, y + ROW_H / 2);
    pdfDoc.text(money(it.lineTax), colTax, y + ROW_H / 2);
    pdfDoc.text(money(it.lineTotal), colTotal, y + ROW_H / 2);

    if (!isLast) {
      pdfDoc
        .strokeColor(LIGHT_GRAY_BG[0], LIGHT_GRAY_BG[1], LIGHT_GRAY_BG[2])
        .lineWidth(0.1)
        .moveTo(tableX, y + ROW_H)
        .lineTo(tableX + tableW, y + ROW_H)
        .stroke();
    }
  };

  const drawTotals = (y) => {
    pdfDoc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    pdfDoc.font("Helvetica");
    pdfDoc.fontSize(10);

    // Subtotal line
    pdfDoc.text("SUBTOTAL", pageWidth - m - 40, y);
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(money(subtotal), pageWidth - m, y);

    if (gstEnabled) {
      y += 8;
      // GST Total line
      pdfDoc.font("Helvetica");
      pdfDoc.text("GST TOTAL", pageWidth - m - 40, y);
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text(money(tax), pageWidth - m, y);
    }

    y += 12;
    // Grand Total Line - Prominent with a subtle background
    pdfDoc
      .fillColor(LIGHT_GRAY_BG[0], LIGHT_GRAY_BG[1], LIGHT_GRAY_BG[2])
      .rect(pageWidth - m - 60, y - 7, 60, 10, "F"); // Light background for total
    
    pdfDoc
      .strokeColor(ACCENT_GOLD[0], ACCENT_GOLD[1], ACCENT_GOLD[2])
      .lineWidth(0.5)
      .rect(pageWidth - m - 60, y - 7, 60, 10, "S"); // Gold border around total

    pdfDoc.fontSize(12);
    pdfDoc.fillColor(ACCENT_GOLD[0], ACCENT_GOLD[1], ACCENT_GOLD[2]); // Gold for the final total
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("GRAND TOTAL", pageWidth - m - 65, y);
    pdfDoc.text(money(invoiceTotal), pageWidth - m - 2, y);

    return y + 15; // Return the Y position after drawing totals
  };

  const drawFooterSection = () => {
    // Simple line at the bottom
    pdfDoc
      .strokeColor(DIVIDER_LINE[0], DIVIDER_LINE[1], DIVIDER_LINE[2])
      .lineWidth(0.5)
      .moveTo(m, footerSectionY)
      .lineTo(pageWidth - m, footerSectionY)
      .stroke();

    // Render notes if present
    let notesEndY = footerSectionY + 8;
    if (transaction.notes) {
      const notesLines = pdfDoc.splitTextToSize(transaction.notes, pageWidth - 2 * m);
      pdfDoc.fontSize(8).font("Helvetica");
      pdfDoc.text(notesLines, m, notesEndY);
      notesEndY += notesLines.length * 10;
    }

    pdfDoc.font("Helvetica");
    pdfDoc.fontSize(8);
    pdfDoc.fillColor(MUTED_INFO[0], MUTED_INFO[1], MUTED_INFO[2]);

    pdfDoc.text(invoiceData.company.address, m, notesEndY + 4);
    pdfDoc.text(
      `${invoiceData.company.email} | ${invoiceData.company.phone}`,
      m,
      notesEndY + 8
    );
    
    const pageCount = pdfDoc.bufferedPageRange().count;
    // Page number (if multiple pages)
    pdfDoc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - m, notesEndY + 6);
  };

  // ---------- paginate rows ----------
  const chunks = [];
  for (let i = 0; i < itemsForTable.length; i += ITEMS_PER_PAGE) {
    chunks.push(itemsForTable.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]); // Ensure at least one page

  let lastRowY = tableStartY;
  let currentPage = 1;

  const addNewPage = () => {
    pdfDoc.addPage();
    currentPage++;
    drawHeaderSection();
    drawDetailBlocks();
  };

  // Render all pages with items
  chunks.forEach((rows, pageIndex) => {
    if (pageIndex > 0) addNewPage();
    else drawHeaderSection();

    drawDetailBlocks();

    let y = drawTableHead(tableStartY);

    rows.forEach((it, idx) => {
      drawRow(it, y, idx === rows.length - 1);
      y += ROW_H;
    });

    lastRowY = y;

    // Draw footer content on every page
    drawFooterSection();
  });

  // ---------- Totals (only once, at the end) ----------
  const totalsBlockHeight = gstEnabled ? 40 : 30;
  const bottomSafeY = pageHeight - footerSectionH - m - totalsBlockHeight - 10;

  // Check if there's enough space on the current page for totals
  if (lastRowY + totalsBlockHeight <= bottomSafeY) {
    drawTotals(lastRowY + 10);
  } else {
    // Not enough space, need to add a new page
    addNewPage();
    drawTotals(tableStartY + 10);
    drawFooterSection();
  }
};

module.exports = { generatePdfForTemplate6 };