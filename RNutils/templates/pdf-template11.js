// backend/templates/template11.js
const {
  getBillingAddress,
  getShippingAddress,
  getUnifiedLines,
  prepareTemplate8Data,
  invNo,
  formatCurrency,
  numberToWords,
  getStateCode,
} = require("../pdf-utils");
const { capitalizeWords } = require("../utils");
const { formatPhoneNumber } = require("../pdf-utils");

// =======================================================================
// === SIMPLE HTML RENDERER (REPLACEMENT FOR jspdf-html-renderer) ===
// =======================================================================
function parseHtmlToElementsForJsPDF(html, fontSize = 9) {
  if (!html) return [];
  
  try {
    // Basic HTML tag stripping with line break preservation
    const cleanText = html
      .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
      .replace(/<p>/gi, '\n') // Convert <p> to newlines
      .replace(/<\/p>/gi, '\n')
      .replace(/<div>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, '') // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n/g, '\n') // Remove multiple newlines
      .trim();
    
    return [{ type: 'text', content: cleanText, fontSize }];
  } catch (error) {
    return [{ type: 'text', content: String(html), fontSize }];
  }
}

function renderParsedElementsWithJsPDF(pdfDoc, elements, x, y, maxWidth, pageWidth, pageHeight, headerFunction) {
  let currentY = y;
  
  for (const element of elements) {
    if (element.type === 'text' && element.content) {
      // Check if we need a new page
      if (currentY > pageHeight - 50) {
        pdfDoc.addPage();
        headerFunction(false);
        currentY = 100;
      }
      
      const lines = pdfDoc.splitTextToSize(element.content, maxWidth);
      pdfDoc.setFontSize(element.fontSize || 9);
      pdfDoc.text(lines, x, currentY);
      currentY += lines.length * ((element.fontSize || 9) + 2);
    }
  }
  
  return currentY;
}

// =======================================================================
// === MAIN PDF GENERATION FUNCTION ===
// =======================================================================

const generateTemplate11 = async (
  pdfDoc,
  transaction,
  company,
  party,
  shippingAddress,
  bank
) => {
  // ---------- palette and helper functions ----------
  const COLOR = {
    PRIMARY: [38, 70, 83],
    TEXT: [52, 58, 64],
    SUB: [108, 117, 125],
    BORDER: [206, 212, 218],
    BG: [248, 249, 250],
    WHITE: [255, 255, 255],
    BLUE: [0, 102, 204],
  };

  const BORDER_WIDTH = 0.01;

  const detectGSTIN = (x) => {
    const a = x || {};
    const gstin =
      a?.gstin ??
      a?.GSTIN ??
      a?.gstIn ??
      a?.GSTIn ??
      a?.gstNumber ??
      a?.GSTNumber ??
      a?.gst_no ??
      a?.GST_no ??
      a?.GST ??
      a?.gstinNumber ??
      a?.tax?.gstin;
    return (gstin || "").toString().trim() || null;
  };

  const money = (n) =>
    Number(n || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });

  const rupeesInWords = (n) =>
    `${numberToWords(Math.floor(Number(n) || 0)).toUpperCase()}`;

  const shouldHideBankDetails = transaction.type === "proforma";

  // ---------------- BANK DETAILS LOGIC ----------------
  const handleUndefined = (value, fallback = "-") => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "string" && value.trim() === "") return fallback;
    if (value === "N/A") return fallback;
    return value.toString();
  };

  const getBankDetailsFallback = () => ({
    name: "Bank Details Not Available",
    branch: "N/A",
    accNumber: "N/A",
    ifsc: "N/A",
    upiId: "N/A",
    contactNumber: "N/A",
    city: "N/A",
  });

  const dynamicBankDetails = (() => {
    if (!bank || typeof bank !== "object") {
      return getBankDetailsFallback();
    }

    const bankObj = bank;

    const hasBankDetails =
      bankObj.bankName ||
      bankObj.branchName ||
      bankObj.branchAddress ||
      bankObj.accountNumber ||
      bankObj.accountNo ||
      bankObj.ifscCode ||
      bankObj.upiDetails?.upiId ||
      bankObj.upiId;

    if (!hasBankDetails) {
      return getBankDetailsFallback();
    }

    const accountNumber =
      bankObj.accountNo ||
      bankObj.accountNumber ||
      bankObj.account_number ||
      "N/A";

    const upiId =
      bankObj.upiDetails?.upiId || bankObj.upiId || bankObj.upi_id || "N/A";

    return {
      name: handleUndefined(capitalizeWords(bankObj.bankName)),
      branch: handleUndefined(
        capitalizeWords(bankObj.branchName || bankObj.branchAddress)
      ),
      accNumber: handleUndefined(String(accountNumber)),
      ifsc: handleUndefined(capitalizeWords(bankObj.ifscCode)),
      upiId: handleUndefined(String(upiId)),
      contactNumber: handleUndefined(bankObj.contactNumber),
      city: handleUndefined(capitalizeWords(bankObj.city)),
    };
  })();

  const areBankDetailsAvailable =
    dynamicBankDetails.name !== "Bank Details Not Available";

  // ---------- derive (Template 8 logic) ----------
  const {
    totalTaxable,
    totalAmount,
    itemsWithGST,
    totalItems,
    totalQty,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    isInterstate,
    showIGST,
    showCGSTSGST,
    showNoTax,
  } = prepareTemplate8Data(transaction, company, party, shippingAddress);

  const unifiedLines = itemsWithGST?.length
    ? itemsWithGST
    : getUnifiedLines(transaction)?.map((it) => ({
        name: it.name || transaction.description || "Service Rendered",
        description: it.description || "",
        quantity: it.itemType === "service" ? "-" : (it.quantity || 1),
        pricePerUnit:
          it.pricePerUnit ??
          it.amount ??
          Number((transaction)?.amount || 0),
        taxableValue: Number(
          it.amount ??
            (it.quantity || 1) *
              (it.pricePerUnit ?? Number((transaction)?.amount || 0))
        ),
        gstRate: Number(it.gstPercentage || 0),
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
        code: it.code || (transaction)?.hsn || "N/A",
        unit: it.unit || it.uom || "",
      }));

  const calcRows = (itemsWithGST?.length ? itemsWithGST : unifiedLines).map(
    (it, i) => {
      const qty = Number(it.quantity || 1);
      const rate =
        it.pricePerUnit ?? (it.taxableValue && qty ? it.taxableValue / qty : 0);

      const taxable = Number(it.taxableValue ?? qty * rate);
      const gstPct = Number(it.gstRate ?? it.gstPercentage ?? 0);

      const cgst = Number(it.cgst || 0);
      const sgst = Number(it.sgst || 0);
      const igst = Number(it.igst || 0);
      const total = Number(it.total ?? taxable + cgst + sgst + igst);

      const desc = `${capitalizeWords(it?.name || "")}${
        it?.description ? " — " + it.description : ""
      }`;

      return {
        sr: i + 1,
        desc,
        hsn: it?.code || "N/A",
        qty: it.itemType === "service" ? "-" : it.quantity,
        unit: it?.unit || "",
        rate: Number(rate || 0),
        taxable,
        gstPct,
        cgst,
        sgst,
        igst,
        total,
      };
    }
  );

  const totalTaxableValue = Number(totalTaxable || 0);
  const invoiceTotalAmount = Number(totalAmount || 0);
  const sumCGST = Number(totalCGST || 0);
  const sumSGST = Number(totalSGST || 0);
  const sumIGST = Number(totalIGST || 0);

  const gstEnabled = !!isGSTApplicable;
  const shouldShowIGSTColumns = !!showIGST;
  const shouldShowCGSTSGSTColumns = !!showCGSTSGST;

  // Address and metadata logic
  const companyGSTIN = detectGSTIN(company) || "";
  const billingAddress = getBillingAddress(party);
  const shippingAddressStr = getShippingAddress(
    shippingAddress,
    billingAddress
  );

  const displayedCompanyName = (company?.businessName || "").trim();
  const partyPhone =
    (party?.mobileNumber && typeof party.mobileNumber === "string"
      ? party.mobileNumber.trim()
      : "") ||
    (party?.phone && typeof party.phone === "string"
      ? party.phone.trim()
      : "") ||
    (party?.contactNumber && typeof party.contactNumber === "string"
      ? party.contactNumber.trim()
      : "") ||
    "-";

  const invoiceData = {
    invoiceNumber: invNo(transaction),
    date: transaction.date
      ? new Intl.DateTimeFormat("en-GB").format(new Date(transaction.date))
      : new Intl.DateTimeFormat("en-GB").format(new Date()),
    company: {
      name: displayedCompanyName || " ",
      address: company?.address || "",
      email: company?.emailId || "",
      phone: company?.mobileNumber || "",
      gstin: companyGSTIN,
      logoUrl: company?.logoUrl || "",
      state: company?.addressState || "-",
    },
    billTo: {
      name: party?.name || "",
      billing: billingAddress || "-",
      shipping: shippingAddressStr || "-",
      email: party?.email || "",
      gstin: detectGSTIN(party) || "",
    },
    notes: transaction?.notes || "",
    totalInWords: rupeesInWords(invoiceTotalAmount),
  };

  const buyerState = party?.state || "-";
  const consigneeState = shippingAddress?.state
    ? `${shippingAddress.state} (${getStateCode(shippingAddress.state) || "-"})`
    : party?.state
    ? `${party.state} (${getStateCode(party.state) || "-"})`
    : "-";

  // ---------- doc scaffold ----------
  const pw = pdfDoc.internal.pageSize.getWidth();
  const ph = pdfDoc.internal.pageSize.getHeight();

  const margin = 36;
  const contentWidth = pw - margin * 2;
  const gutter = 10;

  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setTextColor(...COLOR.TEXT);

  // ---------- Reusable header drawing function ----------
  let DYNAMIC_HEADER_HEIGHT = 228;

  const drawCompleteHeader = (isFirstPage = false) => {
    // Draw white background
    pdfDoc.setFillColor(255, 255, 255);
    pdfDoc.rect(0, 0, pw, DYNAMIC_HEADER_HEIGHT, "F");

    // Company info section
    if (isFirstPage && company?.logo) {
      try {
        const logoPath = `${process.env.BASE_URL || ""}${company.logo}`;
        pdfDoc.addImage(logoPath, "PNG", margin + gutter - 8, 20, 60, 56);
      } catch (error) {
        console.log("Logo not found");
      }
    }

    const nameX =
      isFirstPage && company?.logo ? margin + gutter + 70 : margin + gutter;

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(16);
    pdfDoc.setTextColor(...COLOR.PRIMARY);
    pdfDoc.text(
      capitalizeWords((invoiceData.company.name || "").toUpperCase()),
      nameX - 10,
      45
    );

    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9);
    pdfDoc.setTextColor(...COLOR.SUB);

    const addr = (company?.address || "").trim();
    const stateText = company?.addressState ? `, ${company.addressState}` : "";
    const baseAddressText = addr + stateText;

    const textYStart = 60;
    const textX = nameX - 10;
    const maxWidth = contentWidth - (nameX - margin) - gutter;
    const lineHeight = 8;

    let finalY = textYStart;
    if (baseAddressText.length > 0) {
      const addressLines = pdfDoc.splitTextToSize(baseAddressText, maxWidth);
      pdfDoc.text(addressLines, textX, finalY);
      finalY += addressLines.length * lineHeight;
    }

    const phoneText = invoiceData.company.phone || "";

    if (phoneText.length > 0) {
      const formattedPhone = formatPhoneNumber(phoneText);
      const phoneY = baseAddressText.length > 0 ? finalY + 4 : textYStart;

      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("Phone No: ", textX, phoneY);

      pdfDoc.setFont("helvetica", "normal");

      const labelWidth =
        pdfDoc.getStringUnitWidth("Phone No: ") * pdfDoc.getFontSize();
      const phoneX = textX + labelWidth;

      pdfDoc.text(formattedPhone, phoneX, phoneY, {
        maxWidth: maxWidth - labelWidth,
      });
    }

    // Blue header bar
    const headerBarY = 90;
    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(margin, headerBarY - 10, margin + contentWidth, headerBarY - 10);

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(11);
    pdfDoc.setTextColor(...COLOR.TEXT);

    const gstText = invoiceData.company.gstin
      ? `GSTIN: ${invoiceData.company.gstin}`
      : "GSTIN: -";

    pdfDoc.text(gstText, margin + gutter - 6, headerBarY + 2);
    pdfDoc.text(
      transaction.type === "proforma"
        ? "PROFORMA INVOICE"
        : gstEnabled
        ? "TAX INVOICE"
        : "INVOICE",
      margin + contentWidth / 2,
      headerBarY + 2,
      { align: "center" }
    );
    pdfDoc.text(
      "ORIGINAL FOR RECIPIENT",
      margin + contentWidth - gutter + 5,
      headerBarY + 2,
      { align: "right" }
    );

    // Three-column info box with DYNAMIC HEIGHT
    const row = (label, value, x, y, colW) => {
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(9);
      const labelWidth =
        (pdfDoc.getStringUnitWidth(label) * pdfDoc.getFontSize()) /
        pdfDoc.internal.scaleFactor;
      const labelW = Math.max(labelWidth + 5, 45);
      const lineHeight = 10;

      pdfDoc.setTextColor(...COLOR.TEXT);
      pdfDoc.text(label, x + gutter, y);

      pdfDoc.setFont("helvetica", "normal");
      const txX = x + gutter + labelW;
      const txW = colW - (txX - x) - gutter;

      const capitalizedValue = capitalizeWords((value || "-"));
      const lines = pdfDoc.splitTextToSize(capitalizedValue, txW);
      pdfDoc.text(lines, txX, y);

      return y + lines.length * lineHeight + 2;
    };

    const topY = 96;
    const bw = contentWidth;

    const w1 = bw * 0.33;
    const w2 = bw * 0.33;
    const w3 = bw * 0.33 + 5;

    const x1 = margin;
    const x2 = margin + w1;
    const x3 = margin + w1 + w2;

    const subHeadH = 18;

    // CALCULATE DYNAMIC HEIGHTS for each column
    let yL = topY + subHeadH + 15;
    let yM = topY + subHeadH + 15;
    let yR = topY + subHeadH + 15;

    // Buyer details
    const buyerStartY = yL;
    yL = row("Name:", invoiceData.billTo.name, x1 - 5, yL, w1);
    yL = row("Address:", invoiceData.billTo.billing || "-", x1 - 5, yL, w1);
    yL = row(
      "Phone:",
      partyPhone && partyPhone !== "-" ? formatPhoneNumber(partyPhone) : "-",
      x1 - 5,
      yL,
      w1
    );
    yL = row("GSTIN:", invoiceData.billTo.gstin || "-", x1 - 5, yL, w1);
    yL = row("PAN:", party?.pan || "-", x1 - 5, yL, w1);
    yL = row(
      "Place of Supply:",
      shippingAddress?.state
        ? `${shippingAddress.state} (${
            getStateCode(shippingAddress.state) || "-"
          })`
        : party?.state
        ? `${party.state} (${getStateCode(party.state) || "-"})`
        : "-",
      x1 - 5,
      yL,
      w1
    );
    const buyerEndY = yL;

    // Consignee details
    const consigneeName =
      party?.consigneeName || invoiceData.billTo.name || "";
    const consigneeAddr =
      invoiceData.billTo.shipping || invoiceData.billTo.billing || "-";
    const consigneeCountry =
      shippingAddress?.country || party?.country || "India";
    const consigneePhone = shippingAddress?.contactNumber || partyPhone || "-";
    const consigneeGST = invoiceData.billTo.gstin || "-";

    const consigneeStartY = yM;
    yM = row("Name:", consigneeName, x2 - 5, yM, w2);
    yM = row("Address:", consigneeAddr, x2 - 5, yM, w2);
    yM = row("Country:", capitalizeWords(consigneeCountry), x2 - 5, yM, w2);
    yM = row(
      "Phone:",
      consigneePhone && consigneePhone !== "-"
        ? formatPhoneNumber(consigneePhone)
        : "-",
      x2 - 5,
      yM,
      w2
    );
    yM = row("GSTIN:", consigneeGST, x2 - 5, yM, w2);
    yM = row("State:", capitalizeWords(consigneeState), x2 - 5, yM, w2);
    const consigneeEndY = yM;

    // Invoice metadata
    const meta = {
      "Invoice No:": invoiceData.invoiceNumber,
      "Invoice Date:": invoiceData.date,
      "Due Date:": transaction?.dueDate
        ? new Intl.DateTimeFormat("en-GB").format(
            new Date(transaction.dueDate)
          )
        : "-",
      "P.O. No:": transaction?.poNumber || "-",
      "P.O. Date:": transaction?.poDate
        ? new Intl.DateTimeFormat("en-GB").format(
            new Date(transaction.poDate)
          )
        : "-",
      "E-Way No:": transaction?.ewayBillNo || "-",
    };

    const metaStartY = yR;
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(9);
    Object.entries(meta).forEach(([k, v]) => {
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(k, x3 - 5 + gutter, yR);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(String(v || "-"), x3 - 5 + w3 - gutter, yR, { align: "right" });
      yR += 12;
    });
    const metaEndY = yR;

    // Calculate the MAXIMUM height needed
    const buyerHeight = buyerEndY - buyerStartY;
    const consigneeHeight = consigneeEndY - consigneeStartY;
    const metaHeight = metaEndY - metaStartY;
    const maxContentHeight = Math.max(buyerHeight, consigneeHeight, metaHeight);

    const boxH = maxContentHeight + subHeadH + 20;

    // Draw the box with dynamic height
    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(margin, headerBarY - 10.3, margin, topY);
    pdfDoc.line(
      margin + contentWidth,
      headerBarY - 10.3,
      margin + contentWidth,
      topY
    );

    pdfDoc.rect(margin, topY, bw, boxH, "S");

    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(x2, topY, x2, topY + boxH);
    pdfDoc.line(x3, topY, x3, topY + boxH);

    pdfDoc.line(x1, topY + subHeadH, x1 + w1, topY + subHeadH);
    pdfDoc.line(x2, topY + subHeadH, x2 + w2, topY + subHeadH);
    pdfDoc.line(x3, topY + subHeadH, x3 + w3, topY + subHeadH);

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...COLOR.TEXT);
    pdfDoc.text(
      "Details of Buyer | Billed to :",
      x1 - 6 + gutter,
      topY + subHeadH - 5
    );
    pdfDoc.text(
      "Details of Consignee | Shipped to :",
      x2 - 6 + gutter,
      topY + subHeadH - 5
    );

    DYNAMIC_HEADER_HEIGHT = topY + boxH;
  };

  // Draw first page header
  drawCompleteHeader(true);

  // ---------- TABLE ----------
  // Define explicit column widths for better control
  const columnStyles = shouldShowIGSTColumns
    ? {
        0: { cellWidth: 30 }, // Sr.No.
        1: { cellWidth: 113 }, // Name
        2: { cellWidth: 50 }, // HSN/SAC
        3: { cellWidth: 45 }, // Qty
        4: { cellWidth: 50 }, // Rate
        5: { cellWidth: 70 }, // Taxable Value
        6: { cellWidth: 40 }, // IGST%
        7: { cellWidth: 60 }, // IGST Amt
        8: { cellWidth: 65 }, // Total
      }
    : shouldShowCGSTSGSTColumns
    ? {
        0: { cellWidth: 20 }, // Sr.No.
        1: { cellWidth: 100 }, // Name
        2: { cellWidth: 43 }, // HSN/SAC
        3: { cellWidth: 38 }, // Qty
        4: { cellWidth: 42 }, // Rate
        5: { cellWidth: 60 }, // Taxable Value
        6: { cellWidth: 38 }, // CGST%
        7: { cellWidth: 45 }, // CGST Amt
        8: { cellWidth: 38 }, // SGST%
        9: { cellWidth: 45 }, // SGST Amt
        10: { cellWidth: 55 }, // Total
      }
    : {
        0: { cellWidth: 35 }, // Sr.No.
        1: { cellWidth: 122 }, // Name
        2: { cellWidth: 60 }, // HSN/SAC
        3: { cellWidth: 60 }, // Qty
        4: { cellWidth: 75 }, // Rate
        5: { cellWidth: 85 }, // Taxable Value
        6: { cellWidth: 85 }, // Total
      };

  const head = shouldShowIGSTColumns
    ? [
        [
          { content: "Sr.No.", styles: { halign: "center" } },
          { content: "Name of Product / Service", styles: { halign: "center" } },
          { content: "HSN/SAC", styles: { halign: "center" } },
          { content: "Qty", styles: { halign: "center" } },
          { content: "Rate (Rs)", styles: { halign: "center" } },
          { content: "Taxable Value (Rs)", styles: { halign: "center" } },
          { content: "IGST% (Rs)", styles: { halign: "center" } },
          { content: "IGST Amt (Rs)", styles: { halign: "center" } },
          { content: "Total(Rs)", styles: { halign: "center" } },
        ],
      ]
    : shouldShowCGSTSGSTColumns
    ? [
        [
          { content: "Sr.No.", styles: { halign: "center" } },
          { content: "Name of Product / Service", styles: { halign: "center" } },
          { content: "HSN/SAC", styles: { halign: "center" } },
          { content: "Qty", styles: { halign: "center" } },
          { content: "Rate (Rs)", styles: { halign: "center" } },
          { content: "Taxable Value (Rs)", styles: { halign: "center" } },
          { content: "CGST% (Rs)", styles: { halign: "center" } },
          { content: "CGST Amt (Rs)", styles: { halign: "center" } },
          { content: "SGST% (Rs)", styles: { halign: "center" } },
          { content: "SGST Amt (Rs)", styles: { halign: "center" } },
          { content: "Total(Rs)", styles: { halign: "center" } },
        ],
      ]
    : [
        [
          { content: "Sr.No.", styles: { halign: "left" } },
          { content: "Name of Product / Service", styles: { halign: "left" } },
          { content: "HSN/SAC", styles: { halign: "left" } },
          { content: "Qty", styles: { halign: "center" } },
          { content: "Rate(Rs)", styles: { halign: "center" } },
          { content: "Taxable Value (Rs)", styles: { halign: "center" } },
          { content: "Total(Rs)", styles: { halign: "center" } },
        ],
      ];

  const body = calcRows.map((r) => {
    const qtyCell = typeof r.qty === "string" ? r.qty : r.qty.toString();

    if (shouldShowIGSTColumns) {
      return [
        String(r.sr),
        { content: r.desc },
        r.hsn,
        { content: qtyCell, styles: { halign: "left" } },
        { content: money(r.rate), styles: { halign: "right" } },
        { content: money(r.taxable), styles: { halign: "right" } },
        { content: `${(r.gstPct || 0).toFixed(2)}%`, styles: { halign: "center" } },
        { content: money(r.igst), styles: { halign: "right" } },
        { content: money(r.total), styles: { halign: "right" } },
      ];
    } else if (shouldShowCGSTSGSTColumns) {
      const halfPct = ((r.gstPct || 0) / 2).toFixed(2);
      return [
        String(r.sr),
        { content: r.desc },
        r.hsn,
        { content: qtyCell, styles: { halign: "left" } },
        { content: money(r.rate), styles: { halign: "right" } },
        { content: money(r.taxable), styles: { halign: "right" } },
        { content: `${halfPct}%`, styles: { halign: "center" } },
        { content: money(r.cgst), styles: { halign: "right" } },
        { content: `${halfPct}%`, styles: { halign: "center" } },
        { content: money(r.sgst), styles: { halign: "right" } },
        { content: money(r.total), styles: { halign: "right" } },
      ];
    } else {
      return [
        String(r.sr),
        { content: r.desc },
        r.hsn,
        { content: qtyCell, styles: { halign: "left" } },
        { content: money(r.rate), styles: { halign: "right" } },
        { content: money(r.taxable), styles: { halign: "right" } },
        { content: money(r.total), styles: { halign: "right" } },
      ];
    }
  });

  // Footer totals
  const foot = shouldShowIGSTColumns
    ? [
        [
          {
            content: "Total",
            colSpan: 5,
            styles: { halign: "left", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(totalTaxableValue),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          { content: "", styles: { halign: "center", cellPadding: 5 } },
          {
            content: money(sumIGST),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(invoiceTotalAmount),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
        ],
      ]
    : shouldShowCGSTSGSTColumns
    ? [
        [
          {
            content: "Total",
            colSpan: 5,
            styles: { halign: "left", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(totalTaxableValue),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          { content: "", styles: { halign: "center", cellPadding: 5 } },
          {
            content: money(sumCGST),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          { content: "", styles: { halign: "center", cellPadding: 5 } },
          {
            content: money(sumSGST),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(invoiceTotalAmount),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
        ],
      ]
    : [
        [
          {
            content: "Total",
            colSpan: 5,
            styles: { halign: "left", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(totalTaxableValue),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
          {
            content: money(invoiceTotalAmount),
            styles: { halign: "right", fontStyle: "bold", cellPadding: 5 },
          },
        ],
      ];

  // Use autoTable for PDFKit
  pdfDoc.autoTable({
    head,
    body,
    foot,
    startY: DYNAMIC_HEADER_HEIGHT,
    theme: "grid",
    margin: {
      left: margin,
      top: DYNAMIC_HEADER_HEIGHT,
      right: margin,
      bottom: 40,
    },
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: COLOR.TEXT,
      lineColor: COLOR.BLUE,
      lineWidth: BORDER_WIDTH,
      cellPadding: 4,
      valign: "top",
    },
    headStyles: {
      fillColor: [200, 225, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    columnStyles,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawCompleteHeader(false);
      }
    },
  });

  // ---------- Footer box ----------
  let footerStartY = pdfDoc.lastAutoTable.finalY + 20;
  const bottomMargin = 40;

  if (footerStartY + 250 > ph - bottomMargin) {
    pdfDoc.addPage();
    drawCompleteHeader(false);
    footerStartY = DYNAMIC_HEADER_HEIGHT + 12;
  }

  // Adjusted column widths
  const col1W = contentWidth * 0.58;
  const col2W = contentWidth * 0.42;
  const col1X = margin;
  const col2X = margin + col1W;

  const drawHeading = (title, x, y, width) => {
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...COLOR.TEXT);

    const headingW = pdfDoc.getTextWidth(title);
    const headingX = x + (width - headingW) / 2;
    pdfDoc.text(title, headingX, y);

    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(x, y + 4, x + width, y + 4);
    return y + 12;
  };

  let y1 = footerStartY + 15;
  let y1ContentEnd = y1;

  // Total in Words
  const headingHeight = 15;
  pdfDoc.setFillColor(200, 225, 255);
  pdfDoc.rect(col1X, y1 - 15, col1W, headingHeight, "F");
  y1 = drawHeading("Total in Words", col1X, y1 - 4, col1W);
  y1 += 8;

  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(8);

  const totalWordsLines = pdfDoc.splitTextToSize(
    invoiceData.totalInWords,
    col1W - 20
  );
  pdfDoc.text(totalWordsLines, col1X + gutter, y1);
  y1 += totalWordsLines.length * 12;
  y1ContentEnd = y1;

  // divider
  pdfDoc.setDrawColor(...COLOR.BLUE);
  pdfDoc.setLineWidth(BORDER_WIDTH);
  pdfDoc.line(col1X, y1, col1X + col1W, y1);
  y1 += 10;
  y1ContentEnd = y1;

  // Bank Details
  if (!shouldHideBankDetails) {
    const bankHeadingHeight = 13.4;
    pdfDoc.setFillColor(200, 225, 255);
    pdfDoc.rect(col1X, y1 - 9.8, col1W, bankHeadingHeight, "F");
    y1 = drawHeading("Bank Details", col1X, y1, col1W);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9);
    y1 += 4;

    if (areBankDetailsAvailable) {
      const bankData = bank;
      let currentBankY = y1;
      const maxTextWidth = col1W * 0.45;

      const renderBankLine = (label, value, wrapValue = false) => {
        if (value && value !== "-" && value !== "N/A") {
          pdfDoc.setFont("helvetica", "bold");
          const labelWidth = pdfDoc.getTextWidth(label);
          const startX = col1X + gutter + labelWidth;

          pdfDoc.text(label, col1X + gutter, currentBankY);

          pdfDoc.setFont("helvetica", "normal");

          if (wrapValue) {
            const splitText = pdfDoc.splitTextToSize(value, maxTextWidth);
            pdfDoc.text(splitText, startX, currentBankY);
            currentBankY += splitText.length * 14;
          } else {
            pdfDoc.text(value, startX, currentBankY);
            currentBankY += 14;
          }
        }
      };

      const bankDetailsStartY = currentBankY;

      // Bank details rendering
      if (bankData?.bankName) {
        renderBankLine("Bank Name: ", dynamicBankDetails.name);
      }
      if (bankData?.ifscCode) {
        renderBankLine("IFSC Code: ", dynamicBankDetails.ifsc);
      }
      if (bankData?.accountNo || bankData?.accountNumber) {
        renderBankLine("A/C Number: ", dynamicBankDetails.accNumber);
      }
      if (bankData?.branchAddress || bankData?.branchName) {
        renderBankLine("Branch: ", dynamicBankDetails.branch, true);
      }
      if (bankData?.upiDetails?.upiId || bankData?.upiId) {
        renderBankLine("UPI ID: ", dynamicBankDetails.upiId);
      }
      if (bankData?.upiDetails?.upiName) {
        renderBankLine("UPI Name: ", capitalizeWords(bankData.upiDetails.upiName));
      }
      if (bankData?.upiDetails?.upiMobile) {
        renderBankLine("UPI Mobile: ", bankData.upiDetails.upiMobile);
      }

      // QR Code
      if (bankData?.qrCode) {
        try {
          const qrCodePath = `${process.env.BASE_URL || ''}/${bankData.qrCode}`;
          const qrSize = 85;
          const qrX = col1X + col1W - qrSize - gutter + 10;
          const qrY = bankDetailsStartY + 5;
          
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFontSize(9);
          const qrLabel = "QR Code";
          const qrLabelWidth = pdfDoc.getTextWidth(qrLabel);
          pdfDoc.text(qrLabel, qrX + (qrSize - qrLabelWidth) / 2, qrY - 5);
          
          pdfDoc.addImage(qrCodePath, "PNG", qrX - 2, qrY, qrSize + 5, qrSize - 12);
        } catch (error) {
          console.log("QR code not found");
        }
      }

      y1 = currentBankY;
    } else {
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text("Bank details not available", col1X + gutter, y1);
      y1 += 14;
    }
    y1ContentEnd = y1;

    // divider after bank details
    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(col1X, y1ContentEnd, col1X + col1W, y1ContentEnd);
    y1ContentEnd += 10;
  }

  // Terms & Conditions
  let tncCursorY = y1ContentEnd + 10;
  const TNC_MAX_WIDTH = col1W - 20;
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(10);

  if (transaction?.notes) {
    const elements = parseHtmlToElementsForJsPDF(transaction.notes, 9);
    tncCursorY = renderParsedElementsWithJsPDF(
      pdfDoc,
      elements,
      col1X + gutter,
      tncCursorY,
      TNC_MAX_WIDTH,
      pw,
      ph,
      drawCompleteHeader
    );
  }

  y1ContentEnd = tncCursorY + 4;

  // ---------- RIGHT SIDE (Tax Summary / Signature) ----------
  const RIGHT_PAD = gutter;
  const LINE_H = 12;

  const rightBoxX = col2X;
  const rightBoxW = col2W;
  const rightBoxTopY = footerStartY;

  const innerRX = rightBoxX + RIGHT_PAD;
  const innerRW = rightBoxW - RIGHT_PAD * 2;

  const BOX_LEFT = rightBoxX;
  const BOX_RIGHT = rightBoxX + rightBoxW;

  const rDivider = (y) => {
    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(BOX_LEFT, y, BOX_RIGHT, y);
  };

  const rHeading = (title, y) => {
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...COLOR.TEXT);
    const w = pdfDoc.getTextWidth(title);
    const x = innerRX + (innerRW - w) / 2;
    pdfDoc.text(title, x, y);
    pdfDoc.setDrawColor(...COLOR.BLUE);
    pdfDoc.setLineWidth(BORDER_WIDTH);
    pdfDoc.line(BOX_LEFT, y + 4, BOX_RIGHT, y + 4);
    return y + 12;
  };

  let y2 = rightBoxTopY + 11;
  let y2ContentEnd = y2;

  // Tax Summary
  const taxHeadingHeight = 15;
  pdfDoc.setFillColor(200, 225, 255);
  pdfDoc.rect(rightBoxX, rightBoxTopY, rightBoxW, taxHeadingHeight, "F");

  y2 = rHeading("Tax Summary", y2);
  y2 += 9;
  y2ContentEnd = y2;

  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(8);

  const labelX = innerRX;
  const valueX = innerRX + innerRW;

  const taxRows = shouldShowIGSTColumns
    ? [
        ["Taxable Amount", `Rs ${money(totalTaxableValue)}`],
        ["Add: IGST", `Rs ${money(sumIGST)}`],
        ["Total Tax", `Rs ${money(sumIGST)}`],
      ]
    : shouldShowCGSTSGSTColumns
    ? [
        ["Taxable Amount", `Rs ${money(totalTaxableValue)}`],
        ["Add: CGST", `Rs ${money(sumCGST)}`],
        ["Add: SGST", `Rs ${money(sumSGST)}`],
        ["Total Tax", `Rs ${money(sumCGST + sumSGST)}`],
      ]
    : [
        ["Taxable Amount", `Rs ${money(totalTaxableValue)}`],
        ["Total Tax", `Rs ${money(0)}`],
      ];

  taxRows.forEach(([label, value]) => {
    pdfDoc.text(label, labelX, y2);
    pdfDoc.text(value, valueX, y2, { align: "right" });
    y2 += LINE_H + 2;
  });
  y2ContentEnd = y2;

  rDivider(y2);
  y2 += 16;

  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("Total Amount After Tax :", labelX, y2);

  const formattedTotal = money(invoiceTotalAmount);
  const amountWidth = pdfDoc.getTextWidth(formattedTotal);
  const gap = 15;
  const rsX = valueX - amountWidth - gap;

  pdfDoc.text("Rs.", rsX, y2);
  pdfDoc.text(formattedTotal, valueX, y2, { align: "right" });

  y2 += LINE_H - 4;
  y2ContentEnd = y2;

  rDivider(y2);
  y2 += 14;
  y2ContentEnd = y2;

  // Reverse Charge
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(...COLOR.TEXT);
  const rcLabel = "GST Payable on Reverse Charge : ";
  const rcValue = "N.A.";
  pdfDoc.text(rcLabel, rightBoxX + gutter, y2);
  const labelWidth = pdfDoc.getTextWidth(rcLabel);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.text(rcValue, rightBoxX + gutter + labelWidth + 2, y2);
  y2 += LINE_H - 3;
  y2ContentEnd = y2;

  pdfDoc.setDrawColor(...COLOR.BLUE);
  pdfDoc.setLineWidth(BORDER_WIDTH);
  pdfDoc.line(rightBoxX, y2, rightBoxX + rightBoxW, y2);
  y2 += 12;
  y2ContentEnd = y2;

  // Certificate
  const certText =
    "Certified that the particulars given above are true and correct.";
  const certLines = pdfDoc.splitTextToSize(certText, innerRW);
  pdfDoc.text(certLines, innerRX, y2);
  y2 += certLines.length * LINE_H + 6;
  y2ContentEnd = y2;

  // Signature / Stamp
  const companyDisplayName = capitalizeWords(
    company?.businessName || company?.companyName || "Company Name"
  );

  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(`For ${companyDisplayName}`, rightBoxX + rightBoxW / 2, y2, {
    align: "center",
  });
  y2 += 8;
  y2ContentEnd = y2;

  const stampW = 70;
  const stampH = 70;
  const stampX = rightBoxX + rightBoxW / 2 - stampW / 2;
  let stampPlaced = false;

  try {
    const stampPath = (company)?.stampDataUrl || "/path/to/stamp.png";
    pdfDoc.addImage(stampPath, "PNG", stampX, y2 + 6, stampW, stampH);
    stampPlaced = true;
  } catch (error) {
    console.log("Stamp not found");
  }

  const signY = y2 + (stampPlaced ? stampH + 34 : 50);
  pdfDoc.setDrawColor(...COLOR.BLUE);
  pdfDoc.setLineWidth(BORDER_WIDTH);
  pdfDoc.line(rightBoxX, signY - 10, rightBoxX + rightBoxW, signY - 10);

  const finalSignY = signY + 10;
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.text("Authorised Signatory", rightBoxX + rightBoxW / 2, finalSignY, {
    align: "center",
  });
  y2ContentEnd = finalSignY + 14;

  // --- Final Box Drawing and Page Numbering ---
  const contentMaxY = Math.max(y1ContentEnd, y2ContentEnd);
  const finalBlockHeight = contentMaxY - footerStartY;
  const blockHeightToDraw = Math.max(finalBlockHeight, 150);

  pdfDoc.setPage(pdfDoc.getNumberOfPages());
  pdfDoc.setDrawColor(...COLOR.BLUE);
  pdfDoc.setLineWidth(BORDER_WIDTH);
  pdfDoc.rect(col1X, footerStartY, contentWidth, blockHeightToDraw, "S");
  pdfDoc.setLineWidth(BORDER_WIDTH);
  pdfDoc.line(col2X, footerStartY, col2X, footerStartY + blockHeightToDraw);

  // Page numbers
  const pageCount = pdfDoc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdfDoc.setPage(i);
    pdfDoc.setFontSize(9);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Page ${i} of ${pageCount}`, pw - 35, ph - 20, { align: "right" });
  }

  return pdfDoc;
};

module.exports = { generateTemplate11 };