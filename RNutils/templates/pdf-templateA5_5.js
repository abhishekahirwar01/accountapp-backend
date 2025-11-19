// backend/templates/templateA5_6.js
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
const { templateA5Styles } = require("./pdf-template-styles");

const getClientName = (client) => {
  console.log("getClientName called with:", client);
  if (!client) return "Client Name";
  if (typeof client === "string") return client;
  return client.companyName || client.contactName || "Client Name";
};

const generateTemplateA5_5 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank,
  client
) => {
  // A5 landscape dimensions
  const pageWidth = 595;
  const pageHeight = 420;
  const margin = templateA5Styles.page.padding || 20;
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
    showNoTax,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

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

  // Column widths
  const colWidthsIGST = ["4%", "25%", "10%", "8%", "10%", "15%", "20%", "12%"];
  const colWidthsCGSTSGST = ["4%", "30%", "10%", "8%", "10%", "12%", "12%", "15%", "10%"];
  const colWidthsNoTax = ["10%", "25%", "10%", "10%", "10%", "15%", "20%"];

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;

  const totalColumnIndex = showIGST ? 7 : showCGSTSGST ? 8 : 6;
  const tableWidth = showCGSTSGST ? 495 : showIGST ? 530 : 560;

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
        '#02006C': [2, 0, 108],
        '#D8D8E8': [216, 216, 232]
      };
      pdfDoc.fillColor(colorMap[style.color] || [0, 0, 0]);
    }
    if (style.fontWeight === 'bold' || style.fontWeight === 'extrabold') {
      pdfDoc.font('Helvetica-Bold');
    }
  };

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage({ size: [pageWidth, pageHeight] });
    currentY = margin;
    currentPage++;
    drawHeader();
  };

  // Draw Header
  const drawHeader = () => {
    // Draw header border
    pdfDoc.rect(margin, currentY, contentWidth, 80)
      .stroke([2, 0, 108])
      .fill([255, 255, 255]);

    // Logo (left side)
    if (logoSrc) {
      try {
        const logoStyle = templateA5Styles.logo || { width: 60, height: 60 };
        pdfDoc.image(logoSrc, margin + 10, currentY + 10, { 
          width: logoStyle.width, 
          height: logoStyle.height 
        });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Company details (right side of logo)
    const companyX = margin + 80;
    applyStyle(templateA5Styles.companyName || { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#02006C' });
    pdfDoc.text(
      capitalizeWords(company?.businessName || company?.companyName || "Company Name"),
      companyX,
      currentY + 10
    );

    currentY += 25;

    // Company address
    applyStyle(templateA5Styles.address || { fontSize: 10, fontFamily: 'Helvetica', color: '#02006C' });
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
      currentY += 8;
    });

    // Contact info - Phone and Email
    currentY += 2;
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#02006C' });
    pdfDoc.text("Phone : ", companyX, currentY);
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#02006C' });
    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company.mobileNumber)
      : "-";
    pdfDoc.text(phoneText, companyX + 25, currentY);
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#02006C' });
    pdfDoc.text(", E-mail : ", companyX + 80, currentY);
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#02006C' });
    pdfDoc.text(company?.emailId || "-", companyX + 120, currentY);

    currentY += 10;

    // Telephone
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#02006C' });
    pdfDoc.text("Telephone : ", companyX, currentY);
    applyStyle({ fontSize: 9, fontFamily: 'Helvetica', color: '#02006C' });
    pdfDoc.text(company?.Telephone || "-", companyX + 40, currentY);

    currentY = margin + 85;
  };

  // Draw GST and Title Section
  const drawGSTAndTitle = () => {
    // Table Header with border
    pdfDoc.rect(margin, currentY, contentWidth, 25)
      .stroke([2, 0, 108])
      .fill([255, 255, 255]);

    // GSTIN and Title Row
    const hasGSTIN = company?.gstin;
    
    if (hasGSTIN) {
      // GSTIN on left
      applyStyle({ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#02006C' });
      pdfDoc.text("GSTIN : ", margin + 10, currentY + 8);
      applyStyle({ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#02006C' });
      pdfDoc.text(company.gstin, margin + 40, currentY + 8);

      // Title in center
      const invoiceTitle = transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : isGSTApplicable
        ? "TAX INVOICE"
        : "INVOICE";
      
      applyStyle({ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#02006C' });
      pdfDoc.text(invoiceTitle, margin + contentWidth/2 - 50, currentY + 5, { align: "center" });
    } else {
      // Title on left when no GSTIN
      const invoiceTitle = transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : isGSTApplicable
        ? "TAX INVOICE"
        : "INVOICE";
      
      applyStyle({ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#02006C' });
      pdfDoc.text(invoiceTitle, margin + 10, currentY + 5);
    }

    // Recipient Text on right
    applyStyle({ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#02006C' });
    pdfDoc.text("ORIGINAL FOR RECIPIENT", margin + contentWidth - 80, currentY + 8);

    currentY += 30;
  };

  // Draw Three Column Section
  const drawThreeColumnSection = () => {
    const sectionHeight = 120;
    pdfDoc.rect(margin, currentY, contentWidth, sectionHeight)
      .stroke([2, 0, 108])
      .fill([255, 255, 255]);

    const columnWidth = contentWidth / 3;
    const col1X = margin;
    const col2X = margin + columnWidth;
    const col3X = margin + columnWidth * 2;

    // Column 1 - Details of Buyer
    let col1Y = currentY + 5;
    
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text("Details of Buyer | Billed to:", col1X + 5, col1Y);
    col1Y += 8;

    applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
    
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
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text(`${detail.label}:`, col1X + 5, col1Y);
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 40);
      pdfDoc.text(valueLines, col1X + 35, col1Y);
      col1Y += valueLines.length * 6 + 3;
    });

    // Column 2 - Details of Consigned
    let col2Y = currentY + 5;

    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text("Details of Consigned | Shipped to:", col2X + 5, col2Y);
    col2Y += 8;

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
          ? formatPhoneNumber(String(shippingAddress.contactNumber))
          : party?.contactNumber
          ? formatPhoneNumber(String(party.contactNumber))
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
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text(`${detail.label}:`, col2X + 5, col2Y);
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 40);
      pdfDoc.text(valueLines, col2X + 35, col2Y);
      col2Y += valueLines.length * 6 + 3;
    });

    // Column 3 - Invoice Details
    let col3Y = currentY + 5;

    const invoiceDetails = [
      { label: "Invoice No.", value: transaction.invoiceNumber || "N/A" },
      { label: "Invoice Date", value: new Date(transaction.date).toLocaleDateString("en-IN") },
      { label: "Due Date", value: new Date(transaction.dueDate).toLocaleDateString("en-IN") },
      { label: "P.O. No.", value: transaction.voucher || "-" },
      { label: "E-Way No.", value: transaction.referenceNumber || "-" }
    ];

    invoiceDetails.forEach(detail => {
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text(`${detail.label}:`, col3X + 5, col3Y);
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
      pdfDoc.text(detail.value, col3X + 45, col3Y);
      col3Y += 10;
    });

    // Draw vertical borders
    pdfDoc.moveTo(col2X, currentY).lineTo(col2X, currentY + sectionHeight).stroke([2, 0, 108]);
    pdfDoc.moveTo(col3X, currentY).lineTo(col3X, currentY + sectionHeight).stroke([2, 0, 108]);

    currentY += sectionHeight + 5;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin;

    // Table Header
    pdfDoc.rect(tableX, currentY, tableWidth, 15).fill([216, 216, 232]);
    
    let headerX = tableX;
    applyStyle({ fontSize: 7, fontFamily: 'Helvetica-Bold' });

    // Headers
    const headers = ["Sr. No.", "Name of Product/Service", "HSN/SAC", "Qty", "Rate (Rs.)", "Taxable Value (Rs.)"];

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

    currentY += 15;

    // Table Rows
    applyStyle({ fontSize: 7, fontFamily: 'Helvetica' });

    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        currentY = margin + 150;
        // Redraw table header
        pdfDoc.rect(tableX, currentY, tableWidth, 15).fill([216, 216, 232]);
        currentY += 15;
      }

      // Draw row background and border
      pdfDoc.rect(tableX, currentY, tableWidth, 12).fill([255, 255, 255]).stroke([2, 0, 108]);

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

      currentY += 12;
    });

    // Total Row
    pdfDoc.rect(tableX, currentY, tableWidth, 12).fill([216, 216, 232]).stroke([2, 0, 108]);
    applyStyle({ fontSize: 7, fontFamily: 'Helvetica-Bold' });

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

    currentY += 20;
  };

  // Draw Bottom Section with Bank Details and Totals
  const drawBottomSection = () => {
    const bottomSectionHeight = 120;
    pdfDoc.rect(margin, currentY, contentWidth, bottomSectionHeight)
      .stroke([2, 0, 108])
      .fill([255, 255, 255]);

    const leftWidth = contentWidth * 0.65;
    const rightWidth = contentWidth * 0.35;

    // Left Section - Total in words and Bank Details
    let leftY = currentY + 5;

    // Total in words
    applyStyle({ fontSize: 7, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text(`Total in words : ${numberToWords(totalAmount)}`, margin + 5, leftY);
    leftY += 12;

    // Bank Details
    if (transaction.type !== "proforma" && isBankDetailAvailable) {
      applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text("Bank Details:", margin + 5, leftY);
      leftY += 10;

      applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });

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
      if (bankData?.upiDetails?.upiName) {
        bankDetails.push({ label: "UPI Name:", value: bankData.upiDetails.upiName });
      }
      if (bankData?.upiDetails?.upiMobile) {
        bankDetails.push({ label: "UPI Mobile:", value: bankData.upiDetails.upiMobile });
      }

      bankDetails.forEach(detail => {
        applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
        pdfDoc.text(detail.label, margin + 5, leftY);
        applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
        pdfDoc.text(detail.value, margin + 75, leftY);
        leftY += 8;
      });

      // QR Code
      if (bankData?.qrCode) {
        try {
          const qrX = margin + leftWidth - 80;
          const qrY = currentY + 20;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bankData.qrCode}`,
            qrX,
            qrY,
            { width: 70, height: 70 }
          );
          applyStyle({ fontSize: 9, fontFamily: 'Helvetica-Bold' });
          pdfDoc.text("QR Code", qrX + 25, qrY + 75);
        } catch (error) {
          console.log("QR code not found");
        }
      }
    }

    // Right Section - Totals
    const rightX = margin + leftWidth + 10;
    let rightY = currentY + 5;

    // Taxable Amount
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text("Taxable Amount", rightX, rightY);
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text(formatCurrency(totalTaxable), rightX + 70, rightY, { align: "right" });
    rightY += 12;

    // Total Tax
    if (isGSTApplicable) {
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
      pdfDoc.text("Total Tax", rightX, rightY);
      applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
      const totalTax = showIGST ? totalIGST : totalCGST + totalSGST;
      pdfDoc.text(formatCurrency(totalTax), rightX + 70, rightY, { align: "right" });
      rightY += 12;
    }

    // Total Amount
    pdfDoc.rect(rightX, rightY, 90, 15).fill([216, 216, 232]);
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text(
      isGSTApplicable ? "Total Amount After Tax" : "Total Amount",
      rightX + 5,
      rightY + 5
    );
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica-Bold' });
    pdfDoc.text(formatCurrency(totalAmount), rightX + 70, rightY + 5, { align: "right" });
    rightY += 20;

    // Company Footer
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica' });
    pdfDoc.text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, rightX, rightY);
    pdfDoc.text("(E & O.E.)", rightX + 70, rightY, { align: "right" });

    currentY += bottomSectionHeight + 10;
  };

  // Draw Terms and Conditions
  const drawTermsAndConditions = () => {
    if (transaction?.notes) {
      const termsHeight = 60;
      pdfDoc.rect(margin, currentY, contentWidth, termsHeight)
        .stroke([2, 0, 108])
        .fill([255, 255, 255]);

      const parsedElements = parseHtmlToElements(transaction.notes, 7);
      currentY = renderParsedElementsForPDFKit(
        parsedElements,
        pdfDoc,
        margin + 5,
        currentY + 5,
        contentWidth - 10
      );
    }
  };

  // Draw Page Number
  const drawPageNumber = () => {
    applyStyle({ fontSize: 8, fontFamily: 'Helvetica', color: '#666666' });
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
  drawBottomSection();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplateA5_5 };