// backend/templates/template2.js
const {
  deriveTotals,
  formatCurrency,
  getUnifiedLines,
  getBillingAddress,
  getShippingAddress,
} = require("../pdf-utils");

const getItemsBodyTemplate2 = (
  transaction,
  serviceNameById
) => {
  const lines = getUnifiedLines(transaction, serviceNameById);

  if (lines.length === 0) {
    const amt = Number((transaction).amount ?? 0);
    const gstPct = Number((transaction)?.gstPercentage ?? 0);
    const tax = (amt * gstPct) / 100;
    const total = amt + tax;

    return [
      [
        "1",
        transaction.description || "Item",
        "",
        1,
        `${gstPct}%`,
        formatCurrency(amt),
        formatCurrency(tax),
        formatCurrency(total),
      ],
    ];
  }

  return lines.map((item, index) => [
    (index + 1).toString(),
    `${item.name}${item.description ? " - " + item.description : ""}`,
    item.code || "",
    item.itemType === "service" ? "-" : (item.quantity || 1),
    `${item.gstPercentage || 0}%`,
    formatCurrency(Number(item.pricePerUnit || item.amount)),
    formatCurrency(item.lineTax || 0),
    formatCurrency(item.lineTotal || item.amount || 0),
  ]);
};

const generatePdfForTemplate2 = (
  pdfDoc,
  transaction,
  company,
  party,
  serviceNameById,
  shippingAddress
) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 15;

  let currentY = margin;
  let currentPage = 1;

  const { subtotal, tax, invoiceTotal, gstEnabled } = deriveTotals(
    transaction,
    company,
    serviceNameById
  );

  const ITEMS_PER_PAGE = 12;
  const headerStartY = 120;
  const footerOffset = 35;
  const tableBottomMargin = 55;
  const rightX = pageWidth - margin;
  const labelX = rightX - 60;

  const billingAddress = getBillingAddress(party);
  const shippingAddressStr = getShippingAddress(shippingAddress, billingAddress);

  // Draw Header (exact same as frontend)
  const drawHeader = () => {
    // Company block (left)
    pdfDoc.fontSize(22).font("Helvetica-Bold");
    pdfDoc.text(company?.businessName || "Your Company", margin, 30);

    pdfDoc.fontSize(10).font("Helvetica");
    if (company?.emailId) pdfDoc.text(company.emailId, margin, 37);
    if (company?.mobileNumber) pdfDoc.text(company.mobileNumber, margin, 44);
    if (company?.gstin) pdfDoc.text(`GSTIN: ${company.gstin}`, margin, 51);

    // Invoice block (right)
    pdfDoc.fontSize(18).font("Helvetica-Bold");
    const invoiceText = `Invoice ${transaction.invoiceNumber || "N/A"}`;
    const invoiceWidth = pdfDoc.widthOfString(invoiceText);
    pdfDoc.text(invoiceText, rightX - invoiceWidth, 30);

    pdfDoc.fontSize(10).font("Helvetica");
    const issuedDate = `Issued: ${new Date(transaction.date).toLocaleDateString("en-US")}`;
    const issuedWidth = pdfDoc.widthOfString(issuedDate);
    pdfDoc.text(issuedDate, rightX - issuedWidth, 37);

    const dueDate = new Date(transaction.date);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateText = `Payment Due: ${dueDate.toLocaleDateString("en-US")}`;
    const dueDateWidth = pdfDoc.widthOfString(dueDateText);
    pdfDoc.text(dueDateText, rightX - dueDateWidth, 44);

    // Divider
    pdfDoc.moveTo(margin, 60).lineTo(pageWidth - margin, 60).stroke();

    // Client block
    pdfDoc.fontSize(14).font("Helvetica-Bold");
    pdfDoc.text(party?.name || "Client Name", margin, 75);

    pdfDoc.fontSize(10).font("Helvetica");
    if (party?.email) pdfDoc.text(party.email, margin, 82);

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("Bill To:", margin, 89);
    pdfDoc.font("Helvetica");
    
    const billToLines = pdfDoc.splitTextToSize(billingAddress, 150);
    pdfDoc.text(billToLines, margin, 94);

    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text("Ship To:", margin, 99);
    pdfDoc.font("Helvetica");
    
    const shipToLines = pdfDoc.splitTextToSize(shippingAddressStr, 150);
    pdfDoc.text(shipToLines, margin, 104);
  };

  const drawFooter = (pageNum, totalPages) => {
    const y = pageHeight - footerOffset;
    
    // Render notes (exact same as frontend)
    if (transaction.notes) {
      const notesLines = pdfDoc.splitTextToSize(transaction.notes, pageWidth - 40);
      pdfDoc.fontSize(8).font("Helvetica");
      pdfDoc.text(notesLines, 20, y);
    }
    
    // Page numbering
    pdfDoc.text(`Page ${pageNum} of ${totalPages}`, rightX, y, { align: "right" });
  };

  const addNewPage = () => {
    pdfDoc.addPage();
    currentPage++;
    drawHeader();
  };

  // Initial header
  drawHeader();

  // Build all rows then chunk into pages (exact same logic as frontend)
  const allRows = getItemsBodyTemplate2(transaction, serviceNameById);
  const chunks = [];
  for (let i = 0; i < allRows.length; i += ITEMS_PER_PAGE) {
    chunks.push(allRows.slice(i, i + ITEMS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push(allRows);

  const totalPagesPlanned = Math.max(1, chunks.length);

  // Table headers (exact same as frontend)
  const tableHeaders = ["S.No.", "Item Description", "HSN/SAC", "Qty", "GST%", "Rate", "Tax", "Total"];
  const columnWidths = [25, 120, 40, 25, 25, 40, 40, 40];

  // Render each chunk (exact same logic as frontend)
  chunks.forEach((rows, idx) => {
    if (idx > 0) {
      addNewPage();
    }

    let tableY = headerStartY;

    // Draw table header
    pdfDoc.rect(margin, tableY, pageWidth - 30, 15).fillAndStroke("#eeeeee", "#000000");
    
    let headerX = margin;
    pdfDoc.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
    
    tableHeaders.forEach((header, index) => {
      pdfDoc.text(header, headerX + 3, tableY + 5);
      headerX += columnWidths[index];
    });

    tableY += 15;

    // Draw table rows
    rows.forEach((row) => {
      if (tableY > pageHeight - tableBottomMargin) {
        drawFooter(currentPage, totalPagesPlanned);
        addNewPage();
        tableY = headerStartY + 15;
      }

      pdfDoc.rect(margin, tableY, pageWidth - 30, 15).stroke("#000000");
      
      let cellX = margin;
      pdfDoc.fontSize(8).font("Helvetica").fillColor("#000000");

      row.forEach((cell, cellIndex) => {
        const cellWidth = columnWidths[cellIndex];
        const lines = pdfDoc.splitTextToSize(cell.toString(), cellWidth - 6);
        
        const align = cellIndex >= 3 ? "center" : "left";
        const textX = align === "center" ? cellX + (cellWidth / 2) : cellX + 3;
        
        pdfDoc.text(lines, textX, tableY + 5, {
          align: align,
          width: cellWidth - 6
        });
        
        cellX += cellWidth;
      });

      tableY += 15;
    });

    drawFooter(currentPage, totalPagesPlanned);
  });

  // Totals on the last page (exact same logic as frontend)
  let finalY = (pdfDoc.y || headerStartY) + 10;
  const approxTotalsHeight = 30;

  if (finalY + approxTotalsHeight > pageHeight - footerOffset - 10) {
    addNewPage();
    finalY = headerStartY + 10;
  }

  // Totals block (exact same as frontend)
  let y = finalY;
  pdfDoc.fontSize(10).font("Helvetica");

  pdfDoc.text("Sub Total", labelX, y, { align: "right" });
  pdfDoc.text(formatCurrency(subtotal), rightX, y, { align: "right" });

  if (gstEnabled) {
    y += 7;
    pdfDoc.text("GST Total", labelX, y, { align: "right" });
    pdfDoc.text(formatCurrency(tax), rightX, y, { align: "right" });
  }

  y += 5;
  pdfDoc.moveTo(rightX - 80, y).lineTo(rightX, y).stroke();

  y += 7;
  pdfDoc.font("Helvetica-Bold");
  pdfDoc.text("GRAND TOTAL", labelX + 10, y, { align: "right" });
  pdfDoc.text(formatCurrency(invoiceTotal), rightX, y, { align: "right" });

  // Final footer
  drawFooter(currentPage, currentPage);
};

module.exports = { generatePdfForTemplate2 };