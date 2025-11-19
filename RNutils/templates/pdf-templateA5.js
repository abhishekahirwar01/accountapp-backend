// backend/templates/templateA5.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  getStateCode,
  numberToWords,
  getHsnSummary,
  formatPhoneNumber,
  formatQuantity
} = require("../pdf-utils");
const { capitalizeWords, parseNotesHtml } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElementsForPDFKit,
} = require("../HtmlNoteRendrer");

const generateTemplateA5 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank,
  client
) => {
  // A5 landscape page dimensions
  const pageWidth = 595; // A5 landscape width
  const pageHeight = 420; // A5 landscape height
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;
  let currentPage = 1;

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
    totalQty
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

  // Column widths for A5 landscape (more space available)
  const colWidthsIGST = ["4%", "25%", "10%", "8%", "10%", "15%", "20%", "12%"];
  const colWidthsCGSTSGST = ["4%", "20%", "10%", "8%", "10%", "12%", "12%", "15%", "20%"];
  const colWidthsNoTax = ["10%", "25%", "10%", "10%", "10%", "15%", "20%"];

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;

  const totalColumnIndex = showIGST ? 7 : showCGSTSGST ? 8 : 6;

  // Calculate table width for A5 landscape
  const tableWidth = showCGSTSGST ? 495 : showIGST ? 530 : 560;

  // Terms and conditions
  const { title } = parseNotesHtml(transaction?.notes || "");
  const termsTitle = title || "Terms and Conditions";

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage({ size: [pageWidth, pageHeight] });
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Helper function to get client name
  const getClientName = (client) => {
    if (!client) return "Client Name";
    if (typeof client === "string") return client;
    return client.companyName || client.contactName || "Client Name";
  };

  // Draw Header
  const drawHeader = () => {
    // Header container
    const headerY = currentY;

    // Logo (left side)
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, margin, headerY, { width: 70, height: 70 });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Company details (right side)
    const companyX = margin + 80;
    pdfDoc.fontSize(18).font("Helvetica-Bold");
    const companyName = capitalizeWords(
      company?.businessName || company?.companyName || "Company Name"
    );
    pdfDoc.text(companyName, companyX, headerY);

    currentY += 20;

    // Company address
    pdfDoc.fontSize(10).font("Helvetica");
    const companyAddress = [
      company?.address,
      company?.City,
      company?.addressState,
      company?.Country,
      company?.Pincode,
    ]
      .filter(Boolean)
      .join(", ") || "Address Line 1";
    
    const addressLines = pdfDoc.splitTextToSize(companyAddress, contentWidth - 80);
    addressLines.forEach(line => {
      pdfDoc.text(line, companyX, currentY);
      currentY += 12;
    });

    // Contact info
    currentY += 5;
    pdfDoc.fontSize(10).font("Helvetica-Bold").text("Name : ", companyX, currentY);
    pdfDoc.font("Helvetica").text(capitalizeWords(getClientName(client)), companyX + 35, currentY);
    pdfDoc.font("Helvetica-Bold").text(" | Phone : ", companyX + 120, currentY);
    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company?.mobileNumber)
      : company?.Telephone
      ? formatPhoneNumber(company.Telephone)
      : "-";
    pdfDoc.font("Helvetica").text(phoneText, companyX + 165, currentY);

    currentY += 20;
  };

  // Draw GST Row and Invoice Title
  const drawGSTAndTitle = () => {
    // GST Row
    if (company?.gstin) {
      pdfDoc.fontSize(10).font("Helvetica-Bold").text("GSTIN : ", margin, currentY);
      pdfDoc.font("Helvetica").text(company.gstin, margin + 40, currentY);
      currentY += 12;
    }

    // Invoice Title
    const invoiceTitle = transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE";
    
    pdfDoc.fontSize(16).font("Helvetica-Bold").fillColor([3, 113, 193]);
    pdfDoc.text(invoiceTitle, margin, currentY, { align: "center", width: contentWidth });
    currentY += 15;

    // Recipient Text
    pdfDoc.fontSize(10).font("Helvetica-Bold").fillColor([0, 0, 0]);
    pdfDoc.text("ORIGINAL FOR RECIPIENT", margin, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 18;
  };

  // Draw Three Column Section
  const drawThreeColumnSection = () => {
    // Draw outer border
    pdfDoc.rect(margin, currentY, contentWidth, 150)
          .strokeColor([3, 113, 193])
          .lineWidth(1.5)
          .stroke();

    const sectionY = currentY;
    const columnWidth = contentWidth / 3;
    let maxY = sectionY;

    // Column 1 - Details of Buyer
    let col1Y = sectionY + 5;
    
    // Buyer Header
    pdfDoc.fontSize(8).font("Helvetica-Bold").text("Details of Buyer | Billed to:", margin + 5, col1Y);
    col1Y += 12;

    // Buyer Details
    pdfDoc.fontSize(8).font("Helvetica");
    
    const buyerDetails = [
      { label: "Name", value: capitalizeWords(party?.name || "N/A") },
      { label: "Address", value: capitalizeWords(getBillingAddress(party)) || "-" },
      { label: "Phone", value: party?.contactNumber ? formatPhoneNumber(party.contactNumber) : "-" },
      { label: "GSTIN", value: party?.gstin || "-" },
      { label: "PAN", value: party?.pan || "-" },
      { 
        label: "Place of Supply", 
        value: shippingAddress?.state
          ? `${capitalizeWords(shippingAddress.state)} (${getStateCode(shippingAddress.state) || "-"})`
          : party?.state
          ? `${capitalizeWords(party.state)} (${getStateCode(party.state) || "-"})`
          : "-"
      }
    ];

    buyerDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, margin + 5, col1Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 45);
      pdfDoc.font("Helvetica").text(valueLines, margin + 40, col1Y);
      col1Y += valueLines.length * 8 + 4;
    });

    maxY = Math.max(maxY, col1Y);

    // Draw vertical border between columns
    pdfDoc.moveTo(margin + columnWidth, sectionY)
          .lineTo(margin + columnWidth, sectionY + 150)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Column 2 - Details of Consigned
    const col2X = margin + columnWidth + 5;
    let col2Y = sectionY + 5;

    // Consignee Header
    pdfDoc.fontSize(8).font("Helvetica-Bold").text("Details of Consigned | Shipped to:", col2X, col2Y);
    col2Y += 12;

    // Consignee Details
    const consigneeDetails = [
      { label: "Name", value: capitalizeWords(shippingAddress?.label || party?.name || "N/A") },
      { 
        label: "Address", 
        value: capitalizeWords(getShippingAddress(shippingAddress, getBillingAddress(party))) 
      },
      { label: "Country", value: "India" },
      { 
        label: "Phone", 
        value: shippingAddress?.contactNumber
          ? formatPhoneNumber(shippingAddress.contactNumber)
          : party?.contactNumber
          ? formatPhoneNumber(party.contactNumber)
          : "-"
      },
      { label: "GSTIN", value: party?.gstin || "-" },
      { 
        label: "State", 
        value: shippingAddress?.state
          ? `${capitalizeWords(shippingAddress.state)} (${getStateCode(shippingAddress.state) || "-"})`
          : party?.state
          ? `${capitalizeWords(party.state)} (${getStateCode(party.state) || "-"})`
          : "-"
      }
    ];

    consigneeDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col2X, col2Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 45);
      pdfDoc.font("Helvetica").text(valueLines, col2X + 35, col2Y);
      col2Y += valueLines.length * 8 + 4;
    });

    maxY = Math.max(maxY, col2Y);

    // Draw vertical border between columns
    pdfDoc.moveTo(margin + columnWidth * 2, sectionY)
          .lineTo(margin + columnWidth * 2, sectionY + 150)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Column 3 - Invoice Details
    const col3X = margin + columnWidth * 2 + 5;
    let col3Y = sectionY + 5;

    const invoiceDetails = [
      { label: "Invoice No.", value: transaction.invoiceNumber || "N/A" },
      { label: "Invoice Date", value: new Date(transaction.date).toLocaleDateString("en-IN") },
      { label: "Due Date", value: new Date(transaction.dueDate).toLocaleDateString("en-IN") },
      { label: "P.O. No.", value: transaction.voucher || "-" },
      { label: "E-Way No.", value: transaction.referenceNumber || "-" }
    ];

    invoiceDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col3X, col3Y);
      pdfDoc.font("Helvetica").text(detail.value, col3X + 55, col3Y);
      col3Y += 12;
    });

    // QR Code in Column 3
    if (transaction.type !== "proforma" && bankData?.qrCode) {
      try {
        col3Y += 10;
        pdfDoc.image(
          `${process.env.BASE_URL || ""}${bankData.qrCode}`,
          col3X + 10,
          col3Y,
          { width: 45, height: 45 }
        );
        pdfDoc.fontSize(7).font("Helvetica-Bold");
        pdfDoc.text("QR Code", col3X + 15, col3Y + 50);
        col3Y += 60;
      } catch (error) {
        console.log("QR code not found");
      }
    }

    maxY = Math.max(maxY, col3Y);
    currentY = sectionY + 155;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin;

    // Draw table outer border
    pdfDoc.rect(tableX, currentY, tableWidth, 20)
          .fillColor([3, 113, 193])
          .fill();

    let headerX = tableX;
    pdfDoc.fontSize(7).font("Helvetica-Bold").fillColor([255, 255, 255]);

    const headers = [
      "Sr. No.",
      "Name of Product/Service",
      "HSN/SAC",
      "Qty",
      "Rate (Rs.)",
      "Taxable Value (Rs.)"
    ];

    if (showIGST) {
      headers.push("IGST", "Total (Rs.)");
    } else if (showCGSTSGST) {
      headers.push("CGST", "SGST", "Total (Rs.)");
    } else {
      headers.push("Total (Rs.)");
    }

    headers.forEach((header, index) => {
      const width = (parseFloat(colWidths[index]) / 100) * tableWidth;
      pdfDoc.text(header, headerX + 2, currentY + 4, {
        width: width - 4,
        align: "center"
      });
      headerX += width;
    });

    currentY += 20;

    // Table Rows
    pdfDoc.fontSize(7).font("Helvetica").fillColor([0, 0, 0]);

    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        currentY = margin + 150;
        // Redraw table header on new page
        pdfDoc.rect(tableX, currentY, tableWidth, 20)
              .fillColor([3, 113, 193])
              .fill();
        currentY += 20;
      }

      // Draw row background
      const rowColor = index % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      pdfDoc.rect(tableX, currentY, tableWidth, 15)
            .fillColor(rowColor)
            .fill()
            .strokeColor([3, 113, 193])
            .lineWidth(0.5)
            .stroke();

      let cellX = tableX;

      // Sr. No.
      const srNoWidth = (parseFloat(colWidths[0]) / 100) * tableWidth;
      pdfDoc.text((index + 1).toString(), cellX + 2, currentY + 4, {
        width: srNoWidth - 4,
        align: "center"
      });
      cellX += srNoWidth;

      // Product Name
      const productWidth = (parseFloat(colWidths[1]) / 100) * tableWidth;
      pdfDoc.text(capitalizeWords(item.name), cellX + 2, currentY + 4, {
        width: productWidth - 4,
        align: "left"
      });
      cellX += productWidth;

      // HSN/SAC
      const hsnWidth = (parseFloat(colWidths[2]) / 100) * tableWidth;
      pdfDoc.text(item.code || "-", cellX + 2, currentY + 4, {
        width: hsnWidth - 4,
        align: "center"
      });
      cellX += hsnWidth;

      // Quantity
      const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
      const qtyText = item.itemType === "service" ? "-" : formatQuantity(item.quantity || 0, item.unit);
      pdfDoc.text(qtyText, cellX + 2, currentY + 4, {
        width: qtyWidth - 4,
        align: "center"
      });
      cellX += qtyWidth;

      // Rate
      const rateWidth = (parseFloat(colWidths[4]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.pricePerUnit || 0), cellX + 2, currentY + 4, {
        width: rateWidth - 4,
        align: "center"
      });
      cellX += rateWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.taxableValue), cellX + 2, currentY + 4, {
        width: taxableWidth - 4,
        align: "center"
      });
      cellX += taxableWidth;

      // GST Columns
      if (showIGST) {
        const igstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
        const igstText = `${item.gstRate}\n${formatCurrency(item.igst)}`;
        const igstLines = igstText.split('\n');
        igstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 2, currentY + 2 + (lineIndex * 5), {
            width: igstWidth - 4,
            align: "center"
          });
        });
        cellX += igstWidth;
      } else if (showCGSTSGST) {
        // CGST
        const cgstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
        const cgstText = `${(item.gstRate / 2).toFixed(2)}\n${formatCurrency(item.cgst)}`;
        const cgstLines = cgstText.split('\n');
        cgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 2, currentY + 2 + (lineIndex * 5), {
            width: cgstWidth - 4,
            align: "center"
          });
        });
        cellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
        const sgstText = `${(item.gstRate / 2).toFixed(2)}\n${formatCurrency(item.sgst)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 2, currentY + 2 + (lineIndex * 5), {
            width: sgstWidth - 4,
            align: "center"
          });
        });
        cellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.total), cellX + 2, currentY + 4, {
        width: totalWidth - 4,
        align: "center"
      });

      currentY += 15;
    });

    // Total Row
    pdfDoc.rect(tableX, currentY, tableWidth, 15)
          .fillColor([234, 244, 255])
          .fill()
          .strokeColor([3, 113, 193])
          .lineWidth(0.5)
          .stroke();

    pdfDoc.fontSize(7).font("Helvetica-Bold");

    let totalX = tableX;

    // Empty cells for first two columns
    totalX += (parseFloat(colWidths[0]) / 100) * tableWidth;
    totalX += (parseFloat(colWidths[1]) / 100) * tableWidth;

    // Total label
    const totalLabelWidth = (parseFloat(colWidths[2]) / 100) * tableWidth;
    pdfDoc.text("Total", totalX + 2, currentY + 4, {
      width: totalLabelWidth - 4,
      align: "center"
    });
    totalX += totalLabelWidth;

    // Total Qty
    const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
    pdfDoc.text(totalQty.toString(), totalX + 2, currentY + 4, {
      width: qtyWidth - 4,
      align: "center"
    });
    totalX += qtyWidth;

    // Empty cell for Rate
    totalX += (parseFloat(colWidths[4]) / 100) * tableWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), totalX + 2, currentY + 4, {
      width: taxableWidth - 4,
      align: "center"
    });
    totalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalIGST), totalX + 2, currentY + 4, {
        width: igstWidth - 4,
        align: "center"
      });
      totalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalCGST), totalX + 2, currentY + 4, {
        width: cgstWidth - 4,
        align: "center"
      });
      totalX += cgstWidth;

      const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalSGST), totalX + 2, currentY + 4, {
        width: sgstWidth - 4,
        align: "center"
      });
      totalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalAmount), totalX + 2, currentY + 4, {
      width: grandTotalWidth - 4,
      align: "center"
    });

    currentY += 25;
  };

  // Draw Bottom Section with Bank Details and Totals
  const drawBankDetailsAndTotals = () => {
    // Draw outer border for bottom section
    pdfDoc.rect(margin, currentY, contentWidth, 120)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Left Section (65%)
    const leftSectionWidth = contentWidth * 0.65;
    
    // Total in words
    pdfDoc.fontSize(7).font("Helvetica-Bold");
    pdfDoc.text(`Total in words : ${numberToWords(totalAmount)}`, margin + 5, currentY + 5);
    
    // Draw horizontal line below total in words
    pdfDoc.moveTo(margin, currentY + 15)
          .lineTo(margin + leftSectionWidth, currentY + 15)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Bank Details
    let bankY = currentY + 20;
    if (transaction.type !== "proforma" && isBankDetailAvailable) {
      pdfDoc.fontSize(9).font("Helvetica-Bold").text("Bank Details", margin + 5, bankY);
      bankY += 12;

      pdfDoc.fontSize(8).font("Helvetica");

      const bankDetails = [];
      if (bankData?.bankName) {
        bankDetails.push({ label: "Name:", value: capitalizeWords(bankData.bankName) });
      }
      if (bankData?.accountNo) {
        bankDetails.push({ label: "Acc. No:", value: bankData.accountNo });
      }
      if (bankData?.ifscCode) {
        bankDetails.push({ label: "IFSC:", value: bankData.ifscCode });
      }
      if (bankData?.branchAddress) {
        bankDetails.push({ label: "Branch:", value: bankData.branchAddress });
      }
      if (bankData?.upiDetails?.upiId) {
        bankDetails.push({ label: "UPI ID:", value: bankData.upiDetails.upiId });
      }

      bankDetails.forEach(detail => {
        pdfDoc.font("Helvetica-Bold").text(detail.label, margin + 5, bankY);
        pdfDoc.font("Helvetica").text(detail.value, margin + 75, bankY);
        bankY += 10;
      });
    }

    // Draw vertical border between sections
    pdfDoc.moveTo(margin + leftSectionWidth, currentY)
          .lineTo(margin + leftSectionWidth, currentY + 120)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Right Section (35%) - Totals
    const rightX = margin + leftSectionWidth + 10;
    let rightY = currentY + 20;

    // Taxable Amount
    pdfDoc.fontSize(8).font("Helvetica-Bold").text("Taxable Amount", rightX, rightY);
    pdfDoc.text(formatCurrency(totalTaxable), rightX + 80, rightY, { align: "right" });
    rightY += 12;

    // Total Tax
    if (isGSTApplicable) {
      pdfDoc.text("Total Tax", rightX, rightY);
      const totalTax = showIGST ? totalIGST : totalCGST + totalSGST;
      pdfDoc.text(formatCurrency(totalTax), rightX + 80, rightY, { align: "right" });
      rightY += 12;
    }

    // Total Amount
    pdfDoc.rect(rightX, rightY, 90, 15).fill([240, 240, 240]);
    pdfDoc.font("Helvetica-Bold").text(
      isGSTApplicable ? "Total Amount After Tax" : "Total Amount",
      rightX + 5,
      rightY + 5
    );
    pdfDoc.text(formatCurrency(totalAmount), rightX + 70, rightY + 5, { align: "right" });
    rightY += 20;

    // Company Footer
    pdfDoc.font("Helvetica").text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, rightX, rightY);
    pdfDoc.text("(E & O.E.)", rightX + 70, rightY, { align: "right" });

    currentY += 130;
  };

  // Draw Terms and Conditions
  const drawTermsAndConditions = () => {
    if (transaction?.notes) {
      const parsedElements = parseHtmlToElements(transaction.notes, 10);
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
    pdfDoc.fontSize(8).font("Helvetica").fillColor([102, 102, 102]);
    pdfDoc.text(
      `${currentPage} / ${currentPage} page`,
      pageWidth - margin - 30,
      pageHeight - margin - 10,
      { align: "right" }
    );
  };

  // Main execution
  drawHeader();
  drawGSTAndTitle();
  drawThreeColumnSection();
  drawItemsTable();
  drawBankDetailsAndTotals();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplateA5 };