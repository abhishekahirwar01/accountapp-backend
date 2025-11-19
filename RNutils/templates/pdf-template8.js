// backend/templates/template8.js
const {
  deriveTotals,
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  getItemsBody,
  calculateGST,
  getUnifiedLines,
  getStateCode,
  prepareTemplate8Data,
  numberToWords,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElements,
} = require("../HtmlNoteRendrer");

// Template8 styles matching frontend exactly
const template8Styles = {
  page: {
    padding: 25,
    paddingBottom: 34,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  section: {
    marginBottom: 20,
  },
  header: {
    marginBottom: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2583C6",
  },
  grayColor: {
    color: "#262626",
  },
  companyName: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 2,
    color: "#232323",
  },
  addressText: {
    fontSize: 9,
    marginBottom: 3,
    lineHeight: 1.2,
  },
  normalText: {
    fontSize: 8,
    marginBottom: 2,
  },
  boldText: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 2,
  },
  sectionHeader: {
    fontSize: 11,
    marginBottom: 3,
  },
  tableHeader: {
    backgroundColor: "#2583C6",
    color: "#FFFFFF",
    fontSize: 9,
  },
  tableCell: {
    fontSize: 8,
    padding: 3,
  },
  tableCellSize7: {
    fontSize: 7,
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  totalsLeft: {
    fontSize: 8,
  },
  totalsRight: {
    fontSize: 10,
    textAlign: "right",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  smallRs: {
    fontSize: 10,
  },
  pageNumber: {
    fontSize: 8,
    textAlign: "right",
  },
};

// Helper function to render parsed elements for PDFKit
const renderParsedElementsForPDFKit = (elements, pdfDoc, x, y, maxWidth) => {
  let currentY = y;

  elements.forEach((element) => {
    if (element.type === "text") {
      const lines = pdfDoc.splitTextToSize(element.content, maxWidth);
      pdfDoc.fontSize(element.fontSize || 8);

      if (element.fontWeight === "bold") {
        pdfDoc.font("Helvetica-Bold");
      } else {
        pdfDoc.font("Helvetica");
      }

      pdfDoc.text(lines, x, currentY);
      currentY += lines.length * (element.lineHeight || 10);
    }
  });

  return currentY;
};

const generateTemplate8 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;
  let currentPage = 1;

  const {
    totals,
    totalTaxable,
    totalAmount,
    items,
    totalItems,
    totalQty,
    itemsBody,
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

  const logoSrc = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  const shouldHideBankDetails = transaction.type === "proforma";

  // Define column widths based on GST applicability (exact same as frontend)
  const getColWidths = () => {
    if (!isGSTApplicable) {
      return [35, 150, 60, 60, 50, 100, 135];
    } else if (showIGST) {
      return [35, 120, 50, 70, 80, 90, 44, 90, 100];
    } else {
      return [30, 100, 50, 50, 45, 60, 40, 60, 40, 60, 70];
    }
  };

  const colWidths = getColWidths();
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);

  const getTotalColumnIndex = () => {
    if (!isGSTApplicable) return 6;
    if (showIGST) return 8;
    return 10;
  };

  const totalColumnIndex = getTotalColumnIndex();

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage();
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Draw Header (exact same as frontend)
  const drawHeader = () => {
    // Title
    pdfDoc
      .fontSize(template8Styles.title.fontSize)
      .font("Helvetica-Bold")
      .fillColor(template8Styles.title.color);
    pdfDoc.text(
      transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : isGSTApplicable
        ? "TAX INVOICE"
        : "INVOICE",
      margin,
      currentY
    );

    // Company Name
    currentY += 15;
    pdfDoc
      .fontSize(template8Styles.companyName.fontSize)
      .fillColor(template8Styles.companyName.color);
    pdfDoc.text(
      capitalizeWords(
        company?.businessName || company?.companyName || "Company Name"
      ),
      margin,
      currentY
    );

    // Company Details
    currentY += 10;
    pdfDoc
      .fontSize(template8Styles.addressText.fontSize)
      .font("Helvetica")
      .fillColor(template8Styles.grayColor.color);

    if (company?.gstin) {
      pdfDoc.text(`GSTIN ${company.gstin}`, margin, currentY);
      currentY += 8;
    }

    pdfDoc.text(
      capitalizeWords(company?.address || "Address Line 1"),
      margin,
      currentY
    );
    currentY += 8;
    pdfDoc.text(capitalizeWords(company?.City || "City"), margin, currentY);
    currentY += 8;
    pdfDoc.text(
      `${capitalizeWords(company?.addressState || "State")} - ${
        company?.Pincode || "Pincode"
      }`,
      margin,
      currentY
    );
    currentY += 8;

    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company.mobileNumber)
      : company?.Telephone
      ? formatPhoneNumber(company.Telephone)
      : "Phone";
    pdfDoc.text(`Phone ${phoneText}`, margin, currentY);

    // Logo
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, pageWidth - margin - 70, margin, {
          width: 70,
          height: 70,
        });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Blue Divider
    currentY += 15;
    pdfDoc
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .stroke("#2583C6");
    currentY += 5;
  };

  // Draw Two Column Section (exact same as frontend)
  const drawTwoColumnSection = () => {
    const leftColumnWidth = contentWidth * 0.7;
    const rightColumnWidth = contentWidth * 0.3;

    // Left Side - Customer Details and Shipping Address
    pdfDoc
      .fontSize(template8Styles.sectionHeader.fontSize)
      .font("Helvetica-Bold")
      .fillColor(template8Styles.grayColor.color);
    pdfDoc.text("Customer Details | Billed to :", margin, currentY);

    currentY += 10;
    pdfDoc.fontSize(10).text(capitalizeWords(party?.name), margin, currentY);

    currentY += 8;
    const billingAddress = getBillingAddress(party);
    const billingLines = pdfDoc.splitTextToSize(
      capitalizeWords(billingAddress),
      leftColumnWidth * 0.7
    );
    pdfDoc.fontSize(9).font("Helvetica").text(billingLines, margin, currentY);
    currentY += billingLines.length * 8;

    // Customer contact details
    if (party?.contactNumber) {
      pdfDoc.text(
        `Phone: ${formatPhoneNumber(party.contactNumber)}`,
        margin,
        currentY
      );
      currentY += 8;
    }

    pdfDoc.text(`GSTIN: ${party?.gstin || "-"}`, margin, currentY);
    currentY += 8;
    pdfDoc.text(`PAN: ${party?.pan || "-"}`, margin, currentY);
    currentY += 8;

    const supplyState = shippingAddress?.state || party?.state;
    const stateCode = supplyState ? getStateCode(supplyState) : "-";
    pdfDoc.text(
      `Place of Supply: ${supplyState ? `${supplyState} (${stateCode})` : "-"}`,
      margin,
      currentY
    );
    currentY += 15;

    // Shipping Address
    pdfDoc
      .font("Helvetica-Bold")
      .text("Details of Consignee | Shipped to :", margin, currentY);
    currentY += 10;
    pdfDoc
      .fontSize(10)
      .text(capitalizeWords(party?.name || " "), margin, currentY);

    currentY += 8;
    const shippingAddressStr = getShippingAddress(
      shippingAddress,
      billingAddress
    );
    const shippingLines = pdfDoc.splitTextToSize(
      capitalizeWords(shippingAddressStr),
      leftColumnWidth * 0.7
    );
    pdfDoc.fontSize(9).font("Helvetica").text(shippingLines, margin, currentY);
    currentY += shippingLines.length * 8;

    if (company?.Country) {
      pdfDoc.text(`Country: ${company.Country}`, margin, currentY);
      currentY += 8;
    }

    if (party?.contactNumber) {
      pdfDoc.text(
        `Phone: ${formatPhoneNumber(party.contactNumber)}`,
        margin,
        currentY
      );
      currentY += 8;
    }

    pdfDoc.text(`GSTIN: ${party?.gstin || "-"}`, margin, currentY);
    currentY += 8;

    const shipState = shippingAddress?.state || party?.state;
    const shipStateCode = shipState ? getStateCode(shipState) : "-";
    pdfDoc.text(
      `State: ${shipState ? `${shipState} (${shipStateCode})` : "-"}`,
      margin,
      currentY
    );

    // Right Side - Invoice Details
    const rightX = pageWidth - margin - rightColumnWidth;
    let rightY = currentY - 80;

    pdfDoc.fontSize(9).font("Helvetica-Bold");
    pdfDoc.text("Invoice #:", rightX, rightY);
    pdfDoc.text(
      transaction?.invoiceNumber?.toString() || "2",
      pageWidth - margin,
      rightY,
      { align: "right" }
    );
    rightY += 8;

    pdfDoc.text("Invoice Date:", rightX, rightY);
    const invoiceDate = transaction?.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "14-Oct-2022";
    pdfDoc.text(invoiceDate, pageWidth - margin, rightY, { align: "right" });
    rightY += 8;

    pdfDoc.text("P.O. No.:", rightX, rightY);
    pdfDoc.text(transaction?.poNumber || "-", pageWidth - margin, rightY, {
      align: "right",
    });
    rightY += 8;

    pdfDoc.text("P.O. Date:", rightX, rightY);
    const poDate = transaction?.poDate
      ? new Date(transaction.poDate).toLocaleDateString("en-GB")
      : "-";
    pdfDoc.text(poDate, pageWidth - margin, rightY, { align: "right" });
    rightY += 8;

    if (isGSTApplicable) {
      pdfDoc.text("E-Way No.:", rightX, rightY);
      pdfDoc.text(transaction?.ewayNumber || "-", pageWidth - margin, rightY, {
        align: "right",
      });
    }

    currentY += 40;
  };

  // Draw Table (exact same as frontend)
  const drawTable = () => {
    const tableStartY = currentY;

    // Table Headers
    pdfDoc
      .rect(margin, tableStartY, tableWidth, 15)
      .fillAndStroke("#2583C6", "#2583C6");

    let headerX = margin;
    pdfDoc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF");

    const headers = [];
    if (!isGSTApplicable) {
      headers.push(
        "Sr.No",
        "Name of Product / Service",
        "HSN/SAC",
        "Rate (Rs.)",
        "Qty",
        "Taxable Value (Rs.)",
        "Total (Rs.)"
      );
    } else if (showIGST) {
      headers.push(
        "Sr.No",
        "Name of Product / Service",
        "HSN/SAC",
        "Rate (Rs.)",
        "Qty",
        "Taxable Value (Rs.)",
        "IGST%",
        "IGST Amount (Rs.)",
        "Total (Rs.)"
      );
    } else {
      headers.push(
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
        "Total (Rs.)"
      );
    }

    headers.forEach((header, index) => {
      const align = index >= 3 ? "center" : "left";
      pdfDoc.text(header, headerX + 4, tableStartY + 5, {
        width: colWidths[index] - 8,
        align: align,
      });
      headerX += colWidths[index];
    });

    currentY = tableStartY + 15;

    // Table Rows
    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 150) {
        addNewPage();
        currentY = margin + 150;
      }

      // Draw row background with border
      pdfDoc.rect(margin, currentY, tableWidth, 15).stroke("#bfbfbf");

      let cellX = margin;
      pdfDoc.fontSize(7).font("Helvetica").fillColor("#262626");

      const rowData = [
        (index + 1).toString(),
        capitalizeWords(item.name),
        item.code || "-",
        formatCurrency(item.pricePerUnit || 0),
        item.itemType === "service" ? "-" : (item.quantity || 0).toString(),
        formatCurrency(item.taxableValue),
      ];

      if (showIGST) {
        rowData.push(item.gstRate.toFixed(2), formatCurrency(item.igst));
      } else if (showCGSTSGST) {
        rowData.push(
          (item.gstRate / 2).toFixed(2),
          formatCurrency(item.cgst),
          (item.gstRate / 2).toFixed(2),
          formatCurrency(item.sgst)
        );
      }

      rowData.push(formatCurrency(item.total));

      rowData.forEach((cell, cellIndex) => {
        const align = cellIndex >= 3 ? "center" : "left";
        pdfDoc.text(cell, cellX + 4, currentY + 5, {
          width: colWidths[cellIndex] - 8,
          align: align,
        });
        cellX += colWidths[cellIndex];
      });

      currentY += 15;
    });

    // Bottom border
    pdfDoc
      .moveTo(margin, currentY)
      .lineTo(margin + tableWidth, currentY)
      .stroke("#d3d3d3");

    currentY += 10;
  };

  // Draw Footer Sections (exact same as frontend)
  const drawFooter = () => {
    // Totals Section
    pdfDoc.fontSize(8).font("Helvetica").fillColor("#262626");
    pdfDoc.text(
      `Total Items / Qty : ${totalItems} / ${totalQty}`,
      margin,
      currentY
    );

    const totalsRightX = pageWidth - margin;
    let totalsY = currentY;

    if (isGSTApplicable) {
      if (showIGST) {
        pdfDoc.text("IGST", totalsRightX - 100, totalsY, { align: "right" });
        pdfDoc.text(
          `Rs ${totalIGST.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          totalsRightX,
          totalsY,
          { align: "right" }
        );
        totalsY += 7;
      }
      if (showCGSTSGST) {
        pdfDoc.text("CGST", totalsRightX - 100, totalsY, { align: "right" });
        pdfDoc.text(
          `Rs ${totalCGST.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          totalsRightX,
          totalsY,
          { align: "right" }
        );
        totalsY += 7;
        pdfDoc.text("SGST", totalsRightX - 100, totalsY, { align: "right" });
        pdfDoc.text(
          `Rs ${totalSGST.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          totalsRightX,
          totalsY,
          { align: "right" }
        );
        totalsY += 7;
      }
    }

    pdfDoc.font("Helvetica-Bold");
    const totalLabel = isGSTApplicable
      ? "Total Amount After Tax"
      : "Total Amount";
    pdfDoc.text(totalLabel, totalsRightX - 100, totalsY, { align: "right" });
    pdfDoc.text(
      `Rs ${totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      totalsRightX,
      totalsY,
      { align: "right" }
    );

    // Total in words
    currentY += 20;
    pdfDoc.font("Helvetica-Bold").text("Total in words :", margin, currentY);
    pdfDoc
      .font("Helvetica")
      .text(numberToWords(totalAmount), margin + 60, currentY);

    currentY += 15;

    // Gray Divider
    pdfDoc
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .stroke("#bfbfbf");
    currentY += 10;

    // Bank Details and Signature Section
    if (!shouldHideBankDetails) {
      // Bank Details
      pdfDoc.font("Helvetica-Bold").text("Bank Details:", margin, currentY);
      currentY += 8;

      if (bank && typeof bank === "object" && bank.bankName) {
        if (bank.bankName) {
          pdfDoc.text("Name:", margin, currentY);
          pdfDoc.text(capitalizeWords(bank.bankName), margin + 70, currentY);
          currentY += 8;
        }
        if (bank.branchAddress) {
          pdfDoc.text("Branch:", margin, currentY);
          pdfDoc.text(
            capitalizeWords(bank.branchAddress),
            margin + 70,
            currentY
          );
          currentY += 8;
        }
        if (bank.ifscCode) {
          pdfDoc.text("IFSC:", margin, currentY);
          pdfDoc.text(capitalizeWords(bank.ifscCode), margin + 70, currentY);
          currentY += 8;
        }
        if (bank.accountNo) {
          pdfDoc.text("Acc. No:", margin, currentY);
          pdfDoc.text(bank.accountNo, margin + 70, currentY);
          currentY += 8;
        }
        if (bank.upiDetails?.upiId) {
          pdfDoc.text("UPI ID:", margin, currentY);
          pdfDoc.text(bank.upiDetails.upiId, margin + 70, currentY);
          currentY += 8;
        }
        if (bank.upiDetails?.upiName) {
          pdfDoc.text("UPI Name:", margin, currentY);
          pdfDoc.text(bank.upiDetails.upiName, margin + 70, currentY);
          currentY += 8;
        }
        if (bank.upiDetails?.upiMobile) {
          pdfDoc.text("UPI Mobile:", margin, currentY);
          pdfDoc.text(bank.upiDetails.upiMobile, margin + 70, currentY);
          currentY += 8;
        }
      }

      // QR Code
      if (bank?.qrCode) {
        try {
          const qrX = margin + 240;
          const qrY = currentY - 120;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bank.qrCode}`,
            qrX,
            qrY,
            { width: 80, height: 80 }
          );
          pdfDoc
            .fontSize(9)
            .font("Helvetica-Bold")
            .text("QR Code", qrX + 25, qrY + 85);
        } catch (error) {
          console.log("QR code not found");
        }
      }

      // Signature Block
      const signatureX = pageWidth - margin - 100;
      const signatureY = currentY - 120;
      pdfDoc
        .fontSize(9)
        .text(
          `For ${capitalizeWords(company?.businessName || "Company")}`,
          signatureX,
          signatureY,
          { align: "right" }
        );

      // Signature box
      pdfDoc.rect(signatureX, signatureY + 10, 100, 50).stroke("#ddd");
      pdfDoc.text("Authorised Signatory", signatureX + 25, signatureY + 65, {
        align: "center",
      });

      currentY += 50;
    }

    // Terms and Conditions
    if (transaction?.notes) {
      currentY += 10;
      const parsedElements = parseHtmlToElements(transaction.notes, 8);
      renderParsedElementsForPDFKit(
        parsedElements,
        pdfDoc,
        margin,
        currentY,
        contentWidth
      );
    }

    // Page Number
    pdfDoc
      .fontSize(8)
      .text(
        `${currentPage} / ${currentPage} page`,
        pageWidth - margin - 20,
        pageHeight - margin - 10,
        { align: "right" }
      );
  };

  // Main execution
  drawHeader();
  drawTwoColumnSection();
  drawTable();
  drawFooter();
};

module.exports = { generateTemplate8 };
