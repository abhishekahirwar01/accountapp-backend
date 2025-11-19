// backend/templates/template12.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  getStateCode,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElementsForPDFKit,
} = require("../HtmlNoteRendrer");
const { formatPhoneNumber, formatQuantity } = require("../pdf-utils");

/** Number to words (Indian system) */
const convertNumberToWords = (num) => {
  if (num === 0) return "Zero";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return (
        a[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + inWords(n % 100) : "")
      );
    if (n < 100000)
      return (
        inWords(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + inWords(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        inWords(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + inWords(n % 100000) : "")
      );
    return (
      inWords(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + inWords(n % 10000000) : "")
    );
  };

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let words = inWords(integerPart);

  if (decimalPart > 0) {
    words += " and " + inWords(decimalPart) + " Paise";
  }

  return words;
};

const generateTemplate12 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;
  let currentPage = 1;

  const {
    totalTaxable,
    totalAmount,
    totalCGST,
    totalSGST,
    totalIGST,
    totalItems,
    totalQty,
    isGSTApplicable,
    showIGST,
    showCGSTSGST,
    itemsWithGST,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  const logoSrc = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  const showNoGST = !isGSTApplicable || (!showIGST && !showCGSTSGST);
  const shouldHideBankDetails = transaction.type === "proforma";

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage();
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Draw Header
  const drawHeader = () => {
    // Logo and Company Details
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, margin, currentY, { width: 70, height: 70 });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Company Details (right aligned)
    const companyDetailsX = pageWidth - margin - 200;
    pdfDoc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        capitalizeWords(
          company?.businessName || company?.companyName || "Company Name"
        ),
        companyDetailsX,
        currentY,
        { width: 200, align: "right" }
      );

    currentY += 15;

    if (company?.gstin) {
      pdfDoc
        .fontSize(8)
        .font("Helvetica")
        .text(`GSTIN: ${company.gstin}`, companyDetailsX, currentY, {
          width: 200,
          align: "right",
        });
      currentY += 8;
    }

    pdfDoc.text(
      capitalizeWords(company?.address || "Address Line 1"),
      companyDetailsX,
      currentY,
      { width: 200, align: "right" }
    );
    currentY += 8;

    pdfDoc.text(
      `${capitalizeWords(company?.City || "City")}, ${capitalizeWords(
        company?.addressState || "State"
      )} - ${company?.Pincode || "Pincode"}`,
      companyDetailsX,
      currentY,
      { width: 200, align: "right" }
    );

    currentY += 25;

    // Title
    pdfDoc
      .fontSize(15)
      .font("Helvetica-Bold")
      .fillColor("#1976d2")
      .text(
        transaction.type === "proforma"
          ? "PROFORMA INVOICE"
          : isGSTApplicable
          ? "TAX INVOICE"
          : "INVOICE",
        margin,
        currentY,
        { width: contentWidth, align: "center" }
      );

    currentY += 20;

    // Blue divider line
    pdfDoc
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .stroke("#1976d2");

    currentY += 12;

    // Customer Details | Consignee | Invoice Info - 3 Columns
    const col1Width = contentWidth * 0.4;
    const col2Width = contentWidth * 0.4;
    const col3Width = contentWidth * 0.2;

    // Customer Details (Left)
    pdfDoc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#000")
      .text("Customer Details | Billed to:", margin, currentY);
    currentY += 10;

    const customerDetails = [
      { label: "Name:", value: capitalizeWords(party?.name) || "-" },
      {
        label: "Phone:",
        value: party?.contactNumber
          ? formatPhoneNumber(party.contactNumber)
          : "-",
      },
      {
        label: "Address:",
        value: capitalizeWords(getBillingAddress(party)),
      },
      { label: "PAN:", value: party?.pan || "-" },
      { label: "GSTIN:", value: party?.gstin || "-" },
      {
        label: "Place of Supply:",
        value: shippingAddress?.state
          ? `${shippingAddress.state} (${
              getStateCode(shippingAddress.state) || "-"
            })`
          : party?.state
          ? `${party.state} (${getStateCode(party.state) || "-"})`
          : "-",
      },
    ];

    customerDetails.forEach((detail) => {
      pdfDoc.font("Helvetica-Bold").text(detail.label, margin, currentY);
      const lines = pdfDoc.splitTextToSize(detail.value, col1Width - 70);
      pdfDoc
        .font("Helvetica")
        .text(lines, margin + 65, currentY, { width: col1Width - 70 });
      currentY += lines.length * 8;
    });

    // Reset Y for middle column
    let middleY = currentY - customerDetails.length * 8 - 10;

    // Consignee Details (Middle)
    pdfDoc
      .font("Helvetica-Bold")
      .text(
        "Details of Consignee | Shipped to:",
        margin + col1Width,
        middleY
      );
    middleY += 10;

    const consigneeDetails = [
      {
        label: "Name:",
        value: capitalizeWords(
          (shippingAddress && shippingAddress.label) || party?.name || "-"
        ),
      },
      {
        label: "Address:",
        value: capitalizeWords(
          getShippingAddress(shippingAddress, getBillingAddress(party))
        ),
      },
      { label: "Country:", value: company?.Country || "-" },
      {
        label: "Phone:",
        value: formatPhoneNumber(
          (shippingAddress && shippingAddress.phone) ||
            (shippingAddress && shippingAddress.mobileNumber) ||
            party?.contactNumber ||
            "-"
        ),
      },
    ];

    if (isGSTApplicable) {
      consigneeDetails.push({
        label: "GSTIN:",
        value: (shippingAddress && shippingAddress.gstin) || "-",
      });
    }

    consigneeDetails.push({
      label: "State:",
      value: shippingAddress?.state
        ? `${shippingAddress.state} (${
            getStateCode(shippingAddress.state) || "-"
          })`
        : party?.state
        ? `${party.state} (${getStateCode(party.state) || "-"})`
        : "-",
    });

    consigneeDetails.forEach((detail) => {
      pdfDoc
        .font("Helvetica-Bold")
        .text(detail.label, margin + col1Width, middleY);
      const lines = pdfDoc.splitTextToSize(detail.value, col2Width - 60);
      pdfDoc
        .font("Helvetica")
        .text(lines, margin + col1Width + 60, middleY, {
          width: col2Width - 60,
        });
      middleY += lines.length * 8;
    });

    // Invoice Info (Right)
    const rightX = margin + col1Width + col2Width;
    let rightY = currentY - customerDetails.length * 8 - 10;

    const invoiceDetails = [
      { label: "Invoice #:", value: transaction?.invoiceNumber || "—" },
      {
        label: "Invoice Date:",
        value: transaction?.date
          ? new Date(transaction.date).toLocaleDateString("en-GB")
          : "—",
      },
      {
        label: "P.O. Date:",
        value: transaction?.dueDate
          ? new Date(transaction.dueDate).toLocaleDateString("en-GB")
          : "-",
      },
      { label: "E-Way No.:", value: "-" },
    ];

    invoiceDetails.forEach((detail) => {
      pdfDoc.font("Helvetica-Bold").text(detail.label, rightX, rightY);
      pdfDoc
        .font("Helvetica")
        .text(detail.value, rightX + 75, rightY, { width: col3Width - 75 });
      rightY += 8;
    });

    // Set currentY to the maximum of the three columns
    currentY = Math.max(currentY, middleY, rightY) + 15;
  };

  // Draw Main Items Table
  const drawMainTable = () => {
    const tableStartY = currentY;
    const colWidths = [30, 180, 60, 60, 60, 60]; // Sum: 450

    // Table Header
    pdfDoc.rect(margin, tableStartY, contentWidth, 12).fill("#1976d2");
    pdfDoc.fillColor("#fff").fontSize(8).font("Helvetica-Bold");

    const headers = [
      "Sr. No",
      "Name of Product / Service",
      "HSN/SAC",
      "Qty",
      "Rate (Rs.)",
      "Taxable Value(Rs.)",
    ];

    let headerX = margin;
    headers.forEach((header, index) => {
      pdfDoc.text(header, headerX + 2, tableStartY + 3, {
        width: colWidths[index] - 4,
        align: index === 1 ? "left" : "center",
      });
      headerX += colWidths[index];
    });

    currentY = tableStartY + 12;

    // Table Rows
    pdfDoc.fillColor("#000").font("Helvetica");
    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 200) {
        addNewPage();
        currentY = margin + 150;
      }

      // Draw row border
      pdfDoc
        .rect(margin, currentY, contentWidth, 15)
        .stroke("#1976d2")
        .fill("#fff");

      let cellX = margin;
      const rowData = [
        (index + 1).toString(),
        capitalizeWords(item.name),
        item.code || "-",
        item.itemType === "service"
          ? "-"
          : formatQuantity(item.quantity || 0, item.unit),
        item.pricePerUnit != null ? formatCurrency(item.pricePerUnit) : "-",
        formatCurrency(item.taxableValue || 0),
      ];

      rowData.forEach((cell, cellIndex) => {
        pdfDoc.text(cell, cellX + 2, currentY + 4, {
          width: colWidths[cellIndex] - 4,
          align: cellIndex === 1 ? "left" : "center",
        });
        cellX += colWidths[cellIndex];
      });

      currentY += 15;
    });

    currentY += 8;
  };

  // Draw Totals Section
  const drawTotals = () => {
    // Total Items/Qty
    pdfDoc
      .fontSize(8)
      .text(
        `Total Items / Qty: ${totalItems} / ${Number(totalQty || 0)}`,
        margin,
        currentY
      );
    currentY += 10;

    // Totals Box (right aligned)
    const totalsWidth = 200;
    const totalsX = pageWidth - margin - totalsWidth;

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("Taxable Amount:", totalsX, currentY);
    pdfDoc.text(`Rs.${formatCurrency(totalTaxable)}`, totalsX + 120, currentY, {
      align: "right",
    });
    currentY += 8;

    if (isGSTApplicable && showIGST) {
      pdfDoc.text("IGST:", totalsX, currentY);
      pdfDoc.text(`Rs.${formatCurrency(totalIGST)}`, totalsX + 120, currentY, {
        align: "right",
      });
      currentY += 8;
    }

    if (isGSTApplicable && showCGSTSGST) {
      pdfDoc.text("CGST:", totalsX, currentY);
      pdfDoc.text(`Rs.${formatCurrency(totalCGST)}`, totalsX + 120, currentY, {
        align: "right",
      });
      currentY += 8;

      pdfDoc.text("SGST:", totalsX, currentY);
      pdfDoc.text(`Rs.${formatCurrency(totalSGST)}`, totalsX + 120, currentY, {
        align: "right",
      });
      currentY += 8;
    }

    // Total Amount
    currentY += 2;
    pdfDoc
      .moveTo(totalsX, currentY)
      .lineTo(totalsX + totalsWidth, currentY)
      .stroke("#000");
    currentY += 4;

    pdfDoc.text("Total Amount:", totalsX, currentY);
    pdfDoc.text(`Rs.${formatCurrency(totalAmount)}`, totalsX + 120, currentY, {
      align: "right",
    });
    currentY += 12;

    // Total in words
    pdfDoc.text("Total (in words):", margin, currentY);
    pdfDoc
      .font("Helvetica")
      .text(
        `${convertNumberToWords(Math.round(totalAmount))} only`,
        margin + 70,
        currentY
      );
    currentY += 15;
  };

  // Draw GST Summary Table
  const drawGSTSummary = () => {
    if (currentY > pageHeight - 250) {
      addNewPage();
      currentY = margin + 150;
    }

    const tableStartY = currentY;
    let tableWidth = contentWidth;

    // Determine column structure based on GST type
    let colWidths = [];
    let headers = [];

    if (showIGST && !showNoGST) {
      colWidths = [80, 80, 60, 80, 80]; // Sum: 380
      headers = [
        "HSN/SAC",
        "Taxable Value (Rs.)",
        "IGST %",
        "IGST Amt (Rs.)",
        "Total (Rs.)",
      ];
    } else if (showCGSTSGST && !showNoGST) {
      colWidths = [60, 70, 50, 70, 50, 70, 70]; // Sum: 440
      headers = [
        "HSN/SAC",
        "Taxable Value (Rs.)",
        "CGST %",
        "CGST Amt (Rs.)",
        "SGST %",
        "SGST Amt (Rs.)",
        "Total (Rs.)",
      ];
    } else if (showNoGST) {
      colWidths = [80, 80, 80]; // Sum: 240
      headers = ["HSN/SAC", "Taxable Value (Rs.)", "Total (Rs.)"];
    }

    // Adjust table width and position for centering
    const actualTableWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const tableX = margin + (contentWidth - actualTableWidth) / 2;

    // Table Header
    pdfDoc
      .rect(tableX, tableStartY, actualTableWidth, 12)
      .fill("#1976d2");
    pdfDoc.fillColor("#fff").fontSize(8).font("Helvetica-Bold");

    let headerX = tableX;
    headers.forEach((header, index) => {
      pdfDoc.text(header, headerX + 2, tableStartY + 3, {
        width: colWidths[index] - 4,
        align: "center",
      });
      headerX += colWidths[index];
    });

    currentY = tableStartY + 12;

    // Table Rows
    pdfDoc.fillColor("#000").font("Helvetica").fontSize(8);
    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        currentY = margin + 150;
      }

      const taxable = item.taxableValue || 0;
      const totalLine =
        item.total ??
        taxable + (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0);

      // Draw row border
      pdfDoc
        .rect(tableX, currentY, actualTableWidth, 12)
        .stroke("#1976d2")
        .fill("#fff");

      let cellX = tableX;

      if (showIGST && !showNoGST) {
        const rowData = [
          item.code || "-",
          formatCurrency(taxable),
          Number(item.gstRate || 0).toFixed(2) + "%",
          formatCurrency(item.igst || 0),
          formatCurrency(totalLine),
        ];

        rowData.forEach((cell, cellIndex) => {
          pdfDoc.text(cell, cellX + 2, currentY + 3, {
            width: colWidths[cellIndex] - 4,
            align: "center",
          });
          cellX += colWidths[cellIndex];
        });
      } else if (showCGSTSGST && !showNoGST) {
        const halfRate = Number((item.gstRate || 0) / 2);
        const rowData = [
          item.code || "-",
          formatCurrency(taxable),
          halfRate.toFixed(2) + "%",
          formatCurrency(item.cgst || 0),
          halfRate.toFixed(2) + "%",
          formatCurrency(item.sgst || 0),
          formatCurrency(totalLine),
        ];

        rowData.forEach((cell, cellIndex) => {
          pdfDoc.text(cell, cellX + 2, currentY + 3, {
            width: colWidths[cellIndex] - 4,
            align: "center",
          });
          cellX += colWidths[cellIndex];
        });
      } else if (showNoGST) {
        const rowData = [
          item.code || "-",
          formatCurrency(taxable),
          formatCurrency(taxable),
        ];

        rowData.forEach((cell, cellIndex) => {
          const isBold = cellIndex === 2;
          pdfDoc.font(isBold ? "Helvetica-Bold" : "Helvetica");
          pdfDoc.text(cell, cellX + 2, currentY + 3, {
            width: colWidths[cellIndex] - 4,
            align: "center",
          });
          cellX += colWidths[cellIndex];
        });
      }

      currentY += 12;
    });

    // TOTAL row
    pdfDoc
      .rect(tableX, currentY, actualTableWidth, 12)
      .stroke("#1976d2")
      .fill("#fff");

    let totalX = tableX;
    pdfDoc.font("Helvetica-Bold");

    if (showIGST && !showNoGST) {
      const totalData = [
        "TOTAL",
        formatCurrency(totalTaxable),
        "",
        formatCurrency(totalIGST),
        formatCurrency(totalAmount),
      ];

      totalData.forEach((cell, cellIndex) => {
        pdfDoc.text(cell, totalX + 2, currentY + 3, {
          width: colWidths[cellIndex] - 4,
          align: "center",
        });
        totalX += colWidths[cellIndex];
      });
    } else if (showCGSTSGST && !showNoGST) {
      const totalData = [
        "TOTAL",
        formatCurrency(totalTaxable),
        "",
        formatCurrency(totalCGST),
        "",
        formatCurrency(totalSGST),
        formatCurrency(totalAmount),
      ];

      totalData.forEach((cell, cellIndex) => {
        pdfDoc.text(cell, totalX + 2, currentY + 3, {
          width: colWidths[cellIndex] - 4,
          align: "center",
        });
        totalX += colWidths[cellIndex];
      });
    } else if (showNoGST) {
      const totalData = [
        "TOTAL",
        formatCurrency(totalTaxable),
        formatCurrency(totalTaxable),
      ];

      totalData.forEach((cell, cellIndex) => {
        pdfDoc.text(cell, totalX + 2, currentY + 3, {
          width: colWidths[cellIndex] - 4,
          align: "center",
        });
        totalX += colWidths[cellIndex];
      });
    }

    currentY += 20;
  };

  // Draw Bank Details and Signature
  const drawBankAndSignature = () => {
    if (currentY > pageHeight - 150) {
      addNewPage();
      currentY = margin + 150;
    }

    const sectionStartY = currentY;

    if (!shouldHideBankDetails) {
      // Bank Details (Left - 50%)
      const bankWidth = contentWidth * 0.5;
      pdfDoc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Bank Details:", margin, sectionStartY);

      let bankY = sectionStartY + 10;

      if (bank && typeof bank === "object") {
        const bankDetails = [];
        
        if (bank.bankName) {
          bankDetails.push({ label: "Name:", value: capitalizeWords(bank.bankName) });
        }
        if (bank.ifscCode) {
          bankDetails.push({ label: "IFSC:", value: capitalizeWords(bank.ifscCode) });
        }
        if ((bank.accountNo || bank.accountNumber)) {
          bankDetails.push({ label: "Account No:", value: (bank.accountNo || bank.accountNumber) });
        }
        if (bank.branchAddress) {
          bankDetails.push({ label: "Branch:", value: capitalizeWords(bank.branchAddress) });
        }
        if (bank.upiDetails?.upiId) {
          bankDetails.push({ label: "UPI ID:", value: bank.upiDetails.upiId });
        }
        if (bank.upiDetails?.upiName) {
          bankDetails.push({ label: "UPI Name:", value: capitalizeWords(bank.upiDetails.upiName) });
        }
        if (bank.upiDetails?.upiMobile) {
          bankDetails.push({ label: "UPI Mobile:", value: bank.upiDetails.upiMobile });
        }

        bankDetails.forEach((detail) => {
          pdfDoc.font("Helvetica-Bold").text(detail.label, margin, bankY);
          pdfDoc
            .font("Helvetica")
            .text(detail.value, margin + 70, bankY, { width: bankWidth - 70 });
          bankY += 8;
        });
      } else {
        pdfDoc
          .font("Helvetica")
          .text("No bank details available", margin, bankY);
        bankY += 8;
      }

      // QR Code (Center - 25%)
      if (bank?.qrCode) {
        try {
          const qrX = margin + bankWidth + 20;
          const qrY = sectionStartY;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bank.qrCode}`,
            qrX,
            qrY,
            { width: 76, height: 76 }
          );
          pdfDoc
            .fontSize(9)
            .font("Helvetica-Bold")
            .text("QR Code", qrX + 25, qrY + 80);
        } catch (error) {
          console.log("QR code not found");
        }
      }
    }

    // Signature (Right - 25%)
    const signatureX = pageWidth - margin - contentWidth * 0.25;
    pdfDoc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(
        `For ${capitalizeWords(company?.businessName || "Company")}`,
        signatureX,
        sectionStartY,
        { width: contentWidth * 0.25, align: "right" }
      );

    pdfDoc
      .fontSize(8)
      .text("Authorised Signatory", signatureX, sectionStartY + 40, {
        width: contentWidth * 0.25,
        align: "right",
      });

    currentY = Math.max(sectionStartY + 60, currentY);
  };

  // Draw Terms and Conditions
  const drawTerms = () => {
    if (currentY > pageHeight - 100) {
      addNewPage();
      currentY = margin + 150;
    }

    if (transaction?.notes) {
      // Blue top border
      pdfDoc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke("#2583C6");

      currentY += 10;

      const parsedElements = parseHtmlToElements(transaction.notes, 8);
      currentY = renderParsedElementsForPDFKit(
        parsedElements,
        pdfDoc,
        margin,
        currentY,
        contentWidth
      );
    }
  };

  // Draw Page Number
  const drawPageNumber = () => {
    pdfDoc
      .fontSize(8)
      .fillColor("#666")
      .text(
        `Page ${currentPage} of ${currentPage}`,
        pageWidth - margin - 40,
        pageHeight - margin - 15,
        { align: "right" }
      );
  };

  // Main execution
  drawHeader();
  drawMainTable();
  drawTotals();
  drawGSTSummary();
  drawBankAndSignature();
  drawTerms();
  drawPageNumber();
};

module.exports = { generateTemplate12 };