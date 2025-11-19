// backend/templates/template20.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  numberToWords,
  getStateCode,
  formatPhoneNumber,
  formatQuantity
} = require("../pdf-utils");
const { capitalizeWords, parseNotesHtml } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElementsForPDFKit,
} = require("../HtmlNoteRenderer");

const generateTemplate20 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;
  let currentPage = 1;

  // Colors
  const PRIMARY_BLUE = [0, 112, 192];
  const LIGHT_GRAY = [255, 255, 255];
  const DARK_TEXT = [51, 51, 51];
  const BORDER_COLOR = [186, 186, 186];

  const preparedData = prepareTemplate8Data(
    transaction,
    company,
    party,
    shippingAddress
  );

  const {
    totalTaxable,
    totalAmount,
    items: allItems,
    totalItems,
    totalQty,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    showIGST,
    showCGSTSGST,
    showNoTax,
  } = preparedData;

  const typedItems = preparedData.itemsWithGST || allItems;

  const shouldHideBankDetails = transaction.type === "proforma";
  const logoSrc = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  // Column Width Logic
  const IGST_COL_WIDTHS = [30, 150, 50, 60, 40, 80, 50, 60, 70];
  const NON_GST_COL_WIDTHS = [30, 190, 70, 70, 50, 90, 70];
  const CGST_SGST_COL_WIDTHS = [30, 100, 50, 50, 40, 60, 40, 50, 40, 50, 50];

  const getColWidths = () => {
    if (!isGSTApplicable || showNoTax) {
      return NON_GST_COL_WIDTHS;
    } else if (showIGST) {
      return IGST_COL_WIDTHS;
    } else {
      return CGST_SGST_COL_WIDTHS;
    }
  };

  const colWidths = getColWidths();
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const tableX = margin + (contentWidth - tableWidth) / 2;

  const getTotalColumnIndex = () => {
    if (!isGSTApplicable || showNoTax) return 6;
    if (showIGST) return 8;
    return 10;
  };
  const totalColumnIndex = getTotalColumnIndex();

  const getAddressLines = (address) =>
    address ? address.split("\n").filter((line) => line.trim() !== "") : [];

  const bankData = bank;
  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  const amountInWords = numberToWords(Math.round(totalAmount));

  const extendedTransaction = transaction;
  const partyAsAny = party;
  
  // Buyer Phone Logic
  const buyerPhone =
    (partyAsAny?.mobileNumber && typeof partyAsAny.mobileNumber === "string"
      ? formatPhoneNumber(partyAsAny.mobileNumber.trim())
      : "") ||
    (partyAsAny?.phone && typeof partyAsAny.phone === "string"
      ? formatPhoneNumber(partyAsAny.phone.trim())
      : "") ||
    (partyAsAny?.contactNumber && typeof partyAsAny.contactNumber === "string"
      ? formatPhoneNumber(partyAsAny.contactNumber.trim())
      : "") ||
    "-";

  // Consignee Phone Logic
  const shippingAsAny = shippingAddress;
  const consigneePhone =
    (shippingAsAny?.phone && typeof shippingAsAny.phone === "string"
      ? formatPhoneNumber(shippingAsAny.phone.trim())
      : "") ||
    (shippingAsAny?.mobileNumber && typeof shippingAsAny.mobileNumber === "string"
      ? formatPhoneNumber(shippingAsAny.mobileNumber.trim())
      : "") ||
    (shippingAsAny?.contactNumber && typeof shippingAsAny.contactNumber === "string"
      ? formatPhoneNumber(shippingAsAny.contactNumber.trim())
      : "") ||
    buyerPhone;

  // Terms and Conditions
  const { title } = parseNotesHtml(transaction?.notes || "");
  const termsData = {
    title: title || "Terms and Conditions",
  };

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage();
    currentY = margin;
    currentPage++;
    drawHeader();
    drawPartySection();
  };

  // Draw Header Section
  const drawHeader = () => {
    // Header Container
    pdfDoc.rect(margin, currentY, contentWidth, 1.5).fill(PRIMARY_BLUE);
    currentY += 5;

    // Logo and Company Name Block
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, margin, currentY, { width: 70, height: 70 });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    const companyNameX = margin + 80;
    pdfDoc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_BLUE)
      .text(
        company?.businessName || company?.companyName || "",
        companyNameX,
        currentY
      );

    currentY += 20;

    // Company Details
    pdfDoc.fontSize(9.5).font("Helvetica-Normal").fillColor(DARK_TEXT);

    if (company?.gstin) {
      pdfDoc.font("Helvetica-Bold").text("GSTIN:", companyNameX, currentY);
      pdfDoc
        .font("Helvetica-Normal")
        .text(company.gstin, companyNameX + 35, currentY);
      currentY += 12;
    }

    if (company?.address) {
      const addressLines = pdfDoc.splitTextToSize(company.address, 200);
      addressLines.forEach((line) => {
        pdfDoc.text(line, companyNameX, currentY);
        currentY += 10;
      });
    }

    const locationLine = `${company?.addressState || ""}${
      company?.Country ? `,${company.Country}` : ""
    }${company?.Pincode ? `, ${company.Pincode}` : ""}`;
    if (locationLine.trim()) {
      pdfDoc.text(locationLine, companyNameX, currentY);
      currentY += 12;
    }

    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company.mobileNumber)
      : company?.Telephone
      ? formatPhoneNumber(company.Telephone)
      : "-";
    pdfDoc.font("Helvetica-Bold").text("Phone:", companyNameX, currentY);
    pdfDoc.font("Helvetica-Normal").text(phoneText, companyNameX + 35, currentY);
    currentY += 15;

    // Invoice Info Block (Right Side)
    const invoiceX = pageWidth - margin - 150;
    pdfDoc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_BLUE)
      .text(
        transaction.type === "proforma"
          ? "PROFORMA INVOICE"
          : isGSTApplicable
          ? "TAX INVOICE"
          : "INVOICE",
        invoiceX,
        margin + 5,
        { underline: true }
      );

    pdfDoc.fontSize(9).font("Helvetica-Normal").fillColor(DARK_TEXT);

    // Invoice Number
    pdfDoc.font("Helvetica-Bold").text("Invoice #:", invoiceX, margin + 25);
    pdfDoc
      .font("Helvetica-Bold")
      .text(
        transaction?.invoiceNumber?.toString() || "",
        invoiceX + 80,
        margin + 25,
        { width: 70, align: "right" }
      );

    // Invoice Date
    pdfDoc.font("Helvetica-Bold").text("Invoice Date:", invoiceX, margin + 40);
    const invoiceDate = transaction?.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "";
    pdfDoc
      .font("Helvetica-Bold")
      .text(invoiceDate, invoiceX + 80, margin + 40, {
        width: 70,
        align: "right",
      });

    currentY = Math.max(currentY, margin + 80);
  };

  // Draw Party Section
  const drawPartySection = () => {
    const sectionY = currentY;
    let maxY = sectionY;

    // Left Block - Buyer and Consignee (60%)
    const leftWidth = contentWidth * 0.6;
    let leftY = sectionY;

    // Buyer Details
    pdfDoc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_BLUE)
      .text("Details of Buyer | Billed to :", margin, leftY);
    leftY += 12;

    pdfDoc.fontSize(9).font("Helvetica-Normal").fillColor(DARK_TEXT);

    // Buyer Name
    pdfDoc.font("Helvetica-Bold").text("Name:", margin, leftY);
    pdfDoc
      .font("Helvetica-Normal")
      .text(capitalizeWords(party?.name || ""), margin + 35, leftY);
    leftY += 10;

    // Buyer Address
    pdfDoc.font("Helvetica-Bold").text("Address:", margin, leftY);
    const billingAddress = capitalizeWords(
      getAddressLines(getBillingAddress(party)).join(", ")
    );
    const billAddrLines = pdfDoc.splitTextToSize(billingAddress, leftWidth - 45);
    pdfDoc.font("Helvetica-Normal").text(billAddrLines, margin + 45, leftY);
    leftY += billAddrLines.length * 9;

    // Buyer Phone
    pdfDoc.font("Helvetica-Bold").text("Phone:", margin, leftY);
    pdfDoc.font("Helvetica-Normal").text(formatPhoneNumber(buyerPhone), margin + 35, leftY);
    leftY += 10;

    // Buyer GSTIN
    if (party?.gstin) {
      pdfDoc.font("Helvetica-Bold").text("GSTIN:", margin, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.gstin, margin + 35, leftY);
      leftY += 10;
    }

    // Buyer PAN
    if (party?.pan) {
      pdfDoc.font("Helvetica-Bold").text("PAN:", margin, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.pan, margin + 35, leftY);
      leftY += 10;
    }

    // Place of Supply
    const placeOfSupply = shippingAddress?.state
      ? `${shippingAddress.state} (${
          getStateCode(shippingAddress.state) || "-"
        })`
      : party?.state
      ? `${party.state} (${getStateCode(party.state) || "-"})`
      : "-";
    pdfDoc.font("Helvetica-Bold").text("Place of Supply:", margin, leftY);
    pdfDoc.font("Helvetica-Normal").text(placeOfSupply, margin + 72, leftY);
    leftY += 15;

    // Consignee Details
    pdfDoc
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_BLUE)
      .text("Details of Consignee | Shipped to :", margin, leftY);
    leftY += 12;

    pdfDoc.font("Helvetica-Normal").fillColor(DARK_TEXT);

    // Consignee Name
    pdfDoc.font("Helvetica-Bold").text("Name:", margin, leftY);
    const consigneeName = capitalizeWords(
      shippingAddress?.label || party?.name || ""
    );
    pdfDoc.font("Helvetica-Normal").text(consigneeName, margin + 35, leftY);
    leftY += 10;

    // Consignee Address
    pdfDoc.font("Helvetica-Bold").text("Address:", margin, leftY);
    const shippingAddr = capitalizeWords(
      getAddressLines(
        getShippingAddress(shippingAddress, getBillingAddress(party))
      ).join(", ")
    );
    const shipAddrLines = pdfDoc.splitTextToSize(shippingAddr, leftWidth - 45);
    pdfDoc.font("Helvetica-Normal").text(shipAddrLines, margin + 45, leftY);
    leftY += shipAddrLines.length * 9;

    // Country
    if (company?.Country) {
      pdfDoc.font("Helvetica-Bold").text("Country:", margin, leftY);
      pdfDoc
        .font("Helvetica-Normal")
        .text(capitalizeWords(company.Country), margin + 45, leftY);
      leftY += 10;
    }

    // Consignee Phone
    if (consigneePhone !== "-") {
      pdfDoc.font("Helvetica-Bold").text("Phone:", margin, leftY);
      pdfDoc
        .font("Helvetica-Normal")
        .text(formatPhoneNumber(consigneePhone), margin + 35, leftY);
      leftY += 10;
    }

    // Consignee GSTIN
    if (party?.gstin) {
      pdfDoc.font("Helvetica-Bold").text("GSTIN:", margin, leftY);
      pdfDoc.font("Helvetica-Normal").text(party.gstin, margin + 35, leftY);
      leftY += 10;
    }

    // Consignee State
    if (shippingAddress?.state) {
      pdfDoc.font("Helvetica-Bold").text("State:", margin, leftY);
      const stateWithCode = `${capitalizeWords(shippingAddress.state)} (${
        getStateCode(shippingAddress.state) || "-"
      })`;
      pdfDoc.font("Helvetica-Normal").text(stateWithCode, margin + 35, leftY);
      leftY += 10;
    }

    maxY = Math.max(maxY, leftY);

    // Right Block - Transaction Details (38%)
    const rightX = margin + leftWidth + 10;
    let rightY = sectionY;

    pdfDoc.fontSize(9).font("Helvetica-Normal").fillColor(DARK_TEXT);

    // PO Number
    pdfDoc.font("Helvetica-Bold").text("P.O. No.:", rightX, rightY);
    pdfDoc
      .font("Helvetica-Normal")
      .text(extendedTransaction?.poNumber || "-", rightX + 50, rightY);
    rightY += 12;

    // PO Date
    pdfDoc.font("Helvetica-Bold").text("P.O. Date:", rightX, rightY);
    const poDate = extendedTransaction?.poDate
      ? new Date(extendedTransaction.poDate).toLocaleDateString("en-GB")
      : "-";
    pdfDoc.font("Helvetica-Normal").text(poDate, rightX + 50, rightY);
    rightY += 12;

    // E-Way Number
    pdfDoc.font("Helvetica-Bold").text("E-Way No.:", rightX, rightY);
    pdfDoc
      .font("Helvetica-Normal")
      .text(extendedTransaction?.ewayNumber || "-", rightX + 50, rightY);
    rightY += 12;

    maxY = Math.max(maxY, rightY);

    currentY = maxY + 15;

    // Border lines
    pdfDoc
      .moveTo(margin, sectionY)
      .lineTo(pageWidth - margin, sectionY)
      .stroke(BORDER_COLOR);
    pdfDoc
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .stroke(BORDER_COLOR);
  };

  // Draw Table Header
  const drawTableHeader = () => {
    pdfDoc.rect(tableX, currentY, tableWidth, 20).fill(PRIMARY_BLUE);
    
    let headerX = tableX;
    pdfDoc.fontSize(7).font("Helvetica-Bold").fillColor(LIGHT_GRAY);

    const headers = [
      "Sr. No.",
      "Name of Product / Service",
      "HSN / SAC",
      "Rate (Rs.)",
      "Qty",
      "Taxable Value (Rs.)",
    ];

    if (showIGST) {
      headers.push("IGST %", "IGST Amt (Rs.)");
    } else if (showCGSTSGST) {
      headers.push("CGST %", "CGST Amt (Rs.)", "SGST %", "SGST Amt (Rs.)");
    }

    headers.push("Total (Rs.)");

    headers.forEach((header, index) => {
      const align = index === 1 ? "left" : "center";
      pdfDoc.text(header, headerX + 4, currentY + 6, {
        width: colWidths[index] - 8,
        align: align,
      });
      headerX += colWidths[index];
    });

    currentY += 20;
  };

  // Draw Table Rows
  const drawTableRows = () => {
    pdfDoc.fontSize(7).font("Helvetica-Normal").fillColor(DARK_TEXT);

    typedItems.forEach((item, index) => {
      if (currentY > pageHeight - 150) {
        addNewPage();
        drawTableHeader();
      }

      // Draw row background
      pdfDoc.rect(tableX, currentY, tableWidth, 20).stroke(BORDER_COLOR).fill(LIGHT_GRAY);

      let cellX = tableX;

      // Sr. No.
      pdfDoc.text((index + 1).toString(), cellX + 4, currentY + 6, {
        width: colWidths[0] - 8,
        align: "center",
      });
      cellX += colWidths[0];

      // Name
      pdfDoc.text(item.name, cellX + 4, currentY + 6, {
        width: colWidths[1] - 8,
        align: "left",
      });
      cellX += colWidths[1];

      // HSN/SAC
      pdfDoc.text(item.code || "-", cellX + 4, currentY + 6, {
        width: colWidths[2] - 8,
        align: "center",
      });
      cellX += colWidths[2];

      // Rate
      pdfDoc.text(formatCurrency(item.pricePerUnit || 0), cellX + 4, currentY + 6, {
        width: colWidths[3] - 8,
        align: "center",
      });
      cellX += colWidths[3];

      // Quantity
      const qtyText = item.itemType === "service" ? "-" : formatQuantity(item.quantity || 0, item.unit);
      pdfDoc.text(qtyText, cellX + 4, currentY + 6, {
        width: colWidths[4] - 8,
        align: "center",
      });
      cellX += colWidths[4];

      // Taxable Value
      pdfDoc.text(formatCurrency(item.taxableValue), cellX + 4, currentY + 6, {
        width: colWidths[5] - 8,
        align: "center",
      });
      cellX += colWidths[5];

      // GST Columns
      if (showIGST) {
        pdfDoc.text(item.gstRate.toFixed(2), cellX + 4, currentY + 6, {
          width: colWidths[6] - 8,
          align: "center",
        });
        cellX += colWidths[6];

        pdfDoc.text(formatCurrency(item.igst), cellX + 4, currentY + 6, {
          width: colWidths[7] - 8,
          align: "center",
        });
        cellX += colWidths[7];
      } else if (showCGSTSGST) {
        pdfDoc.text((item.gstRate / 2).toFixed(2), cellX + 4, currentY + 6, {
          width: colWidths[6] - 8,
          align: "center",
        });
        cellX += colWidths[6];

        pdfDoc.text(formatCurrency(item.cgst), cellX + 4, currentY + 6, {
          width: colWidths[7] - 8,
          align: "center",
        });
        cellX += colWidths[7];

        pdfDoc.text((item.gstRate / 2).toFixed(2), cellX + 4, currentY + 6, {
          width: colWidths[8] - 8,
          align: "center",
        });
        cellX += colWidths[8];

        pdfDoc.text(formatCurrency(item.sgst), cellX + 4, currentY + 6, {
          width: colWidths[9] - 8,
          align: "center",
        });
        cellX += colWidths[9];
      }

      // Total (Bold)
      pdfDoc.font("Helvetica-Bold").text(formatCurrency(item.total), cellX + 4, currentY + 6, {
        width: colWidths[totalColumnIndex] - 8,
        align: "center",
      });
      pdfDoc.font("Helvetica-Normal");

      currentY += 20;
    });

    // Bottom border
    pdfDoc
      .moveTo(tableX, currentY)
      .lineTo(tableX + tableWidth, currentY)
      .stroke([211, 211, 211]);
    
    currentY += 10;
  };

  // Draw Totals Section
  const drawTotalsSection = () => {
    const totalsY = currentY;

    // Left Section (60%)
    const leftX = margin;
    
    // Total Items/Qty
    pdfDoc.fontSize(8).text(`Total Items / Qty : `, leftX, totalsY);
    pdfDoc
      .font("Helvetica-Bold")
      .text(`${totalItems} / ${totalQty}`, leftX + 85, totalsY);
    pdfDoc.font("Helvetica-Normal");

    // Amount in Words
    pdfDoc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Total amount (in words):", leftX, totalsY + 20);
    pdfDoc.fontSize(8).font("Helvetica-Normal");
    const wordsLines = pdfDoc.splitTextToSize(amountInWords, contentWidth * 0.6);
    pdfDoc.text(wordsLines, leftX, totalsY + 30);

    // Right Section (38%) - Tax Breakdown
    const rightX = pageWidth - margin - contentWidth * 0.38;
    let rightY = totalsY;

    // Taxable Amount
    pdfDoc.font("Helvetica-Bold").text("Taxable Amount", rightX, rightY);
    pdfDoc.text(`Rs.${formatCurrency(totalTaxable)}`, rightX + 120, rightY, {
      align: "right",
    });
    rightY += 12;

    // GST Breakdown
    if (isGSTApplicable) {
      if (showIGST) {
        pdfDoc.font("Helvetica-Bold").text("IGST", rightX, rightY);
        pdfDoc.text(`Rs.${formatCurrency(totalIGST)}`, rightX + 120, rightY, {
          align: "right",
        });
        rightY += 12;
      } else if (showCGSTSGST) {
        pdfDoc.font("Helvetica-Bold").text("CGST", rightX, rightY);
        pdfDoc.text(`Rs.${formatCurrency(totalCGST)}`, rightX + 120, rightY, {
          align: "right",
        });
        rightY += 12;

        pdfDoc.font("Helvetica-Bold").text("SGST", rightX, rightY);
        pdfDoc.text(`Rs.${formatCurrency(totalSGST)}`, rightX + 120, rightY, {
          align: "right",
        });
        rightY += 12;
      }
    }

    // Total Amount (with background)
    pdfDoc.rect(rightX, rightY, 150, 15).fill([240, 240, 240]);
    pdfDoc.font("Helvetica-Bold").text("Total Amount", rightX + 5, rightY + 5);
    pdfDoc.text(`Rs.${formatCurrency(totalAmount)}`, rightX + 120, rightY + 5, {
      align: "right",
    });

    currentY = Math.max(totalsY + 50, rightY + 20);
  };

  // Draw Bank and Signature Section
  const drawBankAndSignature = () => {
    if (currentY > pageHeight - 150) {
      addNewPage();
    }

    const sectionY = currentY;

    // Top border
    pdfDoc
      .moveTo(margin, sectionY)
      .lineTo(pageWidth - margin, sectionY)
      .stroke(PRIMARY_BLUE);

    currentY += 10;

    if (!shouldHideBankDetails) {
      // Bank Details (60%)
      const bankX = margin;
      
      pdfDoc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY_BLUE)
        .text("Bank Details:", bankX, currentY);
      currentY += 15;

      if (bankData && isBankDetailAvailable) {
        pdfDoc.fontSize(8).font("Helvetica-Normal").fillColor(DARK_TEXT);

        const putBankDetail = (label, value, y) => {
          pdfDoc.font("Helvetica-Bold").text(`${label}:`, bankX, y);
          pdfDoc.font("Helvetica-Normal").text(value, bankX + 65, y);
        };

        let bankY = currentY;

        if (bankData.bankName) {
          putBankDetail("Name", capitalizeWords(bankData.bankName), bankY);
          bankY += 10;
        }

        if (bankData.ifscCode) {
          putBankDetail("IFSC", capitalizeWords(bankData.ifscCode), bankY);
          bankY += 10;
        }

        if (bankData.accountNo) {
          putBankDetail("Acc. No", bankData.accountNo, bankY);
          bankY += 10;
        }

        if (bankData.branchAddress) {
          putBankDetail("Branch", capitalizeWords(bankData.branchAddress), bankY);
          bankY += 10;
        }

        if (bankData.upiDetails?.upiId) {
          putBankDetail("UPI ID", bankData.upiDetails.upiId, bankY);
          bankY += 10;
        }

        if (bankData.upiDetails?.upiName) {
          putBankDetail("UPI Name", capitalizeWords(bankData.upiDetails.upiName), bankY);
          bankY += 10;
        }

        if (bankData.upiDetails?.upiMobile) {
          putBankDetail("UPI Mobile", bankData.upiDetails.upiMobile, bankY);
          bankY += 10;
        }

        currentY = Math.max(currentY, bankY);
      } else {
        pdfDoc
          .fontSize(8)
          .fillColor([102, 102, 102])
          .text("BANK DETAILS NOT AVAILABLE", bankX, currentY);
        currentY += 15;
      }

      // QR Code
      if (bankData?.qrCode) {
        try {
          const qrX = bankX + 200;
          const qrY = sectionY + 15;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bankData.qrCode}`,
            qrX,
            qrY,
            { width: 80, height: 80 }
          );
          pdfDoc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor(DARK_TEXT)
            .text("QR Code", qrX + 25, qrY + 85);
        } catch (error) {
          console.log("QR code not found");
        }
      }
    }

    // Signature Section (38%)
    const sigX = pageWidth - margin - contentWidth * 0.38;
    const sigY = sectionY + 10;

    // Stamp/Signature Box
    pdfDoc.rect(sigX, sigY + 40, 88, 55).stroke(BORDER_COLOR);
    
    pdfDoc
      .fontSize(7)
      .text(company?.businessName || "Company", sigX, sigY + 50, {
        width: 88,
        align: "center",
      });

    pdfDoc
      .fontSize(7)
      .text("AUTHORISED SIGNATORY", sigX, sigY + 100, {
        width: 88,
        align: "center",
      });

    currentY = Math.max(currentY, sigY + 110);
  };

  // Draw Terms and Conditions
  const drawTermsAndConditions = () => {
    if (currentY > pageHeight - 80) {
      addNewPage();
    }

    if (transaction?.notes) {
      // Top border
      pdfDoc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke(PRIMARY_BLUE);

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
      .fontSize(7)
      .fillColor([102, 102, 102])
      .text(
        `${currentPage} / ${currentPage} Page`,
        pageWidth - margin - 30,
        pageHeight - margin - 10,
        { align: "right" }
      );
  };

  // Main execution
  drawHeader();
  drawPartySection();
  drawTableHeader();
  drawTableRows();
  drawTotalsSection();
  drawBankAndSignature();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplate20 };