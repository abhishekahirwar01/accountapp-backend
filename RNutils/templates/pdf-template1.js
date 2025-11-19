// backend/templates/template1.js - FIXED GST CALCULATIONS

const {
  formatCurrency,
  capitalizeWords: capitalizeWordsFromUtils,
  getBillingAddress,
  getShippingAddress,
  getStateCode,
  formatPhoneNumber,
  numberToWords,
  formatQuantity,
  prepareTemplate8Data,
  getHsnSummary,
} = require("../pdf-utils");

const {
  parseHtmlToElements,
  renderParsedElements,
} = require("../HtmlNoteRendrer");

const { capitalizeWords, parseNotesHtml } = require("../utils");

// Template styles (same as before)
const template1Styles = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 25,
    paddingBottom: 30,
    fontFamily: "Helvetica",
  },

  tableWrapper: {
    position: "relative",
    flexDirection: "column",
  },

  pageBottomBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#0371C1",
  },

  columnBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: -1,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    paddingBottom: 4,
    alignItems: "center",
    textAlign: "center",
  },
  headerLeft: {
    alignItems: "flex-start",
  },
  headerRight: {
    alignItems: "flex-start",
    width: "100%",
    marginLeft: 20,
  },
  logo: {
    width: 70,
    height: 70,
    marginRight: 5,
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    marginLeft: 2,
  },
  address: {
    fontSize: 10,
    marginBottom: 3,
    lineHeight: 1.2,
    marginLeft: 2,
    alignItems: "flex-start",
    textAlign: "left",
  },
  contactInfo: {
    fontSize: 10,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center",
  },

  contactLabel: {
    fontSize: 10,
    fontWeight: "bold",
  },
  contactValue: {
    fontSize: 10,
    fontWeight: "normal",
  },
  section: {
    padding: 0,
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1.5px solid #0371C1",
  },
  gstRow: {
    flexDirection: "row",
    padding: 3,
  },
  gstLabel: {
    fontSize: 10,
    fontWeight: "bold",
  },
  gstValue: {
    fontSize: 10,
    fontWeight: "normal",
  },
  invoiceTitleRow: {
    padding: 3,
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "extrabold",
    textAlign: "center",
    color: "#0371C1",
  },
  recipientRow: {
    padding: 3,
  },
  recipientText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },

  threeColSection: {
    flexDirection: "row",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1",
  },
  column: {
    width: "33.3%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1",
  },
  columnHeader: {
    marginBottom: 5,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 2,
  },
  threecoltableHeader: {
    fontSize: 8,
    fontWeight: "bold",
  },
  tableLabel: {
    fontSize: 8,
    fontWeight: "bold",
    width: "40%",
    flexShrink: 0,
    wrap: true,
    hyphens: "none",
  },
  tableValue: {
    fontSize: 8,
    fontWeight: "normal",
    width: "70%",
    flexShrink: 1,
    wrap: true,
    hyphens: "none",
  },

  itemsTable: {},
  tableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1",
  },
  verticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1",
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    borderBottom: "1px solid #0371C1",
    borderTop: 0,
  },
  headerCell: {
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  itemsTableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  itemsTableTotalRow: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    alignItems: "center",
  },
  srNoHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2,
  },
  productHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "25%",
    padding: 3,
  },
  hsnHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2,
  },
  qtyHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2,
  },
  rateHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2,
  },
  taxableHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2,
  },
  igstHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
  },
  totalHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2,
  },
  igstMainHeader: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 1,
  },
  igstSubHeader: { flexDirection: "row", borderTop: "1px solid #0371C1" },
  igstSubText: {
    fontSize: 6,
    fontWeight: "bold",
    width: "70%",
    textAlign: "center",
    padding: 1,
  },
  igstSubPercentage: {
    fontSize: 6,
    fontWeight: "bold",
    width: "30%",
    textAlign: "center",
    padding: 1,
  },

  srNoCell: { fontSize: 7, width: "8%", textAlign: "center", padding: 3 },
  productCell: {
    fontSize: 7,
    width: "25%",
    textAlign: "left",
    padding: 3,
    wrap: true,
  },
  hsnCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3,
    justifyContent: "flex-start",
    alignItems: "center",
  },

  qtyCell: {
    fontSize: 7,
    width: "8%",
    textAlign: "center",
    padding: 3,
  },
  rateCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3,
  },
  taxableCell: {
    fontSize: 7,
    width: "12%",
    textAlign: "center",
    padding: 3,
  },
  igstCell: {
    flexDirection: "row",
    width: "12%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    textAlign: "center",
    paddingVertical: 3,
  },
  igstPercent: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "30%",
  },
  igstAmount: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "70%",
  },
  totalCell: {
    fontSize: 7,
    width: "15%",
    textAlign: "center",
    padding: 3,
  },

  totalLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 2,
  },
  totalEmpty: {
    fontSize: 7,
    width: "25%",
    padding: 2,
    textAlign: "center",
    fontWeight: "bold",
  },
  totalQty: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2,
  },
  totalTaxable: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2,
  },
  igstTotal: {},
  totalIgstAmount: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "right",
    padding: 2,
    paddingRight: 9,
  },
  grandTotal: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2,
  },

  igstPercentHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
    borderRight: "1px solid #000",
  },
  igstAmountHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
  },

  igstPercentCell: {
    fontSize: 7,
    textAlign: "center",
    padding: 2,
  },
  igstAmountCell: {
    fontSize: 7,
    textAlign: "center",
    padding: 2,
  },

  bottomSection: {
    flexDirection: "row",
    width: "100%",
    fontSize: 7,
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1",
    borderBottom: "1.5px solid #0371C1",
  },

  leftSection: {
    width: "65%",
    borderRight: "1px solid #0371C1",
  },

  totalInWords: {
    fontSize: 7,
    fontWeight: "bold",
    borderBottom: "1px solid #0371C1",
    padding: 3,
    textTransform: "uppercase",
  },

  termsBox: {
    padding: 8,
    paddingTop: 0,
  },
  termLine: {
    fontSize: 7,
    marginBottom: 1,
  },

  qrContainer: {
    alignItems: "center",
    marginTop: 6,
  },
  qrImage: {
    width: 45,
    height: 45,
  },
  qrText: {
    fontSize: 7,
    marginTop: 2,
  },

  rightSection: {
    width: "35%",
    justifyContent: "flex-start",
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #0371C1",
    padding: 3,
  },

  label: { fontSize: 8, fontWeight: "bold" },
  value: { fontSize: 8, fontWeight: "bold" },

  labelBold: { fontSize: 8, fontWeight: "bold" },
  valueBold: { fontSize: 8, fontWeight: "bold" },

  highlightRow: {
    backgroundColor: "#EAF4FF",
  },

  currencySymbol: {
    fontSize: 6,
  },

  hsnTaxTable: {
    backgroundColor: "#FFFFFF",
  },
  hsnTaxTableTitle: {
    backgroundColor: "#0371C1",
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
  },
  hsnTaxTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f8ff",
    borderBottom: "1px solid #0371C1",
  },
  hsnTaxHeaderCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "0.5px solid #0371C1",
    textAlign: "center",
  },
  hsnTaxTableRow: {
    flexDirection: "row",
    borderBottom: "0.5px solid #0371C1",
  },
  hsnTaxCell: {
    padding: 1,
    fontSize: 7,
    borderRight: "1px solid #0371C1",
    textAlign: "center",
  },
  hsnTaxTableTotalRow: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
  },
  hsnTaxTotalCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "1px solid #0371C1",
    textAlign: "center",
  },

  pageNumber: {
    position: "absolute",
    bottom: 20,
    right: 20,
    fontSize: 8,
    textAlign: "right",
  },
};

// Helper functions (same as before)
const wrapText = (doc, text, maxWidth) => {
  if (!text || text === undefined || text === null) return [""];

  const textStr = String(text);
  const words = textStr.split(" ");
  const lines = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;
    const width = doc.widthOfString(testLine);

    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};

const renderParsedElementsForPDFKit = (elements, doc, x, y, maxWidth) => {
  let currentY = y;

  if (!elements || !Array.isArray(elements)) {
    return currentY;
  }

  elements.forEach((element) => {
    if (element.type === "text") {
      const fontSize = element.fontSize || 8;
      doc.fontSize(fontSize);

      if (element.fontWeight === "bold") {
        doc.font("Helvetica-Bold");
      } else {
        doc.font("Helvetica");
      }

      const lines = wrapText(doc, element.content, maxWidth);

      lines.forEach((line) => {
        doc.text(line, x, currentY, {
          width: maxWidth,
          align: element.textAlign || "left",
          continued: false,
        });
        currentY += fontSize * (element.lineHeight || 1.2);
      });
    } else if (element.type === "view") {
      currentY = renderParsedElementsForPDFKit(
        element.children,
        doc,
        x,
        currentY,
        maxWidth
      );
    } else if (element.type === "text-element") {
      const fontSize = element.fontSize || 8;
      doc.fontSize(fontSize);

      if (element.fontWeight === "bold") {
        doc.font("Helvetica-Bold");
      } else {
        doc.font("Helvetica");
      }

      if (element.color) {
        doc.fillColor(element.color);
      }

      const lines = wrapText(doc, element.content, maxWidth);

      lines.forEach((line) => {
        doc.text(line, x, currentY, {
          width: maxWidth,
          continued: false,
        });
        currentY += fontSize * (element.lineHeight || 1.2);
      });

      if (element.color) {
        doc.fillColor("#000000");
      }
    }
  });

  return currentY;
};

const renderTableCell = (doc, text, x, y, width, options = {}) => {
  const { align = "left", padding = 2, bold = false, fontSize = 7 } = options;

  doc.fontSize(fontSize);
  doc.font(bold ? "Helvetica-Bold" : "Helvetica");

  const lines = wrapText(doc, text, width - padding * 2);
  const usableWidth = width - padding * 2;

  lines.forEach((line, idx) => {
    const textWidth = doc.widthOfString(line);
    let textX = x + padding;

    if (align === "center") {
      textX = x + (width - textWidth) / 2;
    } else if (align === "right") {
      textX = x + width - textWidth - padding;
    }

    doc.text(line, textX, y + idx * (fontSize + 2), {
      width: usableWidth,
      align: align,
      lineBreak: false,
    });
  });

  return lines.length * (fontSize + 2);
};

const generateTemplate1 = (
  doc,
  transaction,
  company,
  party,
  shippingAddress,
  serviceNameById,
  bank
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = template1Styles.page.padding;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;
  let currentPage = 1;

  console.log("=== GENERATING TEMPLATE 1 PDF ===");
  console.log("Transaction:", transaction);
  console.log("Company:", company);
  console.log("Party:", party);

  // Prepare data with proper error handling
  let itemsWithGST = [];
  let totalTaxable = 0;
  let totalAmount = 0;
  let totalQty = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let isGSTApplicable = false;
  let showIGST = false;
  let showCGSTSGST = false;

  try {
    const preparedData = prepareTemplate8Data(
      transaction,
      company,
      party,
      shippingAddress
    );

    itemsWithGST = preparedData.itemsWithGST || [];
    totalTaxable = preparedData.totalTaxable || 0;
    totalAmount = preparedData.totalAmount || 0;
    totalQty = preparedData.totalQty || 0;
    totalCGST = preparedData.totalCGST || 0;
    totalSGST = preparedData.totalSGST || 0;
    totalIGST = preparedData.totalIGST || 0;
    isGSTApplicable = preparedData.isGSTApplicable || false;
    showIGST = preparedData.showIGST || false;
    showCGSTSGST = preparedData.showCGSTSGST || false;

    console.log("Prepared items:", itemsWithGST.length);
    console.log("Total taxable:", totalTaxable);
    console.log("Total amount:", totalAmount);
    console.log("Total CGST:", totalCGST);
    console.log("Total SGST:", totalSGST);
    console.log("Total IGST:", totalIGST);
    console.log("GST Applicable:", isGSTApplicable);

    // ✅ MANUAL CALCULATION FALLBACK - If totalAmount is 0 but we have items
    if (totalAmount === 0 && itemsWithGST.length > 0) {
      console.log("=== APPLYING MANUAL CALCULATIONS ===");

      // Recalculate from items
      totalTaxable = itemsWithGST.reduce(
        (sum, item) => sum + (item.taxableValue || 0),
        0
      );
      totalCGST = itemsWithGST.reduce((sum, item) => sum + (item.cgst || 0), 0);
      totalSGST = itemsWithGST.reduce((sum, item) => sum + (item.sgst || 0), 0);
      totalIGST = itemsWithGST.reduce((sum, item) => sum + (item.igst || 0), 0);
      totalAmount = totalTaxable + totalCGST + totalSGST + totalIGST;
      totalQty = itemsWithGST.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );

      console.log("Manual Total Taxable:", totalTaxable);
      console.log("Manual Total CGST:", totalCGST);
      console.log("Manual Total SGST:", totalSGST);
      console.log("Manual Total IGST:", totalIGST);
      console.log("Manual Total Amount:", totalAmount);
    }
  } catch (error) {
    console.error("Error in prepareTemplate8Data:", error);

    // ✅ COMPLETE FALLBACK CALCULATIONS
    itemsWithGST = transaction.items || [];

    if (itemsWithGST.length > 0) {
      console.log("=== USING FALLBACK CALCULATIONS ===");

      totalTaxable = itemsWithGST.reduce(
        (sum, item) => sum + (item.taxableValue || 0),
        0
      );
      totalCGST = itemsWithGST.reduce((sum, item) => sum + (item.cgst || 0), 0);
      totalSGST = itemsWithGST.reduce((sum, item) => sum + (item.sgst || 0), 0);
      totalIGST = itemsWithGST.reduce((sum, item) => sum + (item.igst || 0), 0);
      totalAmount = totalTaxable + totalCGST + totalSGST + totalIGST;
      totalQty = itemsWithGST.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );

      // Determine GST type
      isGSTApplicable = itemsWithGST.some((item) => (item.gstRate || 0) > 0);
      const companyState = company?.addressState || company?.state || "Delhi";
      const partyState = party?.state || "Delhi";
      const isInterstate = companyState !== partyState;
      showIGST = isGSTApplicable && isInterstate;
      showCGSTSGST = isGSTApplicable && !isInterstate;

      console.log("Fallback Total Taxable:", totalTaxable);
      console.log("Fallback Total Amount:", totalAmount);
      console.log("Company State:", companyState);
      console.log("Party State:", partyState);
      console.log("Is Interstate:", isInterstate);
      console.log("Show IGST:", showIGST);
      console.log("Show CGST/SGST:", showCGSTSGST);
    }
  }

  // Final fallback for testing
  if (!itemsWithGST || itemsWithGST.length === 0) {
    console.log("No items found, using fallback data");
    itemsWithGST = [
      {
        name: "Sample Product",
        code: "123456",
        quantity: 1,
        unit: "pcs",
        pricePerUnit: 1000,
        taxableValue: 1000,
        gstRate: 18,
        cgst: 90,
        sgst: 90,
        igst: 180,
        total: 1180,
        itemType: "product",
      },
    ];
    totalTaxable = 1000;
    totalCGST = 90;
    totalSGST = 90;
    totalIGST = 180;
    totalAmount = 1180;
    totalQty = 1;
    isGSTApplicable = true;
    showCGSTSGST = true;
  }

  // ✅ FINAL VERIFICATION
  console.log("=== FINAL CALCULATIONS ===");
  console.log("Total Taxable:", totalTaxable);
  console.log("Total CGST:", totalCGST);
  console.log("Total SGST:", totalSGST);
  console.log("Total IGST:", totalIGST);
  console.log("Total Amount:", totalAmount);
  console.log("Show IGST:", showIGST);
  console.log("Show CGST/SGST:", showCGSTSGST);

  const logoSrc = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  const bankData = bank || {};
  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.qrCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  // Dynamic column widths matching frontend
  const colWidthsIGST = ["8%", "25%", "10%", "8%", "10%", "12%", "12%", "15%"];
  const totalColumnIndexIGST = 7;

  const colWidthsCGSTSGST = [
    "8%",
    "25%",
    "10%",
    "8%",
    "10%",
    "12%",
    "12%",
    "12%",
    "15%",
  ];
  const totalColumnIndexCGSTSGST = 8;

  const colWidthsNoTax = ["8%", "25%", "10%", "8%", "10%", "12%", "27%"];
  const totalColumnIndexNoTax = 6;

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;
  const totalColumnIndex = showIGST
    ? totalColumnIndexIGST
    : showCGSTSGST
    ? totalColumnIndexCGSTSGST
    : totalColumnIndexNoTax;

  const tableWidth = contentWidth;

  // Calculate border positions
  const borderPositions = [];
  let cumulative = 0;
  for (let i = 0; i < colWidths.length - 1; i++) {
    cumulative += parseFloat(colWidths[i]);
    borderPositions.push((cumulative / 100) * tableWidth);
  }

  // Helper to get column width
  const getColWidth = (index) => {
    return (parseFloat(colWidths[index]) / 100) * tableWidth;
  };

  const companyName =
    company?.businessName || company?.companyName || "Company Name";

  // Function to add new page
  const addNewPage = () => {
    doc.addPage();
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Draw header function
  const drawHeader = () => {
    let logoX = margin;

    // Logo
    if (logoSrc) {
      try {
        doc.image(logoSrc, margin, currentY, {
          width: template1Styles.logo.width,
          height: template1Styles.logo.height,
        });
        logoX = margin + template1Styles.logo.width + 20;
      } catch (error) {
        console.log("Logo not found:", error.message);
        logoX = margin;
      }
    }

    // Company Name
    doc
      .fontSize(template1Styles.companyName.fontSize)
      .font("Helvetica-Bold")
      .fillColor("#000000");

    const companyNameText = capitalizeWords(companyName);
    doc.text(companyNameText, logoX, currentY, {
      width: contentWidth - (logoSrc ? 90 : 0),
    });

    // Company Address
    let addressY = currentY + 25;
    doc.fontSize(template1Styles.address.fontSize).font("Helvetica");

    const address = capitalizeWords(
      [
        company?.address,
        company?.City,
        company?.addressState,
        company?.Country,
        company?.Pincode,
      ]
        .filter(Boolean)
        .join(", ") || "Address Line 1"
    );

    const addressLines = wrapText(
      doc,
      address,
      contentWidth - (logoSrc ? 90 : 0)
    );
    addressLines.forEach((line) => {
      doc.text(line, logoX, addressY, {
        width: contentWidth - (logoSrc ? 90 : 0),
      });
      addressY += template1Styles.address.fontSize * 1.2;
    });

    // Contact Info
    addressY += 5;
    doc.fontSize(template1Styles.contactInfo.fontSize);

    let phoneText = "Phone";
    try {
      const num = company?.mobileNumber || company?.Telephone;
      phoneText = num ? formatPhoneNumber(num) : "Phone";
    } catch (error) {
      phoneText = company?.mobileNumber || company?.Telephone || "Phone";
    }

    doc.font("Helvetica-Bold");
    doc.text("Phone No: ", logoX, addressY, { continued: true });
    doc.font("Helvetica");
    doc.text(phoneText);

    currentY = addressY + 20;
  };

  // Draw initial header
  drawHeader();

  // TABLE HEADER SECTION
  doc.rect(margin, currentY, contentWidth, 20).stroke("#0371C1");

  // GSTIN
  if (company?.gstin) {
    doc.fontSize(template1Styles.gstLabel.fontSize).font("Helvetica-Bold");
    doc.text("GSTIN: ", margin + 5, currentY + 7, { continued: true });
    doc.font("Helvetica");
    doc.text(company.gstin);
  }

  // Invoice Title
  doc.fontSize(template1Styles.invoiceTitle.fontSize).font("Helvetica-Bold");
  const invoiceTitle =
    transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE";

  const titleWidth = doc.widthOfString(invoiceTitle);
  doc.fillColor("#0371C1");
  doc.text(
    invoiceTitle,
    margin + (contentWidth - titleWidth) / 2,
    currentY + 5
  );
  doc.fillColor("#000000");

  // Recipient Text
  doc.fontSize(template1Styles.recipientText.fontSize).font("Helvetica-Bold");
  doc.text("ORIGINAL FOR RECIPIENT", margin + contentWidth - 150, currentY + 7);

  currentY += 25;

  // THREE COLUMN SECTION
  const threeColHeight = 80;
  doc.rect(margin, currentY, contentWidth, threeColHeight).stroke("#0371C1");

  const columnWidth = contentWidth / 3;

  // Vertical dividers
  doc
    .moveTo(margin + columnWidth, currentY)
    .lineTo(margin + columnWidth, currentY + threeColHeight)
    .stroke("#0371C1");

  doc
    .moveTo(margin + columnWidth * 2, currentY)
    .lineTo(margin + columnWidth * 2, currentY + threeColHeight)
    .stroke("#0371C1");

  // Column 1 - Details of Buyer
  doc
    .fontSize(template1Styles.threecoltableHeader.fontSize)
    .font("Helvetica-Bold");
  doc.text("Details of Buyer | Billed to:", margin + 5, currentY + 5);

  doc.fontSize(template1Styles.tableLabel.fontSize);
  let buyerY = currentY + 15;

  const buyerData = [
    { label: "Name:", value: capitalizeWords(party?.name || "N/A") },
    {
      label: "Address:",
      value: capitalizeWords(getBillingAddress(party)),
      multiLine: true,
    },
    {
      label: "Phone:",
      value: party?.contactNumber
        ? formatPhoneNumber(party.contactNumber)
        : "-",
    },
    { label: "GSTIN:", value: party?.gstin || "-" },
    { label: "PAN:", value: party?.pan || "-" },
    {
      label: "Place of Supply:",
      value: () => {
        const supplyState = shippingAddress?.state || party?.state;
        const stateCode = supplyState ? getStateCode(supplyState) : "-";
        return supplyState ? `${supplyState} (${stateCode})` : "-";
      },
    },
  ];

  buyerData.forEach((item) => {
    doc.font("Helvetica-Bold");
    doc.text(item.label, margin + 5, buyerY, { continued: true });
    doc.font("Helvetica");

    const value = typeof item.value === "function" ? item.value() : item.value;

    if (item.multiLine) {
      const lines = wrapText(doc, value, columnWidth - 30);
      doc.text("");
      lines.forEach((line, idx) => {
        doc.text(line, margin + 25, buyerY + idx * 10, {
          width: columnWidth - 35,
        });
      });
      buyerY += lines.length * 10;
    } else {
      doc.text(value, { width: columnWidth - 35 });
      buyerY += 10;
    }
  });

  // Column 2 - Details of Consigned
  const col2X = margin + columnWidth;
  doc
    .fontSize(template1Styles.threecoltableHeader.fontSize)
    .font("Helvetica-Bold");
  doc.text("Details of Consigned | Shipped to:", col2X + 5, currentY + 5);

  doc.fontSize(template1Styles.tableLabel.fontSize);
  let consignedY = currentY + 15;

  const consignedData = [
    {
      label: "Name:",
      value: capitalizeWords(shippingAddress?.label || party?.name || "N/A"),
    },
    {
      label: "Address:",
      value: capitalizeWords(
        getShippingAddress(shippingAddress, getBillingAddress(party))
      ),
      multiLine: true,
    },
    { label: "Country:", value: company?.Country || "India" },
    {
      label: "Phone:",
      value: formatPhoneNumber(
        shippingAddress?.contactNumber || party?.contactNumber || "-"
      ),
    },
    { label: "GSTIN:", value: party?.gstin || "-" },
    {
      label: "State:",
      value: () => {
        const supplyState = shippingAddress?.state || party?.state;
        const stateCode = supplyState ? getStateCode(supplyState) : "-";
        return supplyState ? `${supplyState} (${stateCode})` : "-";
      },
    },
  ];

  consignedData.forEach((item) => {
    doc.font("Helvetica-Bold");
    doc.text(item.label, col2X + 5, consignedY, { continued: true });
    doc.font("Helvetica");

    const value = typeof item.value === "function" ? item.value() : item.value;

    if (item.multiLine) {
      const lines = wrapText(doc, value, columnWidth - 30);
      doc.text("");
      lines.forEach((line, idx) => {
        doc.text(line, col2X + 25, consignedY + idx * 10, {
          width: columnWidth - 35,
        });
      });
      consignedY += lines.length * 10;
    } else {
      doc.text(value, { width: columnWidth - 35 });
      consignedY += 10;
    }
  });

  // Column 3 - Invoice Details
  const col3X = margin + columnWidth * 2;
  let invoiceY = currentY + 15;

  const invoiceData = [
    { label: "Invoice No:", value: transaction.invoiceNumber || "N/A" },
    {
      label: "Invoice Date:",
      value: new Date(transaction.date).toLocaleDateString("en-IN"),
    },
    {
      label: "Due Date:",
      value: new Date(transaction.dueDate).toLocaleDateString("en-IN"),
    },
    { label: "P.O. No:", value: transaction.voucher || "-" },
    { label: "E-Way No:", value: transaction.referenceNumber || "-" },
  ];

  invoiceData.forEach((item) => {
    doc.font("Helvetica-Bold");
    doc.text(item.label, col3X + 5, invoiceY, { continued: true });
    doc.font("Helvetica");
    doc.text(item.value);
    invoiceY += 10;
  });

  currentY += threeColHeight + 5;

  // ITEMS TABLE HEADER
  const headerHeight = 20;

  // Remove background fill that was causing black color
  doc.rect(margin, currentY, contentWidth, headerHeight).stroke("#0371C1");

  // Draw vertical borders for header
  borderPositions.forEach((pos) => {
    doc
      .moveTo(margin + pos, currentY)
      .lineTo(margin + pos, currentY + headerHeight)
      .stroke("#0371C1");
  });

  let headerX = margin;
  doc.fontSize(template1Styles.srNoHeader.fontSize).font("Helvetica-Bold");

  // Table Headers
  const headers = [
    { text: "Sr. No.", width: colWidths[0], align: "center" },
    { text: "Name of Product/Service", width: colWidths[1], align: "center" },
    { text: "HSN/SAC", width: colWidths[2], align: "center" },
    { text: "Qty", width: colWidths[3], align: "center" },
    { text: "Rate (Rs.)", width: colWidths[4], align: "center" },
    { text: "Taxable Value (Rs.)", width: colWidths[5], align: "center" },
  ];

  headers.forEach((header) => {
    const colWidth = getColWidth(headers.indexOf(header));
    renderTableCell(doc, header.text, headerX, currentY + 6, colWidth, {
      align: header.align,
      fontSize: 7,
      bold: true,
    });
    headerX += colWidth;
  });

  // GST Headers
  if (showIGST) {
    const igstWidth = getColWidth(6);

    doc.fontSize(7).font("Helvetica-Bold");
    const igstTextWidth = doc.widthOfString("IGST");
    doc.text("IGST", headerX + (igstWidth - igstTextWidth) / 2, currentY + 4);

    doc.fontSize(6);
    doc.text("%", headerX + 10, currentY + 12);
    doc.text("Amount (Rs.)", headerX + 25, currentY + 12);

    headerX += igstWidth;
  } else if (showCGSTSGST) {
    const cgstWidth = getColWidth(6);

    doc.fontSize(7).font("Helvetica-Bold");
    const cgstTextWidth = doc.widthOfString("CGST");
    doc.text("CGST", headerX + (cgstWidth - cgstTextWidth) / 2, currentY + 4);

    doc.fontSize(6);
    doc.text("%", headerX + 10, currentY + 12);
    doc.text("Amount (Rs.)", headerX + 25, currentY + 12);

    headerX += cgstWidth;

    const sgstWidth = getColWidth(7);

    doc.fontSize(7).font("Helvetica-Bold");
    const sgstTextWidth = doc.widthOfString("SGST");
    doc.text("SGST", headerX + (sgstWidth - sgstTextWidth) / 2, currentY + 4);

    doc.fontSize(6);
    doc.text("%", headerX + 10, currentY + 12);
    doc.text("Amount (Rs.)", headerX + 25, currentY + 12);

    headerX += sgstWidth;
  }

  // Total Header
  const totalWidth = getColWidth(totalColumnIndex);
  renderTableCell(doc, "Total (Rs.)", headerX, currentY + 6, totalWidth, {
    align: "center",
    fontSize: 7,
    bold: true,
  });

  currentY += headerHeight;

  // ITEMS TABLE ROWS
  console.log("Rendering items:", itemsWithGST.length);

  if (itemsWithGST && itemsWithGST.length > 0) {
    itemsWithGST.forEach((item, index) => {
      // Check if we need a new page
      if (currentY > pageHeight - 250) {
        addNewPage();
        currentY += 25;
      }

      const rowHeight = 20;
      const rowStartY = currentY;

      // Draw only border, no background fill
      doc.rect(margin, currentY, contentWidth, rowHeight).stroke("#0371C1");

      let rowX = margin;
      const cellY = currentY + 6;

      // Ensure text is visible
      doc.fillColor("#000000");

      // Sr. No.
      renderTableCell(
        doc,
        (index + 1).toString(),
        rowX,
        cellY,
        getColWidth(0),
        {
          align: "center",
          fontSize: 7,
        }
      );
      rowX += getColWidth(0);

      // Product Name
      const productName = item.name
        ? capitalizeWords(item.name)
        : "Unnamed Item";
      renderTableCell(doc, productName, rowX, cellY, getColWidth(1), {
        align: "left",
        fontSize: 7,
      });
      rowX += getColWidth(1);

      // HSN/SAC
      renderTableCell(doc, item.code || "-", rowX, cellY, getColWidth(2), {
        align: "center",
        fontSize: 7,
      });
      rowX += getColWidth(2);

      // Quantity
      const quantityText =
        item.itemType === "service"
          ? "-"
          : formatQuantity(item.quantity || 0, item.unit || "pcs");
      renderTableCell(doc, quantityText, rowX, cellY, getColWidth(3), {
        align: "center",
        fontSize: 7,
      });
      rowX += getColWidth(3);

      // Rate
      renderTableCell(
        doc,
        formatCurrency(item.pricePerUnit || 0),
        rowX,
        cellY,
        getColWidth(4),
        {
          align: "right",
          fontSize: 7,
        }
      );
      rowX += getColWidth(4);

      // Taxable Value
      renderTableCell(
        doc,
        formatCurrency(item.taxableValue || 0),
        rowX,
        cellY,
        getColWidth(5),
        {
          align: "right",
          fontSize: 7,
        }
      );
      rowX += getColWidth(5);

      // GST Columns
      if (showIGST) {
        const igstWidth = getColWidth(6);
        const halfWidth = igstWidth / 2;

        doc.fontSize(7).font("Helvetica");
        doc.text((item.gstRate || 0).toString(), rowX + 10, cellY);
        doc.text(formatCurrency(item.igst || 0), rowX + halfWidth, cellY, {
          width: halfWidth - 5,
          align: "right",
        });

        rowX += igstWidth;
      } else if (showCGSTSGST) {
        const cgstWidth = getColWidth(6);
        const cgstHalfWidth = cgstWidth / 2;

        doc.fontSize(7).font("Helvetica");
        doc.text(((item.gstRate || 0) / 2).toString(), rowX + 10, cellY);
        doc.text(formatCurrency(item.cgst || 0), rowX + cgstHalfWidth, cellY, {
          width: cgstHalfWidth - 5,
          align: "right",
        });

        rowX += cgstWidth;

        const sgstWidth = getColWidth(7);
        const sgstHalfWidth = sgstWidth / 2;

        doc.text(((item.gstRate || 0) / 2).toString(), rowX + 10, cellY);
        doc.text(formatCurrency(item.sgst || 0), rowX + sgstHalfWidth, cellY, {
          width: sgstHalfWidth - 5,
          align: "right",
        });

        rowX += sgstWidth;
      }

      // Total
      renderTableCell(
        doc,
        formatCurrency(item.total || 0),
        rowX,
        cellY,
        getColWidth(totalColumnIndex),
        {
          align: "right",
          fontSize: 7,
        }
      );

      // Draw vertical borders
      borderPositions.forEach((pos) => {
        doc
          .moveTo(margin + pos, rowStartY)
          .lineTo(margin + pos, rowStartY + rowHeight)
          .stroke("#0371C1");
      });

      currentY += rowHeight;
    });
  } else {
    // Show message if no items
    console.log("No items to display");
    doc.fontSize(8).font("Helvetica");
    doc.text("No items found in this transaction", margin + 10, currentY + 10);
    currentY += 30;
  }

  // Draw bottom border for table
  doc
    .moveTo(margin, currentY)
    .lineTo(margin + contentWidth, currentY)
    .stroke("#0371C1");

  // TOTAL ROW
  const totalRowHeight = 20;

  // Remove background fill that was causing black color
  doc.rect(margin, currentY, contentWidth, totalRowHeight).stroke("#0371C1");

  borderPositions.forEach((pos) => {
    doc
      .moveTo(margin + pos, currentY)
      .lineTo(margin + pos, currentY + totalRowHeight)
      .stroke("#0371C1");
  });

  let totalX = margin;
  doc.fontSize(template1Styles.totalLabel.fontSize).font("Helvetica-Bold");

  totalX += getColWidth(0); // Skip Sr. No.
  totalX += getColWidth(1); // Skip Product

  // Total Label
  renderTableCell(doc, "Total", totalX, currentY + 7, getColWidth(2), {
    align: "center",
    fontSize: 7,
    bold: true,
  });
  totalX += getColWidth(2);

  // Total Quantity
  renderTableCell(
    doc,
    totalQty.toString(),
    totalX,
    currentY + 7,
    getColWidth(3),
    {
      align: "center",
      fontSize: 7,
      bold: true,
    }
  );
  totalX += getColWidth(3);

  totalX += getColWidth(4); // Skip Rate

  // Total Taxable
  renderTableCell(
    doc,
    formatCurrency(totalTaxable),
    totalX,
    currentY + 7,
    getColWidth(5),
    {
      align: "right",
      fontSize: 7,
      bold: true,
    }
  );
  totalX += getColWidth(5);

  // GST Totals
  if (showIGST) {
    const igstWidth = getColWidth(6);
    doc.fontSize(7).font("Helvetica-Bold");
    doc.text(formatCurrency(totalIGST), totalX + 25, currentY + 7);
    totalX += igstWidth;
  } else if (showCGSTSGST) {
    const cgstWidth = getColWidth(6);
    doc.fontSize(7).font("Helvetica-Bold");
    doc.text(formatCurrency(totalCGST), totalX + 25, currentY + 7);
    totalX += cgstWidth;

    const sgstWidth = getColWidth(7);
    doc.text(formatCurrency(totalSGST), totalX + 25, currentY + 7);
    totalX += sgstWidth;
  }

  // Grand Total
  renderTableCell(
    doc,
    formatCurrency(totalAmount),
    totalX,
    currentY + 7,
    getColWidth(totalColumnIndex),
    {
      align: "right",
      fontSize: 7,
      bold: true,
    }
  );

  currentY += totalRowHeight + 10;

  // TOTAL IN WORDS
  const wordsHeight = 15;
  doc.rect(margin, currentY, contentWidth, wordsHeight).stroke("#0371C1");

  doc.fontSize(template1Styles.totalInWords.fontSize).font("Helvetica-Bold");
  doc.text(
    `Total in words: ${numberToWords(totalAmount)}`,
    margin + 5,
    currentY + 5,
    { width: contentWidth - 10 }
  );

  currentY += wordsHeight + 10;

  // HSN SUMMARY TABLE
  if (isGSTApplicable) {
    const hsnSummary = getHsnSummary(itemsWithGST, showIGST, showCGSTSGST);

    // HSN Table Title
    doc
      .rect(margin, currentY, contentWidth, 15)
      .fillAndStroke("#0371C1", "#0371C1");

    doc
      .fontSize(template1Styles.hsnTaxTableTitle.fontSize)
      .font("Helvetica-Bold")
      .fillColor("#FFFFFF");

    const hsnTitleWidth = doc.widthOfString("HSN/SAC Summary");
    doc.text(
      "HSN/SAC Summary",
      margin + (contentWidth - hsnTitleWidth) / 2,
      currentY + 5
    );
    doc.fillColor("#000000");

    currentY += 20;

    // HSN column widths
    const hsnColWidths = showIGST
      ? ["25%", "20%", "30%", "25%"]
      : showCGSTSGST
      ? ["18%", "20%", "22%", "22%", "20%"]
      : ["40%", "30%", "30%"];

    const hsnTotalColumnIndex = showIGST ? 3 : showCGSTSGST ? 4 : 2;
    const hsnTableWidth = contentWidth;

    // HSN border positions
    const hsnBorderPositions = [];
    let hsnCumulative = 0;
    for (let i = 0; i < hsnColWidths.length - 1; i++) {
      hsnCumulative += parseFloat(hsnColWidths[i]);
      hsnBorderPositions.push((hsnCumulative / 100) * hsnTableWidth);
    }

    const getHsnColWidth = (index) => {
      return (parseFloat(hsnColWidths[index]) / 100) * hsnTableWidth;
    };

    // HSN Table Headers
    // Remove background fill that was causing black color
    doc.rect(margin, currentY, hsnTableWidth, 15).stroke("#0371C1");

    doc
      .fontSize(template1Styles.hsnTaxHeaderCell.fontSize)
      .font("Helvetica-Bold");
    let hsnHeaderX = margin;

    renderTableCell(
      doc,
      "HSN / SAC",
      hsnHeaderX,
      currentY + 4,
      getHsnColWidth(0),
      {
        align: "center",
        fontSize: 7,
        bold: true,
      }
    );
    hsnHeaderX += getHsnColWidth(0);

    renderTableCell(
      doc,
      "Taxable Value (Rs.)",
      hsnHeaderX,
      currentY + 4,
      getHsnColWidth(1),
      {
        align: "center",
        fontSize: 7,
        bold: true,
      }
    );
    hsnHeaderX += getHsnColWidth(1);

    if (showIGST) {
      const igstWidth = getHsnColWidth(2);
      doc.fontSize(7).font("Helvetica-Bold");
      const igstTextWidth = doc.widthOfString("IGST");
      doc.text(
        "IGST",
        hsnHeaderX + (igstWidth - igstTextWidth) / 2,
        currentY + 2
      );

      doc.fontSize(6);
      doc.text("%", hsnHeaderX + 10, currentY + 9);
      doc.text("Amount (Rs.)", hsnHeaderX + 25, currentY + 9);

      hsnHeaderX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = getHsnColWidth(2);
      doc.fontSize(7).font("Helvetica-Bold");
      const cgstTextWidth = doc.widthOfString("CGST");
      doc.text(
        "CGST",
        hsnHeaderX + (cgstWidth - cgstTextWidth) / 2,
        currentY + 2
      );

      doc.fontSize(6);
      doc.text("%", hsnHeaderX + 10, currentY + 9);
      doc.text("Amount (Rs.)", hsnHeaderX + 25, currentY + 9);

      hsnHeaderX += cgstWidth;

      const sgstWidth = getHsnColWidth(3);
      doc.fontSize(7).font("Helvetica-Bold");
      const sgstTextWidth = doc.widthOfString("SGST");
      doc.text(
        "SGST",
        hsnHeaderX + (sgstWidth - sgstTextWidth) / 2,
        currentY + 2
      );

      doc.fontSize(6);
      doc.text("%", hsnHeaderX + 10, currentY + 9);
      doc.text("Amount (Rs.)", hsnHeaderX + 25, currentY + 9);

      hsnHeaderX += sgstWidth;
    }

    renderTableCell(
      doc,
      "Total",
      hsnHeaderX,
      currentY + 4,
      getHsnColWidth(hsnTotalColumnIndex),
      {
        align: "center",
        fontSize: 7,
        bold: true,
      }
    );

    // Draw vertical borders for header
    hsnBorderPositions.forEach((pos) => {
      doc
        .moveTo(margin + pos, currentY)
        .lineTo(margin + pos, currentY + 15)
        .stroke("#0371C1");
    });

    currentY += 20;

    // HSN Table Rows
    if (hsnSummary && hsnSummary.length > 0) {
      hsnSummary.forEach((hsnItem) => {
        if (currentY > pageHeight - 150) {
          addNewPage();
          currentY = margin + 20;
        }

        const hsnRowHeight = 15;
        const hsnRowStartY = currentY;
        doc
          .rect(margin, currentY, hsnTableWidth, hsnRowHeight)
          .stroke("#0371C1");

        let hsnX = margin;
        const hsnCellY = currentY + 4;

        // HSN Code
        renderTableCell(
          doc,
          hsnItem.hsnCode,
          hsnX,
          hsnCellY,
          getHsnColWidth(0),
          {
            align: "center",
            fontSize: 7,
          }
        );
        hsnX += getHsnColWidth(0);

        // Taxable Value - No background fill
        renderTableCell(
          doc,
          formatCurrency(hsnItem.taxableValue),
          hsnX,
          hsnCellY,
          getHsnColWidth(1),
          {
            align: "right",
            fontSize: 7,
          }
        );
        hsnX += getHsnColWidth(1);

        if (showIGST) {
          const igstWidth = getHsnColWidth(2);
          const halfWidth = igstWidth / 2;

          doc.fontSize(7).font("Helvetica");
          doc.text(hsnItem.taxRate.toString(), hsnX + 10, hsnCellY);
          doc.text(
            formatCurrency(hsnItem.taxAmount),
            hsnX + halfWidth,
            hsnCellY,
            {
              width: halfWidth - 5,
              align: "right",
            }
          );

          hsnX += igstWidth;
        } else if (showCGSTSGST) {
          const cgstWidth = getHsnColWidth(2);
          const cgstHalfWidth = cgstWidth / 2;

          doc.fontSize(7).font("Helvetica");
          doc.text((hsnItem.taxRate / 2).toString(), hsnX + 10, hsnCellY);
          doc.text(
            formatCurrency(hsnItem.cgstAmount),
            hsnX + cgstHalfWidth,
            hsnCellY,
            {
              width: cgstHalfWidth - 5,
              align: "right",
            }
          );

          hsnX += cgstWidth;

          const sgstWidth = getHsnColWidth(3);
          const sgstHalfWidth = sgstWidth / 2;

          doc.text((hsnItem.taxRate / 2).toString(), hsnX + 10, hsnCellY);
          doc.text(
            formatCurrency(hsnItem.sgstAmount),
            hsnX + sgstHalfWidth,
            hsnCellY,
            {
              width: sgstHalfWidth - 5,
              align: "right",
            }
          );

          hsnX += sgstWidth;
        }

        // Total - No background fill
        renderTableCell(
          doc,
          formatCurrency(hsnItem.total),
          hsnX,
          hsnCellY,
          getHsnColWidth(hsnTotalColumnIndex),
          {
            align: "right",
            fontSize: 7,
          }
        );

        // Draw vertical borders
        hsnBorderPositions.forEach((pos) => {
          doc
            .moveTo(margin + pos, hsnRowStartY)
            .lineTo(margin + pos, hsnRowStartY + hsnRowHeight)
            .stroke("#0371C1");
        });

        currentY += hsnRowHeight;
      });

      // HSN Total Row
      const hsnTotalRowHeight = 15;
      const hsnTotalStartY = currentY;

      // Remove background fill that was causing black color
      doc
        .rect(margin, currentY, hsnTableWidth, hsnTotalRowHeight)
        .stroke("#0371C1");

      doc
        .fontSize(template1Styles.hsnTaxTotalCell.fontSize)
        .font("Helvetica-Bold");
      let hsnTotalX = margin;
      const hsnTotalCellY = currentY + 4;

      renderTableCell(
        doc,
        "Total",
        hsnTotalX,
        hsnTotalCellY,
        getHsnColWidth(0),
        {
          align: "center",
          fontSize: 7,
          bold: true,
        }
      );
      hsnTotalX += getHsnColWidth(0);

      renderTableCell(
        doc,
        formatCurrency(totalTaxable),
        hsnTotalX,
        hsnTotalCellY,
        getHsnColWidth(1),
        {
          align: "right",
          fontSize: 7,
          bold: true,
        }
      );
      hsnTotalX += getHsnColWidth(1);

      if (showIGST) {
        const igstWidth = getHsnColWidth(2);
        doc.fontSize(7).font("Helvetica-Bold");
        doc.text(formatCurrency(totalIGST), hsnTotalX + 25, hsnTotalCellY);
        hsnTotalX += igstWidth;
      } else if (showCGSTSGST) {
        const cgstWidth = getHsnColWidth(2);
        doc.fontSize(7).font("Helvetica-Bold");
        doc.text(formatCurrency(totalCGST), hsnTotalX + 25, hsnTotalCellY);
        hsnTotalX += cgstWidth;

        const sgstWidth = getHsnColWidth(3);
        doc.text(formatCurrency(totalSGST), hsnTotalX + 25, hsnTotalCellY);
        hsnTotalX += sgstWidth;
      }

      renderTableCell(
        doc,
        formatCurrency(totalAmount),
        hsnTotalX,
        hsnTotalCellY,
        getHsnColWidth(hsnTotalColumnIndex),
        {
          align: "right",
          fontSize: 7,
          bold: true,
        }
      );

      // Draw vertical borders
      hsnBorderPositions.forEach((pos) => {
        doc
          .moveTo(margin + pos, hsnTotalStartY)
          .lineTo(margin + pos, hsnTotalStartY + hsnTotalRowHeight)
          .stroke("#0371C1");
      });

      currentY += 20;
    }
  }

  // BOTTOM SECTION
  const bottomSectionHeight = 120;
  const leftSectionWidth = contentWidth * 0.65;
  const rightSectionWidth = contentWidth * 0.35;

  // Check if we need a new page for bottom section
  if (currentY > pageHeight - bottomSectionHeight - 50) {
    addNewPage();
  }

  // Main container
  doc
    .rect(margin, currentY, contentWidth, bottomSectionHeight)
    .stroke("#0371C1");

  // Vertical divider
  doc
    .moveTo(margin + leftSectionWidth, currentY)
    .lineTo(margin + leftSectionWidth, currentY + bottomSectionHeight)
    .stroke("#0371C1");

  // Left Section - Bank Details & Terms
  const leftSectionX = margin;
  let leftSectionY = currentY + 5;

  if (transaction.type !== "proforma" && isBankDetailAvailable) {
    const bankDetailsX = leftSectionX + 5;
    let bankY = leftSectionY;

    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Bank Details:", bankDetailsX, bankY);
    bankY += 12;

    doc.fontSize(8).font("Helvetica");

    const bankInfo = [];

    if (bankData?.bankName) {
      bankInfo.push({
        label: "Name:",
        value: capitalizeWords(bankData.bankName),
      });
    }
    if (bankData?.accountNo) {
      bankInfo.push({ label: "Acc. No:", value: bankData.accountNo });
    }
    if (bankData?.ifscCode) {
      bankInfo.push({ label: "IFSC:", value: bankData.ifscCode });
    }
    if (bankData?.branchAddress) {
      bankInfo.push({
        label: "Branch:",
        value: bankData.branchAddress,
        multiLine: true,
      });
    }
    if (bankData?.upiDetails?.upiId) {
      bankInfo.push({ label: "UPI ID:", value: bankData.upiDetails.upiId });
    }
    if (bankData?.upiDetails?.upiName) {
      bankInfo.push({ label: "UPI Name:", value: bankData.upiDetails.upiName });
    }
    if (bankData?.upiDetails?.upiMobile) {
      bankInfo.push({
        label: "UPI Mobile:",
        value: bankData.upiDetails.upiMobile,
      });
    }

    bankInfo.forEach((item) => {
      doc.font("Helvetica-Bold");
      doc.text(item.label, bankDetailsX, bankY, { continued: true });
      doc.font("Helvetica");

      if (item.multiLine) {
        const lines = wrapText(doc, item.value, leftSectionWidth - 90);
        doc.text("");
        lines.forEach((line, idx) => {
          doc.text(line, bankDetailsX + 50, bankY + idx * 10, {
            width: leftSectionWidth - 90,
          });
        });
        bankY += lines.length * 10;
      } else {
        doc.text(item.value);
        bankY += 10;
      }
    });

    // QR Code
    if (bankData?.qrCode) {
      try {
        const qrX = leftSectionX + leftSectionWidth - 95;
        const qrY = currentY + 15;

        doc.image(`${process.env.BASE_URL || ""}${bankData.qrCode}`, qrX, qrY, {
          width: 80,
          height: 80,
        });

        doc.fontSize(7).font("Helvetica-Bold");
        doc.text("QR Code", qrX + 20, qrY + 85);
      } catch (error) {
        console.log("QR code not found:", error.message);
      }
    }

    leftSectionY = bankY + 10;
  }

  // Terms and Conditions
  if (transaction?.notes) {
    // Top border for terms section
    doc
      .moveTo(leftSectionX + 5, leftSectionY)
      .lineTo(leftSectionX + leftSectionWidth - 5, leftSectionY)
      .stroke("#0371C1");

    // Terms title
    doc.fontSize(8).font("Helvetica-Bold");
    doc.text("Terms & Conditions:", leftSectionX + 5, leftSectionY + 5);

    // Parse and render HTML content
    try {
      const parsedElements = parseHtmlToElements(transaction.notes, 8);
      const termsContentY = leftSectionY + 15;
      renderParsedElementsForPDFKit(
        parsedElements,
        doc,
        leftSectionX + 5,
        termsContentY,
        leftSectionWidth - 15
      );
    } catch (error) {
      console.log("Error rendering notes:", error.message);
      // Fallback to plain text if HTML parsing fails
      doc.fontSize(7).font("Helvetica");
      doc.text(transaction.notes, leftSectionX + 5, leftSectionY + 15, {
        width: leftSectionWidth - 15,
      });
    }
  }

  // Right Section - Totals & Signature
  const rightSectionX = margin + leftSectionWidth;
  let rightY = currentY + 5;

  doc.fontSize(template1Styles.label.fontSize).font("Helvetica-Bold");

  // Taxable Amount
  doc.text("Taxable Amount", rightSectionX + 5, rightY);
  doc.text(
    `Rs.${formatCurrency(totalTaxable)}`,
    rightSectionX + rightSectionWidth - 55,
    rightY
  );
  rightY += 12;

  // Total Tax
  if (isGSTApplicable) {
    doc.text("Total Tax", rightSectionX + 5, rightY);
    const totalTax = showIGST ? totalIGST : totalCGST + totalSGST;
    doc.text(
      `Rs.${formatCurrency(totalTax)}`,
      rightSectionX + rightSectionWidth - 55,
      rightY
    );
    rightY += 12;
  }

  // Total Amount - Highlighted
  const totalAmountY = rightY;
  doc
    .rect(rightSectionX, totalAmountY, rightSectionWidth, 15)
    .stroke("#0371C1");

  const totalLabel = isGSTApplicable
    ? "Total Amount After Tax"
    : "Total Amount";
  doc.fontSize(template1Styles.label.fontSize).font("Helvetica-Bold");
  doc.text(totalLabel, rightSectionX + 5, totalAmountY + 5);
  doc.text(
    `Rs.${formatCurrency(totalAmount)}`,
    rightSectionX + rightSectionWidth - 55,
    totalAmountY + 5
  );

  rightY += 25;

  // Signature Block
  const signatureBlockY = rightY;
  doc.fontSize(9).font("Helvetica-Bold");

  const sigText = `For ${capitalizeWords(companyName)}`;
  const sigTextWidth = doc.widthOfString(sigText);
  doc.text(
    sigText,
    rightSectionX + (rightSectionWidth - sigTextWidth) / 2,
    signatureBlockY
  );

  // Signature space and line
  const signatureSpaceY = signatureBlockY + 15;
  const signatureLineLength = rightSectionWidth * 0.9;
  const signatureLineStartX =
    rightSectionX + (rightSectionWidth - signatureLineLength) / 2;

  doc
    .moveTo(signatureLineStartX, signatureSpaceY + 25)
    .lineTo(signatureLineStartX + signatureLineLength, signatureSpaceY + 25)
    .stroke("#0371C1");

  doc.fontSize(7).font("Helvetica");
  const authSigText = "Authorised Signatory";
  const authSigWidth = doc.widthOfString(authSigText);
  doc.text(
    authSigText,
    rightSectionX + (rightSectionWidth - authSigWidth) / 2,
    signatureSpaceY + 30
  );

  // Page Number at the bottom
  doc.fontSize(template1Styles.pageNumber.fontSize).font("Helvetica");
  doc.text(
    `${currentPage} / ${currentPage} page`,
    pageWidth - margin - 60,
    pageHeight - margin - 10,
    { align: "right" }
  );

  console.log("=== PDF GENERATION COMPLETED ===");
  console.log("Final Total Amount:", totalAmount);
};

module.exports = { generateTemplate1 };
