// backend/templates/template8.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  getStateCode,
  numberToWords,
  formatQuantity,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords, parseNotesHtml } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElementsForPDFKit,
} = require("../HtmlNoteRenderer");

// Import styles
const { template8Styles } = require("./pdf-template-styles");

const generateTemplate8 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // A4 page dimensions
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
    itemsWithGST,
    isGSTApplicable,
    showIGST,
    showCGSTSGST,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  const logoSrc = company?.logo
    ? `${process.env.BASE_URL || ""}${company.logo}`
    : null;

  const bankData = bank || {};
  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  const shouldHideBankDetails = transaction.type === "proforma";

  // Define column widths based on GST applicability
  const getColWidths = () => {
    if (!isGSTApplicable) {
      return [35, 150, 60, 60, 50, 100, 135]; // Sum: 590
    } else if (showIGST) {
      return [35, 120, 50, 80, 80, 80, 40, 70, 115]; // Sum: 590
    } else {
      return [30, 100, 50, 50, 45, 60, 40, 60, 40, 60, 70]; // Sum: 590
    }
  };

  const colWidths = getColWidths();

  // Helper function to get total column index based on GST type
  const getTotalColumnIndex = () => {
    if (!isGSTApplicable) return 6;
    if (showIGST) return 8;
    return 10;
  };

  const totalColumnIndex = getTotalColumnIndex();

  // Apply style function
  const applyStyle = (style) => {
    if (style.fontSize) pdfDoc.fontSize(style.fontSize);
    if (style.fontFamily) {
      const fontMap = {
        'Helvetica': 'Helvetica',
        'Helvetica-Bold': 'Helvetica-Bold',
        'Helvetica-Oblique': 'Helvetica-Oblique'
      };
      pdfDoc.font(fontMap[style.fontFamily] || 'Helvetica');
    }
    if (style.color) {
      const colorMap = {
        '#000000': [0, 0, 0],
        '#ffffff': [255, 255, 255],
        '#0785E5': [7, 133, 229],
        '#3d3d3d': [61, 61, 61],
        '#2583C6': [37, 131, 198],
        '#bfbfbf': [191, 191, 191],
        '#d3d3d3': [211, 211, 211],
        '#E2E2E2': [226, 226, 226]
      };
      pdfDoc.fillColor(colorMap[style.color] || [0, 0, 0]);
    }
    if (style.fontWeight === 'bold' || style.fontWeight === 'semibold') {
      pdfDoc.font('Helvetica-Bold');
    }
  };

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage();
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Draw Header
  const drawHeader = () => {
    // Invoice Title
    applyStyle({ fontSize: 18, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text(
      transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : isGSTApplicable
        ? "TAX INVOICE"
        : "INVOICE",
      margin,
      currentY,
      { align: "center", width: contentWidth }
    );

    currentY += 20;

    // Company Name
    applyStyle({ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0785E5' });
    pdfDoc.text(
      capitalizeWords(company?.businessName || company?.companyName || "Company Name").toUpperCase(),
      margin,
      currentY,
      { align: "center", width: contentWidth }
    );

    currentY += 25;

    // Company Details
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#3d3d3d' });

    if (company?.gstin) {
      pdfDoc.font('Helvetica-Bold').text("GSTIN ", margin, currentY);
      pdfDoc.font('Helvetica').text(company.gstin, margin + 25, currentY);
      currentY += 10;
    }

    pdfDoc.text(capitalizeWords(company?.address || "Address Line 1"), margin, currentY);
    currentY += 8;

    pdfDoc.text(capitalizeWords(company?.City || "City"), margin, currentY);
    currentY += 8;

    const phoneText = company?.mobileNumber || company?.Telephone
      ? formatPhoneNumber(String(company?.mobileNumber || company?.Telephone))
      : "-";
    pdfDoc.font('Helvetica-Bold').text("Phone: ", margin, currentY);
    pdfDoc.font('Helvetica').text(phoneText, margin + 25, currentY);
    currentY += 8;

    pdfDoc.font('Helvetica-Bold').text("State: ", margin, currentY);
    pdfDoc.font('Helvetica').text(`${capitalizeWords(company?.addressState || "State")} - ${company?.Pincode || "Pincode"}`, margin + 25, currentY);
    currentY += 15;

    // Logo
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, pageWidth - margin - 65, margin + 25, { 
          width: 65, 
          height: 65 
        });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Blue divider
    pdfDoc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke([7, 133, 229]);
    currentY += 10;
  };

  // Draw Two Column Section
  const drawTwoColumnSection = () => {
    const leftWidth = contentWidth * 0.35;
    const middleWidth = contentWidth * 0.30;
    const rightWidth = contentWidth * 0.25;

    let maxY = currentY;

    // Customer Details (Left)
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#3d3d3d' });
    pdfDoc.text("Customer Details :", margin, currentY);
    currentY += 8;

    applyStyle({ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#3d3d3d' });
    pdfDoc.text(capitalizeWords(party?.name || "Jay Enterprises"), margin, currentY);
    currentY += 10;

    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#3d3d3d' });
    const customerAddress = capitalizeWords(getBillingAddress(party));
    const customerAddressLines = pdfDoc.splitTextToSize(customerAddress, leftWidth);
    customerAddressLines.forEach(line => {
      pdfDoc.text(line, margin, currentY);
      currentY += 8;
    });

    // Customer details
    const customerDetails = [
      { label: "GSTIN:", value: party?.gstin || "-" },
      { label: "PAN:", value: party?.pan || "-" }
    ];

    if (party?.contactNumber) {
      customerDetails.push({ 
        label: "Phone:", 
        value: formatPhoneNumber(party.contactNumber) 
      });
    }

    customerDetails.push({ 
      label: "Place of Supply:", 
      value: shippingAddress?.state
        ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
        : party?.state
        ? `${party.state} (${getStateCode(party.state) || "-"})`
        : "-"
    });

    customerDetails.forEach(detail => {
      pdfDoc.font('Helvetica-Bold').text(detail.label, margin, currentY);
      pdfDoc.font('Helvetica').text(detail.value, margin + 50, currentY);
      currentY += 8;
    });

    maxY = Math.max(maxY, currentY);
    currentY = maxY;

    // Shipping Address (Middle) - Reset Y position
    let middleY = maxY - (customerDetails.length * 8 + customerAddressLines.length * 8 + 18);
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#3d3d3d' });
    pdfDoc.text("Shipping address:", margin + leftWidth, middleY);
    middleY += 8;

    applyStyle({ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#3d3d3d' });
    pdfDoc.text(capitalizeWords(party?.name || " "), margin + leftWidth, middleY);
    middleY += 10;

    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#3d3d3d' });
    const shippingAddr = capitalizeWords(getShippingAddress(shippingAddress, getBillingAddress(party)));
    const shippingAddrLines = pdfDoc.splitTextToSize(shippingAddr, middleWidth);
    shippingAddrLines.forEach(line => {
      pdfDoc.text(line, margin + leftWidth, middleY);
      middleY += 8;
    });

    // Shipping details
    const shippingDetails = [];
    if (company?.Country) {
      shippingDetails.push({ label: "Country:", value: company.Country });
    }
    if (party?.contactNumber) {
      shippingDetails.push({ 
        label: "Phone:", 
        value: formatPhoneNumber(party.contactNumber) 
      });
    }
    shippingDetails.push(
      { label: "GSTIN:", value: party?.gstin || "-" },
      { 
        label: "State:", 
        value: shippingAddress?.state
          ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
          : party?.state
          ? `${party.state} (${getStateCode(party.state) || "-"})`
          : "-"
      }
    );

    shippingDetails.forEach(detail => {
      pdfDoc.font('Helvetica-Bold').text(detail.label, margin + leftWidth, middleY);
      pdfDoc.font('Helvetica').text(detail.value, margin + leftWidth + 40, middleY);
      middleY += 8;
    });

    maxY = Math.max(maxY, middleY);

    // Invoice Details (Right)
    const rightX = margin + leftWidth + middleWidth + 20;
    let rightY = maxY - (shippingDetails.length * 8 + shippingAddrLines.length * 8 + 18);

    const invoiceDetails = [
      { label: "Invoice #:", value: transaction?.invoiceNumber?.toString() || "2" },
      { label: "Invoice Date:", value: transaction?.date ? new Date(transaction.date).toLocaleDateString("en-GB") : "14-Oct-2022" },
      { label: "P.O. No.:", value: transaction?.voucher || "-" },
      { label: "P.O. Date:", value: transaction?.dueDate ? new Date(transaction.dueDate).toLocaleDateString("en-GB") : "-" }
    ];

    if (isGSTApplicable) {
      invoiceDetails.push({ label: "E-Way No.:", value: transaction?.referenceNumber || "-" });
    }

    invoiceDetails.forEach(detail => {
      pdfDoc.font('Helvetica-Bold').text(detail.label, rightX, rightY);
      pdfDoc.font('Helvetica').text(detail.value, rightX + 50, rightY);
      rightY += 12;
    });

    currentY = Math.max(maxY, rightY) + 10;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin;
    const tableWidth = 590;

    // Table Header
    pdfDoc.rect(tableX, currentY, tableWidth, 20).fill([7, 133, 229]);
    
    let headerX = tableX;
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff' });

    // Headers
    const headers = ["Sr.No", "Name of Product / Service", "HSN/SAC", "Rate (Rs.)", "Qty", "Taxable Value (Rs.)"];

    if (showIGST) {
      headers.push("IGST%", "IGST Amount (Rs.)", "Total (Rs.)");
    } else if (showCGSTSGST) {
      headers.push("CGST%", "CGST Amount (Rs.)", "SGST%", "SGST Amount (Rs.)", "Total (Rs.)");
    } else {
      headers.push("Total (Rs.)");
    }

    headers.forEach((header, index) => {
      const width = colWidths[index];
      pdfDoc.text(header, headerX + 4, currentY + 6, {
        width: width - 8,
        align: index === 1 ? "left" : "center"
      });
      headerX += width;
    });

    currentY += 20;

    // Table Rows
    applyStyle({ fontSize: 7, fontFamily: 'Helvetica', color: '#3d3d3d' });

    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 150) {
        addNewPage();
        currentY = margin + 150;
        // Redraw table header
        pdfDoc.rect(tableX, currentY, tableWidth, 20).fill([7, 133, 229]);
        currentY += 20;
      }

      // Draw row background
      pdfDoc.rect(tableX, currentY, tableWidth, 15).fill([255, 255, 255]).stroke([7, 133, 229]);

      let cellX = tableX;

      // Sr. No.
      pdfDoc.text((index + 1).toString(), cellX + 4, currentY + 5, {
        width: colWidths[0] - 8,
        align: "center"
      });
      cellX += colWidths[0];

      // Product Name
      pdfDoc.text(capitalizeWords(item.name), cellX + 4, currentY + 5, {
        width: colWidths[1] - 8,
        align: "left"
      });
      cellX += colWidths[1];

      // HSN/SAC
      pdfDoc.text(item.code || "-", cellX + 4, currentY + 5, {
        width: colWidths[2] - 8,
        align: "center"
      });
      cellX += colWidths[2];

      // Rate
      pdfDoc.text(formatCurrency(item.pricePerUnit || 0), cellX + 4, currentY + 5, {
        width: colWidths[3] - 8,
        align: "center"
      });
      cellX += colWidths[3];

      // Quantity
      const qtyText = item.itemType === "service" ? "-" : formatQuantity(item.quantity || 0, item.unit);
      pdfDoc.text(qtyText, cellX + 4, currentY + 5, {
        width: colWidths[4] - 8,
        align: "center"
      });
      cellX += colWidths[4];

      // Taxable Value
      pdfDoc.text(formatCurrency(item.taxableValue), cellX + 4, currentY + 5, {
        width: colWidths[5] - 8,
        align: "center"
      });
      cellX += colWidths[5];

      // GST Columns
      if (showIGST) {
        pdfDoc.text(item.gstRate.toFixed(2), cellX + 4, currentY + 5, {
          width: colWidths[6] - 8,
          align: "center"
        });
        cellX += colWidths[6];

        pdfDoc.text(formatCurrency(item.igst), cellX + 4, currentY + 5, {
          width: colWidths[7] - 8,
          align: "center"
        });
        cellX += colWidths[7];
      } else if (showCGSTSGST) {
        pdfDoc.text((item.gstRate / 2).toFixed(2), cellX + 4, currentY + 5, {
          width: colWidths[6] - 8,
          align: "center"
        });
        cellX += colWidths[6];

        pdfDoc.text(formatCurrency(item.cgst), cellX + 4, currentY + 5, {
          width: colWidths[7] - 8,
          align: "center"
        });
        cellX += colWidths[7];

        pdfDoc.text((item.gstRate / 2).toFixed(2), cellX + 4, currentY + 5, {
          width: colWidths[8] - 8,
          align: "center"
        });
        cellX += colWidths[8];

        pdfDoc.text(formatCurrency(item.sgst), cellX + 4, currentY + 5, {
          width: colWidths[9] - 8,
          align: "center"
        });
        cellX += colWidths[9];
      }

      // Total
      pdfDoc.text(formatCurrency(item.total), cellX + 4, currentY + 5, {
        width: colWidths[totalColumnIndex] - 8,
        align: "center"
      });

      currentY += 15;
    });

    // Grey divider
    pdfDoc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke([211, 211, 211]);
    currentY += 10;
  };

  // Draw Totals Section
  const drawTotalsSection = () => {
    const leftWidth = contentWidth * 0.5;
    const rightWidth = contentWidth * 0.3;

    // Left side - Total Items/Qty
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica' });
    pdfDoc.text(`Total Items / Qty : ${totalItems} / ${totalQty}`, margin, currentY);
    currentY += 15;

    // Right side - Totals box
    const totalsX = pageWidth - margin - rightWidth;

    // Draw totals box border
    pdfDoc.rect(totalsX, currentY, rightWidth, isGSTApplicable ? 95 : 65).stroke([191, 191, 191]);

    let totalsY = currentY + 5;

    // Taxable Amount
    pdfDoc.font('Helvetica-Bold').text("Taxable Amount", totalsX + 5, totalsY);
    pdfDoc.text(`Rs ${formatCurrency(totalTaxable)}`, totalsX + rightWidth - 60, totalsY);
    totalsY += 15;

    // GST breakdown
    if (isGSTApplicable) {
      if (showIGST) {
        pdfDoc.font('Helvetica-Bold').text("IGST", totalsX + 5, totalsY);
        pdfDoc.text(`Rs ${formatCurrency(totalIGST)}`, totalsX + rightWidth - 60, totalsY);
        totalsY += 15;
      } else if (showCGSTSGST) {
        pdfDoc.font('Helvetica-Bold').text("CGST", totalsX + 5, totalsY);
        pdfDoc.text(`Rs ${formatCurrency(totalCGST)}`, totalsX + rightWidth - 60, totalsY);
        totalsY += 15;

        pdfDoc.font('Helvetica-Bold').text("SGST", totalsX + 5, totalsY);
        pdfDoc.text(`Rs ${formatCurrency(totalSGST)}`, totalsX + rightWidth - 60, totalsY);
        totalsY += 15;
      }
    }

    // Total Amount (highlighted)
    pdfDoc.rect(totalsX, totalsY, rightWidth, 20).fill([226, 226, 226]);
    pdfDoc.font('Helvetica-Bold').text("Total Amount", totalsX + 5, totalsY + 7);
    pdfDoc.text(`Rs. ${formatCurrency(totalAmount)}`, totalsX + rightWidth - 60, totalsY + 7);

    currentY += (isGSTApplicable ? 100 : 70);
  };

  // Draw Total in Words
  const drawTotalInWords = () => {
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
    pdfDoc.text(`Total in words : ${numberToWords(totalAmount)}`, margin, currentY);
    currentY += 15;

    // Divider
    pdfDoc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke([211, 211, 211]);
    currentY += 10;
  };

  // Draw Bank Details and Signature
  const drawBankAndSignature = () => {
    if (!shouldHideBankDetails) {
      const leftWidth = contentWidth * 0.45;
      const middleWidth = contentWidth * 0.25;
      const rightWidth = contentWidth * 0.3;

      // Bank Details (Left)
      applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text("Bank Details:", margin, currentY);
      currentY += 12;

      applyStyle({ fontSize: 9, fontFamily: 'Helvetica' });

      if (bankData && isBankDetailAvailable) {
        const bankDetails = [];
        if (bankData.bankName) {
          bankDetails.push({ label: "Name:", value: capitalizeWords(bankData.bankName) });
        }
        if (bankData.ifscCode) {
          bankDetails.push({ label: "IFSC:", value: bankData.ifscCode });
        }
        if (bankData.accountNo) {
          bankDetails.push({ label: "Acc. No:", value: bankData.accountNo });
        }
        if (bankData.branchAddress) {
          bankDetails.push({ label: "Branch:", value: capitalizeWords(bankData.branchAddress) });
        }
        if (bankData.upiDetails?.upiId) {
          bankDetails.push({ label: "UPI ID:", value: bankData.upiDetails.upiId });
        }
        if (bankData.upiDetails?.upiName) {
          bankDetails.push({ label: "UPI Name:", value: bankData.upiDetails.upiName });
        }
        if (bankData.upiDetails?.upiMobile) {
          bankDetails.push({ label: "UPI Mobile:", value: bankData.upiDetails.upiMobile });
        }

        let bankY = currentY;
        bankDetails.forEach(detail => {
          pdfDoc.font('Helvetica-Bold').text(detail.label, margin, bankY);
          pdfDoc.font('Helvetica').text(detail.value, margin + 65, bankY);
          bankY += 8;
        });
      } else {
        pdfDoc.text("No bank details available", margin, currentY);
      }

      // QR Code (Middle)
      if (bankData?.qrCode) {
        try {
          const qrX = margin + leftWidth + 20;
          const qrY = currentY - 15;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bankData.qrCode}`,
            qrX,
            qrY,
            { width: 80, height: 80 }
          );
          applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
          pdfDoc.text("QR Code", qrX + 30, qrY + 85);
        } catch (error) {
          console.log("QR code not found");
        }
      }

      // Signature (Right)
      const signatureX = pageWidth - margin - rightWidth;
      applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, signatureX, currentY);

      // Signature box
      pdfDoc.rect(signatureX, currentY + 20, 70, 70)
        .stroke([153, 153, 153])
        .fill([255, 255, 255]);

      applyStyle({ fontSize: 7, fontFamily: 'Helvetica' });
      pdfDoc.text("AUTHORISED SIGNATORY", signatureX + 5, currentY + 95);

      currentY += 120;
    } else {
      // Just signature when no bank details
      const signatureX = pageWidth - margin - 100;
      applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, signatureX, currentY);

      pdfDoc.rect(signatureX, currentY + 20, 70, 70)
        .stroke([153, 153, 153])
        .fill([255, 255, 255]);

      applyStyle({ fontSize: 7, fontFamily: 'Helvetica' });
      pdfDoc.text("AUTHORISED SIGNATORY", signatureX + 5, currentY + 95);

      currentY += 120;
    }
  };

  // Draw Terms and Conditions
  const drawTermsAndConditions = () => {
    if (transaction?.notes) {
      // Blue top border
      pdfDoc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke([37, 131, 198]);
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
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica', color: '#666666' });
    pdfDoc.text(
      `${currentPage} / ${currentPage} page`,
      pageWidth - margin - 40,
      pageHeight - margin - 15,
      { align: "right" }
    );
  };

  // Main execution
  drawHeader();
  drawTwoColumnSection();
  drawItemsTable();
  drawTotalsSection();
  drawTotalInWords();
  drawBankAndSignature();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplate8 };