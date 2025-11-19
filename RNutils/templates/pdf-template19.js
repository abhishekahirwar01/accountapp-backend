// backend/templates/template19.js
const PDFDocument = require("pdfkit");
const {
  getBillingAddress,
  getShippingAddress,
  getUnifiedLines,
  prepareTemplate8Data,
  invNo,
  formatCurrency,
  numberToWords,
  getStateCode,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");
const fs = require("fs");
const path = require("path");

// --- Constants ---
const BLUE = [24, 115, 204];
const DARK = [45, 55, 72];
const MUTED = [105, 112, 119];
const BORDER = [220, 224, 228];

// Helper function to safely return value or "-"
const handleUndefined = (value, fallback = "-") => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  if (value === "N/A") return fallback;
  return value.toString();
};

// Format date helper
const fmtDate = (d) =>
  d
    ? new Intl.DateTimeFormat("en-GB").format(new Date(d)).replace(/\//g, "-")
    : "N/A";

// Money formatting helper
const money = (n) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// GSTIN extraction helper
const _getGSTIN = (x) =>
  x?.gstin ??
  x?.gstIn ??
  x?.gstNumber ??
  x?.gst_no ??
  x?.gst ??
  x?.gstinNumber ??
  x?.tax?.gstin ??
  null;

// Format quantity helper
const formatQuantity = (quantity, unit = "pcs") => {
  if (quantity === "-") return "-";
  const num = Number(quantity);
  if (isNaN(num)) return quantity;

  if (num % 1 === 0) {
    return `${num.toFixed(0)} ${unit}`;
  } else {
    return `${num.toFixed(2)} ${unit}`;
  }
};

// Get asset path for logo and QR code
const getAssetPath = (assetPath) => {
  if (!assetPath) return null;

  if (assetPath.startsWith("http")) {
    return assetPath;
  }

  const localPath = path.join(process.cwd(), "public", assetPath);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  return null;
};

// Simple HTML to text converter
const simpleHtmlToText = (html) => {
  if (!html) return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<div>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<ul>/gi, "\n")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<ol>/gi, "\n")
    .replace(/<\/ol>/gi, "\n")
    .replace(/<strong>/gi, "")
    .replace(/<\/strong>/gi, "")
    .replace(/<b>/gi, "")
    .replace(/<\/b>/gi, "")
    .replace(/<em>/gi, "")
    .replace(/<\/em>/gi, "")
    .replace(/<i>/gi, "")
    .replace(/<\/i>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n\s*\n/g, "\n")
    .trim();
};

// Static header drawing function
const drawStaticHeader = (doc, M, invoiceData, logoUrl, pageWidth) => {
  let y = M;

  // Title
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(`rgb(0, 110, 200)`)
    .text("TAX INVOICE", pageWidth / 2, y, { align: "center" });
  y += 24;

  // Company Details
  doc
    .fontSize(15)
    .fillColor("black")
    .text(capitalizeWords(invoiceData.company.name.toUpperCase()), M, y);
  y += 16;

  doc.fontSize(9).font("Helvetica");

  if (invoiceData.company.gstin !== "N/A") {
    doc.font("Helvetica-Bold").text(`GSTIN: `, M, y);
    doc
      .font("Helvetica")
      .text(
        ` ${invoiceData.company.gstin}`,
        M + doc.widthOfString("GSTIN: "),
        y
      );
    y += 12;
  }

  const headerAddr = capitalizeWords(invoiceData.company.address);
  const headerAddrLines =
    doc.heightOfString(headerAddr, { width: 250 }) > 9
      ? doc.splitTextToSize(headerAddr, 250)
      : [headerAddr];

  if (headerAddrLines.length) {
    headerAddrLines.forEach((line) => {
      doc.text(line, M, y);
      y += 9;
    });
  }

  y += 3;

  if (invoiceData.company.city !== "N/A") {
    doc.text(`${capitalizeWords(invoiceData.company.city)}`, M, y);
  }

  y += 9;

  if (invoiceData.company.pan !== "N/A") {
    doc.font("Helvetica-Bold").text(`PAN:`, M, y);
    doc
      .font("Helvetica")
      .text(` ${invoiceData.company.pan}`, M + doc.widthOfString("PAN:"), y);
    y += 12;
  }

  if (invoiceData.company.phone !== "N/A") {
    y += 3;
    doc.font("Helvetica-Bold").text(`Phone:`, M, y);
    doc
      .font("Helvetica")
      .text(
        ` ${
          invoiceData.company.phone
            ? formatPhoneNumber(invoiceData.company.phone)
            : "-"
        }`,
        M + doc.widthOfString("Phone:"),
        y
      );
  }

  y += 12;

  if (invoiceData.company.state !== "N/A") {
    doc.font("Helvetica-Bold").text(`State:`, M, y);
    doc
      .font("Helvetica")
      .text(
        ` ${capitalizeWords(invoiceData.company.state)}`,
        M + doc.widthOfString("State:"),
        y
      );
  }

  y += 6;

  // Logo
  const logoSize = 70;
  const logoX = pageWidth - M - logoSize;

  if (logoUrl) {
    try {
      doc.image(logoUrl, logoX, M + 20, { width: logoSize, height: logoSize });
    } catch (e) {
      console.log("Logo not found");
    }
  }

  // Separator
  y = Math.max(y, M + logoSize + 20);
  doc
    .moveTo(M, y + 4)
    .lineTo(pageWidth - M, y + 4)
    .strokeColor(`rgb(0, 110, 200)`)
    .lineWidth(1.5)
    .stroke();

  return y + 20;
};

// Customer and meta block drawing function
const drawCustomerMetaBlock = (
  doc,
  M,
  invoiceData,
  party,
  shippingAddress,
  startY,
  pageWidth
) => {
  let detailY = startY;

  // LEFT: Customer Details
  let leftY = detailY;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(`rgb(0, 110, 200)`)
    .text("Details of Buyer | Billed to :", M, leftY);
  leftY += 15;

  // Buyer's Name
  doc
    .fontSize(10)
    .fillColor(`rgb(${DARK.join(",")})`)
    .text(capitalizeWords(invoiceData.invoiceTo.name), M, leftY);
  leftY += 12;

  // Other details
  doc.fontSize(9).font("Helvetica");

  const billAddressLines =
    doc.heightOfString(capitalizeWords(invoiceData.invoiceTo.billingAddress), {
      width: 200,
    }) > 9
      ? doc.splitTextToSize(
          capitalizeWords(invoiceData.invoiceTo.billingAddress),
          200
        )
      : [capitalizeWords(invoiceData.invoiceTo.billingAddress)];

  if (billAddressLines.length) {
    billAddressLines.forEach((line) => {
      doc.text(line, M, leftY);
      leftY += 9;
    });
  }

  // Phone
  doc.font("Helvetica-Bold").text(`Phone No:`, M, leftY);
  doc
    .font("Helvetica")
    .text(
      ` ${handleUndefined(
        party?.contactNumber ? formatPhoneNumber(party.contactNumber) : "-"
      )}`,
      M + doc.widthOfString("Phone No:"),
      leftY
    );
  leftY += 12;

  if (invoiceData.invoiceTo.gstin !== "N/A") {
    doc.font("Helvetica-Bold").text(`GSTIN:`, M, leftY);
    doc
      .font("Helvetica")
      .text(
        ` ${invoiceData.invoiceTo.gstin}`,
        M + doc.widthOfString("GSTIN:"),
        leftY
      );
    leftY += 12;
  }

  if (invoiceData.invoiceTo.pan !== "N/A") {
    doc.font("Helvetica-Bold").text(`PAN:`, M, leftY);
    doc
      .font("Helvetica")
      .text(
        ` ${invoiceData.invoiceTo.pan}`,
        M + doc.widthOfString("PAN:"),
        leftY
      );
    leftY += 12;
  }

  // Place of Supply
  const placeOfSupply = shippingAddress?.state
    ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
    : party?.state
    ? `${party.state} (${getStateCode(party.state) || "-"})`
    : "-";

  doc.font("Helvetica-Bold").text(`Place of Supply:`, M, leftY);
  doc
    .font("Helvetica")
    .text(
      ` ${placeOfSupply}`,
      M + doc.widthOfString("Place of Supply:"),
      leftY
    );
  leftY += 16;

  // Shipping Details
  let shippingY = leftY + 9;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(`rgb(0, 110, 200)`)
    .text("Details of Consignee | Shipped to :", M, shippingY);
  shippingY += 15;

  // Shipping name
  doc
    .fontSize(10)
    .fillColor(`rgb(${DARK.join(",")})`)
    .text(capitalizeWords(invoiceData.shippingAddress.name), M, shippingY);
  shippingY += 12;

  // Other shipping details
  doc.fontSize(9).font("Helvetica");

  // Address
  let addressString = capitalizeWords(invoiceData.shippingAddress.address);
  if (
    addressString === "" ||
    addressString.toLowerCase().includes("not available") ||
    addressString.toLowerCase().includes("address missing")
  ) {
    addressString = "Address not available";
  }

  const shipAddressLines =
    doc.heightOfString(addressString, { width: 200 }) > 9
      ? doc.splitTextToSize(addressString, 200)
      : [addressString];

  if (shipAddressLines.length) {
    shipAddressLines.forEach((line) => {
      doc.text(line, M, shippingY);
      shippingY += 9;
    });
  }

  // Country
  if (invoiceData.company?.Country !== "N/A") {
    doc.font("Helvetica-Bold").text(`Country:`, M, shippingY);
    doc
      .font("Helvetica")
      .text(
        ` ${invoiceData.company?.Country}`,
        M + doc.widthOfString("Country:"),
        shippingY
      );
    shippingY += 12;
  }

  // Phone
  const phoneraw =
    shippingAddress?.contactNumber ||
    shippingAddress?.phone ||
    party?.contactNumber ||
    "-";

  const phone =
    phoneraw && phoneraw !== "-" ? formatPhoneNumber(String(phoneraw)) : "-";

  doc.font("Helvetica-Bold").text(`Phone No:`, M, shippingY);
  doc
    .font("Helvetica")
    .text(
      ` ${handleUndefined(phone)}`,
      M + doc.widthOfString("Phone No:"),
      shippingY
    );
  shippingY += 12;

  // GSTIN
  const shippingGSTIN = _getGSTIN(shippingAddress) || _getGSTIN(party) || "-";
  if (shippingGSTIN !== "N/A" && shippingGSTIN !== "-") {
    doc.font("Helvetica-Bold").text(`GSTIN:`, M, shippingY);
    doc
      .font("Helvetica")
      .text(` ${shippingGSTIN}`, M + doc.widthOfString("GSTIN:"), shippingY);
    shippingY += 12;
  } else {
    doc.font("Helvetica-Bold").text(`GSTIN:`, M, shippingY);
    doc
      .font("Helvetica")
      .text(` -`, M + doc.widthOfString("GSTIN:"), shippingY);
    shippingY += 12;
  }

  // State
  if (invoiceData.shippingAddress.state !== "N/A") {
    doc.font("Helvetica-Bold").text(`State:`, M, shippingY);
    doc
      .font("Helvetica")
      .text(
        ` ${invoiceData.shippingAddress.state}`,
        M + doc.widthOfString("State:"),
        shippingY
      );
    shippingY += 12;
  }

  const contentBottomY = shippingY;

  // RIGHT: Invoice meta
  const rightX = pageWidth - M - 120;
  let rightY = detailY;
  doc.fontSize(9).font("Helvetica-Bold");

  const metaLabels = [
    "Invoice # :",
    "Invoice Date :",
    "P.O. No :",
    "P.O. Date :",
    "E-Way No :",
  ];

  const metaValues = [
    handleUndefined(invoiceData.invoiceNumber),
    handleUndefined(invoiceData.date),
    handleUndefined(invoiceData.poNumber),
    handleUndefined(invoiceData.poDate),
    handleUndefined(invoiceData.eWayNo),
  ];

  for (let i = 0; i < metaLabels.length; i++) {
    doc.text(metaLabels[i], rightX, rightY);
    let displayValue = metaValues[i];

    if (displayValue === "N/A") {
      displayValue = "-";
    }

    doc.font("Helvetica").text(displayValue, rightX + 60, rightY);
    doc.font("Helvetica-Bold");
    rightY += 14;
  }

  return Math.max(contentBottomY, rightY);
};

// Create table function for PDFKit
const createTable = (
  doc,
  headers,
  rows,
  startY,
  columnStyles,
  pageWidth,
  M
) => {
  const tableTop = startY;
  const rowHeight = 20;
  const headerHeight = 24;

  // Draw header background
  doc
    .rect(M, tableTop, pageWidth - M * 2, headerHeight)
    .fill(`rgb(0, 110, 200)`);

  // Draw header text
  let xPos = M;
  doc.fontSize(7).font("Helvetica-Bold").fillColor("white");

  headers.forEach((header, i) => {
    const colWidth = columnStyles[i].cellWidth;
    const align = columnStyles[i].halign === "center" ? "center" : "left";

    doc.text(header, xPos + 2, tableTop + 8, {
      width: colWidth - 4,
      align: align,
    });

    xPos += colWidth;
  });

  // Draw rows
  let currentY = tableTop + headerHeight;

  rows.forEach((row, rowIndex) => {
    xPos = M;

    // Draw cell borders and content
    row.forEach((cell, cellIndex) => {
      const colWidth = columnStyles[cellIndex].cellWidth;
      const isBold = cell.styles?.fontStyle === "bold";
      const align = columnStyles[cellIndex].halign;
      const content = cell.content || cell;

      // Draw cell border
      doc
        .rect(xPos, currentY, colWidth, rowHeight)
        .strokeColor(`rgb(${BORDER.join(",")})`)
        .lineWidth(0.3)
        .stroke();

      // Draw cell content
      doc
        .fontSize(7.5)
        .font(isBold ? "Helvetica-Bold" : "Helvetica")
        .fillColor("black")
        .text(String(content), xPos + 2, currentY + 6, {
          width: colWidth - 4,
          align:
            align === "center"
              ? "center"
              : align === "right"
              ? "right"
              : "left",
        });

      xPos += colWidth;
    });

    currentY += rowHeight;
  });

  return currentY;
};

// Optimized column widths function
const getColWidths = (availableWidth) => {
  const baseWidths = {
    srNo: 28,
    hsn: 42,
    rate: 40,
    qty: 35,
    taxable: 55,
    igstPct: 40,
    igstAmt: 55,
    cgstPct: 35,
    cgstAmt: 55,
    sgstPct: 35,
    sgstAmt: 55,
    total: 58,
  };

  const fixedWidths = {
    withCGSTSGST:
      baseWidths.srNo +
      baseWidths.hsn +
      baseWidths.rate +
      baseWidths.qty +
      baseWidths.taxable +
      baseWidths.cgstPct +
      baseWidths.cgstAmt +
      baseWidths.sgstPct +
      baseWidths.sgstAmt +
      baseWidths.total,
    withIGST:
      baseWidths.srNo +
      baseWidths.hsn +
      baseWidths.rate +
      baseWidths.qty +
      baseWidths.taxable +
      baseWidths.igstPct +
      baseWidths.igstAmt +
      baseWidths.total,
    withoutGST:
      baseWidths.srNo +
      baseWidths.hsn +
      baseWidths.rate +
      baseWidths.qty +
      baseWidths.taxable +
      baseWidths.total,
  };

  return {
    withCGSTSGST: [
      23,
      availableWidth - fixedWidths.withCGSTSGST,
      40,
      40,
      33,
      54,
      35,
      55,
      35,
      55,
      55,
    ],
    withIGST: [
      28,
      availableWidth - fixedWidths.withIGST,
      42,
      40,
      37,
      55,
      40,
      55,
      58,
    ],
    withoutGST: [
      28,
      availableWidth - fixedWidths.withoutGST,
      52,
      50,
      35,
      70,
      77,
    ],
  };
};

// Render HTML notes for PDFKit
const renderSimpleHtml = (
  doc,
  html,
  startX,
  startY,
  maxWidth,
  lineHeight = 10
) => {
  const text = simpleHtmlToText(html);
  if (!text.trim()) return startY;

  const lines =
    doc.heightOfString(text, { width: maxWidth }) > lineHeight
      ? doc.splitTextToSize(text, maxWidth)
      : [text];

  let currentY = startY;

  lines.forEach((line) => {
    // Check if we need a new page
    if (currentY + lineHeight > doc.page.height - 50) {
      doc.addPage();
      currentY = 50;
    }

    doc.text(line, startX, currentY);
    currentY += lineHeight;
  });

  return currentY;
};

// Main PDF generation function
const generateTemplate19 = async (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  const shouldHideBankDetails = transaction.type === "proforma";

  // Prepare data using template8 logic
  const {
    totalTaxable,
    totalAmount,
    items,
    totalItems,
    totalQty,
    itemsWithGST,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    isInterstate,
    showIGST,
    showCGSTSGST,
    showNoTax,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  const logoUrl = getAssetPath(company?.logo);

  // Convert itemsWithGST to the expected format
  const lines = itemsWithGST.map((item) => ({
    name: capitalizeWords(item.name),
    description: item.description || "",
    quantity: item.itemType === "service" ? "-" : item.quantity || 0,
    pricePerUnit: item.pricePerUnit || 0,
    amount: item.taxableValue,
    gstPercentage: item.gstRate,
    lineTax: item.cgst + item.sgst + item.igst,
    lineTotal: item.total,
    hsnSac: item.code || "N/A",
    unit: item.unit || "PCS",
    formattedDescription: item.description
      ? item.description.split("\n").join(" / ")
      : "",
  }));

  const subtotal = totalTaxable;
  const tax = totalCGST + totalSGST + totalIGST;
  const invoiceTotal = totalAmount;
  const gstEnabled = isGSTApplicable;
  const totalQuantity = totalQty;

  const totalTaxableAmount = formatCurrency(subtotal);
  const finalTotalAmount = formatCurrency(invoiceTotal);

  const billingAddress = capitalizeWords(getBillingAddress(party));
  const shippingAddressStr = capitalizeWords(
    getShippingAddress(shippingAddress, billingAddress)
  );

  const companyGSTIN = _getGSTIN(company);
  const partyGSTIN = _getGSTIN(party);

  // Invoice data object
  const invoiceData = {
    invoiceNumber: handleUndefined(invNo(transaction)),
    date: handleUndefined(fmtDate(transaction.date) || fmtDate(new Date())),
    poNumber: handleUndefined(transaction.poNumber, "-"),
    poDate: handleUndefined(fmtDate(transaction.poDate), "-"),
    eWayNo: handleUndefined(transaction.eWayBillNo, "-"),
    placeOfSupply: handleUndefined(
      shippingAddress?.state
        ? `${capitalizeWords(shippingAddress.state)} (${
            getStateCode(shippingAddress.state) || "-"
          })`
        : "-"
    ),
    company: {
      name: handleUndefined(
        capitalizeWords(company?.businessName),
        "Company Name"
      ),
      address: handleUndefined(
        capitalizeWords(company?.address),
        "Address not available"
      ),
      gstin: handleUndefined(companyGSTIN, "-"),
      pan: handleUndefined(company?.panNumber, "-"),
      state: handleUndefined(
        company?.addressState
          ? `${capitalizeWords(company?.addressState)} (${
              getStateCode(company?.addressState) || "-"
            })`
          : "-"
      ),
      city: handleUndefined(capitalizeWords(company?.City), "-"),
      phone: handleUndefined(company?.mobileNumber, "-"),
      Country: handleUndefined(company?.Country, "-"),
    },
    invoiceTo: {
      name: handleUndefined(capitalizeWords(party?.name), "Client Name"),
      billingAddress: handleUndefined(billingAddress, "Address not available"),
      gstin: handleUndefined(partyGSTIN, "-"),
      pan: handleUndefined(party?.panNumber, "-"),
      state: handleUndefined(
        party?.state
          ? `${capitalizeWords(party.state)} (${
              getStateCode(party.state) || "-"
            })`
          : "-"
      ),
      email: handleUndefined(party?.email, "-"),
    },
    shippingAddress: {
      name: handleUndefined(
        capitalizeWords(shippingAddress?.name || party?.name),
        "Client Name"
      ),
      address: handleUndefined(shippingAddressStr, "Address not available"),
      state: handleUndefined(
        shippingAddress?.state
          ? `${capitalizeWords(shippingAddress.state)} (${
              getStateCode(shippingAddress.state) || "-"
            })`
          : party?.state
          ? `${capitalizeWords(party.state)} (${
              getStateCode(party.state) || "-"
            })`
          : "-"
      ),
    },
  };

  const doc =
    pdfDoc ||
    new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const M = 36;
  const availableWidth = pageWidth - M * 2;

  // Draw header on first page
  let headerBottomY = drawStaticHeader(doc, M, invoiceData, logoUrl, pageWidth);
  let blockBottomY = drawCustomerMetaBlock(
    doc,
    M,
    invoiceData,
    party,
    shippingAddress,
    headerBottomY,
    pageWidth
  );
  const REPEATING_HEADER_HEIGHT = blockBottomY;
  let cursorY = blockBottomY;

  // Get column widths based on GST type
  const colWidthsConfig = getColWidths(availableWidth);
  let colWidths, headers, bodyData;

  if (showCGSTSGST) {
    colWidths = colWidthsConfig.withCGSTSGST;
    headers = [
      "Sr.No",
      "Name of Product / Service",
      "HSN/SAC",
      "Rate (Rs.)",
      "Qty",
      "Taxable Value (Rs.)",
      "CGST%",
      "CGST Amount (Rs.)",
      "SGST%",
      "SGST Amount (Rs.)",
      "Total (Rs.)",
    ];
  } else if (showIGST) {
    colWidths = colWidthsConfig.withIGST;
    headers = [
      "Sr.No",
      "Name of Product / Service",
      "HSN/SAC",
      "Rate (Rs.)",
      "Qty",
      "Taxable Value (Rs.)",
      "IGST %",
      "IGST Amount (Rs.)",
      "Total (Rs.)",
    ];
  } else {
    colWidths = colWidthsConfig.withoutGST;
    headers = [
      "Sr.No",
      "Name of Product / Service",
      "HSN/SAC",
      "Rate (Rs.)",
      "Qty",
      "Taxable Value (Rs.)",
      "Total (Rs.)",
    ];
  }

  // Build column styles
  const columnStyles = colWidths.map((width, index) => ({
    cellWidth: width,
    halign: index === 1 ? "left" : "center",
  }));

  // Build body data
  bodyData = lines.map((it, i) => {
    const nameAndDesc = handleUndefined(capitalizeWords(it.name || ""));
    const baseData = [
      i + 1,
      nameAndDesc,
      handleUndefined(it.hsnSac),
      money(it.pricePerUnit),
      it.quantity === "-"
        ? "-"
        : formatQuantity(Number(it.quantity), handleUndefined(it.unit, "pcs")),
      money(it.amount),
    ];

    if (showIGST) {
      return [
        ...baseData,
        `${it.gstPercentage || 0}`,
        money(it.lineTax),
        money(it.lineTotal),
      ];
    } else if (showCGSTSGST) {
      const cgst = (it.lineTax || 0) / 2;
      const sgst = (it.lineTax || 0) / 2;
      return [
        ...baseData,
        `${(it.gstPercentage || 0) / 2}`,
        money(cgst),
        `${(it.gstPercentage || 0) / 2}`,
        money(sgst),
        money(it.lineTotal),
      ];
    } else {
      return [...baseData, money(it.lineTotal)];
    }
  });

  // Add total row to body data
  if (showCGSTSGST) {
    bodyData.push([
      { content: "Total", styles: { fontStyle: "bold" } },
      "",
      "",
      "",
      { content: totalQuantity, styles: { fontStyle: "bold" } },
      { content: totalTaxableAmount, styles: { fontStyle: "bold" } },
      "",
      { content: money(totalCGST), styles: { fontStyle: "bold" } },
      "",
      { content: money(totalSGST), styles: { fontStyle: "bold" } },
      { content: finalTotalAmount, styles: { fontStyle: "bold" } },
    ]);
  } else if (showIGST) {
    bodyData.push([
      { content: "Total", styles: { fontStyle: "bold" } },
      "",
      "",
      "",
      { content: totalQuantity, styles: { fontStyle: "bold" } },
      { content: totalTaxableAmount, styles: { fontStyle: "bold" } },
      "",
      { content: money(totalIGST), styles: { fontStyle: "bold" } },
      { content: finalTotalAmount, styles: { fontStyle: "bold" } },
    ]);
  } else {
    bodyData.push([
      { content: "Total", styles: { fontStyle: "bold" } },
      "",
      "",
      "",
      { content: totalQuantity, styles: { fontStyle: "bold" } },
      { content: totalTaxableAmount, styles: { fontStyle: "bold" } },
      { content: finalTotalAmount, styles: { fontStyle: "bold" } },
    ]);
  }

  // Create main table
  cursorY = createTable(
    doc,
    headers,
    bodyData,
    cursorY,
    columnStyles,
    pageWidth,
    M
  );
  cursorY += 20;

  // Space management helper
  const ensureSpace = (needed) => {
    const bottomSafe = pageHeight - M;
    if (cursorY + needed > bottomSafe) {
      doc.addPage();
      const newHeaderBottomY = drawStaticHeader(
        doc,
        M,
        invoiceData,
        logoUrl,
        pageWidth
      );
      drawCustomerMetaBlock(
        doc,
        M,
        invoiceData,
        party,
        shippingAddress,
        newHeaderBottomY,
        pageWidth
      );
      return REPEATING_HEADER_HEIGHT;
    }
    return cursorY;
  };

  // Totals Summary Block
  const totalsW = 200;
  const totalsX = pageWidth - M - totalsW;

  if (cursorY + 160 > pageHeight - M) {
    cursorY = ensureSpace(160);
  }

  const totalsY = cursorY + 10;
  let currentTotalsY = totalsY;

  const putTotalLine = (label, val, y, bold = false) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8)
      .text(label, totalsX + 12, y)
      .text(val, totalsX + totalsW - 12, y, { align: "right" });
  };

  // Taxable Amount
  doc
    .rect(totalsX, currentTotalsY, totalsW, 18)
    .fillColor("white")
    .fill()
    .strokeColor(`rgb(${BORDER.join(",")})`)
    .stroke();

  putTotalLine(
    "Taxable Amount",
    `Rs.${formatCurrency(subtotal)}`,
    currentTotalsY + 12
  );
  currentTotalsY += 18;

  // GST breakdown
  if (isGSTApplicable) {
    if (showIGST) {
      doc.rect(totalsX, currentTotalsY, totalsW, 18).fill().stroke();

      putTotalLine(
        "IGST",
        `Rs.${formatCurrency(totalIGST)}`,
        currentTotalsY + 12
      );
      currentTotalsY += 18;
    } else if (showCGSTSGST) {
      doc.rect(totalsX, currentTotalsY, totalsW, 18).fill().stroke();

      putTotalLine(
        "CGST",
        `Rs.${formatCurrency(totalCGST)}`,
        currentTotalsY + 12
      );
      currentTotalsY += 18;

      doc.rect(totalsX, currentTotalsY, totalsW, 18).fill().stroke();

      putTotalLine(
        "SGST",
        `Rs.${formatCurrency(totalSGST)}`,
        currentTotalsY + 12
      );
      currentTotalsY += 18;
    }
  }

  // Final Total
  doc.rect(totalsX, currentTotalsY, totalsW, 20).fill().stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("black")
    .text("Total", totalsX + 12, currentTotalsY + 14)
    .text(
      `Rs.${formatCurrency(invoiceTotal)}`,
      totalsX + totalsW - 12,
      currentTotalsY + 14,
      { align: "right" }
    );

  currentTotalsY += 20;

  // Total Items / Qty
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Total Items / Qty : ${totalItems} / ${
        totalQuantity % 1 === 0
          ? totalQuantity.toFixed(0)
          : totalQuantity.toFixed(2)
      }`,
      M,
      cursorY + 16
    );

  // Amount in Words
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Total amount (in words):", M, currentTotalsY + 13);

  doc
    .font("Helvetica")
    .fontSize(8)
    .text(` ${numberToWords(invoiceTotal)}`, M + 106, currentTotalsY + 13, {
      width: 420,
    });

  cursorY = currentTotalsY + 25;

  doc
    .moveTo(M, cursorY)
    .lineTo(pageWidth - M, cursorY)
    .strokeColor(`rgb(0, 110, 200)`)
    .lineWidth(1)
    .stroke();

  cursorY += 15;

  // Bank Details & Signature Block
  const bankBlockH = 90;
  const requiredFooterSpace = bankBlockH + 10;
  cursorY = ensureSpace(requiredFooterSpace);
  const blockY = cursorY + 10;

  // Dynamic Bank Details
  const dynamicBankDetails = (() => {
    if (!bank || typeof bank !== "object") {
      return {
        name: "Bank Details Not Available",
        branch: "-",
        accNumber: "-",
        ifsc: "-",
        upiId: "-",
        upiName: "-",
        upiMobile: "-",
        qrCode: null,
      };
    }

    const bankObj = bank;
    const hasBankDetails =
      bankObj.bankName ||
      bankObj.branchName ||
      bankObj.branchAddress ||
      bankObj.accountNumber ||
      bankObj.accountNo ||
      bankObj.ifscCode ||
      bankObj.upiDetails?.upiId ||
      bankObj.upiDetails?.upiName ||
      bankObj.upiDetails?.upiMobile ||
      bankObj.upiId;

    if (!hasBankDetails) {
      return {
        name: "Bank Details Not Available",
        branch: "-",
        accNumber: "-",
        ifsc: "-",
        upiId: "-",
        upiName: "-",
        upiMobile: "-",
        qrCode: bankObj.qrCode || null,
      };
    }

    const accountNumber =
      bankObj.accountNo ||
      bankObj.accountNumber ||
      bankObj.account_number ||
      "-";

    const upiId =
      bankObj.upiDetails?.upiId || bankObj.upiId || bankObj.upi_id || "-";

    const upiName = bankObj.upiDetails?.upiName || "-";
    const upiMobile = bankObj.upiDetails?.upiMobile || "-";

    return {
      name: handleUndefined(capitalizeWords(bankObj.bankName)),
      branch: handleUndefined(
        capitalizeWords(bankObj.branchName || bankObj.branchAddress)
      ),
      accNumber: handleUndefined(String(accountNumber)),
      ifsc: handleUndefined(capitalizeWords(bankObj.ifscCode)),
      upiId: handleUndefined(String(upiId)),
      upiName: handleUndefined(capitalizeWords(upiName)),
      upiMobile: handleUndefined(String(upiMobile)),
      qrCode: bankObj.qrCode || null,
    };
  })();

  const areBankDetailsAvailable =
    dynamicBankDetails.name !== "Bank Details Not Available";

  // Bank Details
  let bankY = blockY;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("black")
    .text("Bank Details:", M, bankY - 6);
  bankY += 12;

  let bankDetailY = bankY;
  const bankX = M;
  doc.fontSize(8);

  const putBankDetail = (label, val, y) => {
    if (val === "-") return y;

    doc.font("Helvetica-Bold").text(label, bankX, y);
    doc.font("Helvetica").text(val, bankX + 65, y);

    return y + 12;
  };

  if (areBankDetailsAvailable && !shouldHideBankDetails) {
    bankDetailY = putBankDetail(
      "Bank Name:",
      dynamicBankDetails.name,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "Branch:",
      dynamicBankDetails.branch,
      bankDetailY
    );
    bankDetailY = putBankDetail("IFSC:", dynamicBankDetails.ifsc, bankDetailY);
    bankDetailY = putBankDetail(
      "Acc. Number:",
      dynamicBankDetails.accNumber,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI ID:",
      dynamicBankDetails.upiId,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI Name:",
      dynamicBankDetails.upiName,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI Mobile:",
      dynamicBankDetails.upiMobile,
      bankDetailY
    );
  } else if (!shouldHideBankDetails) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(`rgb(${DARK.join(",")})`)
      .text("No bank details available", bankX, bankDetailY);
    bankDetailY += 40;
  }

  // QR Code
  const qrSize = 80;
  const centerX = pageWidth / 2;

  if (dynamicBankDetails.qrCode && !shouldHideBankDetails) {
    const qrX = centerX - qrSize / 3;
    const qrY = blockY + 4;

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("black")
      .text("QR Code", centerX - doc.widthOfString("QR Code") / 2, qrY - 8);

    try {
      const qrCodePath = getAssetPath(dynamicBankDetails.qrCode);
      if (qrCodePath) {
        doc.image(qrCodePath, qrX, qrY, { width: qrSize, height: qrSize - 12 });
      } else {
        throw new Error("QR code path not found");
      }
    } catch (error) {
      console.log("QR code not found");
      doc
        .rect(qrX, qrY, qrSize, qrSize)
        .fillColor("#f0f0f0")
        .fill()
        .strokeColor(`rgb(${BORDER.join(",")})`)
        .stroke();
    }
  }

  // Signature Block
  const sigX = pageWidth - M - 150;
  doc.font("Helvetica").fontSize(10).fillColor("black");

  const companyNameForSign = `For ${capitalizeWords(invoiceData.company.name)}`;
  const companyNameLines =
    doc.heightOfString(companyNameForSign, { width: 120 }) > 8
      ? doc.splitTextToSize(companyNameForSign, 120)
      : [companyNameForSign];

  let currentBlockY = blockY;
  companyNameLines.forEach((line) => {
    doc.text(line, sigX + 30, currentBlockY);
    currentBlockY += 8;
  });

  const sigHeight = 50;
  const sigWidth = 120;
  doc
    .rect(sigX + 30, currentBlockY, sigWidth, sigHeight)
    .strokeColor(`rgb(${BORDER.join(",")})`)
    .lineWidth(0.1)
    .stroke();

  cursorY = Math.max(bankY + qrSize, currentBlockY + sigHeight);

  // Terms and Conditions
  const termsHeightEstimate = 100;
  const TERMS_COL_WIDTH = 520;
  cursorY = ensureSpace(termsHeightEstimate);

  const LINE_Y_POSITION = cursorY + 20;
  doc
    .moveTo(M, LINE_Y_POSITION)
    .lineTo(M + 3 + TERMS_COL_WIDTH, LINE_Y_POSITION)
    .strokeColor(`rgb(0, 110, 200)`)
    .lineWidth(1)
    .stroke();

  let termsY = cursorY + 40;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(`rgb(${DARK.join(",")})`);

  if (transaction.notes) {
    termsY = renderSimpleHtml(
      doc,
      transaction.notes,
      M,
      termsY,
      TERMS_COL_WIDTH,
      10
    );
  }

  // Add page numbers
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(`rgb(${DARK.join(",")})`)
      .text(
        `Page ${i + 1} of ${totalPages}`,
        pageWidth - M + 7,
        pageHeight - 15,
        {
          align: "right",
        }
      );
  }

  return doc;
};

module.exports = { generateTemplate19 };
