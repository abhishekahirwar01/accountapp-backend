// backend/templates/templateA5_2.js
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


const generateTemplateA5_2 = (
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
    itemsWithGST,
    totalCGST,
    totalSGST,
    totalIGST,
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

  // Column widths for different GST scenarios
  const colWidthsIGST = ["5%", "25%", "10%", "8%", "10%", "15%", "20%", "12%"];
  const colWidthsCGSTSGST = ["5%", "20%", "12%", "8%", "10%", "12%", "15%", "15%", "18%"];
  const colWidthsNoTax = ["10%", "25%", "10%", "10%", "10%", "15%", "20%"];

  const colWidths = showIGST
    ? colWidthsIGST
    : showCGSTSGST
    ? colWidthsCGSTSGST
    : colWidthsNoTax;

  const totalColumnIndex = showIGST ? 7 : showCGSTSGST ? 8 : 6;

  // Calculate table width
  const tableWidth = showCGSTSGST ? 327 : showIGST ? 357 : 375;

  // Calculate vertical border positions
  const borderPositions = [];
  let cumulative = 0;
  for (let i = 0; i < colWidths.length - 1; i++) {
    cumulative += parseFloat(colWidths[i]);
    borderPositions.push((cumulative / 100) * tableWidth);
  }

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
    // Header container
    const headerY = currentY;

    // Logo (left side)
    if (logoSrc) {
      try {
        pdfDoc.image(logoSrc, margin, headerY, { width: 50, height: 50 });
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Company details (right side)
    const companyX = margin + 60;
    pdfDoc.fontSize(12).font("Helvetica-Bold");
    const companyName = capitalizeWords(
      company?.businessName || company?.companyName || "Company Name"
    );
    pdfDoc.text(companyName, companyX, headerY);

    currentY += 15;

    // Company address
    pdfDoc.fontSize(8).font("Helvetica-Normal");
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
      currentY += 8;
    });

    // Contact info
    pdfDoc.font("Helvetica-Bold").text("Name : ", companyX, currentY);
    pdfDoc.font("Helvetica-Normal").text(capitalizeWords(getClientName(client)), companyX + 35, currentY);
    pdfDoc.font("Helvetica-Bold").text(" | Phone : ", companyX + 120, currentY);
    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company?.mobileNumber)
      : company?.Telephone
      ? formatPhoneNumber(company.Telephone)
      : "-";
    pdfDoc.font("Helvetica-Normal").text(phoneText, companyX + 165, currentY);

    currentY += 15;
  };

  // Helper function to get client name
  const getClientName = (client) => {
    if (!client) return "Client Name";
    if (typeof client === "string") return client;
    return client.companyName || client.contactName || "Client Name";
  };

  // Draw GST Row and Invoice Title
  const drawGSTAndTitle = () => {
    // GST Row
    if (company?.gstin) {
      pdfDoc.fontSize(8).font("Helvetica-Bold").text("GSTIN : ", margin, currentY);
      pdfDoc.font("Helvetica-Normal").text(company.gstin, margin + 35, currentY);
      currentY += 10;
    }

    // Invoice Title
    const invoiceTitle = transaction.type === "proforma"
      ? "PROFORMA INVOICE"
      : isGSTApplicable
      ? "TAX INVOICE"
      : "INVOICE";
    
    pdfDoc.fontSize(10).font("Helvetica-Bold");
    pdfDoc.text(invoiceTitle, margin, currentY, { align: "center", width: contentWidth });
    currentY += 12;

    // Recipient Text
    pdfDoc.fontSize(8).text("ORIGINAL FOR RECIPIENT", margin, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 15;
  };

  // Draw Three Column Section
  const drawThreeColumnSection = () => {
    const sectionY = currentY;
    const columnWidth = contentWidth / 3;
    let maxY = sectionY;

    // Column 1 - Details of Buyer
    let col1Y = sectionY;
    
    // Buyer Header
    pdfDoc.fontSize(8).font("Helvetica-Bold").text("Details of Buyer | Billed to:", margin, col1Y);
    col1Y += 10;

    // Buyer Details
    pdfDoc.fontSize(7).font("Helvetica-Normal");
    
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
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, margin, col1Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 40);
      pdfDoc.font("Helvetica-Normal").text(valueLines, margin + 35, col1Y);
      col1Y += valueLines.length * 6 + 4;
    });

    // Consignee Header
    col1Y += 5;
    pdfDoc.font("Helvetica-Bold").text("Details of Consigned | Shipped to:", margin, col1Y);
    col1Y += 10;

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
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, margin, col1Y);
      const valueLines = pdfDoc.splitTextToSize(detail.value, columnWidth - 40);
      pdfDoc.font("Helvetica-Normal").text(valueLines, margin + 35, col1Y);
      col1Y += valueLines.length * 6 + 4;
    });

    maxY = Math.max(maxY, col1Y);

    // Column 3 - Invoice Details
    const col3X = margin + columnWidth * 2;
    let col3Y = sectionY;

    const invoiceDetails = [
      { label: "Invoice No.", value: transaction.invoiceNumber || "N/A" },
      { label: "Invoice Date", value: new Date(transaction.date).toLocaleDateString("en-IN") },
      { label: "Due Date", value: new Date(transaction.dueDate).toLocaleDateString("en-IN") },
      { label: "P.O. No.", value: transaction.voucher || "-" },
      { label: "E-Way No.", value: transaction.referenceNumber || "-" }
    ];

    invoiceDetails.forEach(detail => {
      pdfDoc.font("Helvetica-Bold").text(`${detail.label}:`, col3X, col3Y);
      pdfDoc.font("Helvetica-Normal").text(detail.value, col3X + 50, col3Y);
      col3Y += 10;
    });

    // QR Code
    if (transaction.type !== "proforma" && bankData?.qrCode) {
      try {
        col3Y += 10;
        pdfDoc.image(
          `${process.env.BASE_URL || ""}${bankData.qrCode}`,
          col3X + 10,
          col3Y,
          { width: 80, height: 80 }
        );
        pdfDoc.fontSize(9).font("Helvetica-Bold").text("QR Code", col3X + 25, col3Y + 85);
        col3Y += 95;
      } catch (error) {
        console.log("QR code not found");
      }
    }

    maxY = Math.max(maxY, col3Y);
    currentY = maxY + 15;
  };

  // Draw Items Table
  const drawItemsTable = () => {
    const tableX = margin + (contentWidth - tableWidth) / 2;

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
      headers.push("IGST");
    } else if (showCGSTSGST) {
      headers.push("CGST", "SGST");
    }

    headers.push("Total (Rs.)");

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
    pdfDoc.fontSize(7).font("Helvetica-Normal").fillColor([0, 0, 0]);

    itemsWithGST.forEach((item, index) => {
      if (currentY > pageHeight - 100) {
        addNewPage();
        currentY = margin + 150;
        // Redraw table header on new page
        pdfDoc.rect(tableX, currentY, tableWidth, 20).fill([3, 113, 193]);
        currentY += 20;
      }

      // Draw row
      let cellX = tableX;

      // Sr. No.
      const srNoWidth = (parseFloat(colWidths[0]) / 100) * tableWidth;
      pdfDoc.text((index + 1).toString(), cellX + 4, currentY + 6, {
        width: srNoWidth - 8,
        align: "center"
      });
      cellX += srNoWidth;

      // Product Name
      const productWidth = (parseFloat(colWidths[1]) / 100) * tableWidth;
      pdfDoc.text(capitalizeWords(item.name), cellX + 4, currentY + 6, {
        width: productWidth - 8,
        align: "left"
      });
      cellX += productWidth;

      // HSN/SAC
      const hsnWidth = (parseFloat(colWidths[2]) / 100) * tableWidth;
      pdfDoc.text(item.code || "-", cellX + 4, currentY + 6, {
        width: hsnWidth - 8,
        align: "center"
      });
      cellX += hsnWidth;

      // Quantity
      const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
      const qtyText = formatQuantity(item.quantity || 0, item.unit);
      pdfDoc.text(qtyText, cellX + 4, currentY + 6, {
        width: qtyWidth - 8,
        align: "center"
      });
      cellX += qtyWidth;

      // Rate
      const rateWidth = (parseFloat(colWidths[4]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.pricePerUnit || 0), cellX + 4, currentY + 6, {
        width: rateWidth - 8,
        align: "center"
      });
      cellX += rateWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.taxableValue), cellX + 4, currentY + 6, {
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
          pdfDoc.text(line, cellX + 4, currentY + 3 + (lineIndex * 6), {
            width: igstWidth - 8,
            align: "center"
          });
        });
        cellX += igstWidth;
      } else if (showCGSTSGST) {
        // CGST
        const cgstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
        const cgstText = `${item.gstRate / 2}\n${formatCurrency(item.cgst)}`;
        const cgstLines = cgstText.split('\n');
        cgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 4, currentY + 3 + (lineIndex * 6), {
            width: cgstWidth - 8,
            align: "center"
          });
        });
        cellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
        const sgstText = `${item.gstRate / 2}\n${formatCurrency(item.sgst)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, cellX + 4, currentY + 3 + (lineIndex * 6), {
            width: sgstWidth - 8,
            align: "center"
          });
        });
        cellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(item.total), cellX + 4, currentY + 6, {
        width: totalWidth - 8,
        align: "center"
      });

      currentY += 20;
    });

    // Total Row
    pdfDoc.font("Helvetica-Bold");
    let totalX = tableX;

    // Empty cells
    totalX += (parseFloat(colWidths[0]) / 100) * tableWidth;
    totalX += (parseFloat(colWidths[1]) / 100) * tableWidth;

    // Total label
    const totalLabelWidth = (parseFloat(colWidths[2]) / 100) * tableWidth;
    pdfDoc.text("Total", totalX + 4, currentY + 6, {
      width: totalLabelWidth - 8,
      align: "center"
    });
    totalX += totalLabelWidth;

    // Total Qty
    const qtyWidth = (parseFloat(colWidths[3]) / 100) * tableWidth;
    pdfDoc.text(totalQty.toString(), totalX + 4, currentY + 6, {
      width: qtyWidth - 8,
      align: "center"
    });
    totalX += qtyWidth;

    // Empty cell for Rate
    totalX += (parseFloat(colWidths[4]) / 100) * tableWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(colWidths[5]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), totalX + 4, currentY + 6, {
      width: taxableWidth - 8,
      align: "center"
    });
    totalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalIGST), totalX + 4, currentY + 6, {
        width: igstWidth - 8,
        align: "center"
      });
      totalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(colWidths[6]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalCGST), totalX + 4, currentY + 6, {
        width: cgstWidth - 8,
        align: "center"
      });
      totalX += cgstWidth;

      const sgstWidth = (parseFloat(colWidths[7]) / 100) * tableWidth;
      pdfDoc.text(formatCurrency(totalSGST), totalX + 4, currentY + 6, {
        width: sgstWidth - 8,
        align: "center"
      });
      totalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(colWidths[totalColumnIndex]) / 100) * tableWidth;
    pdfDoc.text(formatCurrency(totalAmount), totalX + 4, currentY + 6, {
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
    const hsnTableWidth = 318;
    const hsnTableX = margin + (contentWidth - hsnTableWidth) / 2;

    // HSN Table Header
    pdfDoc.rect(hsnTableX, currentY, hsnTableWidth, 20).fill([3, 113, 193]);
    
    let hsnHeaderX = hsnTableX;
    pdfDoc.fontSize(7).font("Helvetica-Bold").fillColor([255, 255, 255]);

    const hsnHeaders = ["HSN / SAC", "Taxable Value (Rs.)"];

    if (showIGST) {
      hsnHeaders.push("IGST");
    } else if (showCGSTSGST) {
      hsnHeaders.push("CGST", "SGST");
    }

    hsnHeaders.push("Total (Rs.)");

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
    pdfDoc.fontSize(7).font("Helvetica-Normal").fillColor([0, 0, 0]);

    hsnSummary.forEach((hsnItem, index) => {
      let hsnCellX = hsnTableX;

      // HSN Code
      const hsnCodeWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
      pdfDoc.text(hsnItem.hsnCode, hsnCellX + 4, currentY + 6, {
        width: hsnCodeWidth - 8,
        align: "center"
      });
      hsnCellX += hsnCodeWidth;

      // Taxable Value
      const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.taxableValue), hsnCellX + 4, currentY + 6, {
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
          pdfDoc.text(line, hsnCellX + 4, currentY + 3 + (lineIndex * 6), {
            width: igstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += igstWidth;
      } else if (showCGSTSGST) {
        // CGST
        const cgstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
        const cgstText = `${hsnItem.taxRate / 2}\n${formatCurrency(hsnItem.cgstAmount)}`;
        const cgstLines = cgstText.split('\n');
        cgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 4, currentY + 3 + (lineIndex * 6), {
            width: cgstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += cgstWidth;

        // SGST
        const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
        const sgstText = `${hsnItem.taxRate / 2}\n${formatCurrency(hsnItem.sgstAmount)}`;
        const sgstLines = sgstText.split('\n');
        sgstLines.forEach((line, lineIndex) => {
          pdfDoc.text(line, hsnCellX + 4, currentY + 3 + (lineIndex * 6), {
            width: sgstWidth - 8,
            align: "center"
          });
        });
        hsnCellX += sgstWidth;
      }

      // Total
      const totalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(hsnItem.total), hsnCellX + 4, currentY + 6, {
        width: totalWidth - 8,
        align: "center"
      });

      currentY += 20;
    });

    // HSN Total Row
    pdfDoc.font("Helvetica-Bold");
    let hsnTotalX = hsnTableX;

    // Total label
    const totalLabelWidth = (parseFloat(hsnColWidths[0]) / 100) * hsnTableWidth;
    pdfDoc.text("Total", hsnTotalX + 4, currentY + 6, {
      width: totalLabelWidth - 8,
      align: "center"
    });
    hsnTotalX += totalLabelWidth;

    // Total Taxable
    const taxableWidth = (parseFloat(hsnColWidths[1]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalTaxable), hsnTotalX + 4, currentY + 6, {
      width: taxableWidth - 8,
      align: "center"
    });
    hsnTotalX += taxableWidth;

    // GST Totals
    if (showIGST) {
      const igstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalIGST), hsnTotalX + 4, currentY + 6, {
        width: igstWidth - 8,
        align: "center"
      });
      hsnTotalX += igstWidth;
    } else if (showCGSTSGST) {
      const cgstWidth = (parseFloat(hsnColWidths[2]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalCGST), hsnTotalX + 4, currentY + 6, {
        width: cgstWidth - 8,
        align: "center"
      });
      hsnTotalX += cgstWidth;

      const sgstWidth = (parseFloat(hsnColWidths[3]) / 100) * hsnTableWidth;
      pdfDoc.text(formatCurrency(totalSGST), hsnTotalX + 4, currentY + 6, {
        width: sgstWidth - 8,
        align: "center"
      });
      hsnTotalX += sgstWidth;
    }

    // Grand Total
    const grandTotalWidth = (parseFloat(hsnColWidths[hsnTotalColumnIndex]) / 100) * hsnTableWidth;
    pdfDoc.text(formatCurrency(totalAmount), hsnTotalX + 4, currentY + 6, {
      width: grandTotalWidth - 8,
      align: "center"
    });

    currentY += 30;
  };

  // Draw Bank Details and Totals
  const drawBankDetailsAndTotals = () => {
    const leftWidth = contentWidth * 0.6;
    const rightWidth = contentWidth * 0.4;

    // Left Section - Bank Details
    if (transaction.type !== "proforma") {
      pdfDoc.fontSize(9).font("Helvetica-Bold").text("Bank Details", margin, currentY);
      currentY += 12;

      pdfDoc.fontSize(8).font("Helvetica-Normal");

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
        pdfDoc.font("Helvetica-Bold").text(detail.label, margin, currentY);
        pdfDoc.font("Helvetica-Normal").text(detail.value, margin + 70, currentY);
        currentY += 8;
      });

      currentY += 10;
    }

    // Right Section - Totals
    const rightX = margin + leftWidth + 10;
    let rightY = currentY - (bankDetails?.length * 8 + 22) || currentY;

    // Taxable Amount
    pdfDoc.font("Helvetica-Bold").text("Taxable Amount", rightX, rightY);
    pdfDoc.text(formatCurrency(totalTaxable), rightX + 80, rightY, { align: "right" });
    rightY += 10;

    // Total Tax
    if (isGSTApplicable) {
      pdfDoc.text("Total Tax", rightX, rightY);
      const totalTax = showIGST ? totalIGST : totalCGST + totalSGST;
      pdfDoc.text(formatCurrency(totalTax), rightX + 80, rightY, { align: "right" });
      rightY += 10;
    }

    // Total Amount
    pdfDoc.rect(rightX, rightY, 100, 15).fill([240, 240, 240]);
    pdfDoc.font("Helvetica-Bold").text(
      isGSTApplicable ? "Total Amount After Tax" : "Total Amount",
      rightX + 5,
      rightY + 5
    );
    pdfDoc.text(formatCurrency(totalAmount), rightX + 80, rightY + 5, { align: "right" });
    rightY += 20;

    // Company Footer
    pdfDoc.text(`For ${capitalizeWords(company?.businessName || company?.companyName || "Company Name")}`, rightX, rightY);
    pdfDoc.text("(E & O.E.)", rightX + 80, rightY, { align: "right" });

    currentY = Math.max(currentY, rightY + 20);
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
    pdfDoc
      .fontSize(7)
      .fillColor([102, 102, 102])
      .text(
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
  drawHsnSummary();
  drawBankDetailsAndTotals();
  drawTermsAndConditions();
  drawPageNumber();
};

module.exports = { generateTemplateA5_2 };