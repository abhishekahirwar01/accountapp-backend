// backend/pdf-utils.js - COMPLETE implementation matching frontend

// ==================== STATE CODE MAP ====================

const stateCodeMap = {
  "jammu & kashmir": "01",
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "haryana": "06",
  "delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "nagaland": "13",
  "manipur": "14",
  "mizoram": "15",
  "tripura": "16",
  "meghalaya": "17",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "daman & diu": "25",
  "daman and diu": "25",
  "dadra & nagar haveli": "26",
  "dadra and nagar haveli": "26",
  "maharashtra": "27",
  "andhra pradesh": "28",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34",
  "andaman & nicobar islands": "35",
  "andaman and nicobar islands": "35",
  "telangana": "36",
  "ladakh": "37"
};

const getStateCode = (stateName) => {
  if (!stateName) return null;
  const normalized = stateName.toLowerCase().trim();
  return stateCodeMap[normalized] || null;
};

// Normalize state name by removing code suffix like " ( 23 )"
const normalizeState = (state) => {
  if (!state) return "";
  return state.toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '');
};

// ==================== FORMATTING UTILITIES ====================

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return "0.00";
  const num = parseFloat(amount);
  const hasFraction = num % 1 !== 0;
  return num.toFixed(hasFraction ? 2 : 0);
};

const capitalizeWords = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatPhoneNumber = (phone) => {
  if (!phone) return "";
  
  // Convert to string and remove everything except digits
  const digits = String(phone).replace(/\D/g, "");
  
  // Keep last 10 digits (for numbers with +91 or country code)
  const cleaned = digits.slice(-10);
  
  // If not 10 digits, return original
  if (cleaned.length !== 10) return String(phone);
  
  // Format as 99999-99999
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
};

const formatQuantity = (qty, unit) => {
  if (!unit) return String(qty ?? "-");
  
  const normalized = unit.trim().toLowerCase();
  
  // Core mapping — singular to plural abbreviations
  const unitMap = {
    piece: { singular: "Pc", plural: "Pcs" },
    kilogram: { singular: "Kg", plural: "Kgs" },
    kg: { singular: "Kg", plural: "Kgs" },
    gram: { singular: "g", plural: "g" },
    g: { singular: "g", plural: "g" },
    litre: { singular: "Ltr", plural: "Ltrs" },
    ltr: { singular: "Ltr", plural: "Ltrs" },
    box: { singular: "Box", plural: "Boxes" },
    bag: { singular: "Bag", plural: "Bags" },
    packet: { singular: "Pkt", plural: "Pkts" },
    pkt: { singular: "Pkt", plural: "Pkts" },
    dozen: { singular: "dz", plural: "dz" },
    meter: { singular: "m", plural: "m" },
    m: { singular: "m", plural: "m" },
    foot: { singular: "ft", plural: "ft" },
    ft: { singular: "ft", plural: "ft" },
    unit: { singular: "Unit", plural: "Units" }
  };
  
  const singularKey = normalized.endsWith("s")
    ? normalized.slice(0, -1)
    : normalized;
  
  const entry = unitMap[normalized] || unitMap[singularKey];
  
  if (!entry) return `${qty ?? "-"} ${unit}`;
  
  const shortForm = qty === 1 ? entry.singular : entry.plural;
  return `${qty ?? "-"} ${shortForm}`;
};

// ==================== NUMBER TO WORDS ====================

const numberToWords = (num) => {
  if (num === 0) return "ZERO RUPEES ONLY";
  
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN"
  ];
  
  const tens = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"
  ];
  
  const convertBelowHundred = (n) => {
    if (n < 20) {
      return ones[n];
    }
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    return tens[ten] + (unit > 0 ? " " + ones[unit] : "");
  };
  
  const convertHundreds = (n) => {
    if (n === 0) return "";
    let str = "";
    
    // Handle hundreds
    if (n > 99) {
      str += ones[Math.floor(n / 100)] + " HUNDRED";
      n %= 100;
      if (n > 0) str += " ";
    }
    
    // Handle below hundred
    if (n > 0) {
      str += convertBelowHundred(n);
    }
    
    return str.trim();
  };
  
  const convertToWords = (n) => {
    if (n === 0) return "ZERO";
    
    let words = "";
    
    if (n >= 10000000) {
      const crores = Math.floor(n / 10000000);
      words += convertHundreds(crores) + " CRORE ";
      n %= 10000000;
    }
    
    if (n >= 100000) {
      const lakhs = Math.floor(n / 100000);
      words += convertHundreds(lakhs) + " LAKH ";
      n %= 100000;
    }
    
    if (n >= 1000) {
      const thousands = Math.floor(n / 1000);
      words += convertHundreds(thousands) + " THOUSAND ";
      n %= 1000;
    }
    
    if (n > 0) {
      words += convertHundreds(n);
    }
    
    return words.trim();
  };
  
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);
  
  let result = convertToWords(integerPart);
  
  if (decimalPart > 0) {
    result += " AND " + convertToWords(decimalPart) + " PAISE ONLY";
  } else {
    result += " RUPEES ONLY";
  }
  
  return result.trim().replace(/\s+/g, " ");
};

// ==================== ADDRESS UTILITIES ====================

const getBillingAddress = (party) => {
  if (!party) return "Address not available";
  return [party.address, party.city, party.state, party.pincode]
    .filter(Boolean)
    .join(", ");
};

const getShippingAddress = (shippingAddress, billingAddress) => {
  if (!shippingAddress) return billingAddress || "Address not available";
  return [shippingAddress.address, shippingAddress.city, shippingAddress.state, shippingAddress.pincode]
    .filter(Boolean)
    .join(", ");
};

const getBankDetails = (bank) => {
  if (!bank) return "Bank details not available";
  if (typeof bank === "string") return bank;
  return [bank.bankName, bank.branchAddress, bank.city, `IFSC: ${bank.ifscCode}`]
    .filter(Boolean)
    .join(", ");
};

// ==================== GSTIN UTILITY ====================

const getCompanyGSTIN = (c) => {
  if (!c) return null;
  return (
    c.gstin ??
    c.gstIn ??
    c.gstNumber ??
    c.gst_no ??
    c.gst ??
    c.gstinNumber ??
    c.tax?.gstin ??
    null
  );
};

// ==================== GET UNIFIED LINES ====================

const getUnifiedLines = (transaction, serviceNameById) => {
  const items = transaction.items || [];
  
  return items.map(item => ({
    name: item.name || item.itemName || "Item",
    description: item.description || "",
    quantity: item.quantity || 0,
    pricePerUnit: item.pricePerUnit || item.rate || 0,
    amount: (item.quantity || 0) * (item.pricePerUnit || item.rate || 0),
    gstPercentage: item.gstRate || item.gstPercentage || 0,
    code: item.hsnCode || item.sacCode || item.code || "-",
    unit: item.unit || "Nos",
    itemType: item.itemType || "product",
    lineTax: 0, // Will be calculated
    lineTotal: 0 // Will be calculated
  }));
};

// ==================== GST CALCULATIONS ====================

const calculateGST = (
  amount,
  gstRate,
  tx,
  company,
  party,
  shippingAddress
) => {
  const companyGstin = getCompanyGSTIN(company);
  
  // If company doesn't have GSTIN, no tax applies
  if (!companyGstin) {
    return {
      cgst: 0,
      sgst: 0,
      igst: 0,
      isInterstate: false,
      isGSTApplicable: false
    };
  }
  
  // Check if supplier state and recipient state are different (interstate)
  const recipientState = shippingAddress?.state || party?.state;
  const supplierState = company?.addressState || company?.state;
  const isInterstate = supplierState && recipientState 
    ? normalizeState(supplierState) !== normalizeState(recipientState) 
    : false;
  
  // Calculate GST amounts
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (isInterstate) {
    // IGST for interstate transactions
    igst = (amount * gstRate) / 100;
  } else {
    // CGST and SGST for intrastate transactions (split equally)
    const halfRate = gstRate / 2;
    cgst = (amount * halfRate) / 100;
    sgst = (amount * halfRate) / 100;
  }
  
  return {
    cgst,
    sgst,
    igst,
    isInterstate,
    isGSTApplicable: true
  };
};

// ==================== DERIVE TOTALS ====================

const deriveTotals = (tx, company, serviceNameById) => {
  const lines = getUnifiedLines(tx, serviceNameById);
  
  const subtotal = lines.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  
  const totalTax = lines.reduce(
    (sum, item) => sum + (Number(item.lineTax) || 0),
    0
  );
  
  const invoiceTotal = lines.reduce(
    (sum, item) => sum + (Number(item.lineTotal) || 0),
    0
  );
  
  const gstEnabled = totalTax > 0 && !!getCompanyGSTIN(company)?.trim();
  
  // Apply IGST/CGST/SGST calculations
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  
  lines.forEach(item => {
    const gst = calculateGST(item.amount || 0, item.gstPercentage || 0, tx, company);
    cgstTotal += gst.cgst;
    sgstTotal += gst.sgst;
    igstTotal += gst.igst;
  });
  
  return {
    lines,
    subtotal,
    tax: totalTax,
    invoiceTotal,
    gstPct: 0,
    gstEnabled,
    cgstTotal,
    sgstTotal,
    igstTotal
  };
};

// ==================== GET ITEMS BODY ====================

const getItemsBody = (transaction, serviceNameById) => {
  const lines = getUnifiedLines(transaction, serviceNameById);
  
  if (lines.length === 0) {
    return [
      [
        "1",
        1,
        transaction.description || "Item",
        "",
        formatCurrency(transaction.amount || 0),
        "0%",
        formatCurrency(0),
        formatCurrency(transaction.amount || 0)
      ]
    ];
  }
  
  return lines.map((item, index) => [
    (index + 1).toString(),
    item.quantity || 1,
    `${item.name}\n${item.description || ""}`,
    item.code || "",
    formatCurrency(Number(item.pricePerUnit || item.amount)),
    `${item.gstPercentage || 0}%`,
    formatCurrency(item.lineTax || 0),
    formatCurrency(item.lineTotal || item.amount || 0)
  ]);
};

// ==================== HSN SUMMARY ====================

const getHsnSummary = (items, showIGST, showCGSTSGST) => {
  const hsnMap = new Map();
  
  items.forEach(item => {
    const hsnCode = item.code || '-';
    
    if (!hsnMap.has(hsnCode)) {
      hsnMap.set(hsnCode, {
        hsnCode,
        taxableValue: 0,
        taxRate: item.gstRate || 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        total: 0
      });
    }
    
    const existing = hsnMap.get(hsnCode);
    existing.taxableValue += item.taxableValue;
    
    if (showIGST) {
      existing.taxAmount += item.igst || 0;
    } else if (showCGSTSGST) {
      existing.cgstAmount += item.cgst || 0;
      existing.sgstAmount += item.sgst || 0;
      existing.taxAmount = existing.cgstAmount + existing.sgstAmount;
    }
    
    existing.total += item.total;
  });
  
  return Array.from(hsnMap.values());
};

// ==================== PREPARE TEMPLATE DATA ====================

const prepareTemplate8Data = (transaction, company, party, shippingAddress) => {
  const totals = deriveTotals(transaction, company);
  const totalTaxable = totals.subtotal;
  const totalAmount = totals.invoiceTotal;
  const items = getUnifiedLines(transaction);
  const totalItems = items.length;
  const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const itemsBody = getItemsBody(transaction);
  
  // Calculate GST for each item with proper party and shipping address context
  const itemsWithGST = items.map((item) => {
    const taxableValue = item.amount;
    const gstRate = item.gstPercentage || 0;
    
    const gst = calculateGST(
      taxableValue,
      gstRate,
      transaction,
      company,
      party,
      shippingAddress
    );
    
    return {
      ...item,
      taxableValue,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      total: taxableValue + gst.cgst + gst.sgst + gst.igst,
      isGSTApplicable: gst.isGSTApplicable,
      isInterstate: gst.isInterstate,
      gstRate
    };
  });
  
  // Calculate total GST amounts
  const totalCGST = itemsWithGST.reduce((sum, item) => sum + (item.cgst || 0), 0);
  const totalSGST = itemsWithGST.reduce((sum, item) => sum + (item.sgst || 0), 0);
  const totalIGST = itemsWithGST.reduce((sum, item) => sum + (item.igst || 0), 0);
  
  // Determine GST type based on actual calculations
  const isGSTApplicable = itemsWithGST.some((item) => item.isGSTApplicable);
  const isInterstate = itemsWithGST.some((item) => item.isInterstate);
  const showIGST = isGSTApplicable && isInterstate;
  const showCGSTSGST = isGSTApplicable && !isInterstate;
  const showNoTax = !isGSTApplicable;
  
  return {
    totals,
    totalTaxable,
    totalAmount,
    items,
    totalItems,
    totalQty,
    itemsBody,
    itemsWithGST,
    totalCGST,
    totalSGST,
    totalIGST,
    isGSTApplicable,
    isInterstate,
    showIGST,
    showCGSTSGST,
    showNoTax
  };
};

// ==================== HTML PARSING ====================

const parseHtmlToElements = (html, fontSize = 8) => {
  if (!html) return [];
  
  // Basic HTML to text conversion
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  
  return [{
    type: "text",
    content: text,
    fontSize: fontSize,
    fontWeight: "normal",
    lineHeight: 1.2
  }];
};

// ==================== EXPORTS ====================

module.exports = {
  // Formatting
  formatCurrency,
  capitalizeWords,
  formatPhoneNumber,
  formatQuantity,
  
  // Address
  getBillingAddress,
  getShippingAddress,
  getBankDetails,
  
  // State
  getStateCode,
  normalizeState,
  
  // Number conversion
  numberToWords,
  
  // GSTIN
  getCompanyGSTIN,
  
  // Lines & Items
  getUnifiedLines,
  getItemsBody,
  
  // GST calculations
  calculateGST,
  deriveTotals,
  prepareTemplate8Data,
  getHsnSummary,
  
  // HTML parsing
  parseHtmlToElements
};