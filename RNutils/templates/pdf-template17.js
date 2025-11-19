// backend/templates/template17.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// --- Constants ---
const PRIMARY_BLUE = [0, 110, 200];
const DARK = [45, 55, 72];
const BORDER = [0, 110, 200];

// --- Page Dimensions ---
const PAGE_WIDTH = 650;
const PAGE_HEIGHT = 800;
const MARGIN = 36;
const COL_W = (PAGE_WIDTH - MARGIN * 2) / 2;

// --- Frame & Margin Constants ---
const TITLE_Y = 30;
const FRAME_TOP_Y = 35;
const BOTTOM_OFFSET = 20;

// Utility functions
const {
  getBillingAddress,
  getShippingAddress,
  getUnifiedLines,
  prepareTemplate8Data,
  invNo,
  numberToWords,
  getStateCode,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");

// Simple HTML to text converter for backend
const htmlToText = (html) => {
  if (!html) return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n\s*\n/g, "\n")
    .trim();
};

// Helper function to safely return value or "-"
const checkValue = (value) => {
  if (value === undefined || value === null) return "-";
  const val = String(value);
  if (
    val === "N/A" ||
    val === "null" ||
    val === "undefined" ||
    val === "" ||
    val.toLowerCase().includes("not available")
  ) {
    return "-";
  }
  return val;
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

// Border drawing function
const drawBorderFrame = (doc) => {
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(1);

  // Left border
  doc
    .moveTo(MARGIN - 8, FRAME_TOP_Y)
    .lineTo(MARGIN - 8, PAGE_HEIGHT - BOTTOM_OFFSET)
    .stroke();

  // Right border
  doc
    .moveTo(PAGE_WIDTH - MARGIN + 8, FRAME_TOP_Y)
    .lineTo(PAGE_WIDTH - MARGIN + 8, PAGE_HEIGHT - BOTTOM_OFFSET)
    .stroke();

  // Top border
  doc
    .moveTo(MARGIN - 8, FRAME_TOP_Y)
    .lineTo(PAGE_WIDTH - MARGIN + 8, FRAME_TOP_Y)
    .stroke();

  // Bottom border
  doc
    .moveTo(MARGIN - 8, PAGE_HEIGHT - BOTTOM_OFFSET)
    .lineTo(PAGE_WIDTH - MARGIN + 8, PAGE_HEIGHT - BOTTOM_OFFSET)
    .stroke();

  doc.restore();
};

// Helper function to draw table
const drawTable = (doc, x, y, headers, rows, columnWidths, options = {}) => {
  const {
    headerBackground = [200, 225, 255],
    borderColor = BORDER,
    textColor = DARK,
    fontSize = 8,
    padding = 3,
  } = options;

  let currentY = y;
  const rowHeight = 15;

  // Draw headers
  doc.save();
  doc
    .rect(
      x,
      currentY,
      columnWidths.reduce((a, b) => a + b, 0),
      rowHeight
    )
    .fill(headerBackground);

  doc.fillColor(textColor);
  doc.fontSize(fontSize);
  doc.font("Helvetica-Bold");

  let currentX = x;
  headers.forEach((header, index) => {
    doc.text(header, currentX + padding, currentY + padding, {
      width: columnWidths[index] - padding * 2,
      align: "center",
    });
    currentX += columnWidths[index];
  });

  currentY += rowHeight;
  doc.restore();

  // Draw rows
  doc.save();
  doc.fontSize(fontSize);
  doc.font("Helvetica");
  doc.strokeColor(...borderColor);
  doc.lineWidth(0.1);

  rows.forEach((row, rowIndex) => {
    const isLastRow = rowIndex === rows.length - 1;
    if (isLastRow) {
      doc.font("Helvetica-Bold");
    }

    let currentX = x;
    let maxCellHeight = rowHeight;

    // Calculate max height for this row
    row.forEach((cell, colIndex) => {
      const cellHeight =
        doc.heightOfString(cell, {
          width: columnWidths[colIndex] - padding * 2,
        }) +
        padding * 2;
      maxCellHeight = Math.max(maxCellHeight, cellHeight);
    });

    // Draw cell borders and content
    row.forEach((cell, colIndex) => {
      // Cell border
      doc
        .rect(currentX, currentY, columnWidths[colIndex], maxCellHeight)
        .stroke();

      // Cell content
      doc.text(cell, currentX + padding, currentY + padding, {
        width: columnWidths[colIndex] - padding * 2,
        align: "center",
      });

      currentX += columnWidths[colIndex];
    });

    currentY += maxCellHeight;
  });

  doc.restore();
  return currentY;
};

// Buyer/Consignee block drawing function
const drawBuyerConsigneeBlock = (doc, invoiceData, startY) => {
  let cursorY = startY;

  // Draw top border
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(MARGIN - 8, cursorY)
    .lineTo(PAGE_WIDTH - MARGIN + 8, cursorY)
    .stroke();
  doc.restore();

  // Headers
  doc.save();
  doc.fontSize(9);
  doc.font("Helvetica-Bold");
  doc.fillColor(...DARK);
  doc.text("Details of Buyer | Billed to:", MARGIN + 5, cursorY + 9.3);
  doc.text(
    "Details of Consignee | Shipped to:",
    MARGIN + COL_W + 10,
    cursorY + 9.3
  );
  cursorY += 15;
  doc.restore();

  // Draw horizontal line after headers
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(MARGIN - 8, cursorY)
    .lineTo(PAGE_WIDTH - MARGIN + 8, cursorY)
    .stroke();
  doc.restore();

  const contentStartY = cursorY + 12;

  // ========== LEFT COLUMN: BUYER DETAILS ==========
  let leftY = contentStartY;

  doc.save();
  doc.fontSize(9);
  doc.font("Helvetica-Bold");
  doc.fillColor(0, 0, 0);
  doc.text(capitalizeWords(invoiceData.invoiceTo.name), MARGIN + 5, leftY);
  leftY += 12;
  doc.restore();

  // Billing Address
  doc.save();
  doc.font("Helvetica");
  let billAddressToDisplay = capitalizeWords(
    invoiceData.invoiceTo.billingAddress
  );
  if (
    !billAddressToDisplay ||
    billAddressToDisplay.trim() === "" ||
    billAddressToDisplay.toLowerCase().includes("address missing") ||
    billAddressToDisplay.toLowerCase().includes("n/a")
  ) {
    billAddressToDisplay = "-";
  }

  const billAddressHeight = doc.heightOfString(billAddressToDisplay, {
    width: COL_W - 10,
  });
  doc.text(billAddressToDisplay, MARGIN + 5, leftY + 2, {
    width: COL_W - 10,
  });
  leftY += billAddressHeight + 4;
  doc.restore();

  // GSTIN
  doc.save();
  const gstinLabel = `GSTIN: `;
  doc.font("Helvetica-Bold");
  doc.text(gstinLabel, MARGIN + 5, leftY);
  const gstinLabelWidth = doc.widthOfString(gstinLabel);
  doc.font("Helvetica");
  doc.text(
    `${invoiceData.party?.gstin || "-"}`,
    MARGIN + 5 + gstinLabelWidth,
    leftY
  );
  leftY += 12;
  doc.restore();

  // PAN
  doc.save();
  const panLabel = `PAN: `;
  doc.font("Helvetica-Bold");
  doc.text(panLabel, MARGIN + 5, leftY);
  const panLabelWidth = doc.widthOfString(panLabel);
  doc.font("Helvetica");
  doc.text(
    `${checkValue(invoiceData.invoiceTo.pan)}`,
    MARGIN + 5 + panLabelWidth,
    leftY
  );
  leftY += 12;
  doc.restore();

  // Phone
  doc.save();
  const phoneLabel = `Phone: `;
  doc.font("Helvetica-Bold");
  doc.text(phoneLabel, MARGIN + 5, leftY);
  const phoneLabelWidth = doc.widthOfString(phoneLabel);
  doc.font("Helvetica");
  doc.text(
    `${checkValue(invoiceData.invoiceTo.phone)}`,
    MARGIN + 5 + phoneLabelWidth,
    leftY
  );
  leftY += 12;
  doc.restore();

  // Place of Supply
  doc.save();
  const posLabel = `Place of Supply: `;
  doc.font("Helvetica-Bold");
  doc.text(posLabel, MARGIN + 5, leftY);
  const posLabelWidth = doc.widthOfString(posLabel);
  doc.font("Helvetica");

  const placeOfSupply = invoiceData.shippingAddress?.state
    ? `${invoiceData.shippingAddress.state} (${
        getStateCode(invoiceData.shippingAddress.state) || "-"
      })`
    : invoiceData.party?.state
    ? `${invoiceData.party.state} (${
        getStateCode(invoiceData.party.state) || "-"
      })`
    : "-";

  doc.text(`${placeOfSupply}`, MARGIN + 5 + posLabelWidth, leftY);
  doc.restore();

  // ========== RIGHT COLUMN: CONSIGNEE DETAILS ==========
  let rightY = contentStartY;

  doc.save();
  doc.fontSize(9);
  doc.font("Helvetica-Bold");
  doc.fillColor(0, 0, 0);
  doc.text(
    capitalizeWords(invoiceData.shippingAddress.name),
    MARGIN + 5 + COL_W + 5,
    rightY
  );
  rightY += 12;
  doc.restore();

  // Shipping Address
  doc.save();
  doc.font("Helvetica");
  let shipAddressToDisplay = capitalizeWords(
    invoiceData.shippingAddress.address
  );
  if (
    shipAddressToDisplay.toLowerCase().includes("address missing") ||
    shipAddressToDisplay.toLowerCase().includes("n/a")
  ) {
    shipAddressToDisplay = "-";
  }

  const shipAddressHeight = doc.heightOfString(shipAddressToDisplay, {
    width: COL_W - 10,
  });
  doc.text(shipAddressToDisplay, MARGIN + 5 + COL_W + 5, rightY, {
    width: COL_W - 10,
  });
  rightY += shipAddressHeight;
  doc.restore();

  // Country
  doc.save();
  doc.font("Helvetica-Bold");
  doc.text(`Country:`, MARGIN + 5 + COL_W + 5, rightY + 3);
  doc.font("Helvetica");
  doc.text(
    ` india`,
    MARGIN + 5 + COL_W + 5 + doc.widthOfString("Country: "),
    rightY + 2
  );
  rightY += 13;
  doc.restore();

  // Phone
  doc.save();
  const consigneePhone =
    checkValue(invoiceData.shippingAddress.contactNumber) !== "-"
      ? checkValue(invoiceData.shippingAddress.contactNumber)
      : checkValue(invoiceData.invoiceTo.phone);

  doc.font("Helvetica-Bold");
  doc.text(`Phone:`, MARGIN + 5 + COL_W + 5, rightY + 2);
  doc.font("Helvetica");
  doc.text(
    `${consigneePhone}`,
    MARGIN + 5 + COL_W + 5 + doc.widthOfString("Phone: "),
    rightY + 2
  );
  rightY += 13;
  doc.restore();

  // GSTIN
  doc.save();
  doc.font("Helvetica-Bold");
  doc.text(`GSTIN:`, MARGIN + 5 + COL_W + 5, rightY + 2);
  doc.font("Helvetica");
  doc.text(
    `${invoiceData.Party?.gstin || "-"}`,
    MARGIN + 5 + COL_W + 5 + doc.widthOfString("GSTIN: "),
    rightY + 2
  );
  rightY += 13;
  doc.restore();

  // State
  doc.save();
  doc.font("Helvetica-Bold");
  doc.text(`State:`, MARGIN + 5 + COL_W + 5, rightY + 2);
  doc.font("Helvetica");
  doc.text(
    invoiceData.shippingAddress?.state
      ? `${invoiceData.shippingAddress.state} (${
          getStateCode(invoiceData.shippingAddress.state) || "-"
        })`
      : invoiceData.party?.state
      ? `${invoiceData.party.state} (${
          getStateCode(invoiceData.party.state) || "-"
        })`
      : "-",
    MARGIN + 5 + COL_W + 5 + doc.widthOfString("State: "),
    rightY + 2
  );
  rightY += 10;
  doc.restore();

  // ========== CALCULATE DYNAMIC BLOCK HEIGHT ==========
  const maxContentHeight = Math.max(leftY, rightY) - contentStartY;
  const blockHeight = maxContentHeight + 20;

  // Draw vertical line
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(MARGIN + COL_W, cursorY)
    .lineTo(MARGIN + COL_W, cursorY + blockHeight)
    .stroke();
  doc.restore();

  cursorY = cursorY + blockHeight;

  // Draw bottom border
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(MARGIN - 8, cursorY)
    .lineTo(PAGE_WIDTH - MARGIN + 8, cursorY)
    .stroke();
  doc.restore();

  cursorY += 5;
  return cursorY;
};

// Company/Metadata block drawing function
const drawHeaderContent = (
  doc,
  invoiceData,
  fmtDate,
  transaction,
  isGSTApplicable,
  logoUrl
) => {
  doc.save();
  doc.fontSize(18);
  doc.font("Helvetica-Bold");
  doc.fillColor(...PRIMARY_BLUE);
  doc.text(
    transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE",
    MARGIN + 240,
    TITLE_Y
  );
  doc.restore();

  if (logoUrl) {
    try {
      doc.image(logoUrl, MARGIN, FRAME_TOP_Y - 4 + 20, {
        width: 70,
        height: 70,
      });
    } catch (e) {
      console.log("Logo not found:", e.message);
    }
  }

  let companyX = logoUrl ? MARGIN + 80 : MARGIN + 5;
  let companyY = FRAME_TOP_Y + 25;

  doc.save();
  doc.fontSize(14);
  doc.font("Helvetica-Bold");
  doc.fillColor(0, 0, 0);

  const companyNameLines = doc.splitTextToSize(
    capitalizeWords(invoiceData.company.name.toUpperCase()),
    180
  );

  companyNameLines.forEach((line) => {
    doc.text(line, companyX, companyY);
    companyY += 15;
  });

  doc.fontSize(9);
  doc.font("Helvetica");

  if (checkValue(invoiceData.company.lAddress) !== "-") {
    doc.text(
      ` ${checkValue(capitalizeWords(invoiceData.company.lAddress))}`,
      companyX - 2,
      companyY
    );
    companyY += 13;
  }

  if (checkValue(invoiceData.company.state) !== "-") {
    doc.text(
      ` ${checkValue(capitalizeWords(invoiceData.company?.state))}`,
      companyX - 2,
      companyY
    );
    companyY += 13;
  }

  const companyGstinDisplay = checkValue(invoiceData.company.gstin);
  if (companyGstinDisplay !== "-") {
    doc.text(`GSTIN: ${companyGstinDisplay}`, companyX, companyY);
    companyY += 13;
  }

  const companyPhoneDisplay = checkValue(invoiceData.company.phone);
  if (companyPhoneDisplay !== "-") {
    doc.text(`Phone: ${companyPhoneDisplay}`, companyX, companyY);
    companyY += 13;
  }
  doc.restore();

  let metaY = FRAME_TOP_Y + 10;
  const metaData = [
    {
      labelLeft: "Invoice No.",
      valueLeft: checkValue(invoiceData.invoiceNumber),
      labelRight: "Invoice Date",
      valueRight: checkValue(fmtDate(new Date())),
    },
    {
      labelLeft: "P.O. No.",
      valueLeft: checkValue(invoiceData.poNumber),
      labelRight: "P.O. Date",
      valueRight: checkValue(invoiceData.poDate),
    },
    {
      labelLeft: "Due Date",
      valueLeft: checkValue(fmtDate(new Date())),
      labelRight: "E-Way No.",
      valueRight: checkValue(invoiceData.eWayNo),
    },
  ];

  doc.save();
  doc.fontSize(9);
  doc.font("Helvetica");

  const metaX = MARGIN + COL_W + 20;
  const blockWidth = PAGE_WIDTH - MARGIN - metaX;
  const boxH = 30;
  const columnWidth = blockWidth / 2;
  const valueOffset = 12;

  // Draw vertical lines
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(metaX, metaY - 3)
    .lineTo(metaX, metaY + metaData.length * boxH - 3)
    .stroke();
  doc
    .moveTo(metaX + columnWidth, metaY - 3)
    .lineTo(metaX + columnWidth, metaY + metaData.length * boxH - 3)
    .stroke();
  doc
    .moveTo(PAGE_WIDTH - MARGIN, metaY - 3)
    .lineTo(PAGE_WIDTH - MARGIN, metaY + metaData.length * boxH - 3)
    .stroke();

  for (let i = 0; i < metaData.length; i++) {
    const data = metaData[i];
    const verticalPadding = 8;
    const yPosLabel = metaY + verticalPadding;
    const yPosValue = metaY + verticalPadding + valueOffset;

    // Top horizontal line for each row
    doc
      .moveTo(metaX, metaY - 3)
      .lineTo(PAGE_WIDTH - MARGIN, metaY - 3)
      .stroke();

    // Left side - Label
    doc.font("Helvetica");
    doc.fillColor(...DARK);
    doc.text(data.labelLeft, metaX + 5, yPosLabel);

    // Left side - Value
    doc.font("Helvetica-Bold");
    doc.fillColor(...PRIMARY_BLUE);
    doc.text(data.valueLeft, metaX + 5, yPosValue);

    // Right side - Label
    doc.font("Helvetica");
    doc.fillColor(...DARK);
    doc.text(data.labelRight, metaX + columnWidth + 5, yPosLabel);

    // Right side - Value
    doc.font("Helvetica-Bold");
    doc.fillColor(...PRIMARY_BLUE);
    doc.text(data.valueRight, metaX + columnWidth + 5, yPosValue);

    metaY += boxH;
  }

  // Bottom horizontal line
  doc
    .moveTo(metaX, metaY - 3)
    .lineTo(PAGE_WIDTH - MARGIN, metaY - 3)
    .stroke();
  doc.restore();

  return Math.max(companyY + 10, metaY + 10);
};

// Simple HTML notes renderer for PDFKit
const renderHtmlNotesForPDFKit = (doc, htmlNotes, startX, startY, maxWidth) => {
  if (!htmlNotes) return startY;

  const plainText = htmlToText(htmlNotes);
  if (!plainText.trim()) return startY;

  doc.save();
  doc.font("Helvetica-Bold");
  doc.fontSize(9);
  doc.text("Terms & Conditions:", startX, startY);

  startY += 8;

  doc.font("Helvetica");
  doc.fontSize(8);

  const lines = doc.splitTextToSize(plainText, maxWidth);
  doc.text(lines, startX, startY);

  const textHeight = lines.length * 9;
  doc.restore();

  return startY + textHeight + 5;
};

// Main PDF generation function
const generateTemplate17 = async (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // Helper function for bank details
  const handleUndefined = (value, fallback = "-") => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "string" && value.trim() === "") return fallback;
    if (value === "N/A") return fallback;
    return value.toString();
  };

  // Dynamic bank details
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

  // Helper functions
  const _getGSTIN = (x) =>
    x?.gstin ??
    x?.gstIn ??
    x?.gstNumber ??
    x?.gst_no ??
    x?.gst ??
    x?.gstinNumber ??
    x?.tax?.gstin ??
    null;

  const money = (n) =>
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (d) =>
    d
      ? new Intl.DateTimeFormat("en-GB").format(new Date(d)).replace(/\//g, "-")
      : "-";

  // Prepare data
  const {
    totalTaxable,
    totalAmount,
    itemsWithGST,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    isInterstate,
    showIGST,
    showCGSTSGST,
    showNoTax,
    totalQty,
    totalItems,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  // Use getAssetPath for logo
  const logoUrl = getAssetPath(company?.logo);

  const lines = (itemsWithGST || []).map((it) => ({
    name: capitalizeWords(it.name),
    description: it.description || "",
    quantity: it.itemType === "service" ? "-" : it.quantity || 0,
    pricePerUnit: it.pricePerUnit || 0,
    amount: it.taxableValue || 0,
    gstPercentage: it.gstRate || 0,
    lineTax: (it.cgst || 0) + (it.sgst || 0) + (it.igst || 0),
    lineTotal: it.total || 0,
    hsnSac: it.code || "N/A",
    unit: it.unit || "PCS",
    itemType: it.itemType,
  }));

  const subtotal = totalTaxable;
  const tax = totalCGST + totalSGST + totalIGST;
  const invoiceTotal = totalAmount;
  const gstEnabled = isGSTApplicable;
  const totalQuantity = totalQty;

  const totalTaxableAmount = money(subtotal);
  const finalTotalAmount = money(invoiceTotal);
  const shippingAddressSource = shippingAddress;
  const billingAddress = capitalizeWords(getBillingAddress(party));
  const rawShippingAddressStr = getShippingAddress(
    shippingAddressSource,
    billingAddress
  );
  let shippingAddressStr = capitalizeWords(rawShippingAddressStr);
  if (
    shippingAddressStr.toLowerCase().includes("address missing") ||
    shippingAddressStr === "-"
  ) {
    shippingAddressStr = "-";
  }
  const companyGSTIN = _getGSTIN(company);
  const partyGSTIN = _getGSTIN(party);

  const invoiceData = {
    invoiceNumber: checkValue(invNo(transaction)),
    date: checkValue(fmtDate(transaction.date) || fmtDate(new Date())),
    poNumber: checkValue(transaction.poNumber),
    poDate: checkValue(fmtDate(transaction.poDate)),
    eWayNo: checkValue(transaction.eWayBillNo),
    placeOfSupply: checkValue(
      party?.stateCode
        ? `${capitalizeWords(party?.state)} (${party?.stateCode})`
        : party?.state || "N/A"
    ),
    company: {
      name: capitalizeWords(company?.businessName || "Your Company Name"),
      lAddress: checkValue(company?.address),
      address: checkValue(company?.addressState || "Company Address Missing"),
      gstin: checkValue(companyGSTIN),
      pan: checkValue(company?.panNumber),
      state: checkValue(company?.addressState),
      phone: checkValue(
        company?.mobileNumber
          ? formatPhoneNumber(company.mobileNumber)
          : company?.Telephone
          ? formatPhoneNumber(company.Telephone)
          : "-"
      ),
      email: checkValue(company?.email || company?.emailId),
    },
    invoiceTo: {
      name: capitalizeWords(party?.name || "Client Name"),
      billingAddress: billingAddress,
      gstin: checkValue(partyGSTIN),
      pan: checkValue(party?.panNumber),
      state: checkValue(party?.state),
      email: checkValue(party?.email),
      phone: checkValue(
        party?.contactNumber ? formatPhoneNumber(party.contactNumber) : "-"
      ),
    },
    shippingAddress: {
      name: capitalizeWords(
        shippingAddress?.name || party?.name || "Client Name"
      ),
      address: shippingAddressStr,
      state: checkValue(shippingAddress?.state || party?.state),
      contactNumber: checkValue(shippingAddress?.contactNumber),
    },
    party: party,
    Party: party,
  };

  const doc =
    pdfDoc ||
    new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: 0,
    });

  // Set default font
  doc.font("Helvetica");

  // Draw border frame
  drawBorderFrame(doc);

  // Draw header content
  const headerBottomY = drawHeaderContent(
    doc,
    invoiceData,
    fmtDate,
    transaction,
    isGSTApplicable,
    logoUrl
  );

  // Draw buyer/consignee block
  let cursorY = drawBuyerConsigneeBlock(doc, invoiceData, headerBottomY);

  // Prepare table data
  const removeGstColumns = !gstEnabled;
  const totalWidth = PAGE_WIDTH - MARGIN * 2;
  const fixedWidthsWithGST = 380;
  const itemColWidthWithGST = totalWidth - fixedWidthsWithGST;
  const removedGstWidth = 2;
  const fixedWidthsNoGST = fixedWidthsWithGST - removedGstWidth;
  const itemColWidthNoGST = totalWidth - fixedWidthsNoGST;
  const currentItemColWidth = removeGstColumns
    ? itemColWidthNoGST
    : itemColWidthWithGST;
  const gstGroupHeader = showIGST ? "IGST" : showCGSTSGST ? "CGST/SGST" : "GST";

  // Prepare table body
  const tableBody = [];
  lines.forEach((it, i) => {
    const src = (itemsWithGST || [])[i] || {};
    const hsnSacDisplay = checkValue(it.hsnSac);
    const description = it.description
      ? it.description.split("\n").join(" / ")
      : "";
    const itemText = `${it.name || ""}\n${description}`;

    if (showCGSTSGST) {
      const cgstPct = (src.gstRate || 0) / 2;
      const sgstPct = (src.gstRate || 0) / 2;
      tableBody.push([
        String(i + 1),
        itemText,
        hsnSacDisplay,
        it.quantity === "-" ? "-" : String(Number(it.quantity)),
        it.itemType === "service" ? "-" : it.unit || "PCS",
        money(it.pricePerUnit),
        money(it.amount),
        `${cgstPct}`,
        money(src.cgst || 0),
        `${sgstPct}`,
        money(src.sgst || 0),
        money(it.lineTotal),
      ]);
    } else if (removeGstColumns) {
      tableBody.push([
        String(i + 1),
        itemText,
        hsnSacDisplay,
        it.quantity === "-" ? "-" : String(Number(it.quantity)),
        it.unit || "PCS",
        money(it.pricePerUnit),
        money(it.amount),
        money(it.lineTotal),
      ]);
    } else {
      const percent = showIGST ? src.gstRate || 0 : it.gstPercentage || 0;
      const amount = showIGST ? src.igst || 0 : it.lineTax || 0;
      tableBody.push([
        String(i + 1),
        itemText,
        hsnSacDisplay,
        it.quantity === "-" ? "-" : String(Number(it.quantity)),
        it.unit || "PCS",
        money(it.pricePerUnit),
        money(it.amount),
        `${Number(percent)}`,
        money(amount),
        money(it.lineTotal),
      ]);
    }
  });

  // Add total row
  if (showCGSTSGST) {
    tableBody.push([
      "Total",
      "",
      "",
      totalQuantity,
      "",
      "",
      totalTaxableAmount,
      "",
      money(totalCGST),
      "",
      money(totalSGST),
      finalTotalAmount,
    ]);
  } else if (removeGstColumns) {
    tableBody.push([
      "Total",
      "",
      "",
      totalQuantity,
      "",
      "",
      totalTaxableAmount,
      finalTotalAmount,
    ]);
  } else {
    const totalTaxAmount = showIGST
      ? money(totalIGST)
      : money(totalCGST + totalSGST);
    tableBody.push([
      "Total",
      "",
      "",
      totalQuantity,
      "",
      "",
      totalTaxableAmount,
      "",
      totalTaxAmount,
      finalTotalAmount,
    ]);
  }

  // Define table headers and column widths
  let headers, columnWidths;

  if (showCGSTSGST) {
    headers = [
      "Sr.No.",
      "Name of Product / Service",
      "HSN/SAC",
      "Qty",
      "Unit",
      "Rate (Rs.)",
      "Taxable Value (Rs.)",
      "CGST %",
      "CGST Amount",
      "SGST %",
      "SGST Amount",
      "Total (Rs.)",
    ];
    columnWidths = [
      35,
      currentItemColWidth - 61,
      45,
      32,
      35,
      48,
      60,
      18,
      55,
      18,
      55,
      56,
    ];
  } else if (removeGstColumns) {
    headers = [
      "Sr.No.",
      "Name of Product / Service",
      "HSN/SAC",
      "Qty",
      "Unit",
      "Rate (Rs.)",
      "Taxable Value (Rs.)",
      "Total (Rs.)",
    ];
    columnWidths = [
      30,
      currentItemColWidth + removedGstWidth,
      60,
      57,
      50,
      55,
      66,
      73,
    ];
  } else {
    headers = [
      "Sr.No.",
      "Name of Product / Service",
      "HSN/SAC",
      "Qty",
      "Unit",
      "Rate (Rs.)",
      "Taxable Value (Rs.)",
      `${gstGroupHeader} %`,
      `${gstGroupHeader} Amount`,
      "Total (Rs.)",
    ];
    columnWidths = [
      30,
      currentItemColWidth - 30,
      50,
      35,
      38,
      50,
      65,
      25,
      65,
      68,
    ];
  }

  // Draw main items table
  cursorY = drawTable(
    doc,
    MARGIN - 8,
    cursorY,
    headers,
    tableBody,
    columnWidths,
    {
      headerBackground: [200, 225, 255],
      borderColor: BORDER,
      textColor: DARK,
      fontSize: 8,
      padding: 3,
    }
  );

  cursorY += 10;

  // Tax summary section
  const groupedByHSN = {};
  (itemsWithGST || []).forEach((it) => {
    const key = checkValue(it.code);
    if (!groupedByHSN[key]) {
      groupedByHSN[key] = {
        hsn: key,
        taxable: 0,
        cgstPct: 0,
        cgstAmt: 0,
        sgstPct: 0,
        sgstAmt: 0,
        igstPct: 0,
        igstAmt: 0,
        total: 0,
      };
    }
    groupedByHSN[key].taxable += it.taxableValue || 0;
    groupedByHSN[key].cgstPct = showCGSTSGST ? (it.gstRate || 0) / 2 : 0;
    groupedByHSN[key].sgstPct = showCGSTSGST ? (it.gstRate || 0) / 2 : 0;
    groupedByHSN[key].igstPct = showIGST ? it.gstRate || 0 : 0;
    groupedByHSN[key].cgstAmt += it.cgst || 0;
    groupedByHSN[key].sgstAmt += it.sgst || 0;
    groupedByHSN[key].igstAmt += it.igst || 0;
    groupedByHSN[key].total += it.total || 0;
  });

  const taxSummaryData = Object.values(groupedByHSN);
  const taxSummaryRows = taxSummaryData.map((d) =>
    showIGST
      ? [
          d.hsn,
          money(d.taxable),
          `${Number(d.igstPct)}`,
          money(d.igstAmt),
          money(d.total),
        ]
      : showCGSTSGST
      ? [
          d.hsn,
          money(d.taxable),
          `${Number(d.cgstPct)}`,
          money(d.cgstAmt),
          `${Number(d.sgstPct)}`,
          money(d.sgstAmt),
          money(d.total),
        ]
      : [d.hsn, money(d.taxable), money(d.total)]
  );

  // Add total row to tax summary
  if (showIGST) {
    taxSummaryRows.push([
      "Total",
      money(subtotal),
      "",
      money(totalIGST),
      money(subtotal + totalIGST),
    ]);
  } else if (showCGSTSGST) {
    taxSummaryRows.push([
      "Total",
      money(subtotal),
      "",
      money(totalCGST),
      "",
      money(totalSGST),
      money(subtotal + totalCGST + totalSGST),
    ]);
  } else {
    taxSummaryRows.push(["Total", money(subtotal), money(invoiceTotal)]);
  }

  let taxSummaryHeaders, taxSummaryColumnWidths;

  if (showIGST) {
    taxSummaryHeaders = [
      "HSN / SAC",
      "Taxable Value (Rs.)",
      "%",
      "IGST (Rs.)",
      "Total (Rs.)",
    ];
    taxSummaryColumnWidths = [120, 120, 113, 120, 120];
  } else if (showCGSTSGST) {
    taxSummaryHeaders = [
      "HSN / SAC",
      "Taxable Value (Rs.)",
      "%",
      "CGST (Rs.)",
      "%",
      "SGST (Rs.)",
      "Total (Rs.)",
    ];
    taxSummaryColumnWidths = [130, 100, 60, 74, 60, 80, 90];
  } else {
    taxSummaryHeaders = ["HSN / SAC", "Taxable Value (Rs.)", "Total (Rs.)"];
    taxSummaryColumnWidths = [200, 195, 200];
  }

  // Draw tax summary table
  cursorY = drawTable(
    doc,
    MARGIN - 8,
    cursorY,
    taxSummaryHeaders,
    taxSummaryRows,
    taxSummaryColumnWidths,
    {
      headerBackground: [200, 225, 255],
      borderColor: BORDER,
      textColor: DARK,
      fontSize: 8,
      padding: 3,
    }
  );

  cursorY += 10;

  // Total in words
  doc.save();
  doc.font("Helvetica-Bold");
  doc.fontSize(9);
  doc.text(`Total Tax in words: `, MARGIN, cursorY + 20);
  doc.fontSize(8);
  doc.font("Helvetica");
  doc.text(` ${numberToWords(invoiceTotal)}`, MARGIN + 82, cursorY + 20);
  doc.restore();

  cursorY += 40;

  // Footer section (Bank details, signature, terms)
  doc.save();
  doc.strokeColor(...BORDER);
  doc.lineWidth(0.1);
  doc
    .moveTo(MARGIN - 8, cursorY)
    .lineTo(PAGE_WIDTH - MARGIN + 8, cursorY)
    .stroke();
  doc.restore();

  cursorY += 24;

  const bankDetails = dynamicBankDetails;
  const BANK_OFFSET = -60;
  const bankX = MARGIN + COL_W + BANK_OFFSET;
  let currentBlockY = cursorY;
  let bankDetailY = currentBlockY;
  const qrSize = 90;
  const qrX = bankX + 250;
  let qrY = currentBlockY;

  // Draw bank details
  doc.save();
  doc.font("Helvetica-Bold");
  doc.fillColor(0, 0, 0);
  doc.fontSize(9);
  doc.text("Bank Details", bankX, bankDetailY);
  bankDetailY += 15;
  doc.fontSize(8);

  const putBankDetail = (label, val, x, y, maxWidth) => {
    if (val === "-") return y;
    const valueX = x + 60;
    doc.font("Helvetica-Bold");
    doc.text(label, x, y);
    doc.font("Helvetica");
    if (maxWidth) {
      const lines = doc.splitTextToSize(val, maxWidth);
      doc.text(lines, valueX, y);
      return y + lines.length * 9;
    } else {
      doc.text(val, valueX, y);
      return y + 12;
    }
  };

  if (areBankDetailsAvailable) {
    bankDetailY = putBankDetail("Name:", bankDetails.name, bankX, bankDetailY);
    bankDetailY = putBankDetail(
      "Branch:",
      bankDetails.branch,
      bankX,
      bankDetailY,
      180
    );
    bankDetailY = putBankDetail("IFSC:", bankDetails.ifsc, bankX, bankDetailY);
    bankDetailY = putBankDetail(
      "Acc. Number:",
      bankDetails.accNumber,
      bankX,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI ID:",
      bankDetails.upiId,
      bankX,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI Name:",
      bankDetails.upiName,
      bankX,
      bankDetailY
    );
    bankDetailY = putBankDetail(
      "UPI Mobile:",
      bankDetails.upiMobile,
      bankX,
      bankDetailY
    );
  }
  doc.restore();

  // QR Code
  if (bankDetails.qrCode) {
    doc.save();
    doc.font("Helvetica-Bold");
    doc.fontSize(9);
    doc.fillColor(0, 0, 0);
    const qrLabelWidth = doc.widthOfString("QR Code");
    doc.text("QR Code", qrX + qrSize / 2 - qrLabelWidth / 2, qrY);
    qrY += 12;

    try {
      const qrCodePath = getAssetPath(bankDetails.qrCode);
      if (qrCodePath) {
        doc.image(qrCodePath, qrX - 2, qrY, {
          width: qrSize,
          height: qrSize - 12,
        });
      } else {
        throw new Error("QR code path not found");
      }
    } catch (error) {
      console.log("QR code not found:", error.message);
      doc.rect(qrX, qrY, qrSize, qrSize).stroke();
    }
    doc.restore();
  }

  // Signature block
  const sigY = Math.max(bankDetailY, qrY + qrSize) + 10;
  doc.save();
  doc.fontSize(9);
  doc.fillColor(0, 0, 0);

  const SIG_WIDTH = 125;
  const SIG_RECT_X = qrX - 65;

  doc.lineWidth(0.1);
  doc.strokeColor(220, 224, 228);

  const maxNameWidthForSign = 130;
  const companyNameLinesForSign = doc.splitTextToSize(
    `For ${capitalizeWords(invoiceData.company.name)}`,
    maxNameWidthForSign
  );

  let currentSignY = sigY + 28;
  companyNameLinesForSign.forEach((line) => {
    doc.text(line, qrX - 25, currentSignY);
    currentSignY += 8;
  });

  doc.rect(SIG_RECT_X + 40, currentSignY, SIG_WIDTH, 55).stroke();
  doc.lineWidth(0.1);

  const SIG_TEXT_AUTH_X = SIG_RECT_X + SIG_WIDTH / 2;
  doc.text("Authorised Signatory", SIG_TEXT_AUTH_X + 40, currentSignY + 50, {
    align: "center",
  });
  doc.restore();

  // Terms and conditions
  let termsY = currentBlockY;
  const TERMS_COL_WIDTH = COL_W - 80;

  if (transaction.notes) {
    termsY = renderHtmlNotesForPDFKit(
      doc,
      transaction.notes,
      MARGIN,
      termsY,
      TERMS_COL_WIDTH
    );
  }

  // Page number
  doc.save();
  doc.fontSize(8);
  doc.text(`Page 1`, PAGE_WIDTH - MARGIN - 20, PAGE_HEIGHT - 10);
  doc.restore();

  return doc;
};

module.exports = { generateTemplate17 };
