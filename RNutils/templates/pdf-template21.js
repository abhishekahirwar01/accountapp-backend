// backend/templates/template21.js
const {
  parseHtmlToElements,
  renderParsedElements,
} = require("../HtmlNoteRenderer");
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  numberToWords,
  getStateCode,
  formatPhoneNumber,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");

// --- Constants ---
const PRIMARY_BLUE = "#0066cc";
const LIGHT_GRAY = "#f5f5f5";
const DARK_TEXT = "#000000";
const BORDER_COLOR = "#b2b2b2";
const TABLE_HEADER_BG = "#0066cc";

// Helper function to format quantity
const formatQuantity = (quantity, unit = "pcs") => {
  if (quantity === "-") return "-";
  const num = Number(quantity);
  if (isNaN(num)) return quantity;
  
  if (num % 1 === 0) {
    return `${num.toFixed(0)} ${unit}`;
  } else {
    return `${num.toFixed(2)} ${unit}`;
  }
};

// Helper function to get address lines
const getAddressLines = (address) =>
  address ? address.split("\n").filter((line) => line.trim() !== "") : [];

// Main PDF generation function
const generateTemplate21 = async (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // Prepare data
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
  } = preparedData;

  const typedItems = preparedData.itemsWithGST || allItems;
  const pages = [typedItems];
  const shouldHideBankDetails = transaction.type === "proforma";

  // Column Width Definitions
  const COL_WIDTH_SR_NO = 25;
  const COL_WIDTH_NAME = showIGST ? 130 : showCGSTSGST ? 110 : 195;
  const COL_WIDTH_HSN = showIGST ? 55 : showCGSTSGST ? 45 : 65;
  const COL_WIDTH_QTY = showIGST ? 45 : showCGSTSGST ? 35 : 55;
  const COL_WIDTH_RATE = showIGST ? 58 : showCGSTSGST ? 48 : 70;
  const COL_WIDTH_TAXABLE = showIGST ? 72 : showCGSTSGST ? 58 : 80;
  const COL_WIDTH_GST_PCT_HALF = 35;
  const COL_WIDTH_GST_AMT_HALF = 50;
  const COL_WIDTH_IGST_PCT = 40;
  const COL_WIDTH_IGST_AMT = 60;
  const COL_WIDTH_TOTAL = showIGST ? 50 : showCGSTSGST ? 65 : 90;

  const getColWidths = () => {
    let widths = [
      COL_WIDTH_SR_NO,
      COL_WIDTH_NAME,
      COL_WIDTH_HSN,
      COL_WIDTH_QTY,
      COL_WIDTH_RATE,
      COL_WIDTH_TAXABLE,
    ];

    if (showIGST) {
      widths.push(COL_WIDTH_IGST_PCT, COL_WIDTH_IGST_AMT);
    } else if (showCGSTSGST) {
      widths.push(
        COL_WIDTH_GST_PCT_HALF,
        COL_WIDTH_GST_AMT_HALF,
        COL_WIDTH_GST_PCT_HALF,
        COL_WIDTH_GST_AMT_HALF
      );
    }
    widths.push(COL_WIDTH_TOTAL);

    return widths;
  };

  const colWidths = getColWidths();
  const totalColumnIndex = colWidths.length - 1;

  const calculateTotalLabelWidth = () => {
    if (showIGST) {
      return (
        COL_WIDTH_SR_NO +
        COL_WIDTH_NAME +
        COL_WIDTH_HSN +
        COL_WIDTH_QTY +
        COL_WIDTH_RATE +
        COL_WIDTH_TAXABLE +
        COL_WIDTH_IGST_PCT +
        COL_WIDTH_IGST_AMT
      );
    } else if (showCGSTSGST) {
      return (
        COL_WIDTH_SR_NO +
        COL_WIDTH_NAME +
        COL_WIDTH_HSN +
        COL_WIDTH_QTY +
        COL_WIDTH_RATE +
        COL_WIDTH_TAXABLE +
        COL_WIDTH_GST_PCT_HALF * 2 +
        COL_WIDTH_GST_AMT_HALF * 2
      );
    } else {
      return (
        COL_WIDTH_SR_NO +
        COL_WIDTH_NAME +
        COL_WIDTH_HSN +
        COL_WIDTH_QTY +
        COL_WIDTH_RATE +
        COL_WIDTH_TAXABLE
      );
    }
  };

  const bankData = bank || {};
  const totalAmountRounded = Math.round(totalAmount);
  const amountInWords = numberToWords(totalAmountRounded);

  const isBankDetailAvailable =
    bankData?.bankName ||
    bankData?.ifscCode ||
    bankData?.branchAddress ||
    bankData?.accountNo ||
    bankData?.upiDetails?.upiId;

  const extendedTransaction = transaction;

  // Tax Summary Data Grouped by HSN/SAC
  const taxSummary = typedItems.reduce((acc, item) => {
    const key = `${item.code || "-"}-${item.gstRate || 0}`;

    if (!acc[key]) {
      acc[key] = {
        hsn: item.code || "-",
        taxableValue: 0,
        rate: item.gstRate || 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        total: 0,
      };
    }

    acc[key].taxableValue += item.taxableValue || 0;
    acc[key].igst += item.igst || 0;
    acc[key].cgst += item.cgst || 0;
    acc[key].sgst += item.sgst || 0;
    acc[key].total += (item.igst || 0) + (item.cgst || 0) + (item.sgst || 0);

    return acc;
  }, {});

  const taxSummaryArray = Object.values(taxSummary);

  // Parse notes
  const {
    title,
    isList,
    items: notesItems,
  } = parseNotesHtml(transaction?.notes || "");
  const termsTitle = title || "Terms and Conditions";
  const termsItems =
    notesItems.length > 0 ? notesItems : ["No terms and conditions specified"];

  const companyName = company?.businessName || company?.companyName || "-";
  const partyAddress = getBillingAddress(party);
  const shippingAddressString = getShippingAddress(
    shippingAddress,
    partyAddress
  );

  // PDF Document Setup
  const doc = pdfDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Set default font
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK_TEXT);

  // Process each page
  pages.forEach((pageItems, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage();
    }

    const isLastPage = pageIndex === pages.length - 1;
    let currentY = 15;

    // --- Header Section ---
    // Left Side: Tax Invoice & Company Details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(PRIMARY_BLUE);
    doc.text(
      transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : isGSTApplicable
        ? "TAX INVOICE"
        : "INVOICE",
      margin,
      currentY
    );
    currentY += 20;

    doc.setFontSize(11);
    doc.setTextColor(DARK_TEXT);
    doc.text(capitalizeWords(companyName), margin, currentY);
    currentY += 12;

    if (company?.gstin) {
      doc.setFontSize(8);
      doc.text(`GSTIN: ${company.gstin}`, margin, currentY);
      currentY += 8;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const companyAddressLines = getAddressLines(company?.address);
    companyAddressLines.forEach((line, idx) => {
      doc.text(line, margin, currentY);
      currentY += 10;
    });

    if (company?.addressState) {
      const stateLine = `${capitalizeWords(company.City)}, ${capitalizeWords(company.addressState)}, ${capitalizeWords(company.Country)}${company?.Pincode ? `, ${company.Pincode}` : ""}`;
      doc.text(stateLine, margin, currentY);
      currentY += 10;
    }

    const phoneText = company?.mobileNumber
      ? formatPhoneNumber(company.mobileNumber)
      : company?.Telephone
      ? formatPhoneNumber(company.Telephone)
      : "-";
    doc.text(`Phone: ${phoneText}`, margin, currentY);
    currentY += 15;

    // Right Side: Original Text & Logo
    const rightX = pageWidth - margin - 100;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("ORIGINAL FOR RECIPIENT", rightX, 15);

    if (company?.logo) {
      try {
        const logoUrl = `${process.env.BASE_URL || ""}${company.logo}`;
        doc.addImage(logoUrl, "PNG", rightX, 25, 70, 70);
      } catch (error) {
        console.log("Logo not found");
      }
    }

    // Two Column Section
    currentY += 10;
    
    // Blue line
    doc.setDrawColor(0, 122, 255);
    doc.setLineWidth(1.5);
    doc.line(margin, currentY - 6, pageWidth - margin, currentY - 6);

    // Customer Details (Left)
    let leftY = currentY;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Customer Details | Billed to :", margin, leftY);
    leftY += 12;

    doc.setFontSize(9);
    doc.text(capitalizeWords(party?.name || "-"), margin, leftY);
    leftY += 10;

    doc.setFont("helvetica", "normal");
    const partyAddressLines = doc.splitTextToSize(
      capitalizeWords(partyAddress || "-"),
      pageWidth * 0.3
    );
    partyAddressLines.forEach((line) => {
      doc.text(line, margin, leftY);
      leftY += 8;
    });

    // GSTIN
    doc.text(`GSTIN: ${party?.gstin || "-"}`, margin, leftY);
    leftY += 8;

    // Phone
    const partyPhone = party?.contactNumber
      ? formatPhoneNumber(party.contactNumber)
      : "-";
    doc.text(`Phone: ${partyPhone}`, margin, leftY);
    leftY += 8;

    // PAN
    doc.text(`PAN: ${party?.pan || "-"}`, margin, leftY);
    leftY += 8;

    // Place of Supply
    const placeOfSupply = shippingAddress?.state
      ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
      : party?.state
      ? `${party.state} (${getStateCode(party.state) || "-"})`
      : "-";
    doc.text(`Place of Supply: ${placeOfSupply}`, margin, leftY);
    leftY += 15;

    // Shipping Address (Center)
    let centerY = currentY;
    const centerX = margin + pageWidth * 0.4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Details of Consignee | Shipped to :", centerX, centerY);
    centerY += 12;

    const shippingName = capitalizeWords(
      shippingAddress?.label || party?.name || " "
    );
    doc.setFontSize(9);
    doc.text(shippingName, centerX, centerY);
    centerY += 10;

    doc.setFont("helvetica", "normal");
    const shippingAddressLines = doc.splitTextToSize(
      capitalizeWords(shippingAddressString || "-"),
      pageWidth * 0.3
    );
    shippingAddressLines.forEach((line) => {
      doc.text(line, centerX, centerY);
      centerY += 8;
    });

    // Country
    doc.text(`Country: ${company?.Country || "-"}`, centerX, centerY);
    centerY += 8;

    // Phone
    const shippingPhone = shippingAddress?.contactNumber
      ? formatPhoneNumber(shippingAddress.contactNumber)
      : partyPhone;
    doc.text(`Phone: ${shippingPhone}`, centerX, centerY);
    centerY += 8;

    // GSTIN
    doc.text(`GSTIN: ${party?.gstin || "-"}`, centerX, centerY);
    centerY += 8;

    // State
    const shippingState = shippingAddress?.state
      ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
      : party?.state
      ? `${party.state} (${getStateCode(party.state) || "-"})`
      : "-";
    doc.text(`State: ${shippingState}`, centerX, centerY);
    centerY += 15;

    // Invoice Details (Right)
    let rightY = currentY;
    const rightDetailsX = pageWidth - margin - 100;

    // Invoice #
    doc.setFont("helvetica", "bold");
    doc.text("Invoice #:", rightDetailsX, rightY);
    doc.setFont("helvetica", "normal");
    doc.text(
      transaction?.invoiceNumber?.toString() || "-",
      rightDetailsX + 40,
      rightY
    );
    rightY += 12;

    // Invoice Date
    doc.setFont("helvetica", "bold");
    doc.text("Invoice Date:", rightDetailsX, rightY);
    doc.setFont("helvetica", "normal");
    const invoiceDate = transaction?.date
      ? new Date(transaction.date).toLocaleDateString("en-GB")
      : "-";
    doc.text(invoiceDate, rightDetailsX + 40, rightY);
    rightY += 12;

    // P.O. No.
    doc.setFont("helvetica", "bold");
    doc.text("P.O. No.:", rightDetailsX, rightY);
    doc.setFont("helvetica", "normal");
    doc.text(extendedTransaction?.poNumber || "-", rightDetailsX + 40, rightY);
    rightY += 12;

    // P.O. Date
    doc.setFont("helvetica", "bold");
    doc.text("P.O. Date:", rightDetailsX, rightY);
    doc.setFont("helvetica", "normal");
    const poDate = extendedTransaction?.poDate
      ? new Date(extendedTransaction.poDate).toLocaleDateString("en-GB")
      : "-";
    doc.text(poDate, rightDetailsX + 40, rightY);
    rightY += 12;

    // E-Way No.
    if (isGSTApplicable) {
      doc.setFont("helvetica", "bold");
      doc.text("E-Way No.:", rightDetailsX, rightY);
      doc.setFont("helvetica", "normal");
      doc.text(extendedTransaction?.ewayNumber || "-", rightDetailsX + 40, rightY);
      rightY += 12;
    }

    currentY = Math.max(leftY, centerY, rightY) + 10;

    // --- Items Table ---
    const tableStartY = currentY;
    
    // Table Header
    doc.setFillColor(0, 102, 204);
    doc.rect(margin, currentY, pageWidth - 2 * margin, 15, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);

    let headerX = margin;
    const headers = [
      "Sr.No",
      "Name of Product / Service",
      "HSN/SAC",
      "Qty",
      "Rate (Rs.)",
      "Taxable Value (Rs.)",
    ];

    if (showIGST) {
      headers.push("IGST%", "IGST Amt (Rs.)");
    } else if (showCGSTSGST) {
      headers.push("CGST%", "CGST Amt (Rs.)", "SGST%", "SGST Amt (Rs.)");
    }
    headers.push("Total (Rs.)");

    headers.forEach((header, index) => {
      const width = colWidths[index];
      const align = index === 1 ? "left" : "center";
      doc.text(header, headerX + 2, currentY + 9, {
        align: align,
        maxWidth: width - 4
      });
      headerX += width;
    });

    currentY += 15;

    // Table Rows
    doc.setTextColor(DARK_TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    pageItems.forEach((item, index) => {
      const isLastItemInList = index === pageItems.length - 1;

      // Draw row background if needed
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, currentY, pageWidth - 2 * margin, 16, "F");
      }

      let cellX = margin;

      // Sr.No
      doc.text((index + 1).toString(), cellX + colWidths[0] / 2, currentY + 9, {
        align: "center"
      });
      cellX += colWidths[0];

      // Name
      const nameLines = doc.splitTextToSize(item.name, colWidths[1] - 4);
      doc.text(nameLines, cellX + 2, currentY + 4);
      cellX += colWidths[1];

      // HSN/SAC
      doc.text(item.code || "", cellX + colWidths[2] / 2, currentY + 9, {
        align: "center"
      });
      cellX += colWidths[2];

      // Qty
      const qtyText = item.itemType === "service" ? "-" : formatQuantity(item.quantity || 0, item.unit);
      doc.text(qtyText, cellX + colWidths[3] / 2, currentY + 9, {
        align: "center"
      });
      cellX += colWidths[3];

      // Rate
      doc.text(formatCurrency(item.pricePerUnit || 0), cellX + colWidths[4] - 2, currentY + 9, {
        align: "right"
      });
      cellX += colWidths[4];

      // Taxable Value
      doc.text(formatCurrency(item.taxableValue || 0), cellX + colWidths[5] - 2, currentY + 9, {
        align: "right"
      });
      cellX += colWidths[5];

      // GST Columns
      if (showIGST) {
        doc.text((item.gstRate || 0).toFixed(2), cellX + colWidths[6] / 2, currentY + 9, {
          align: "center"
        });
        cellX += colWidths[6];

        doc.text(formatCurrency(item.igst || 0), cellX + colWidths[7] - 2, currentY + 9, {
          align: "right"
        });
        cellX += colWidths[7];
      } else if (showCGSTSGST) {
        doc.text(((item.gstRate || 0) / 2).toFixed(2), cellX + colWidths[6] / 2, currentY + 9, {
          align: "center"
        });
        cellX += colWidths[6];

        doc.text(formatCurrency(item.cgst || 0), cellX + colWidths[7] - 2, currentY + 9, {
          align: "right"
        });
        cellX += colWidths[7];

        doc.text(((item.gstRate || 0) / 2).toFixed(2), cellX + colWidths[8] / 2, currentY + 9, {
          align: "center"
        });
        cellX += colWidths[8];

        doc.text(formatCurrency(item.sgst || 0), cellX + colWidths[9] - 2, currentY + 9, {
          align: "right"
        });
        cellX += colWidths[9];
      }

      // Total
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(item.total || 0), cellX + colWidths[totalColumnIndex] - 2, currentY + 9, {
        align: "right"
      });
      doc.setFont("helvetica", "normal");

      // Draw row borders
      doc.setDrawColor(BORDER_COLOR);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      
      if (isLastItemInList) {
        doc.setLineWidth(1);
        doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
      }

      currentY += 16;
    });

    // Total Row
    if (isLastPage) {
      doc.setFillColor(LIGHT_GRAY);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 16, "F");
      
      doc.setFont("helvetica", "bold");
      const totalLabelWidth = calculateTotalLabelWidth();
      
      // Total Items / Qty
      doc.text(
        `Total Items / Qty: ${totalItems} / ${totalQty}`,
        margin + 2,
        currentY + 9,
        { align: "left" }
      );

      // Taxable Total
      const taxableX = margin + totalLabelWidth - colWidths[4] - colWidths[5];
      doc.text(
        "Taxable Total:",
        taxableX,
        currentY + 9,
        { align: "right" }
      );

      // Taxable Value
      doc.text(
        formatCurrency(totalTaxable),
        pageWidth - margin - 2,
        currentY + 9,
        { align: "right" }
      );

      currentY += 20;
    }

    currentY += 10;

    // --- Footer and Totals (Last page only) ---
    if (isLastPage) {
      // Taxable, Total GST, Grand Total Summary
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Taxable Amount: ${formatCurrency(totalTaxable)}`, pageWidth - margin - 150, currentY, {
        align: "right"
      });
      currentY += 10;

      doc.text(`Total GST: ${formatCurrency(isGSTApplicable ? showIGST ? totalIGST : totalCGST + totalSGST : 0)}`, pageWidth - margin - 150, currentY, {
        align: "right"
      });
      currentY += 10;

      doc.setFont("helvetica", "bold");
      doc.text(`Grand Total: Rs. ${formatCurrency(totalAmount)}`, pageWidth - margin - 150, currentY, {
        align: "right"
      });
      currentY += 15;

      // Amount in Words
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const wordsText = `Total Amount (in words): ${amountInWords}`;
      const wordsLines = doc.splitTextToSize(wordsText, pageWidth - 2 * margin);
      wordsLines.forEach((line) => {
        doc.text(line, margin, currentY);
        currentY += 8;
      });

      currentY += 10;

      // --- Tax Summary Table (HSN Wise) ---
      if (isGSTApplicable && taxSummaryArray.length > 0) {
        const taxTableWidth = pageWidth - 2 * margin;
        const taxColWidths = showIGST 
          ? [100, 150, 50, 120, 135]
          : [100, 150, 50, 90, 90, 75];

        // Tax Header
        doc.setFillColor(TABLE_HEADER_BG);
        doc.rect(margin, currentY, taxTableWidth, 15, "F");
        
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        let taxHeaderX = margin;
        const taxHeaders = showIGST
          ? ["HSN/SAC", "Taxable Value (Rs.)", "%", "IGST (Rs.)", "Total (Rs.)"]
          : ["HSN/SAC", "Taxable Value (Rs.)", "%", "CGST (Rs.)", "SGST (Rs.)", "Total (Rs.)"];

        taxHeaders.forEach((header, index) => {
          doc.text(header, taxHeaderX + 2, currentY + 9, {
            align: "center",
            maxWidth: taxColWidths[index] - 4
          });
          taxHeaderX += taxColWidths[index];
        });

        currentY += 15;

        // Tax Rows
        doc.setTextColor(DARK_TEXT);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);

        taxSummaryArray.forEach((summary, index) => {
          if (index % 2 === 0) {
            doc.setFillColor(LIGHT_GRAY);
            doc.rect(margin, currentY, taxTableWidth, 12, "F");
          }

          let taxX = margin;

          // HSN
          doc.text(summary.hsn, taxX + taxColWidths[0] / 2, currentY + 7, {
            align: "center"
          });
          taxX += taxColWidths[0];

          // Taxable Value
          doc.text(formatCurrency(summary.taxableValue), taxX + taxColWidths[1] - 2, currentY + 7, {
            align: "right"
          });
          taxX += taxColWidths[1];

          // Rate
          doc.text(summary.rate.toFixed(2), taxX + taxColWidths[2] / 2, currentY + 7, {
            align: "center"
          });
          taxX += taxColWidths[2];

          if (showIGST) {
            // IGST
            doc.text(formatCurrency(summary.igst), taxX + taxColWidths[3] - 2, currentY + 7, {
              align: "right"
            });
            taxX += taxColWidths[3];

            // Total
            doc.text(formatCurrency(summary.total), taxX + taxColWidths[4] - 2, currentY + 7, {
              align: "right"
            });
          } else {
            // CGST
            doc.text(formatCurrency(summary.cgst), taxX + taxColWidths[3] - 2, currentY + 7, {
              align: "right"
            });
            taxX += taxColWidths[3];

            // SGST
            doc.text(formatCurrency(summary.sgst), taxX + taxColWidths[4] - 2, currentY + 7, {
              align: "right"
            });
            taxX += taxColWidths[4];

            // Total
            doc.text(formatCurrency(summary.total), taxX + taxColWidths[5] - 2, currentY + 7, {
              align: "right"
            });
          }

          // Draw row border
          doc.setDrawColor(BORDER_COLOR);
          doc.setLineWidth(0.5);
          doc.line(margin, currentY, pageWidth - margin, currentY);

          currentY += 12;
        });

        // Tax Total Row
        doc.setFillColor(LIGHT_GRAY);
        doc.rect(margin, currentY, taxTableWidth, 12, "F");
        
        doc.setFont("helvetica", "bold");
        let totalTaxX = margin;

        // Total Tax Label
        doc.text("Total Tax", totalTaxX + taxColWidths[0] / 2, currentY + 7, {
          align: "center"
        });
        totalTaxX += taxColWidths[0];

        // Taxable Total
        doc.text(formatCurrency(totalTaxable), totalTaxX + taxColWidths[1] - 2, currentY + 7, {
          align: "right"
        });
        totalTaxX += taxColWidths[1];

        // Empty cell for %
        totalTaxX += taxColWidths[2];

        if (showIGST) {
          // IGST Total
          doc.text(formatCurrency(totalIGST), totalTaxX + taxColWidths[3] - 2, currentY + 7, {
            align: "right"
          });
          totalTaxX += taxColWidths[3];

          // Total
          doc.text(formatCurrency(totalIGST), totalTaxX + taxColWidths[4] - 2, currentY + 7, {
            align: "right"
          });
        } else {
          // CGST Total
          doc.text(formatCurrency(totalCGST), totalTaxX + taxColWidths[3] - 2, currentY + 7, {
            align: "right"
          });
          totalTaxX += taxColWidths[3];

          // SGST Total
          doc.text(formatCurrency(totalSGST), totalTaxX + taxColWidths[4] - 2, currentY + 7, {
            align: "right"
          });
          totalTaxX += taxColWidths[4];

          // Total
          doc.text(formatCurrency(totalCGST + totalSGST), totalTaxX + taxColWidths[5] - 2, currentY + 7, {
            align: "right"
          });
        }

        currentY += 15;
      }

      // --- Footer Section (QR, Bank, Signature) ---
      const footerStartY = currentY;
      const footerWidth = pageWidth - 2 * margin;
      const qrWidth = footerWidth * 0.25;
      const bankWidth = footerWidth * 0.55;
      const signatureWidth = footerWidth * 0.20;

      // Draw footer border
      doc.setDrawColor(BORDER_COLOR);
      doc.setLineWidth(1);
      doc.rect(margin, footerStartY, footerWidth, 90, "S");

      // Bank Details Block
      if (!shouldHideBankDetails) {
        let bankY = footerStartY + 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("Bank Details:", margin + 5, bankY);
        bankY += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);

        const putBankDetail = (label, value, y) => {
          if (!value || value === "-") return y;
          doc.text(`${label}: ${value}`, margin + 5, y);
          return y + 6;
        };

        if (bankData?.bankName) {
          bankY = putBankDetail("Name", capitalizeWords(bankData.bankName), bankY);
        }
        if (bankData?.accountNo) {
          bankY = putBankDetail("Acc. No", bankData.accountNo, bankY);
        }
        if (bankData?.ifscCode) {
          bankY = putBankDetail("IFSC", bankData.ifscCode, bankY);
        }
        if (bankData?.branchAddress) {
          bankY = putBankDetail("Branch", bankData.branchAddress, bankY);
        }
        if (bankData?.upiDetails?.upiId) {
          bankY = putBankDetail("UPI ID", bankData.upiDetails.upiId, bankY);
        }
        if (bankData?.upiDetails?.upiName) {
          bankY = putBankDetail("UPI Name", capitalizeWords(bankData.upiDetails.upiName), bankY);
        }
        if (bankData?.upiDetails?.upiMobile) {
          bankY = putBankDetail("UPI Mobile", bankData.upiDetails.upiMobile, bankY);
        }
      }

      // QR Code Block
      if (!shouldHideBankDetails && bankData?.qrCode) {
        try {
          const qrUrl = `${process.env.BASE_URL || ""}/${bankData.qrCode}`;
          const qrX = margin + bankWidth + 10;
          const qrY = footerStartY + 15;
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("QR Code", qrX + qrWidth / 2, qrY - 5, { align: "center" });
          
          doc.addImage(qrUrl, "PNG", qrX, qrY, 80, 80);
        } catch (error) {
          console.log("QR code not found");
        }
      }

      // Signature Block
      const signatureX = margin + qrWidth + bankWidth;
      let signatureY = footerStartY + 5;
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(`For ${companyName}`, signatureX + signatureWidth / 2, signatureY, {
        align: "center"
      });
      signatureY += 30;

      // Signature line
      doc.setDrawColor(BORDER_COLOR);
      doc.setLineWidth(1);
      doc.line(signatureX + 10, signatureY, signatureX + signatureWidth - 10, signatureY);
      signatureY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Authorised Signatory", signatureX + signatureWidth / 2, signatureY, {
        align: "center"
      });

      currentY = footerStartY + 95;

      // Terms and Conditions Section
      if (transaction?.notes) {
        const termsStartY = currentY;
        const termsWidth = pageWidth - 2 * margin;
        const termsHeight = 50;

        doc.setDrawColor(BORDER_COLOR);
        doc.setLineWidth(1);
        doc.rect(margin, termsStartY, termsWidth, termsHeight, "S");

        const elements = parseHtmlToElements(transaction.notes, 7);
        renderParsedElements(elements, doc, margin + 5, termsStartY + 5, termsWidth - 10);
      }
    }

    // Page Number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(102, 102, 102);
    doc.text(
      `${pageIndex + 1} / ${pages.length} Page`,
      pageWidth - margin - 10,
      pageHeight - 10,
      { align: "right" }
    );
  });

  return doc;
};

module.exports = { generateTemplate21 };