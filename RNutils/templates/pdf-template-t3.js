// backend/templates/template_t3.js
const {
  prepareTemplate8Data,
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  numberToWords,
  formatPhoneNumber,
  formatQuantity
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");

const generateTemplateT3 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // Thermal receipt dimensions (80mm width)
  const pageWidth = 280;
  const pageHeight = 1000; // Dynamic height for thermal paper
  
  let currentY = 10;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const {
    totalTaxable,
    totalAmount,
    itemsWithGST,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    showIGST,
    showCGSTSGST,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  const bankData = bank;
  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  // Helper function to draw separator line
  const drawSeparator = () => {
    pdfDoc.moveTo(margin, currentY)
          .lineTo(margin + contentWidth, currentY)
          .strokeColor([0, 0, 0])
          .stroke();
    currentY += 8;
  };

  // Set monospace font for thermal receipt
  pdfDoc.font("Courier");

  // Company Header (Centered)
  pdfDoc.fontSize(10).font("Courier-Bold");
  const companyName = capitalizeWords(
    company?.businessName || company?.companyName || "Company Name"
  );
  pdfDoc.text(companyName, margin, currentY, { align: "center", width: contentWidth });
  currentY += 8;

  pdfDoc.fontSize(7).font("Courier");
  const companyAddress = capitalizeWords(
    [company?.address, company?.City, company?.addressState]
      .filter(Boolean)
      .join(", ")
  );
  const addressLines = pdfDoc.splitTextToSize(companyAddress, contentWidth);
  addressLines.forEach(line => {
    pdfDoc.text(line, margin, currentY, { align: "center", width: contentWidth });
    currentY += 6;
  });

  const locationLine = `${capitalizeWords(company?.Country || "India")} - ${company?.Pincode || ""}`;
  pdfDoc.text(locationLine, margin, currentY, { align: "center", width: contentWidth });
  currentY += 6;

  const phoneText = company?.mobileNumber
    ? formatPhoneNumber(String(company.mobileNumber))
    : company?.Telephone
    ? formatPhoneNumber(String(company.Telephone))
    : "";
  if (phoneText) {
    pdfDoc.text(phoneText, margin, currentY, { align: "center", width: contentWidth });
    currentY += 8;
  }

  drawSeparator();

  // Invoice Title
  pdfDoc.font("Courier-Bold").fontSize(10);
  const invoiceTitle = transaction.type === "proforma"
    ? "PROFORMA INVOICE"
    : isGSTApplicable
    ? "TAX INVOICE"
    : "INVOICE";
  pdfDoc.text(invoiceTitle, margin, currentY, { align: "center", width: contentWidth });
  currentY += 10;

  drawSeparator();

  // Billed To and Invoice Details Section
  pdfDoc.fontSize(8).font("Courier");
  
  // Left side - Billed To
  const leftWidth = contentWidth * 0.6;
  pdfDoc.font("Courier-Bold").text("BILLED TO", margin, currentY);
  currentY += 6;
  
  pdfDoc.font("Courier");
  pdfDoc.text(capitalizeWords(party?.name || "N/A"), margin, currentY);
  currentY += 6;
  
  if (party?.contactNumber) {
    pdfDoc.text(formatPhoneNumber(party.contactNumber), margin, currentY);
    currentY += 6;
  }
  
  if (party?.gstin) {
    pdfDoc.text(party.gstin, margin, currentY);
    currentY += 6;
  }

  // Right side - Invoice # and Date
  const rightX = margin + leftWidth;
  let rightY = currentY - 18; // Align with Billed To section
  
  pdfDoc.font("Courier-Bold").text("INVOICE # :", rightX, rightY);
  pdfDoc.font("Courier").text(transaction.invoiceNumber || "N/A", rightX + 50, rightY);
  rightY += 6;

  pdfDoc.font("Courier-Bold").text("DATE :", rightX, rightY);
  const invoiceDate = transaction?.date
    ? new Date(transaction.date).toLocaleDateString("en-IN")
    : "N/A";
  pdfDoc.font("Courier").text(invoiceDate, rightX + 50, rightY);

  currentY = Math.max(currentY, rightY + 12);
  drawSeparator();

  // Table Header
  pdfDoc.font("Courier-Bold").fontSize(9);
  
  // Draw table header with borders
  pdfDoc.rect(margin, currentY, contentWidth, 12).stroke([0, 0, 0]);
  
  const colWidths = [contentWidth * 0.50, contentWidth * 0.35, contentWidth * 0.35, contentWidth * 0.25];
  let headerX = margin;
  
  pdfDoc.text("Item", headerX + 2, currentY + 4);
  headerX += colWidths[0];
  
  pdfDoc.text("Amount (Rs.)", headerX + 2, currentY + 4, { width: colWidths[1] - 4, align: "center" });
  headerX += colWidths[1];
  
  pdfDoc.text("GST", headerX + 2, currentY + 4, { width: colWidths[2] - 4, align: "center" });
  headerX += colWidths[2];
  
  pdfDoc.text("Total(Rs.)", headerX + 2, currentY + 4, { width: colWidths[3] - 4, align: "right" });
  currentY += 12;

  // Table Rows
  pdfDoc.fontSize(7).font("Courier");
  itemsWithGST.forEach((item, index) => {
    if (currentY > pageHeight - 200) {
      // Add new page if running out of space
      pdfDoc.addPage({ size: [pageWidth, pageHeight] });
      currentY = 10;
    }

    let rowX = margin;
    const rowHeight = 24;

    // Draw row border
    pdfDoc.rect(margin, currentY, contentWidth, rowHeight).stroke([0, 0, 0]);

    // Item Column (50%)
    const itemName = capitalizeWords(item.name);
    const quantityText = item.itemType !== "service" ? 
      formatQuantity(item.quantity || 0, item.unit) : '';
    const hsnSacText = `${item.itemType === "service" ? "SAC" : "HSN"}: ${item.code || "-"}`;

    pdfDoc.text(itemName, rowX + 2, currentY + 2, { width: colWidths[0] - 4 });
    
    if (item.itemType !== "service") {
      pdfDoc.text(quantityText, rowX + 2, currentY + 8, { width: colWidths[0] - 4 });
      pdfDoc.text(hsnSacText, rowX + 2, currentY + 14, { width: colWidths[0] - 4 });
    } else {
      pdfDoc.text(hsnSacText, rowX + 2, currentY + 8, { width: colWidths[0] - 4 });
    }
    rowX += colWidths[0];

    // Amount Column (35%)
    pdfDoc.text(
      formatCurrency(item.pricePerUnit || 0), 
      rowX + 2, 
      currentY + 8, 
      { width: colWidths[1] - 4, align: "center" }
    );
    rowX += colWidths[1];

    // GST Column (35%)
    let gstText = "";
    if (isGSTApplicable) {
      if (showIGST) {
        gstText = `IGST-${item.gstRate}%`;
      } else if (showCGSTSGST) {
        gstText = `CGST-${(item.gstRate || 0) / 2}%\nSGST-${(item.gstRate || 0) / 2}%`;
      } else {
        gstText = "No Tax Applicable";
      }
    } else {
      gstText = "No Tax";
    }

    const gstLines = gstText.split('\n');
    gstLines.forEach((line, lineIndex) => {
      pdfDoc.text(line, rowX + 2, currentY + 2 + (lineIndex * 6), { 
        width: colWidths[2] - 4, 
        align: "center" 
      });
    });
    rowX += colWidths[2];

    // Total Column (25%)
    pdfDoc.text(
      formatCurrency(item.total || 0), 
      rowX + 2, 
      currentY + 8, 
      { width: colWidths[3] - 4, align: "right" }
    );

    currentY += rowHeight;
  });

  drawSeparator();

  // Totals Section
  pdfDoc.font("Courier-Bold").fontSize(9);
  pdfDoc.text("TOTAL AMOUNT", margin, currentY, { align: "center", width: contentWidth });
  currentY += 10;

  // Draw totals box
  pdfDoc.rect(margin, currentY, contentWidth, 40).stroke([0, 0, 0]);
  
  pdfDoc.fontSize(8).font("Courier");
  
  // Subtotal
  pdfDoc.text("Subtotal:", margin + 5, currentY + 5);
  pdfDoc.text(`Rs ${formatCurrency(totalTaxable)}`, margin + contentWidth - 55, currentY + 5, {
    align: "right",
    width: 50
  });
  currentY += 8;

  // GST Breakdown
  if (isGSTApplicable) {
    if (showIGST) {
      pdfDoc.text("IGST:", margin + 5, currentY + 5);
      pdfDoc.text(`Rs ${formatCurrency(totalIGST)}`, margin + contentWidth - 55, currentY + 5, {
        align: "right",
        width: 50
      });
      currentY += 8;
    } else if (showCGSTSGST) {
      pdfDoc.text("CGST:", margin + 5, currentY + 5);
      pdfDoc.text(`Rs ${formatCurrency(totalCGST)}`, margin + contentWidth - 55, currentY + 5, {
        align: "right",
        width: 50
      });
      currentY += 8;

      pdfDoc.text("SGST:", margin + 5, currentY + 5);
      pdfDoc.text(`Rs ${formatCurrency(totalSGST)}`, margin + contentWidth - 55, currentY + 5, {
        align: "right",
        width: 50
      });
      currentY += 8;
    }
  }

  // Total Amount
  const totalLabel = isGSTApplicable ? "Total Amount After Tax" : "Total Amount";
  pdfDoc.font("Courier-Bold").text(`${totalLabel}:`, margin + 5, currentY + 5);
  pdfDoc.text(`Rs ${formatCurrency(totalAmount)}`, margin + contentWidth - 55, currentY + 5, {
    align: "right",
    width: 50
  });
  currentY += 15;

  // Amount in Words
  pdfDoc.font("Courier").fontSize(7);
  const amountWords = numberToWords(totalAmount);
  const wordsLines = pdfDoc.splitTextToSize(`Amount in Words: ${amountWords}`, contentWidth - 10);
  wordsLines.forEach((line, index) => {
    pdfDoc.text(line, margin + 5, currentY);
    currentY += 5;
  });
  currentY += 8;

  // UPI Payment Section
  if (bankData?.upiDetails?.upiId) {
    drawSeparator();

    // QR Code
    if (bankData?.qrCode) {
      try {
        const qrSize = 80;
        const qrX = margin + (contentWidth - qrSize) / 2;
        pdfDoc.image(
          `${process.env.BASE_URL || ""}${bankData.qrCode}`,
          qrX,
          currentY,
          { width: qrSize, height: qrSize }
        );
        
        pdfDoc.font("Courier-Bold").fontSize(9);
        pdfDoc.text("QR Code", margin, currentY + qrSize + 5, {
          align: "center",
          width: contentWidth
        });
        currentY += qrSize + 15;
      } catch (error) {
        console.log("QR code not found");
        currentY += 10;
      }
    }

    pdfDoc.fontSize(7).font("Courier");

    // UPI Details Box
    pdfDoc.rect(margin, currentY, contentWidth, 30).stroke([0, 0, 0]);
    
    // UPI Details
    if (bankData.upiDetails.upiId) {
      pdfDoc.text(`UPI ID: ${bankData.upiDetails.upiId}`, margin + 5, currentY + 5, {
        width: contentWidth - 10
      });
      currentY += 8;
    }

    if (bankData.upiDetails.upiName) {
      pdfDoc.text(`UPI Name: ${bankData.upiDetails.upiName}`, margin + 5, currentY + 5, {
        width: contentWidth - 10
      });
      currentY += 8;
    }

    if (bankData.upiDetails.upiMobile) {
      pdfDoc.text(`UPI Mobile No: ${bankData.upiDetails.upiMobile}`, margin + 5, currentY + 5, {
        width: contentWidth - 10
      });
      currentY += 8;
    }

    currentY += 10;
    drawSeparator();
  }

  // Bank Details Section (if UPI not available but bank details exist)
  if (bankData && isBankDetailAvailable && !bankData?.upiDetails?.upiId) {
    drawSeparator();

    pdfDoc.font("Courier-Bold").fontSize(9);
    pdfDoc.text("Bank Details", margin, currentY, { align: "center", width: contentWidth });
    currentY += 10;

    // Bank Details Box
    pdfDoc.rect(margin, currentY, contentWidth, 50).stroke([0, 0, 0]);

    pdfDoc.fontSize(8).font("Courier");

    let bankY = currentY + 5;
    if (bankData.bankName) {
      pdfDoc.text(`Bank Name: ${capitalizeWords(bankData.bankName)}`, margin + 5, bankY);
      bankY += 8;
    }

    if (bankData.accountNo) {
      pdfDoc.text(`Account No: ${bankData.accountNo}`, margin + 5, bankY);
      bankY += 8;
    }

    if (bankData.ifscCode) {
      pdfDoc.text(`IFSC Code: ${capitalizeWords(bankData.ifscCode)}`, margin + 5, bankY);
      bankY += 8;
    }

    if (bankData.branchAddress) {
      pdfDoc.text(`Branch: ${bankData.branchAddress}`, margin + 5, bankY);
      bankY += 8;
    }

    currentY = bankY + 5;
    drawSeparator();
  }

  // Footer
  currentY += 10;
  pdfDoc.fontSize(7);
  const footerText = `For ${capitalizeWords(
    company?.businessName || company?.companyName || "Company Name"
  )} (E & O.E.)`;
  pdfDoc.text(footerText, margin, currentY, { align: "center", width: contentWidth });
  
  // Thank you message
  currentY += 8;
  pdfDoc.font("Courier-Bold").fontSize(8);
  pdfDoc.text("Thank You For Your Business!", margin, currentY, { align: "center", width: contentWidth });
};

module.exports = { generateTemplateT3 };