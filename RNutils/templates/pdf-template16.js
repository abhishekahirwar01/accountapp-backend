// backend/templates/template16.js
const {
  renderNotes,
  getUnifiedLines,
  invNo,
  getBillingAddress,
  getShippingAddress,
  calculateGST,
  prepareTemplate8Data,
  formatCurrency,
  numberToWords,
  getStateCode,
  formatPhoneNumber,
  formatQuantity
} = require("../pdf-utils");
const { capitalizeWords, parseNotesHtml } = require("../utils");

const generateTemplate16 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const M = 30; // Reduced margin from 36 to 30
  const contentWidth = pageWidth - M * 2;

  let currentY = M;
  let currentPage = 1;

  // Use template8 data preparation logic
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

  const logoUrl = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  // Convert itemsWithGST to the format expected by template16
  const lines = itemsWithGST.map((item) => ({
    name: item.name,
    description: item.description || "",
    quantity: item.quantity || 0,
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

  const shippingAddressSource = shippingAddress;

  const billingAddress = capitalizeWords(getBillingAddress(party));
  const shippingAddressStr = capitalizeWords(
    getShippingAddress(shippingAddressSource, getBillingAddress(party))
  );

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

  const fmtDate = (d) =>
    d
      ? new Intl.DateTimeFormat("en-GB").format(new Date(d)).replace(/\//g, "-")
      : "N/A";

  const convertNumberToWords = (n) => {
    return numberToWords(n);
  };

  const companyGSTIN = _getGSTIN(company);
  const partyGSTIN = _getGSTIN(party);

  // ----------------- OPTIMIZED TABLE COLUMN WIDTHS -----------------
  const getColWidths = () => {
    if (showCGSTSGST) {
      // CGST/SGST layout: 11 columns - optimized widths
      return [28, 95, 42, 47, 32, 58, 34, 55, 34, 55, 55];
    } else if (showIGST) {
      // IGST layout: 9 columns - optimized widths
      return [28, 130, 48, 58, 40, 72, 38, 58, 65];
    } else {
      // Non-GST layout: 7 columns - optimized widths
      return [28, 200, 52, 65, 38, 78, 74];
    }
  };

  const colWidths = getColWidths();
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const tableX = M + (contentWidth - tableWidth) / 2;

  // Colors
  const BLUE = [24, 115, 204];
  const DARK = [45, 55, 72];
  const MUTED = [105, 112, 119];
  const BORDER = [220, 224, 228];

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage();
    currentY = M;
    currentPage++;
    drawStaticHeader();
  };

  // ---------- Header Drawer ----------
  const drawStaticHeader = () => {
    let y = M;
    
    // Title
    pdfDoc.fontSize(20).font("Helvetica-Bold").fillColor(DARK);
    pdfDoc.text("TAX INVOICE", M - 2, y);
    y += 20;

    // Company Details
    pdfDoc.fontSize(15).font("Helvetica-Bold").fillColor([0, 110, 200]);
    
    const companyName = capitalizeWords(
      company?.businessName || company?.companyName || "Your Company Name"
    ).toUpperCase();
    pdfDoc.text(companyName, M, y);
    y += 16;
    
    pdfDoc.fontSize(9).font("Helvetica-Normal").fillColor(DARK);
    
    if (companyGSTIN) {
      pdfDoc.font("Helvetica-Bold").text("GSTIN:", M, y);
      pdfDoc.font("Helvetica-Normal").text(companyGSTIN, M + 35, y);
      y += 14;
    }

    const companyAddress = capitalizeWords(company?.address || "Company Address Missing");
    const addressLines = pdfDoc.splitTextToSize(companyAddress, 250);
    if (addressLines.length) {
      for (let i = 0; i < Math.min(addressLines.length, 2); i++) {
        pdfDoc.text(addressLines[i], M, y);
        y += 12;
      }
    }

    if (company?.City) {
      pdfDoc.text(capitalizeWords(company.City), M, y);
    }
    y += 12;

    if (company?.panNumber) {
      pdfDoc.font("Helvetica-Bold").text("PAN:", M, y);
      pdfDoc.font("Helvetica-Normal").text(company.panNumber, M + 28, y);
      y += 11;
    }

    if (company?.mobileNumber) {
      y += 12;
      pdfDoc.font("Helvetica-Bold").text("Phone:", M, y);
      pdfDoc.font("Helvetica-Normal").text(company.mobileNumber, M + 35, y);
      y += 14;
    }

    if (company?.addressState) {
      pdfDoc.font("Helvetica-Bold").text("State:", M, y);
      const stateWithCode = `${capitalizeWords(company.addressState)} (${
        getStateCode(company.addressState) || "-"
      })`;
      pdfDoc.font("Helvetica-Normal").text(stateWithCode, M + 30, y);
    }
    y += 6;

    // Logo
    const logoSize = 60;
    const logoX = pageWidth - M - logoSize;
    if (logoUrl) {
      try {
        pdfDoc.image(logoUrl, logoX, M, { width: logoSize, height: logoSize });
      } catch (e) {
        console.log("Logo not found");
      }
    }

    // Separator
    y = Math.max(y, M + logoSize + 20);
    pdfDoc
      .moveTo(M, y + 4)
      .lineTo(pageWidth - M, y + 4)
      .strokeColor([0, 110, 200])
      .stroke();
    
    return y + 20;
  };

  let headerBottomY = drawStaticHeader();

  // Customer Details Block
  const drawCustomerMetaBlock = (startY) => {
    let detailY = startY;
    
    // LEFT: Customer Details
    let leftY = detailY;
    pdfDoc.fontSize(10).font("Helvetica-Bold").fillColor(DARK);
    pdfDoc.text("Customer Details:", M, leftY);
    leftY += 16;
    pdfDoc.fontSize(9);

    if (party?.name) {
      pdfDoc.font("Helvetica-Bold").text("Name:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(capitalizeWords(party.name), M + 30, leftY);
      leftY += 12;
    }

    if (party?.email) {
      pdfDoc.font("Helvetica-Bold").text("Email:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.email, M + 30, leftY);
      leftY += 12;
    }

    if (party?.contactNumber) {
      pdfDoc.font("Helvetica-Bold").text("Phone No:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.contactNumber, M + 50, leftY);
      leftY += 12;
    }

    if (partyGSTIN) {
      pdfDoc.font("Helvetica-Bold").text("GSTIN:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(partyGSTIN, M + 35, leftY);
      leftY += 12;
    }

    if (party?.panNumber) {
      pdfDoc.font("Helvetica-Bold").text("PAN:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.panNumber, M + 30, leftY);
      leftY += 12;
    }

    const billAddressLines = pdfDoc.splitTextToSize(billingAddress, 170);
    if (billAddressLines.length) {
      pdfDoc.font("Helvetica-Bold").text("Address:", M, leftY);
      pdfDoc.font("Helvetica-Normal").text(billAddressLines, M + 40, leftY);
      leftY += billAddressLines.length * 12;
    }

    const placeOfSupply = party?.state
      ? `${capitalizeWords(party.state)} (${getStateCode(party.state) || "-"})`
      : "N/A";
    
    pdfDoc.font("Helvetica-Bold").text("Place of Supply:", M, leftY);
    pdfDoc.font("Helvetica-Normal").text(placeOfSupply, M + 72, leftY);
    leftY += 12;

    // MIDDLE: Shipping
    const middleX = M + 220;
    let middleY = detailY;
    pdfDoc.fontSize(10).font("Helvetica-Bold").fillColor(DARK);
    pdfDoc.text("Shipping address:", middleX, middleY);
    middleY += 16;
    pdfDoc.fontSize(9);

    // Name
    pdfDoc.font("Helvetica-Bold").text("Name:", middleX, middleY);
    const shippingName = shippingAddress?.name && shippingAddress.name !== "N/A" && shippingAddress.name !== "Client Name"
      ? capitalizeWords(shippingAddress.name)
      : "-";
    pdfDoc.font("Helvetica-Normal").text(shippingName, middleX + 40, middleY);
    middleY += 12;

    // Phone
    pdfDoc.font("Helvetica-Bold").text("Phone:", middleX, middleY);
    const phoneNumber = shippingAddress?.contactNumber && shippingAddress.contactNumber !== "N/A"
      ? shippingAddress.contactNumber
      : "-";
    pdfDoc.font("Helvetica-Normal").text(phoneNumber, middleX + 40, middleY);
    middleY += 12;

    // GSTIN
    pdfDoc.font("Helvetica-Bold").text("GSTIN:", middleX, middleY);
    const shippingGSTIN = _getGSTIN(shippingAddress) || partyGSTIN;
    pdfDoc.font("Helvetica-Normal").text(shippingGSTIN || "-", middleX + 40, middleY);
    middleY += 12;

    // Address
    pdfDoc.font("Helvetica-Bold").text("Address:", middleX, middleY);
    let addressToDisplay = shippingAddressStr;
    if (!addressToDisplay || addressToDisplay.toLowerCase().includes("address missing") || 
        addressToDisplay.toLowerCase().includes("-") || addressToDisplay === "-") {
      addressToDisplay = "-";
    }
    pdfDoc.font("Helvetica-Normal");
    const shipAddressLines = pdfDoc.splitTextToSize(addressToDisplay, 140);
    pdfDoc.text(shipAddressLines, middleX + 42, middleY);
    middleY += shipAddressLines.length * 12;

    // State
    pdfDoc.font("Helvetica-Bold").text("State:", middleX, middleY);
    const stateValue = shippingAddress?.state
      ? `${capitalizeWords(shippingAddress.state)} (${getStateCode(shippingAddress.state) || "-"})`
      : party?.state
      ? `${capitalizeWords(party.state)} (${getStateCode(party.state) || "-"})`
      : "-";
    pdfDoc.font("Helvetica-Normal").text(stateValue, middleX + 40, middleY);
    middleY += 12;

    // Country
    pdfDoc.font("Helvetica-Bold").text("Country:", middleX, middleY);
    pdfDoc.font("Helvetica-Normal").text("India", middleX + 40, middleY);
    middleY += 12;

    // RIGHT: Invoice Details
    const rightX = pageWidth - M - 120;
    let rightY = detailY;
    pdfDoc.fontSize(9).font("Helvetica-Bold");

    const invoiceDetails = [
      { label: "Invoice # :", value: transaction?.invoiceNumber?.toString() || "N/A" },
      { label: "Invoice Date :", value: fmtDate(transaction?.date) },
      { label: "P.O. No. :", value: transaction?.poNumber || "N/A" },
      { label: "P.O. Date :", value: fmtDate(transaction?.poDate) || "N/A" },
      { label: "E-Way No. :", value: transaction?.eWayBillNo || "N/A" },
    ];

    invoiceDetails.forEach((detail) => {
      pdfDoc.text(detail.label, rightX, rightY);
      let displayValue = detail.value === "N/A" ? "-" : detail.value;
      pdfDoc.font("Helvetica-Normal").text(displayValue, rightX + 62, rightY);
      pdfDoc.font("Helvetica-Bold");
      rightY += 14;
    });

    return Math.max(leftY, middleY, rightY) + 10;
  };

  let blockBottomY = drawCustomerMetaBlock(headerBottomY);
  const REPEATING_HEADER_HEIGHT = blockBottomY;
  currentY = blockBottomY;

  // Build dynamic headers based on GST type
  const buildHeaders = () => {
    const baseHeaders = [
      "Sr. No.",
      "Name of Product / Service",
      "HSN/SAC",
      "Rate",
      "Qty",
      "Taxable Value",
    ];

    if (showIGST) {
      return [...baseHeaders, "IGST %", "IGST Amount", "Total"];
    } else if (showCGSTSGST) {
      return [
        ...baseHeaders,
        "CGST %",
        "CGST Amount",
        "SGST %",
        "SGST Amount",
        "Total",
      ];
    } else {
      return [...baseHeaders, "Total"];
    }
  };

  // Build dynamic body data based on GST type
  const buildBodyData = () => {
    return lines.map((it, i) => {
      const nameAndDesc = `${capitalizeWords(it.name || "")}\n${
        it.description ? it.description.split("\n").join(" / ") : ""
      }`;

      const baseData = [
        (i + 1).toString(),
        nameAndDesc,
        it.hsnSac || "N/A",
        formatCurrency(it.pricePerUnit),
        formatQuantity(it.quantity, it.unit),
        formatCurrency(it.amount),
      ];

      if (showIGST) {
        return [
          ...baseData,
          `${it.gstPercentage || 0}`,
          formatCurrency(it.lineTax),
          formatCurrency(it.lineTotal),
        ];
      } else if (showCGSTSGST) {
        const cgst = (it.lineTax || 0) / 2;
        const sgst = (it.lineTax || 0) / 2;
        return [
          ...baseData,
          `${(it.gstPercentage || 0) / 2}`,
          formatCurrency(cgst),
          `${(it.gstPercentage || 0) / 2}`,
          formatCurrency(sgst),
          formatCurrency(it.lineTotal),
        ];
      } else {
        return [...baseData, formatCurrency(it.lineTotal)];
      }
    });
  };

  // Draw Table Header
  const drawTableHeader = () => {
    pdfDoc.rect(tableX, currentY, tableWidth, 20).fill([0, 110, 200]);
    
    let headerX = tableX;
    const headers = buildHeaders();
    
    pdfDoc.fontSize(7).font("Helvetica-Bold").fillColor([255, 255, 255]);
    
    headers.forEach((header, index) => {
      const align = index === 1 ? "left" : "center";
      pdfDoc.text(header, headerX + 3, currentY + 7, {
        width: colWidths[index] - 6,
        align: align
      });
      headerX += colWidths[index];
    });
    
    currentY += 20;
  };

  // Draw Table Rows
  const drawTableRows = () => {
    pdfDoc.fontSize(8).font("Helvetica-Normal").fillColor(DARK);
    
    lines.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        drawTableHeader();
      }

      // Draw row background
      pdfDoc.rect(tableX, currentY, tableWidth, 20).stroke(BORDER).fill([255, 255, 255]);

      let cellX = tableX;
      const rowData = buildBodyData()[index];

      rowData.forEach((cell, cellIndex) => {
        const align = cellIndex === 1 ? "left" : "center";
        pdfDoc.text(cell, cellX + 3, currentY + 7, {
          width: colWidths[cellIndex] - 6,
          align: align
        });
        cellX += colWidths[cellIndex];
      });

      currentY += 20;
    });
  };

  // Draw the table
  drawTableHeader();
  drawTableRows();

  let afterTableY = currentY + 10;

  // Totals Summary Block
  const drawTotalsSummary = () => {
    const totalsW = 200;
    const totalsX = pageWidth - M - totalsW;
    let currentTotalsY = afterTableY + 10;

    const putTotalLine = (label, val, y, bold = false) => {
      pdfDoc.font(bold ? "Helvetica-Bold" : "Helvetica-Normal").fontSize(9);
      pdfDoc.text(label, totalsX + 12, y);
      pdfDoc.text(val, totalsX + totalsW - 12, y, { align: "right" });
    };

    // Taxable Amount
    pdfDoc.rect(totalsX, currentTotalsY, totalsW, 18).stroke(BORDER).fill([255, 255, 255]);
    putTotalLine("Taxable Amount", totalTaxableAmount, currentTotalsY + 12);
    currentTotalsY += 18;

    // GST breakdown
    if (isGSTApplicable) {
      if (showIGST) {
        pdfDoc.rect(totalsX, currentTotalsY, totalsW, 18).stroke(BORDER).fill([255, 255, 255]);
        putTotalLine("IGST", formatCurrency(totalIGST), currentTotalsY + 12);
        currentTotalsY += 18;
      } else if (showCGSTSGST) {
        pdfDoc.rect(totalsX, currentTotalsY, totalsW, 18).stroke(BORDER).fill([255, 255, 255]);
        putTotalLine("CGST", formatCurrency(totalCGST), currentTotalsY + 12);
        currentTotalsY += 18;

        pdfDoc.rect(totalsX, currentTotalsY, totalsW, 18).stroke(BORDER).fill([255, 255, 255]);
        putTotalLine("SGST", formatCurrency(totalSGST), currentTotalsY + 12);
        currentTotalsY += 18;
      }
    }

    // Final Total
    pdfDoc.rect(totalsX, currentTotalsY, totalsW, 18).stroke(BORDER).fill([240, 240, 240]);
    putTotalLine("Total Amount", finalTotalAmount, currentTotalsY + 12, true);
    currentTotalsY += 24;

    // Total Items / Qty
    pdfDoc.font("Helvetica-Normal").fontSize(9);
    pdfDoc.text(
      `Total Items / Qty : ${totalItems} / ${totalQuantity.toFixed(2)}`,
      M,
      afterTableY + 16
    );

    // Amount in Words
    pdfDoc.font("Helvetica-Bold").fontSize(9).fillColor([0, 0, 0]);
    pdfDoc.text("Total amount (in words):", M, currentTotalsY + 10);
    pdfDoc.fontSize(8).font("Helvetica-Normal");
    pdfDoc.text(
      ` ${convertNumberToWords(invoiceTotal)}`,
      M + 105,
      currentTotalsY + 10,
      { width: 420 }
    );

    currentY = currentTotalsY + 25;

    // Separator line
    pdfDoc
      .moveTo(M, currentY)
      .lineTo(pageWidth - M, currentY)
      .strokeColor([0, 110, 200])
      .stroke();

    currentY += 20;
  };

  drawTotalsSummary();

  // Bank Details & Signature
  const drawBankAndSignature = () => {
    const bankBlockH = 90;
    if (currentY + bankBlockH > pageHeight - M) {
      addNewPage();
    }

    const blockY = currentY;
    let bankY = blockY;

    // Bank Details
    const getBankDetails = () => ({
      name: "Bank Details -",
      branch: "N/A",
      accNumber: "N/A",
      ifsc: "N/A",
      upiId: "N/A",
    });

    const dynamicBankDetails =
      bank && typeof bank === "object" && bank.bankName
        ? {
            name: capitalizeWords(bank.bankName || "N/A"),
            branch: capitalizeWords(bank.branchAddress || "N/A"),
            accNumber: bank.accountNumber || "N/A",
            ifsc: capitalizeWords(bank.ifscCode || "N/A"),
            upiId: bank.upiDetails?.upiId || "N/A",
          }
        : getBankDetails();

    const areBankDetailsAvailable = dynamicBankDetails.name !== "Bank Details -";

    pdfDoc.font("Helvetica-Bold").fontSize(10).fillColor([0, 0, 0]);

    if (areBankDetailsAvailable) {
      pdfDoc.text("Pay using UPI:", M, bankY);
      pdfDoc.text("Bank Details:", M + 120, bankY);
    } else {
      pdfDoc.text("Bank Details:", M, bankY);
    }

    bankY += 16;

    // UPI QR Code
    const qrSize = 60;
    if (areBankDetailsAvailable && bank?.qrCode) {
      try {
        pdfDoc.image(
          `${process.env.BASE_URL || ""}${bank.qrCode}`,
          M + 2,
          bankY,
          { width: qrSize, height: qrSize }
        );
      } catch (error) {
        console.log("QR code not found");
        pdfDoc.rect(M + 2, bankY, qrSize, qrSize).stroke(BORDER).fill([240, 240, 240]);
      }
    }

    // Bank Details Text
    let bankDetailY = bankY;
    const bankX = areBankDetailsAvailable ? M + 120 : M;
    pdfDoc.fontSize(8);

    const putBankDetail = (label, val, y) => {
      pdfDoc.font("Helvetica-Bold").text(label, bankX, y);
      pdfDoc.font("Helvetica-Normal").text(val, bankX + 60, y);
    };

    if (areBankDetailsAvailable) {
      putBankDetail("Bank Name :", dynamicBankDetails.name, bankDetailY);
      bankDetailY += 12;
      putBankDetail("Branch :", dynamicBankDetails.branch, bankDetailY);
      bankDetailY += 12;
      putBankDetail("IFSC :", dynamicBankDetails.ifsc, bankDetailY);
      bankDetailY += 12;
      putBankDetail("Acc. Number :", dynamicBankDetails.accNumber, bankDetailY);
      bankDetailY += 12;
      putBankDetail("UPI ID:", dynamicBankDetails.upiId, bankDetailY);
    } else {
      pdfDoc.font("Helvetica-Bold").fontSize(8).fillColor([128, 128, 128]);
      pdfDoc.text("No bank details available", bankX, bankDetailY);
    }

    // Signature Block
    const sigX = pageWidth - M - 150;
    pdfDoc.font("Helvetica-Bold").fontSize(10).fillColor([0, 0, 0]);
    pdfDoc.text(
      `For ${capitalizeWords(company?.businessName || company?.companyName || "Company")}`,
      sigX + 14,
      blockY + 5
    );

    // Signature Box
    const sigHeight = 50;
    const sigWidth = 150;
    pdfDoc.rect(sigX, blockY + 15, sigWidth, sigHeight).stroke(BORDER);

    currentY = Math.max(bankY + qrSize, blockY + sigHeight) + 20;
  };

  drawBankAndSignature();

  // Terms and Conditions
  const drawTermsAndConditions = () => {
    if (currentY > pageHeight - 80) {
      addNewPage();
    }

    const { title, isList, items: notesItems } = parseNotesHtml(transaction.notes || "");
    const termsTitle = title || "Terms and Conditions";
    const termsList = notesItems;

    let termsY = currentY;

    pdfDoc.font("Helvetica-Bold").fontSize(10).fillColor([0, 0, 0]);
    pdfDoc.text(`${termsTitle}:`, M, termsY);
    termsY += 13;

    pdfDoc.font("Helvetica-Normal").fontSize(8).fillColor(DARK);

    if (termsList.length > 0) {
      termsList.forEach((item) => {
        const formattedItem = isList ? `• ${item}` : item;
        const itemLines = pdfDoc.splitTextToSize(formattedItem, 300);
        pdfDoc.text(itemLines, M, termsY);
        termsY += itemLines.length * 10;
      });
    } else {
      pdfDoc.text("No terms and conditions specified", M, termsY);
    }

    currentY = termsY + 10;
  };

  drawTermsAndConditions();

  // Page Numbers
  const totalPages = pdfDoc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    pdfDoc.switchToPage(i);
    const pageHeight = pdfDoc.page.height;
    pdfDoc.fontSize(8).font("Helvetica-Normal").fillColor(DARK);
    pdfDoc.text(`Page ${i + 1} of ${totalPages}`, pageWidth - M + 7, pageHeight - 15, {
      align: "right"
    });
  }
};

module.exports = { generateTemplate16 };