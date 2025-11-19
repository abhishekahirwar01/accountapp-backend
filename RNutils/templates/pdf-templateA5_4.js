// backend/templates/templateA5_4.js
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

const generateTemplateA5_4 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank,
  client
) => {
  // A5 landscape dimensions
  const pageWidth = 595; // A5 landscape width
  const pageHeight = 420; // A5 landscape height
  const margin = 15;
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

  const shouldHideBankDetails = transaction.type === "proforma";
  const bankData = bank || {};
  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  // Column widths
  const colWidthsIGST = ["4%", "30%", "10%", "8%", "10%", "15%", "20%", "12%"];
  const colWidthsCGSTSGST = ["4%", "30%", "10%", "8%", "10%", "12%", "12%", "12%", "15%"];
  const colWidthsNoTax = ["10%", "25%", "10%", "10%", "10%", "15%", "20%"];

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;

  const totalColumnIndex = showIGST ? 7 : showCGSTSGST ? 8 : 6;
  const tableWidth = showCGSTSGST ? 488 : showIGST ? 505 : 550;

  // Function to add new page
  const addNewPage = () => {
    pdfDoc.addPage({ size: [pageWidth, pageHeight] });
    currentY = margin;
    currentPage++;
    drawThreeColumnSection();
  };

  // Helper function to get client name
  const getClientName = (client) => {
    if (!client) return "Client Name";
    if (typeof client === "string") return client;
    return client.companyName || client.contactName || "Client Name";
  };

  // Draw Three Column Section
  const drawThreeColumnSection = () => {
    // Draw outer border for the section
    pdfDoc.rect(margin, currentY, contentWidth, 180)
          .strokeColor([3, 113, 193])
          .lineWidth(1.5)
          .stroke();

    const sectionY = currentY;
    const columnWidth = contentWidth / 4;
    let maxY = sectionY;

    // Column 1 - Company details
    let col1Y = sectionY + 5;
    
    // Company Header
    pdfDoc.fontSize(18).font("Helvetica-Bold");
    const companyName = capitalizeWords(
      company?.businessName || company?.companyName || "Company Name"
    );
    pdfDoc.text(companyName, margin + 5, col1Y, { 
      width: columnWidth - 10,
      align: "left"
    });
    col1Y += 20;

    // Company Details
    pdfDoc.fontSize(10).font("Helvetica");
    
    const companyDetails = [
      { 
        label: "Address", 
        value: [
          company?.address,
          company?.City,
          company?.addressState,
          company?.Country,
          company?.Pincode,
        ].filter(Boolean).join(", ") || "Address Line 1"
      },
      { 
        label: "Phone", 
        value: company?.mobileNumber
          ? formatPhoneNumber(String(company.mobileNumber))
          : company?.Telephone
          ? formatPhoneNumber(String(company.Telephone))
          : "-"
      },
      { label: "GSTIN", value: company?.gstin || "-" },
      { label: "PAN", value: company?.PANNumber || "-" }
    ];

    companyDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, margin + 5, col1Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 45);
      pdfDoc.font("Helvetica").text(valueLines, margin + 45, col1Y);
      col1Y += valueLines.length * 12 + 4;
    });

    maxY = Math.max(maxY, col1Y);

    // Draw vertical border between columns
    pdfDoc.moveTo(margin + columnWidth, sectionY)
          .lineTo(margin + columnWidth, sectionY + 180)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Column 2 - Invoice Details
    const col2X = margin + columnWidth + 5;
    let col2Y = sectionY + 5;

    // Invoice Header
    pdfDoc.fontSize(12).font("Helvetica-Bold").fillColor([3, 113, 193]);
    const invoiceTitle = transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE";
    pdfDoc.text(invoiceTitle, col2X, col2Y, { 
      width: columnWidth - 10,
      align: "left"
    });
    col2Y += 15;

    pdfDoc.fontSize(10).font("Helvetica").fillColor([0, 0, 0]);
    
    const invoiceDetails = [
      { label: "Invoice No.", value: transaction.invoiceNumber || "N/A" },
      { label: "Invoice Date", value: new Date(transaction.date).toLocaleDateString("en-IN") },
      { label: "Due Date", value: new Date(transaction.dueDate).toLocaleDateString("en-IN") }
    ];

    invoiceDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col2X, col2Y);
      pdfDoc.font("Helvetica").text(detail.value, col2X + 55, col2Y);
      col2Y += 12;
    });

    // Empty space rows
    col2Y += 25;

    maxY = Math.max(maxY, col2Y);

    // Draw vertical border between columns
    pdfDoc.moveTo(margin + columnWidth * 2, sectionY)
          .lineTo(margin + columnWidth * 2, sectionY + 180)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Column 3 - Buyer Details
    const col3X = margin + columnWidth * 2 + 5;
    let col3Y = sectionY + 5;

    // Buyer Header
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    pdfDoc.text(`To, ${capitalizeWords(party?.name || "N/A")}`, col3X, col3Y, {
      width: columnWidth - 10,
      align: "left"
    });
    col3Y += 15;

    pdfDoc.fontSize(8).font("Helvetica");
    
    const buyerDetails = [
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
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col3X, col3Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 45);
      pdfDoc.font("Helvetica").text(valueLines, col3X + 55, col3Y);
      col3Y += valueLines.length * 8 + 4;
    });

    maxY = Math.max(maxY, col3Y);

    // Draw vertical border between columns
    pdfDoc.moveTo(margin + columnWidth * 3, sectionY)
          .lineTo(margin + columnWidth * 3, sectionY + 180)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Column 4 - Consignee Details
    const col4X = margin + columnWidth * 3 + 5;
    let col4Y = sectionY + 5;

    // Consignee Header
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    const consigneeName = capitalizeWords(shippingAddress?.label || party?.name || "N/A");
    pdfDoc.text(`Shipped To, ${consigneeName}`, col4X, col4Y, {
      width: columnWidth - 10,
      align: "left"
    });
    col4Y += 15;

    pdfDoc.fontSize(8).font("Helvetica");
    
    const consigneeDetails = [
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
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col4X, col4Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 45);
      pdfDoc.font("Helvetica").text(valueLines, col4X + 45, col4Y);
      col4Y += valueLines.length * 8 + 4;
    });

    maxY = Math.max(maxY, col4Y);
    currentY = sectionY + 185;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin;

    // Table Header
    pdfDoc.rect(tableX, currentY, tableWidth, 20).fill([3, 113, 193]);
    
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
      pdfDoc.text(header, headerX + 4, currentY + 6, {
        width: width - 8,
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
      }

      // Draw row with alternating background
      const rowColor = index % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      pdfDoc.rect(tableX, currentY, tableWidth, 20)
            .fillColor(rowColor)
            .fill()
            .strokeColor([3, 113, 193])
            .lineWidth(0.5)
            .stroke();

      let cellX = tableX;

      // Sr. No.
      const srNoWidth = (parseFloat(colWidths[0]) / 100) * tableWidth;
      pdfDoc.text((index + 1).toString(), cellX + 4, currentY + 8, {
        width: srNoWidth - 8,
        align: "center"
      });
      cellX += srNoWidth;

      // Product Name
      const productWidth = (parseFloat(colWidths[1]) / 100) * tableWidth;
      pdfDoc.text(capitalizeWords(item.name), cellX + 4, currentY + 8, {
        width: productWidth - 8,
        align: "left"
      });
      cellX += productWidth;

      // HSN/SAC
      const hsnWidth = (parseFloat(colWidths[2]) / 100) * tableWidth;
      pdfDoc.text(item.code || "-", cellX + 4, currentY + 8, {
        width: hsnWidth - 8,
        align: "center"
      });
      cellX += hsnWidth;

      // Quantity
      const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
      const qtyText = item.itemType === "service" ? "-" : formatQuantity(item.quantity || 0, item.unit);
      pdfDoc.text(qtyText, cellX + 4, currentY + 8, {
        width: qtyWidth - 8,
        align: "center"
      });
      cellX += qtyWidth;

      // Rate
      const rateWidth = (parseFloat(colWidths[4]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.pricePerUnit || 0), cellX + 4, currentY + 8, {
        width: rateWidth - 8,
        align: "center"
      });
      cellX += rateWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.taxableValue), cellX + 4, currentY + 8, {
        width: taxableWidth - 8,
        align: "center"
      });
      cellX += taxableWidth;

      // GST Columns
      if (showIGST) {
        const igstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
        const igstText = `${item.gstRate}\n${formatCurrency(item.igst)}`;
        const igstLines = igstText.split('\n');
        igstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 4, currentY + 5 + (lineIndex * 6), {
            width: igstWidth - 8,
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
          pdfDoc.text(line, cellX + 4, currentY + 5 + (lineIndex * 6), {
            width: cgstWidth - 8,
            align: "center"
          });
        });
        cellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
        const sgstText = `${(item.gstRate / 2).toFixed(2)}\n${formatCurrency(item.sgst)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 4, currentY + 5 + (lineIndex * 6), {
            width: sgstWidth - 8,
            align: "center"
          });
        });
        cellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.total), cellX + 4, currentY + 8, {
        width: totalWidth - 8,
        align: "center"
      });

      currentY += 20;
    });

    // Total Row
    pdfDoc.rect(tableX, currentY, tableWidth, 20)
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
    pdfDoc.text("Total", totalX + 4, currentY + 8, {
      width: totalLabelWidth - 8,
      align: "center"
    });
    totalX += totalLabelWidth;

    // Total Qty
    const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
    pdfDoc.text(totalQty.toString(), totalX + 4, currentY + 8, {
      width: qtyWidth - 8,
      align: "center"
    });
    totalX += qtyWidth;

    // Empty cell for Rate
    totalX += (parseFloat(colWidths[4]) / 100) * tableWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), totalX + 4, currentY + 8, {
      width: taxableWidth - 8,
      align: "center"
    });
    totalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalIGST), totalX + 4, currentY + 8, {
        width: igstWidth - 8,
        align: "center"
      });
      totalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalCGST), totalX + 4, currentY + 8, {
        width: cgstWidth - 8,
        align: "center"
      });
      totalX += cgstWidth;

      const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalSGST), totalX + 4, currentY + 8, {
        width: sgstWidth - 8,
        align: "center"
      });
      totalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalAmount), totalX + 4, currentY + 8, {
      width: grandTotalWidth - 8,
      align: "center"
    });

    currentY += 25;
  };

  // Draw HSN Summary Table
  const drawHsnSummary = () => {
    if (!isGSTApplicable) return;

    const hsnSummary = getHsnSummary(itemsWithGST, showIGST, showCGSTSGST);
    
    // HSN table column widths
    const hsnColWidths = showIGST
      ? ["25%", "20%", "30%", "25%"]
      : showCGSTSGST
      ? ["18%", "20%", "22%", "22%", "20%"]
      : ["40%", "30%", "30%"];

    const hsnTotalColumnIndex = showIGST ? 3 : showCGSTSGST ? 4 : 2;
    const hsnTableWidth = 450;
    const hsnTableX = margin + (contentWidth - hsnTableWidth) / 2;

    // HSN Table Header
    pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 20).fill([3, 113, 193]);
    
    let hsnHeaderX = hsnTableX;
    pdfDoc.fontSize(7).font("Helvetica-Bold").fillColor([255, 255, 255]);

    const hsnHeaders = ["HSN / SAC", "Taxable Value (Rs.)"];

    if (showIGST) {
      hsnHeaders.push("IGST", "Total (Rs.)");
    } else if (showCGSTSGST) {
      hsnHeaders.push("CGST", "SGST", "Total (Rs.)");
    } else {
      hsnHeaders.push("Total (Rs.)");
    }

    hsnHeaders.forEach((header, index) => {
      const width = (parseFloat(hsnColWidths[index]) / 100) * hsnTableWidth;
      pdfDoc.text(header, hsnHeaderX + 4, currentY + 6, {
        width: width - 8,
        align: "center"
      });
      hsnHeaderX += width;
    });

    currentY += 20;

    // HSN Table Rows
    pdfDoc.fontSize(7).font("Helvetica").fillColor([0, 0, 0]);

    hsnSummary.forEach((hsnItem, index) => {
      // Draw row with borders
      pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 20)
            .fillColor(index % 2 === 0 ? [255, 255, 255] : [240, 240, 240])
            .fill()
            .strokeColor([3, 113, 193])
            .lineWidth(0.5)
            .stroke();

      let hsnCellX = hsnTableX;

      // HSN Code
      const hsnCodeWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
      pdfDoc.text(hsnItem.hsnCode, hsnCellX + 4, currentY + 8, {
        width: hsnCodeWidth - 8,
        align: "center"
      });
      hsnCellX += hsnCodeWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.taxableValue), hsnCellX + 4, currentY + 8, {
        width: taxableWidth - 8,
        align: "center"
      });
      hsnCellX += taxableWidth;

      // GST Columns
      if (showIGST) {
        const igstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
        const igstText = `${hsnItem.taxRate}\n${formatCurrency(hsnItem.taxAmount)}`;
        const igstLines = igstText.split('\n');
        igstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 4, currentY + 5 + (lineIndex * 6), {
            width: igstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += igstWidth;
      } else if (showCGSTSGST) {
        // CGST
        const cgstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
        const cgstText = `${(hsnItem.taxRate / 2).toFixed(2)}\n${formatCurrency(hsnItem.cgstAmount)}`;
        const cgstLines = cgstText.split('\n');
        cgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 4, currentY + 5 + (lineIndex * 6), {
            width: cgstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
        const sgstText = `${(hsnItem.taxRate / 2).toFixed(2)}\n${formatCurrency(hsnItem.sgstAmount)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 4, currentY + 5 + (lineIndex * 6), {
            width: sgstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.total), hsnCellX + 4, currentY + 8, {
        width: totalWidth - 8,
        align: "center"
      });

      currentY += 20;
    });

    // HSN Total Row
    pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 20)
          .fillColor([234, 244, 255])
          .fill()
          .strokeColor([3, 113, 193])
          .lineWidth(0.5)
          .stroke();

    pdfDoc.fontSize(7).font("Helvetica-Bold");

    let hsnTotalX = hsnTableX;

    // Total label
    const totalLabelWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
    pdfDoc.text("Total", hsnTotalX + 4, currentY + 8, {
      width: totalLabelWidth - 8,
      align: "center"
    });
    hsnTotalX += totalLabelWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), hsnTotalX + 4, currentY + 8, {
      width: taxableWidth - 8,
      align: "center"
    });
    hsnTotalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalIGST), hsnTotalX + 4, currentY + 8, {
        width: igstWidth - 8,
        align: "center"
      });
      hsnTotalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalCGST), hsnTotalX + 4, currentY + 8, {
        width: cgstWidth - 8,
        align: "center"
      });
      hsnTotalX += cgstWidth;

      const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalSGST), hsnTotalX + 4, currentY + 8, {
        width: sgstWidth - 8,
        align: "center"
      });
      hsnTotalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalAmount), hsnTotalX + 4, currentY + 8, {
      width: grandTotalWidth - 8,
      align: "center"
    });

    currentY += 30;
  };

  // Draw Bottom Section
  const drawBottomSection = () => {
    // Draw outer border for bottom section
    pdfDoc.rect(margin, currentY, contentWidth, 120)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    const leftWidth = contentWidth * 0.55;
    const rightWidth = contentWidth * 0.45;

    // Left Section
    const leftX = margin + 5;
    
    // Total in words
    pdfDoc.fontSize(7).font("Helvetica-Bold");
    pdfDoc.text(`Total in words : ${numberToWords(totalAmount)}`, leftX, currentY + 5);
    
    // Draw horizontal line below total in words
    pdfDoc.moveTo(margin, currentY + 15)
          .lineTo(margin + leftWidth, currentY + 15)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Terms and Conditions
    if (transaction?.notes) {
      const termsY = currentY + 20;
      const parsedElements = parseHtmlToElements(transaction.notes, 10);
      renderParsedElementsForPDFKit(
        parsedElements,
        pdfDoc,
        leftX,
        termsY,
        leftWidth - 10
      );
    }

    // Draw vertical border between sections
    pdfDoc.moveTo(margin + leftWidth, currentY)
          .lineTo(margin + leftWidth, currentY + 120)
          .strokeColor([3, 113, 193])
          .lineWidth(1)
          .stroke();

    // Right Section - Totals and Bank Details
    const rightX = margin + leftWidth + 10;
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
    rightY += 15;

    // Bank Details
    if (transaction.type !== "proforma" && isBankDetailAvailable && !shouldHideBankDetails) {
      // Draw horizontal line above bank details
      pdfDoc.moveTo(rightX, rightY)
            .lineTo(rightX + rightWidth - 20, rightY)
            .strokeColor([3, 113, 193])
            .lineWidth(1)
            .stroke();
      
      rightY += 10;

      pdfDoc.font("Helvetica-Bold").text("Bank Details:", rightX, rightY);
      rightY += 10;

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
        pdfDoc.font("Helvetica-Bold").text(detail.label, rightX, rightY);
        pdfDoc.font("Helvetica").text(detail.value, rightX + 50, rightY);
        rightY += 10;
      });

      // QR Code
      if (bankData?.qrCode) {
        try {
          const qrSize = 45;
          const qrX = rightX + 120;
          pdfDoc.image(
            `${process.env.BASE_URL || ""}${bankData.qrCode}`,
            qrX,
            rightY - (bankDetails.length * 10) - 10,
            { width: qrSize, height: qrSize }
          );
          pdfDoc.fontSize(7).font("Helvetica-Bold").text("QR Code", qrX + 8, rightY - 15);
        } catch (error) {
          console.log("QR code not found");
        }
      }
    }

    currentY += 130;
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
  drawThreeColumnSection();
  drawItemsTable();
  drawHsnSummary();
  drawBottomSection();
  drawPageNumber();
};

module.exports = { generateTemplateA5_4 };