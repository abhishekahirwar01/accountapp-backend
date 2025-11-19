// backend/templates/template5.js
const {
  renderNotes,
  getUnifiedLines,
  getBillingAddress,
  getShippingAddress,
  formatCurrency,
} = require("../pdf-utils");

const generatePdfForTemplate5 = (
  pdfDoc,
  transaction,
  company,
  party,
  serviceNameById,
  shippingAddress
) => {
  // ------ local helpers (exact same as frontend) ------
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
  const m = 18;

  // Colors (exact same as frontend)
  const PRIMARY_DARK = [38, 50, 56];
  const ACCENT_TEAL = [0, 150, 136];
  const LIGHT_TEXT = [100, 115, 120];
  const BORDER_GRAY = [230, 230, 230];
  const TABLE_HEADER_BG = [240, 245, 248];
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

  // Data scaffold (exact same as frontend)
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

  // Convert to table rows (exact same as frontend)
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
  pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);

  // Layout constants (exact same as frontend)
  const headerBlockHeight = 40;
  const infoBlockY = headerBlockHeight + 15;
  const tableStartY = infoBlockY + 90;
  const ROW_H = 9;
  const ITEMS_PER_PAGE = 10;
  const TABLE_HEADER_HEIGHT = 10;

  const contentX = m;
  const contentW = pageWidth - 2 * m;

  // Columns (exact same as frontend)
  const colSNo = contentX + 2;
  const colItem = colSNo + 20;
  const colQty = colItem + 38;
  const colRate = colQty + 20;
  const colGST = colRate + 30;
  const colTax = colRate + 60;
  const colTotal = pageWidth - m - 2;

  const footerSectionH = 20;
  const footerSectionY = pageHeight - footerSectionH - m;

  // ---------- painters (exact same as frontend) ----------

  const drawHeaderSection = () => {
    let currentY = m;

    // Left: Company Name
    pdfDoc.fontSize(16).font("Helvetica-Bold");
    pdfDoc.text(invoiceData.company.name.toUpperCase(), m, currentY + 7);

    pdfDoc.fontSize(9).font("Helvetica");
    pdfDoc.fillColor(LIGHT_TEXT[0], LIGHT_TEXT[1], LIGHT_TEXT[2]);
    const companyInfoY = currentY + 12;
    pdfDoc.text(invoiceData.company.address, m, companyInfoY);
    pdfDoc.text(invoiceData.company.email, m, companyInfoY + 4);

    // Right: "INVOICE" Title
    pdfDoc.fontSize(30).font("Helvetica-Bold");
    pdfDoc.fillColor(ACCENT_TEAL[0], ACCENT_TEAL[1], ACCENT_TEAL[2]);
    const invoiceWidth = pdfDoc.widthOfString("INVOICE");
    pdfDoc.text("INVOICE", pageWidth - m - invoiceWidth, m + 15);

    // Subtle line below header
    pdfDoc
      .strokeColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2])
      .lineWidth(0.7)
      .moveTo(m, headerBlockHeight + 5)
      .lineTo(pageWidth - m, headerBlockHeight + 5)
      .stroke();
  };

  const drawDetailBlocks = () => {
    let currentY = infoBlockY;

    // Left Block: Invoice Details
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);
    pdfDoc.text("INVOICE DETAILS", m, currentY);

    pdfDoc.fontSize(9).font("Helvetica");
    pdfDoc.fillColor(LIGHT_TEXT[0], LIGHT_TEXT[1], LIGHT_TEXT[2]);
    pdfDoc.text(`Invoice No: ${invoiceData.invoiceNumber}`, m, currentY + 7);
    pdfDoc.text(`Date: ${invoiceData.date}`, m, currentY + 12);

    // Right Block: Bill To
    const rightColX = pageWidth - m;
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);
    pdfDoc.text("BILL TO:", rightColX, currentY, { align: "right" });

    pdfDoc.fontSize(9).font("Helvetica");
    pdfDoc.fillColor(LIGHT_TEXT[0], LIGHT_TEXT[1], LIGHT_TEXT[2]);
    pdfDoc.text(invoiceData.invoiceTo.name, rightColX, currentY + 7, {
      align: "right",
    });
    
    const billToLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.billingAddress, 150);
    pdfDoc.text(billToLines, rightColX, currentY + 12, {
      align: "right",
    });

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("SHIP TO:", rightColX, currentY + 20, { align: "right" });
    pdfDoc.font("Helvetica");
    
    const shipToLines = pdfDoc.splitTextToSize(invoiceData.invoiceTo.shippingAddress, 150);
    pdfDoc.text(shipToLines, rightColX, currentY + 27, {
      align: "right",
    });

    if (invoiceData.invoiceTo.email) {
      pdfDoc.text(invoiceData.invoiceTo.email, rightColX, currentY + 35, {
        align: "right",
      });
    }
    if (invoiceData.invoiceTo.gstin) {
      pdfDoc.text(
        `GSTIN: ${invoiceData.invoiceTo.gstin}`,
        rightColX,
        currentY + 40,
        {
          align: "right",
        }
      );
    }

    // Horizontal divider
    pdfDoc
      .strokeColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2])
      .lineWidth(0.3)
      .moveTo(m, currentY + 40)
      .lineTo(pageWidth - m, currentY + 40)
      .stroke();
  };

  const drawTableHead = () => {
    let y = tableStartY;

    // Table Header with background
    pdfDoc
      .fillColor(TABLE_HEADER_BG[0], TABLE_HEADER_BG[1], TABLE_HEADER_BG[2])
      .rect(contentX, y, contentW, TABLE_HEADER_HEIGHT, "F")
      .strokeColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2])
      .lineWidth(0.5)
      .rect(contentX, y, contentW, TABLE_HEADER_HEIGHT, "S");

    // Header labels
    pdfDoc.fontSize(8).font("Helvetica-Bold");
    pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);

    pdfDoc.text("S.No.", colSNo, y + TABLE_HEADER_HEIGHT / 2 + 1.5);
    pdfDoc.text("ITEM DESCRIPTION", colItem, y + TABLE_HEADER_HEIGHT / 2 + 1.5);
    pdfDoc.text("QTY", colQty, y + TABLE_HEADER_HEIGHT / 2 + 1.5, {
      align: "right",
    });
    pdfDoc.text("RATE", colRate, y + TABLE_HEADER_HEIGHT / 2 + 1.5, {
      align: "right",
    });
    pdfDoc.text("GST%", colGST, y + TABLE_HEADER_HEIGHT / 2 + 1.5, {
      align: "right",
    });
    pdfDoc.text("TAX", colTax, y + TABLE_HEADER_HEIGHT / 2 + 1.5, {
      align: "right",
    });
    pdfDoc.text("TOTAL", colTotal, y + TABLE_HEADER_HEIGHT / 2 + 1.5, {
      align: "right",
    });

    return y + TABLE_HEADER_HEIGHT;
  };

  const drawRow = (it, y, isLast) => {
    pdfDoc.fontSize(8).font("Helvetica");
    pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);

    pdfDoc.text(it.sno, colSNo, y + ROW_H / 2);

    const maxDescWidth = colQty - colItem - 5;
    const descLines = pdfDoc.splitTextToSize(it.description, maxDescWidth);
    pdfDoc.text(descLines, colItem, y + ROW_H / 2 - (descLines.length - 1) * 2);

    pdfDoc.text(String(it.quantity), colQty, y + ROW_H / 2, { align: "right" });
    pdfDoc.text(money(it.pricePerUnit), colRate, y + ROW_H / 2, {
      align: "right",
    });
    pdfDoc.text(`${it.gstPercentage}%`, colGST, y + ROW_H / 2, {
      align: "right",
    });
    pdfDoc.text(money(it.lineTax), colTax, y + ROW_H / 2, { align: "right" });
    pdfDoc.text(money(it.lineTotal), colTotal, y + ROW_H / 2, { align: "right" });

    // Subtle line between rows
    pdfDoc
      .strokeColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2])
      .lineWidth(0.1)
      .moveTo(contentX, y + ROW_H)
      .lineTo(contentX + contentW, y + ROW_H)
      .stroke();
  };

  const drawTotals = (startY) => {
    let yTotals = startY + 10;
    const totalsBoxWidth = 70;
    const totalsBoxX = pageWidth - m - totalsBoxWidth;

    // Subtotal line
    pdfDoc.fontSize(10).font("Helvetica");
    pdfDoc.fillColor(PRIMARY_DARK[0], PRIMARY_DARK[1], PRIMARY_DARK[2]);
    pdfDoc.text("Subtotal:", totalsBoxX, yTotals, { align: "left" });
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(money(subtotal), pageWidth - m, yTotals, { align: "right" });

    if (gstEnabled) {
      yTotals += 7;
      pdfDoc.font("Helvetica");
      pdfDoc.text("GST Total:", totalsBoxX, yTotals, { align: "left" });
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text(money(tax), pageWidth - m, yTotals, { align: "right" });
    }

    yTotals += 10;
    // Grand Total with background
    pdfDoc
      .fillColor(ACCENT_TEAL[0], ACCENT_TEAL[1], ACCENT_TEAL[2])
      .rect(
        totalsBoxX - 2,
        yTotals - 6,
        totalsBoxWidth + 4 + (pageWidth - m - totalsBoxX),
        10,
        "F"
      )
      .strokeColor(ACCENT_TEAL[0], ACCENT_TEAL[1], ACCENT_TEAL[2])
      .lineWidth(0.5)
      .rect(
        totalsBoxX - 2,
        yTotals - 6,
        totalsBoxWidth + 4 + (pageWidth - m - totalsBoxX),
        10,
        "S"
      );

    pdfDoc.fontSize(12).font("Helvetica-Bold");
    pdfDoc.fillColor(WHITE[0], WHITE[1], WHITE[2]);
    pdfDoc.text("GRAND TOTAL", totalsBoxX + 2, yTotals + 1, { align: "left" });
    pdfDoc.text(money(invoiceTotal), pageWidth - m - 2, yTotals + 1, { align: "right" });
  };

  const drawFooterSection = () => {
    // Top border for footer
    pdfDoc
      .strokeColor(BORDER_GRAY[0], BORDER_GRAY[1], BORDER_GRAY[2])
      .lineWidth(0.5)
      .moveTo(m, footerSectionY)
      .lineTo(pageWidth - m, footerSectionY)
      .stroke();

    // Render notes
    if (transaction.notes) {
      const notesLines = pdfDoc.splitTextToSize(transaction.notes, pageWidth - 2 * m);
      pdfDoc.fontSize(8).font("Helvetica");
      pdfDoc.fillColor(LIGHT_TEXT[0], LIGHT_TEXT[1], LIGHT_TEXT[2]);
      pdfDoc.text(notesLines, m, footerSectionY + 7);
    }

    // Company contact details
    const contact = [
      invoiceData.company.address || "",
      invoiceData.company.email || "",
      invoiceData.company.phone || "",
    ]
      .filter(Boolean)
      .join(" • ");
    
    pdfDoc.fontSize(8).font("Helvetica");
    pdfDoc.fillColor(LIGHT_TEXT[0], LIGHT_TEXT[1], LIGHT_TEXT[2]);
    pdfDoc.text(contact || "", m, footerSectionY + 20);

    // Page number
    const pageCount = pdfDoc.bufferedPageRange().count;
    pdfDoc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - m, footerSectionY + 20, {
      align: "right",
    });
  };

  // ---------- paginate rows (exact same logic as frontend) ----------
  const chunks = [];
  for (let i = 0; i < itemsForTable.length; i += ITEMS_PER_PAGE) {
    chunks.push(itemsForTable.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push(itemsForTable);

  let lastRowY = tableStartY;

  chunks.forEach((rows, pageIndex) => {
    if (pageIndex > 0) {
      pdfDoc.addPage();
    }

    drawHeaderSection();
    drawDetailBlocks();
    let y = drawTableHead();

    rows.forEach((it, idx) => {
      drawRow(it, y, idx === rows.length - 1);
      y += ROW_H;
    });

    lastRowY = y;
    drawFooterSection();
  });

  // ---------- Totals (exact same logic as frontend) ----------
  const totalsBlockHeight = gstEnabled ? 35 : 28;
  const bottomSafeY = pageHeight - footerSectionH - m - totalsBlockHeight - 5;

  if (lastRowY + totalsBlockHeight + 10 <= bottomSafeY) {
    drawTotals(lastRowY);
  } else {
    pdfDoc.addPage();
    drawHeaderSection();
    drawDetailBlocks();
    const totalsStartOnNewPageY = Math.max(
      tableStartY,
      pageHeight - footerSectionH - m - totalsBlockHeight - 5
    );
    drawTotals(totalsStartOnNewPageY - 10);
  }
};

module.exports = { generatePdfForTemplate5 };