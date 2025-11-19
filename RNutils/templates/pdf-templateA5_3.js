// backend/templates/templateA5_3.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  getStateCode,
  numberToWords,
  getHsnSummary,
  formatQuantity,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords, parseNotesHtml } = require("../utils");
const {
  parseHtmlToElements,
  renderParsedElementsForPDFKit,
} = require("../HtmlNoteRendrer");

const getClientName = (client) => {
  if (!client) return "Client Name";
  if (typeof client === "string") return client;
  return client.companyName || client.contactName || "Client Name";
};

const generateTemplateA5_3 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank,
  client
) => {
  // A5 page dimensions
  const pageWidth = 420;
  const pageHeight = 595;
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
  const colWidthsIGST = ["5%", "22%", "11%", "8%", "11%", "15%", "16%", "12%"];
  const colWidthsCGSTSGST = ["5%", "20%", "11%", "8%", "10%", "11%", "11%", "12%", "12%"];
  const colWidthsNoTax = ["6%", "32%", "12%", "10%", "11%", "14%", "15%"];

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;

  const totalColumnIndex = showIGST ? 7 : showCGSTSGST ? 8 : 6;
  const tableWidth = 375.5;

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

  // Draw Header
  const drawHeader = () => {
    // Logo (left side)
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, margin, currentY, { 
          width: 50, 
          height: 50 
        });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Company details (right side)
    const companyX = margin + 60;
    pdfDoc.fontSize(12).font('Helvetica-Bold').fillColor([0, 0, 0]);
    pdfDoc.text(
      capitalizeWords(company?.businessName || company?.companyName || "Company Name"),
      companyX,
      currentY
    );

    currentY += 12;

    // Company address
    pdfDoc.fontSize(8).font('Helvetica');
    const companyAddress = [
      company?.address,
      company?.City,
      company?.addressState,
      company?.Country,
      company?.Pincode,
    ]
      .filter(Boolean)
      .join(", ") || "Address Line 1";
    
    const addressLines = pdfDoc.splitTextToSize(companyAddress, contentWidth - 60);
    addressLines.forEach(line => {
      pdfDoc.text(line, companyX, currentY);
      currentY += 6;
    });

    // Contact info
    currentY += 2;
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text("Name : ", companyX, currentY);
    pdfDoc.font('Helvetica');
    pdfDoc.text(capitalizeWords(getClientName(client)), companyX + 25, currentY);
    pdfDoc.font('Helvetica-Bold');
    pdfDoc.text(" | Phone : ", companyX + 100, currentY);
    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(String(company.mobileNumber))
      : company?.Telephone
      ? formatPhoneNumber(String(company.Telephone))
      : "-";
    pdfDoc.font('Helvetica');
    pdfDoc.text(phoneText, companyX + 140, currentY);

    currentY += 15;
  };

  // Draw GST and Title Section
  const drawGSTAndTitle = () => {
    // GST Row
    if (company?.gstin) {
      pdfDoc.fontSize(8).font('Helvetica-Bold');
      pdfDoc.text("GSTIN : ", margin, currentY);
      pdfDoc.font('Helvetica');
      pdfDoc.text(company.gstin, margin + 30, currentY);
      currentY += 10;
    }

    // Invoice Title
    const invoiceTitle = transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE";
    
    pdfDoc.fontSize(10).font('Helvetica-Bold');
    pdfDoc.text(invoiceTitle, margin, currentY, { align: "center", width: contentWidth });
    currentY += 12;

    // Recipient Text
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text("ORIGINAL FOR RECIPIENT", margin, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 15;
  };

  // Draw Three Column Section
  const drawThreeColumnSection = () => {
    const sectionStartY = currentY;
    const columnWidth = contentWidth / 3;
    let maxY = sectionStartY;

    // Column 1 - Details of Buyer
    let col1Y = sectionStartY;
    
    // Buyer Header
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text("Details of Buyer | Billed to:", margin, col1Y);
    col1Y += 8;

    // Buyer Details
    pdfDoc.fontSize(7).font('Helvetica');
    
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
      pdfDoc.font('Helvetica-Bold');
      pdfDoc.text(`${detail.label}:`, margin, col1Y);
      pdfDoc.font('Helvetica');
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 35);
      pdfDoc.text(valueLines, margin + 30, col1Y);
      col1Y += valueLines.length * 5 + 3;
    });

    maxY = Math.max(maxY, col1Y);

    // Column 2 - Details of Consigned
    const col2X = margin + columnWidth;
    let col2Y = sectionStartY;

    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text("Details of Consigned | Shipped to:", col2X, col2Y);
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
      pdfDoc.font('Helvetica-Bold');
      pdfDoc.text(`${detail.label}:`, col2X, col2Y);
      pdfDoc.font('Helvetica');
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 35);
      pdfDoc.text(valueLines, col2X + 30, col2Y);
      col2Y += valueLines.length * 5 + 3;
    });

    maxY = Math.max(maxY, col2Y);

    // Column 3 - Invoice Details
    const col3X = margin + columnWidth * 2;
    let col3Y = sectionStartY;

    const invoiceDetails = [
      { label: "Invoice No.", value: transaction.invoiceNumber || "N/A" },
      { label: "Invoice Date", value: new Date(transaction.date).toLocaleDateString("en-IN") },
      { label: "Due Date", value: new Date(transaction.dueDate).toLocaleDateString("en-IN") },
      { label: "P.O. No.", value: transaction.voucher || "-" },
      { label: "E-Way No.", value: transaction.referenceNumber || "-" }
    ];

    invoiceDetails.forEach(detail => {
      pdfDoc.fontSize(7).font('Helvetica-Bold');
      pdfDoc.text(`${detail.label}:`, col3X, col3Y);
      pdfDoc.font('Helvetica');
      pdfDoc.text(detail.value, col3X + 45, col3Y);
      col3Y += 8;
    });

    // QR Code in Column 3
    if (transaction.type !== "proforma" && bankData?.qrCode) {
      try {
        col3Y += 5;
        pdfDoc.image(
          `${process.env.BASE_URL || ""}${bankData.qrCode}`,
          col3X + 10,
          col3Y,
          { width: 60, height: 60 }
        );
        pdfDoc.fontSize(8).font('Helvetica-Bold');
        pdfDoc.text("QR Code", col3X + 20, col3Y + 65);
        col3Y += 75;
      } catch (error) {
        console.log("QR code not found");
      }
    }

    maxY = Math.max(maxY, col3Y);
    currentY = maxY + 10;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin;

    // Table Header
    pdfDoc.rect(tableX, currentY, tableWidth, 15).fill([3, 113, 193]);
    
    let headerX = tableX;
    pdfDoc.fontSize(7).font('Helvetica-Bold').fillColor([255, 255, 255]);

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
    pdfDoc.fontSize(7).font('Helvetica').fillColor([0, 0, 0]);

    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        currentY = margin + 150;
        // Redraw table header
        pdfDoc.rect(tableX, currentY, tableWidth, 15).fill([3, 113, 193]);
        currentY += 15;
      }

      // Draw row background
      pdfDoc.rect(tableX, currentY, tableWidth, 12).fill([255, 255, 255]).stroke([3, 113, 193]);

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
    pdfDoc.rect(tableX, currentY, tableWidth, 12).fill([240, 240, 240]).stroke([3, 113, 193]);
    pdfDoc.fontSize(7).font('Helvetica-Bold');

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

  // Draw Total in Words
  const drawTotalInWords = () => {
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text(`Total in words : ${numberToWords(totalAmount)}`, margin, currentY);
    currentY += 12;
  };

  // Draw HSN Summary Table
  const drawHsnSummary = () => {
    if (!isGSTApplicable) return;

    const hsnSummary = getHsnSummary(itemsWithGST, showIGST, showCGSTSGST);
    
    // HSN table column widths
    const hsnColWidths = showIGST
      ? ["25%", "20%", "30%", "25%"]
      : showCGSTSGST
      ? ["18%", "20%", "22%", "22%", "18%"]
      : ["40%", "30%", "30%"];

    const hsnTotalColumnIndex = showIGST ? 3 : showCGSTSGST ? 4 : 2;
    const hsnTableWidth = 377;
    const hsnTableX = margin;

    // HSN Table Header
    pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 15).fill([3, 113, 193]);
    
    let hsnHeaderX = hsnTableX;
    pdfDoc.fontSize(7).font('Helvetica-Bold').fillColor([255, 255, 255]);

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
      pdfDoc.text(header, hsnHeaderX + 2, currentY + 4, {
        width: width - 4,
        align: "center"
      });
      hsnHeaderX += width;
    });

    currentY += 15;

    // HSN Table Rows
    pdfDoc.fontSize(7).font('Helvetica').fillColor([0, 0, 0]);

    hsnSummary.forEach((hsnItem, index) => {
      if (currentY > pageHeight - 80) {
        addNewPage();
        currentY = margin + 150;
      }

      pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 12).fill([255, 255, 255]).stroke([3, 113, 193]);

      let hsnCellX = hsnTableX;

      // HSN Code
      const hsnCodeWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
      pdfDoc.text(hsnItem.hsnCode, hsnCellX + 2, currentY + 4, {
        width: hsnCodeWidth - 4,
        align: "center"
      });
      hsnCellX += hsnCodeWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.taxableValue), hsnCellX + 2, currentY + 4, {
        width: taxableWidth - 4,
        align: "center"
      });
      hsnCellX += taxableWidth;

      // GST Columns
      if (showIGST) {
        const igstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
        const igstText = `${hsnItem.taxRate}\n${formatCurrency(hsnItem.taxAmount)}`;
        const igstLines = igstText.split('\n');
        igstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 2, currentY + 2 + (lineIndex * 5), {
            width: igstWidth - 4,
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
          pdfDoc.text(line, hsnCellX + 2, currentY + 2 + (lineIndex * 5), {
            width: cgstWidth - 4,
            align: "center"
          });
        });
        hsnCellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
        const sgstText = `${(hsnItem.taxRate / 2).toFixed(2)}\n${formatCurrency(hsnItem.sgstAmount)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 2, currentY + 2 + (lineIndex * 5), {
            width: sgstWidth - 4,
            align: "center"
          });
        });
        hsnCellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.total), hsnCellX + 2, currentY + 4, {
        width: totalWidth - 4,
        align: "center"
      });

      currentY += 12;
    });

    // HSN Total Row
    pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 12).fill([240, 240, 240]).stroke([3, 113, 193]);
    pdfDoc.fontSize(7).font('Helvetica-Bold');

    let hsnTotalX = hsnTableX;

    // Total label
    const totalLabelWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
    pdfDoc.text("Total", hsnTotalX + 2, currentY + 4, {
      width: totalLabelWidth - 4,
      align: "center"
    });
    hsnTotalX += totalLabelWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), hsnTotalX + 2, currentY + 4, {
      width: taxableWidth - 4,
      align: "center"
    });
    hsnTotalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalIGST), hsnTotalX + 2, currentY + 4, {
        width: igstWidth - 4,
        align: "center"
      });
      hsnTotalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalCGST), hsnTotalX + 2, currentY + 4, {
        width: cgstWidth - 4,
        align: "center"
      });
      hsnTotalX += cgstWidth;

      const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalSGST), hsnTotalX + 2, currentY + 4, {
        width: sgstWidth - 4,
        align: "center"
      });
      hsnTotalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalAmount), hsnTotalX + 2, currentY + 4, {
      width: grandTotalWidth - 4,
      align: "center"
    });

    currentY += 20;
  };

  // Draw Bank Details and Totals
  const drawBankDetailsAndTotals = () => {
    const leftWidth = contentWidth * 0.6;
    const rightWidth = contentWidth * 0.4;

    // Left Section - Bank Details
    if (transaction.type !== "proforma" && isBankDetailAvailable) {
      pdfDoc.fontSize(9).font('Helvetica-Bold');
      pdfDoc.text("Bank Details:", margin, currentY);
      currentY += 10;

      pdfDoc.fontSize(8).font('Helvetica');

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
        pdfDoc.font('Helvetica-Bold');
        pdfDoc.text(detail.label, margin, currentY);
        pdfDoc.font('Helvetica');
        pdfDoc.text(detail.value, margin + 50, currentY);
        currentY += 8;
      });

      currentY += 5;
    }

    // Right Section - Totals
    const rightX = margin + leftWidth + 10;
    let rightY = currentY - (bankDetails?.length * 8 + 15) || currentY;

    // Taxable Amount
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text("Taxable Amount", rightX, rightY);
    pdfDoc.font('Helvetica');
    pdfDoc.text(formatCurrency(totalTaxable), rightX + 70, rightY, { align: "right" });
    rightY += 8;

    // Total Tax
    if (isGSTApplicable) {
      pdfDoc.font('Helvetica-Bold');
      pdfDoc.text("Total Tax", rightX, rightY);
      pdfDoc.font('Helvetica');
      const totalTax = showIGST ? totalIGST : totalCGST + totalSGST;
      pdfDoc.text(formatCurrency(totalTax), rightX + 70, rightY, { align: "right" });
      rightY += 8;
    }

    // Total Amount
    pdfDoc.rect(rightX, rightY, 90, 12).fill([240, 240, 240]);
    pdfDoc.fontSize(8).font('Helvetica-Bold');
    pdfDoc.text(
      isGSTApplicable ? "Total Amount After Tax" : "Total Amount",
      rightX + 5,
      rightY + 4
    );
    pdfDoc.text(formatCurrency(totalAmount), rightX + 70, rightY + 4, { align: "right" });
    rightY += 15;

    // Company Footer
    pdfDoc.fontSize(8).font('Helvetica');
    pdfDoc.text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, rightX, rightY);
    pdfDoc.text("(E & O.E.)", rightX + 70, rightY, { align: "right" });

    currentY = Math.max(currentY, rightY + 15);
  };

  // Draw Terms and Conditions
  const drawTermsAndConditions = () => {
    if (transaction?.notes) {
      // Draw border
      pdfDoc.rect(margin, currentY, contentWidth, 1).stroke([3, 113, 193]);
      currentY += 10;

      const parsedElements = parseHtmlToElements(transaction.notes, 7);
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
    pdfDoc.fontSize(7).font('Helvetica').fillColor([102, 102, 102]);
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
  drawTotalInWords();
  drawHsnSummary();
  drawBankDetailsAndTotals();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplateA5_3 };