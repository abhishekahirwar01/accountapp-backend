// backend/utils.js - Complete implementation matching frontend

// ==================== CLASS NAME UTILITY ====================

function cn(...inputs) {
  // Simple class name merger for backend (without tailwind)
  return inputs.filter(Boolean).join(" ");
}

// ==================== CAPITALIZE WORDS ====================

function capitalizeWords(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/\b\w/g, (l) => l.toUpperCase());
}

// ==================== HELPER: GET TAIL ====================

// Safely get a short id tail for fallback labels
const tail = (id) => (id ? id.toString().slice(-6) : "");

// ==================== GET UNIFIED LINES ====================

// Build a unified list of product + service lines from a transaction
function getUnifiedLines(tx, serviceNameById) {
  if (!tx || typeof tx !== "object") return [];

  // ✅ DIRECT ITEMS ARRAY SUPPORT (Your current structure)
  if (Array.isArray(tx.items)) {
    return tx.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;

        const quantity = item.quantity || 1;
        const pricePerUnit = item.pricePerUnit || 0;
        const taxableValue = quantity * pricePerUnit;
        const gstRate = item.gstRate || item.gstPercentage || 0;

        // ✅ CORRECT GST CALCULATIONS
        let lineTax = 0;
        if (gstRate > 0) {
          lineTax = (taxableValue * gstRate) / 100;
        }

        const lineTotal = taxableValue + lineTax;

        return {
          name: item.name || item.itemName || "Item",
          description: item.description || "",
          quantity: quantity,
          pricePerUnit: pricePerUnit,
          amount: taxableValue, // This is taxable value
          gstPercentage: gstRate,
          code: item.hsnCode || item.sacCode || item.code || "-",
          unit: item.unit || "Nos",
          itemType: item.itemType || "product",
          lineTax: lineTax, // ✅ NOW CALCULATED
          lineTotal: lineTotal, // ✅ NOW CALCULATED
          // ✅ Additional fields for GST calculations
          taxableValue: taxableValue,
          gstRate: gstRate,
          total: lineTotal,
        };
      })
      .filter((item) => item !== null); // Remove null items
  }

  // ✅ LEGACY SUPPORT
  const legacyProducts = Array.isArray(tx.products)
    ? tx.products
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          const quantity = p.quantity || 1;
          const pricePerUnit = p.pricePerUnit || 0;
          const taxableValue = quantity * pricePerUnit;
          const gstRate = p.gstRate || p.gstPercentage || 0;

          let lineTax = 0;
          if (gstRate > 0) {
            lineTax = (taxableValue * gstRate) / 100;
          }

          const lineTotal = taxableValue + lineTax;

          return {
            type: "product",
            name: p.product?.name || p.name || `Product`,
            quantity: quantity,
            unitType: p.unitType || "",
            pricePerUnit: pricePerUnit,
            description: p.description || "",
            amount: taxableValue,
            gstPercentage: gstRate,
            lineTax: lineTax,
            lineTotal: lineTotal,
            code: p.hsnCode || p.sacCode || p.code || "-",
            unit: p.unit || "Nos",
            itemType: p.itemType || "product",
            taxableValue: taxableValue,
            gstRate: gstRate,
            total: lineTotal,
          };
        })
    : [];

  // ✅ SERVICES SUPPORT
  const svcArray = Array.isArray(tx.service)
    ? tx.service
    : Array.isArray(tx.services)
    ? tx.services
    : [];

  const services = svcArray
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const quantity = 1;
      const pricePerUnit = s.pricePerUnit || s.amount || 0;
      const taxableValue = pricePerUnit * quantity;
      const gstRate = s.gstRate || s.gstPercentage || 0;

      let lineTax = 0;
      if (gstRate > 0) {
        lineTax = (taxableValue * gstRate) / 100;
      }

      const lineTotal = taxableValue + lineTax;

      const rawId = s.service?._id || s.service;
      const serviceId = rawId ? String(rawId) : undefined;

      const nameFromDoc = s.service?.serviceName || s.service?.name || s.name;
      const name =
        nameFromDoc ||
        (serviceId ? serviceNameById?.get(serviceId) : undefined) ||
        "Service";

      return {
        type: "service",
        name: name,
        service: serviceId,
        quantity: quantity,
        unitType: "",
        pricePerUnit: pricePerUnit,
        description: s.description || "",
        amount: taxableValue,
        gstPercentage: gstRate,
        lineTax: lineTax,
        lineTotal: lineTotal,
        code: s.sacCode || s.hsnCode || s.code || "-",
        unit: s.unit || "Service",
        itemType: "service",
        taxableValue: taxableValue,
        gstRate: gstRate,
        total: lineTotal,
      };
    });

  // ✅ Merge all arrays
  const allLines = [...legacyProducts, ...services];

  // Fallback if no items found
  if (allLines.length === 0) {
    const amount = Number(tx.amount) || 0;
    const gstRate = Number(tx.gstRate) || Number(tx.gstPercentage) || 0;
    const lineTax = (amount * gstRate) / 100;
    const lineTotal = amount + lineTax;

    allLines.push({
      type: "service",
      name: tx.description || "Item",
      quantity: 1,
      pricePerUnit: amount,
      amount: amount,
      gstPercentage: gstRate,
      lineTax: lineTax,
      lineTotal: lineTotal,
      code: "-",
      unit: "Service",
      itemType: "service",
      taxableValue: amount,
      gstRate: gstRate,
      total: lineTotal,
    });
  }

  return allLines;
}

// ==================== PARSE NOTES HTML ====================

function parseNotesHtml(notesHtml) {
  if (!notesHtml) return { title: "", isList: false, items: [] };

  // Extract title from first <p>
  const titleMatch = notesHtml.match(/<p[^>]*>(.*?)<\/p>/);
  const title = titleMatch
    ? titleMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim()
    : "Terms and Conditions";

  // Check if it's a list or paragraphs
  const isList = /<li[^>]*>/.test(notesHtml);

  if (isList) {
    // Parse as list
    const listItems = [];
    const liRegex = /<li[^>]*>(.*?)<\/li>/g;
    let match;
    while ((match = liRegex.exec(notesHtml)) !== null) {
      const cleanItem = match[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
      if (cleanItem) listItems.push(cleanItem);
    }

    return { title, isList: true, items: listItems };
  } else {
    // Parse as paragraphs
    const paragraphs = [];
    const pRegex = /<p[^>]*>(.*?)<\/p>/g;
    let match;
    let firstSkipped = false;
    while ((match = pRegex.exec(notesHtml)) !== null) {
      if (!firstSkipped) {
        firstSkipped = true; // Skip the title paragraph
        continue;
      }
      const cleanPara = match[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
      if (cleanPara) {
        paragraphs.push(cleanPara);
      }
    }

    return { title, isList: false, items: paragraphs };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  cn,
  capitalizeWords,
  getUnifiedLines,
  parseNotesHtml,
};
