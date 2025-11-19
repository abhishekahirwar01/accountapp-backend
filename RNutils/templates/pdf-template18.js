// backend/templates/template18.js
const {
  formatCurrency,
  getBillingAddress,
  getShippingAddress,
  prepareTemplate8Data,
  numberToWords,
  formatPhoneNumber,
  formatQuantity
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");

const generateTemplate18 = (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // Thermal page sizing
  const mmToPt = (mm) => (mm * 72) / 25.4;
  const THERMAL_WIDTH_MM = 100;
  const thermalPageWidth = mmToPt(THERMAL_WIDTH_MM);
  
  const estimateThermalHeight = (itemCount) => {
    const headerHeight = 180;
    const perItemHeight = 34;
    const footerHeight = 240;
    const minHeight = 400;
    return Math.max(
      minHeight,
      headerHeight + itemCount * perItemHeight + footerHeight
    );
  };

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

  const SEPARATOR_LINE = "=============================================";
  const DOUBLE_SEPARATOR = "==========================================================";

  // Helper to determine GST Label
  const getTaxLabel = (showIGST, totalCGST, totalSGST) => {
    if (showIGST) return "Add: IGST";
    if (totalCGST > 0 || totalSGST > 0) return "Add: Total Tax";
    return "Total Tax";
  };

  const totalTaxAmount = totalIGST || totalCGST + totalSGST;
  const taxLabel = getTaxLabel(showIGST, totalCGST, totalSGST);

  // Check for UPI availability
  const bankDataWithUpi = bank;
  const isUpiAvailable = bankDataWithUpi?.upiDetails?.upiId;

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).toUpperCase().replace(/\./g, "-");
  };

  // Main drawing function
  const drawPage = (pageItems, isLastPage = true) => {
    const dynamicHeight = estimateThermalHeight(pageItems.length);
    
    // Set page size
    pdfDoc.addPage({ size: [thermalPageWidth, dynamicHeight] });
    
    let currentY = 8;
    const M = 8;
    const contentWidth = thermalPageWidth - M * 2;

    // Company Header - Centered
    pdfDoc.fontSize(9).font("Helvetica-Bold");
    const companyName = capitalizeWords(
      company?.businessName || company?.companyName || "Global Securities"
    );
    pdfDoc.text(companyName, M, currentY, { align: "center", width: contentWidth });
    currentY += 12;

    pdfDoc.fontSize(8).font("Helvetica-Normal");
    const companyAddress = capitalizeWords(
      [company?.address, company?.City, company?.addressState]
        .filter(Boolean)
        .join(", ")
    );
    const addressLines = pdfDoc.splitTextToSize(companyAddress, contentWidth);
    addressLines.forEach(line => {
      pdfDoc.text(line, M, currentY, { align: "center", width: contentWidth });
      currentY += 8;
    });

    const countryLine = `${capitalizeWords(company?.Country || "India")} - ${company?.Pincode || ""}`;
    pdfDoc.text(countryLine, M, currentY, { align: "center", width: contentWidth });
    currentY += 8;

    if (company?.mobileNumber) {
      pdfDoc.text(`Phone no: ${formatPhoneNumber(String(company.mobileNumber))}`, M, currentY, { 
        align: "center", width: contentWidth 
      });
      currentY += 8;
    }

    if (company?.gstin) {
      pdfDoc.text(`GSTIN: ${company.gstin}`, M, currentY, { align: "center", width: contentWidth });
      currentY += 10;
    }

    // TAX INVOICE Header
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("========================TAX INVOICE=======================", M, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 12;

    // INVOICE # and DATE
    pdfDoc.font("Helvetica-Normal");
    const invoiceLeft = `INVOICE #: ${transaction.invoiceNumber || "N/A"}`;
    const invoiceRight = `DATE: ${formatDate(transaction.date)}`;
    
    pdfDoc.text(invoiceLeft, M, currentY);
    pdfDoc.text(invoiceRight, M, currentY, { align: "right", width: contentWidth });
    currentY += 12;

    // Billed To Section
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("============================BILLED TO============================", M, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 8;

    pdfDoc.font("Helvetica-Normal");
    pdfDoc.text(`Name : ${capitalizeWords(party?.name || "Jay Enterprises")}`, M, currentY);
    currentY += 8;

    if (party?.contactNumber) {
      pdfDoc.text(formatPhoneNumber(party.contactNumber), M, currentY);
      currentY += 8;
    }

    if (party?.gstin) {
      pdfDoc.text(`GSTIN : ${party.gstin}`, M, currentY);
      currentY += 8;
    }

    if (party?.pan) {
      pdfDoc.text(`PAN : ${party.pan}`, M, currentY);
      currentY += 8;
    }

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(DOUBLE_SEPARATOR, M, currentY, { align: "center", width: contentWidth });
    currentY += 12;

    // Items Table Header
    const colWidths = [contentWidth * 0.30, contentWidth * 0.25, contentWidth * 0.40, contentWidth * 0.30];
    let headerX = M;
    
    pdfDoc.text("Items", headerX, currentY);
    headerX += colWidths[0];
    
    pdfDoc.text("Amount (Rs.)", headerX, currentY, { align: "center", width: colWidths[1] });
    headerX += colWidths[1];
    
    pdfDoc.text("GST", headerX, currentY, { align: "center", width: colWidths[2] });
    headerX += colWidths[2];
    
    pdfDoc.text("Total(Rs)", headerX, currentY, { align: "right", width: colWidths[3] });
    currentY += 8;

    pdfDoc.text("=========================================================", M, currentY, {
      align: "center",
      width: contentWidth
    });
    currentY += 12;

    // Items Table Body
    pdfDoc.font("Helvetica-Normal").fontSize(8);
    pageItems.forEach((item, index) => {
      if (currentY > dynamicHeight - 200) {
        // Add new page if running out of space
        drawPage(pageItems.slice(index), isLastPage);
        return;
      }

      let rowX = M;
      const rowHeight = 34;

      // Item Details (30%)
      const itemName = capitalizeWords(item.name);
      const quantityText = item.itemType !== 'service' ? 
        formatQuantity(item.quantity || 0, item.unit) : '';
      const hsnSacText = `${item.itemType === 'service' ? 'SAC' : 'HSN'}: ${item.code || "-"}`;

      pdfDoc.text(itemName, rowX, currentY, { width: colWidths[0] - 2 });
      
      if (item.itemType !== 'service') {
        pdfDoc.text(quantityText, rowX, currentY + 8, { width: colWidths[0] - 2 });
        pdfDoc.text(hsnSacText, rowX, currentY + 16, { width: colWidths[0] - 2 });
      } else {
        pdfDoc.text(hsnSacText, rowX, currentY + 8, { width: colWidths[0] - 2 });
      }

      rowX += colWidths[0];

      // Amount (25%)
      pdfDoc.text(
        formatCurrency(item.pricePerUnit || 0), 
        rowX, 
        currentY, 
        { width: colWidths[1], align: "center" }
      );
      rowX += colWidths[1];

      // GST (40%)
      let gstText = "";
      if (isGSTApplicable) {
        if (showIGST) {
          gstText = `IGST-${item.gstRate.toFixed(2)}%`;
        } else if (showCGSTSGST) {
          gstText = `CGST-${(item.gstRate / 2).toFixed(2)}%\nSGST-${(item.gstRate / 2).toFixed(2)}%`;
        } else {
          gstText = "No Tax";
        }
      } else {
        gstText = "No Tax";
      }

      const gstLines = gstText.split('\n');
      gstLines.forEach((line, lineIndex) => {
        pdfDoc.text(line, rowX, currentY + (lineIndex * 8), { 
          width: colWidths[2], 
          align: "center" 
        });
      });
      rowX += colWidths[2];

      // Total (30%)
      pdfDoc.text(
        formatCurrency(item.total), 
        rowX, 
        currentY, 
        { width: colWidths[3] - 2, align: "right" }
      );

      currentY += rowHeight;
    });

    // Summary Section (Only on last page)
    if (isLastPage) {
      currentY += 12;
      
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text("========================SUMMARY=======================", M, currentY, {
        align: "center",
        width: contentWidth
      });
      currentY += 15;

      const summaryWidth = contentWidth * 0.75;
      const summaryX = M;

      pdfDoc.font("Helvetica-Normal");

      // Taxable Amount
      pdfDoc.text("Taxable Amount", summaryX, currentY);
      pdfDoc.text(`Rs ${formatCurrency(totalTaxable)}`, summaryX + summaryWidth - 50, currentY, {
        align: "right",
        width: 50
      });
      currentY += 10;

      // GST breakdown
      if (showIGST) {
        pdfDoc.text("Add: IGST", summaryX, currentY);
        pdfDoc.text(`Rs ${formatCurrency(totalIGST)}`, summaryX + summaryWidth - 50, currentY, {
          align: "right",
          width: 50
        });
        currentY += 10;
      }

      if (showCGSTSGST) {
        pdfDoc.text("Add: CGST", summaryX, currentY);
        pdfDoc.text(`Rs ${formatCurrency(totalCGST)}`, summaryX + summaryWidth - 50, currentY, {
          align: "right",
          width: 50
        });
        currentY += 10;

        pdfDoc.text("Add: SGST", summaryX, currentY);
        pdfDoc.text(`Rs ${formatCurrency(totalSGST)}`, summaryX + summaryWidth - 50, currentY, {
          align: "right",
          width: 50
        });
        currentY += 10;
      }

      // Total Tax
      pdfDoc.text("Total Tax", summaryX, currentY);
      pdfDoc.text(`Rs ${formatCurrency(totalTaxAmount)}`, summaryX + summaryWidth - 50, currentY, {
        align: "right",
        width: 50
      });
      currentY += 10;

      // Total Amount After Tax
      pdfDoc.text("Total Amount After Tax", summaryX, currentY);
      pdfDoc.text(`Rs ${formatCurrency(totalAmount).replace("₹", "")}`, summaryX + summaryWidth - 50, currentY, {
        align: "right",
        width: 50
      });
      currentY += 10;

      // GST Payable on Reverse Charge
      pdfDoc.text("GST Payable on Reverse Charge", summaryX, currentY);
      pdfDoc.text("N.A.", summaryX + summaryWidth - 50, currentY, {
        align: "right",
        width: 50
      });
      currentY += 15;

      pdfDoc.text(DOUBLE_SEPARATOR, M, currentY, { align: "center", width: contentWidth });
      currentY += 12;

      // Grand Total
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text("Grand Total", summaryX, currentY);
      pdfDoc.text(`Rs ${formatCurrency(totalAmount).replace("₹", "")}`, summaryX + summaryWidth - 50, currentY, {
        align: "right",
        width: 50
      });
      currentY += 12;

      pdfDoc.text(DOUBLE_SEPARATOR, M, currentY, { align: "center", width: contentWidth });
      currentY += 20;

      // UPI Payment Section
      if (isUpiAvailable) {
        const upiSectionX = M + 10;
        
        // QR Code
        if (bank?.qrCode) {
          try {
            const qrSize = 80;
            const qrX = contentWidth - qrSize - 20;
            pdfDoc.image(
              `${process.env.BASE_URL || ""}${bank.qrCode}`,
              qrX,
              currentY,
              { width: qrSize, height: qrSize }
            );
            
            pdfDoc.fontSize(9).font("Helvetica-Bold");
            pdfDoc.text("QR Code", qrX + 20, currentY + qrSize + 5, { align: "center", width: 40 });
          } catch (error) {
            console.log("QR code not found");
          }
        }

        pdfDoc.fontSize(7).font("Helvetica-Normal");
        
        if (bankDataWithUpi.upiDetails.upiId) {
          pdfDoc.text(`UPI ID: ${bankDataWithUpi.upiDetails.upiId}`, upiSectionX, currentY);
          currentY += 8;
        }

        if (bankDataWithUpi.upiDetails.upiName) {
          pdfDoc.text(`UPI Name: ${bankDataWithUpi.upiDetails.upiName}`, upiSectionX, currentY);
          currentY += 8;
        }

        if (bankDataWithUpi.upiDetails.upiMobile) {
          pdfDoc.text(`UPI Mobile No: ${bankDataWithUpi.upiDetails.upiMobile}`, upiSectionX, currentY);
          currentY += 8;
        }
      }
    }
  };

  // Process items in pages (for thermal, usually one page)
  const itemsPerPage = itemsWithGST.length || 12;
  const pages = [];
  for (let i = 0; i < itemsWithGST.length; i += itemsPerPage) {
    pages.push(itemsWithGST.slice(i, i + itemsPerPage));
  }

  // Draw each page
  pages.forEach((pageItems, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;
    drawPage(pageItems, isLastPage);
  });
};

module.exports = { generateTemplate18 };