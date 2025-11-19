// backend/templates/template3.js
const {
  renderNotes,
  getUnifiedLines,
  invNo,
  getBillingAddress,
  getShippingAddress,
  formatCurrency,
} = require("../pdf-utils");

const generatePdfForTemplate3 = async (
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
  const NAVY = [29, 44, 74];
  const GOLD = [204, 181, 122];
  const TEXT = [41, 48, 66];
  const MUTED = [110, 119, 137];

  const { lines, subtotal, tax, invoiceTotal, gstEnabled } = _deriveTotals(
    transaction,
    company,
    serviceNameById
  );
  const companyGSTIN = _getCompanyGSTIN(company);

  const money = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

  const billingAddress = getBillingAddress(party);
  const shippingAddressStr = getShippingAddress(shippingAddress, billingAddress);

  // Data scaffold (exact same as frontend)
  const invoiceData = {
    invoiceNumber: invNo(transaction),
    date: transaction.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "01 / 10 / 2024",
    footer: {
      address: company?.address || "your address here",
      email: company?.emailId || "yourbusinessaccount@mail.com",
      phone: company?.mobileNumber || "123 456 789",
    },
    invoiceTo: {
      name: party?.name || "Client Name",
      billingAddress,
      shippingAddress: shippingAddressStr,
      email: party?.email || "",
    },
  };

  // Convert to table rows (exact same logic as frontend)
  const itemsForTable = lines.map((l, index) => ({
    sno: (index + 1).toString(),
    description: `${l.name}${l.description ? " — " + l.description : ""}`,
    code: l.code || "",
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
      description: transaction.description || "Item",
      code: "",
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
  pdfDoc.fillColor(TEXT);

  // ---------- Layout constants (exact same as frontend) ----------
  const stripY = 5;
  const stripH = 15;
  const rightLogoBlockW = 10;
  const stripX = 5;
  const stripW = pageWidth - m - rightLogoBlockW - stripX;

  const headYBase = stripY + stripH + 22;
  const ROW_H = 14;
  const ITEMS_PER_PAGE = 10;

  const tableX = m;
  const tableW = pageWidth - 2 * m;

  // Columns (exact same as frontend)
  const colSNo = m;
  const colItem = colSNo + 20;
  const colCode = colItem + 30;
  const colQty = colCode + 20;
  const colRate = pageWidth - m - 110;
  const colAmount = pageWidth - m - 80;
  const colGST = pageWidth - m - 50;
  const colTax = pageWidth - m - 30;
  const colTotal = pageWidth - m;

  // Footer bar geometry
  const fbH = 18;
  const fbY = pageHeight - m - fbH;

  // ---------- painters (exact same as frontend) ----------
  const drawTopStripAndLogo = () => {
    // hairline
    pdfDoc.strokeColor(200, 200, 200).lineWidth(0.2);
    pdfDoc
      .moveTo(0, stripY - 6)
      .lineTo(pageWidth, stripY - 6)
      .stroke();

    // navy strip
    pdfDoc.fillColor(NAVY).rect(stripX, stripY, stripW, stripH).fill();

    // business name (gold, spaced)
    pdfDoc.font("Helvetica-Bold").fontSize(16).fillColor(GOLD);
    const spacedText = (company?.businessName || "Your Company")
      .toUpperCase()
      .split("")
      .join(" ");
    pdfDoc.text(spacedText, pageWidth / 2, stripY + stripH - 5, {
      align: "center",
    });

    // right logo - using simple rectangle as fallback (same as frontend fallback)
    const logoBoxX = pageWidth - m - rightLogoBlockW;
    const x = logoBoxX + 5,
      y = stripY - 3,
      s = 20;
    
    pdfDoc.fillColor(NAVY).roundedRect(x, y, s, s, 3).fill();
    pdfDoc.fillColor(GOLD).circle(x + s - 6, y + 6, 3).fill();
    pdfDoc.strokeColor(255, 255, 255).lineWidth(2);
    pdfDoc
      .moveTo(x + 6, y + 10)
      .lineTo(x + 10, y + 14)
      .stroke();
    pdfDoc
      .moveTo(x + 10, y + 14)
      .lineTo(x + 16, y + 8)
      .stroke();
  };

  const drawHeaderBlocks = () => {
    // GSTIN under strip
    if (companyGSTIN) {
      pdfDoc.font("Helvetica").fontSize(9).fillColor(NAVY);
      pdfDoc.text(`GSTIN: ${companyGSTIN}`, m, stripY + stripH + 7);
    }

    // left: INVOICE TO
    pdfDoc.fillColor(TEXT).fontSize(9.8).font("Helvetica-Bold");
    pdfDoc.text("BILL TO:", m, headYBase);

    pdfDoc.font("Helvetica-Bold").fontSize(10.2);
    pdfDoc.text(invoiceData.invoiceTo.name, m, headYBase + 7);

    pdfDoc.font("Helvetica").fontSize(9.2).fillColor(MUTED);
    if (invoiceData.invoiceTo.email)
      pdfDoc.text(invoiceData.invoiceTo.email, m, headYBase + 13.5);
    
    const billToLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.billingAddress, 150);
    pdfDoc.text(billToLines, m, headYBase + 19.5);

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("SHIP TO:", m, headYBase + 25.5);
    pdfDoc.font("Helvetica");
    
    const shipToLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.shippingAddress, 150);
    pdfDoc.text(shipToLines, m, headYBase + 31.5);

    // right: invoice number + date
    pdfDoc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9.8);
    pdfDoc.text(`INVOICE NO. ${invoiceData.invoiceNumber}`, pageWidth - m, headYBase, {
      align: "right",
    });
    pdfDoc.font("Helvetica").fontSize(9.8);
    pdfDoc.text(`DATE  ${invoiceData.date}`, pageWidth - m, headYBase + 7, {
      align: "right",
    });
  };

  const drawTableHead = () => {
    let y = headYBase + 45;

    // CRISP top rule above the header
    pdfDoc.strokeColor(196, 200, 208).lineWidth(0.2);
    pdfDoc
      .moveTo(tableX, y - 8)
      .lineTo(tableX + tableW, y - 8)
      .stroke();

    // Header background (subtle)
    pdfDoc.fillColor(247, 249, 252).rect(tableX, y - 6, tableW, 12).fill();

    // CRISP bottom border under the header
    pdfDoc.strokeColor(206, 212, 222).lineWidth(0.2);
    pdfDoc
      .moveTo(tableX, y + 6)
      .lineTo(tableX + tableW, y + 6)
      .stroke();

    // Header labels
    pdfDoc.font("Helvetica-Bold").fillColor(NAVY).fontSize(10.5);

    pdfDoc.text("S.No.", colSNo, y);
    pdfDoc.text("ITEM", colItem, y);
    pdfDoc.text("HSN/SAC", colCode, y);
    pdfDoc.text("QTY", colQty, y, { align: "right" });
    pdfDoc.text("PRICE", colAmount, y, { align: "right" });
    pdfDoc.text("GST%", colGST, y, { align: "right" });
    pdfDoc.text("TAX", colTax, y, { align: "right" });
    pdfDoc.text("TOTAL", colTotal, y, { align: "right" });

    // Start of first data row baseline
    return y + 12;
  };

  const drawRow = (it, y) => {
    pdfDoc.font("Helvetica").fillColor(TEXT).lineWidth(0.3).strokeColor(GOLD).fontSize(9);

    // S.No.
    pdfDoc.text(it.sno, colSNo, y);

    // Description (truncate to fit one line)
    const maxDescWidth = colCode - colItem - 5;
    let description = it.description;
    if (pdfDoc.widthOfString(description) > maxDescWidth) {
      // rough clamp based on width
      while (
        pdfDoc.widthOfString(description + "...") > maxDescWidth &&
        description.length > 0
      ) {
        description = description.slice(0, -1);
      }
      description = description.trimEnd() + "...";
    }
    pdfDoc.text(description, colItem, y);

    // HSN/SAC
    pdfDoc.text(it.code, colCode, y);

    // Right-aligned numeric columns
    pdfDoc.text(String(it.quantity), colQty, y, { align: "right" });
    pdfDoc.text(money(it.pricePerUnit), colAmount, y, { align: "right" });
    pdfDoc.text(`${it.gstPercentage}%`, colGST, y, { align: "right" });
    pdfDoc.text(money(it.lineTax), colTax, y, { align: "right" });
    pdfDoc.text(money(it.lineTotal), colTotal, y, { align: "right" });

    // row divider
    pdfDoc
      .moveTo(m, y + 3.2)
      .lineTo(pageWidth - m, y + 3.2)
      .stroke();
  };

  const drawFooterBar = () => {
    // bottom navy footer bar with contact
    pdfDoc.fillColor(NAVY).rect(0, fbY, pageWidth, fbH).fill();

    const innerW = pageWidth;
    const sectionW = innerW / 3;
    const padX = 10;
    const r = 2.2;
    const gap = 4;
    const baseline = fbY + fbH / 2 + 1;

    pdfDoc.font("Helvetica").fontSize(9).fillColor(255, 255, 255);

    const footerVals = [
      String(invoiceData.footer.address || ""),
      String(invoiceData.footer.email || ""),
      String(invoiceData.footer.phone || ""),
    ];

    const maxTextW = sectionW - (padX + r * 2 + gap + 2);
    
    footerVals.forEach((val, i) => {
      const left = i * sectionW;
      const textX = left + padX + r * 2 + gap;
      pdfDoc.fillColor(GOLD);
      
      // Fit text (same logic as frontend)
      let fittedText = val;
      if (pdfDoc.widthOfString(fittedText) > maxTextW) {
        while (
          pdfDoc.widthOfString(fittedText + "...") > maxTextW &&
          fittedText.length > 1
        ) {
          fittedText = fittedText.slice(0, -1);
        }
        fittedText = fittedText.trimEnd() + "...";
      }
      
      pdfDoc.text(fittedText, textX, baseline, { align: "left" });
    });
  };

  // ---------- paginate rows (exact same logic as frontend) ----------
  const chunks = [];
  for (let i = 0; i < itemsForTable.length; i += ITEMS_PER_PAGE) {
    chunks.push(itemsForTable.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push(itemsForTable);

  let lastRowY = headYBase + 28;
  chunks.forEach((rows, pageIndex) => {
    if (pageIndex > 0) {
      pdfDoc.addPage();
    }

    drawTopStripAndLogo();
    drawHeaderBlocks();
    let y = drawTableHead();

    rows.forEach((it) => {
      drawRow(it, y);
      y += ROW_H;
    });

    lastRowY = y;
    drawFooterBar();
  });

  // ---------- Totals (exact same logic as frontend) ----------
  const approxTotalsHeight = gstEnabled ? 34 : 24;
  const bottomSafeY = pageHeight - (m + fbH) - 10;

  if (lastRowY + approxTotalsHeight > bottomSafeY) {
    // add a new page just for totals
    pdfDoc.addPage();
    drawTopStripAndLogo();
    drawHeaderBlocks();
    drawFooterBar();
    lastRowY = headYBase + 28;
  }

  let yTotals = lastRowY + 6;
  pdfDoc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.5);

  pdfDoc.text("SUBTOTAL", colTax, yTotals, { align: "right" });
  pdfDoc.text(money(subtotal), colTotal, yTotals, { align: "right" });

  if (gstEnabled) {
    yTotals += 10;
    pdfDoc.text("GST TOTAL", colTax, yTotals, { align: "right" });
    pdfDoc.text(money(tax), colTotal, yTotals, { align: "right" });
  }

  yTotals += 14;
  pdfDoc.fontSize(12.5);
  pdfDoc.text("GRAND TOTAL:    ", colTax, yTotals, { align: "right" });
  pdfDoc.text(money(invoiceTotal), colTotal, yTotals, { align: "right" });

  // subtle divider above footer
  const afterTotals = yTotals + 6;
  pdfDoc.strokeColor(220, 220, 220).lineWidth(0.2);
  pdfDoc
    .moveTo(m, afterTotals)
    .lineTo(pageWidth - m, afterTotals)
    .stroke();
};

module.exports = { generatePdfForTemplate3 };