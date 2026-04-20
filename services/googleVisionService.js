// services/googleVisionService.js
const vision = require("@google-cloud/vision");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const path = require("path");

const client = new vision.ImageAnnotatorClient();

// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI Setup (Lazy Initialization)
// ─────────────────────────────────────────────────────────────────────────────

let genAI = null;
let geminiModel = null;

function getGeminiModel() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    genAI = new GoogleGenerativeAI(apiKey);
  }

  if (!geminiModel) {
    try {
      geminiModel = genAI.getGenerativeModel(
        { model: "gemini-flash-latest" },
        { apiVersion: "v1beta" },
      );
    } catch (err) {
      console.warn("[Gemini Setup] Standard model failed, trying alias...");
      geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }
  }

  return geminiModel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq AI Parser — FALLBACK (after Gemini)
// ─────────────────────────────────────────────────────────────────────────────

async function parseWithGroq(rawText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("[Groq] No API key found, skipping.");
    return null;
  }
  console.log("[Groq] Starting AI parsing...");
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Extract invoice data, return ONLY JSON.
Rules:
- date=YYYY-MM-DD; dueDate same format
- PRODUCT: has HSN (4-8 digits), quantity > 0, has unit (Piece/Kg/etc)
- SERVICE: has SAC (6 digits starting 99), quantity>=0 or "-", unitType="Hours, Days, Months, Visits,Fixed cost, kilometers"
- **IF SAME ITEM APPEARS IN MULTIPLE ROWS: CREATE SEPARATE ITEMS (DO NOT COMBINE)**
- gstPercentage = CGST% + SGST% (combine them: 9+9=18, not 9)
- lineTax = sum all taxes on line
- Invoice has 2 discount columns: "Discount %" and "Discount Rs." (Amt)
- If Discount % is a round/clean number (5, 10, 12.5, 15, 20, 25): discountType="percentage", discountValue=that %
- Otherwise: discountType="fixed", discountValue=Discount Rs. amount
- Extract "Advance Received" or "Prepaid" or "Advance" amount from invoice (advanceReceived)
- Extract invoice-level discount (look for "Extra Discount", "Additional Discount", "Bulk Discount")
  - If shown as "10%": set extraDiscountType="percentage", extraDiscount=10
  - If shown as "₹500": set extraDiscountType="fixed", extraDiscount=500
  - DO NOT include item-level discounts here - only invoice summary discounts
- Missing/empty = null or 0, NEVER invent
- NO markdown/backticks, ONLY valid JSON`,
          },
          {
            role: "user",
            content: `Extract structured invoice data from this PDF-extracted OCR text (may be flattened tables). 
Reconstruct table columns using the heuristics provided. Return ONLY valid JSON.

OCR TEXT:
${rawText}

RETURN THIS EXACT JSON STRUCTURE (valid JSON only, no backticks or markdown):
{
  "companyName": "string or null",
  "partyName": "string or null",
  "gstin": "string or null",
  "partyGstin": "string or null",
  "invoiceNumber": "string or null",
  "date": "YYYY-MM-DD format or null",
  "dueDate": "YYYY-MM-DD format or null",
  "address": "string or null",
  "city": "string or null",
  "state": "string or null",
  "pincode": "string or null",
  "contactNumber": "string or null",
  "subtotal": 0,
  "taxAmount": 0,
  "totalAmount": 0,
  "paymentMethod": "Cash|UPI|Bank Transfer|Cheque|Credit|Others|null",
  "notes": "string or null",
  "advanceReceived": 0,
  "extraDiscountType": "fixed|percentage",
  "extraDiscount": 0,
  "items": [
    {
      "itemType": "product or service",
      "product": "exact name without HSN/SAC codes",
      "hsn": "HSN code (4-8 digits) - FOR PRODUCTS ONLY, empty string for services",
      "sac": "SAC code (6 digits starting 99) - FOR SERVICES ONLY, empty string for products",
      "quantity": 0,
      "unitType": "Piece|Kg|Litre|Box|Meter|Dozen|Pack|Set|Strip|Bottle|Tablet|Service",
      "pricePerUnit": 0,
      "amount": 0,
      "gstPercentage": 0,
      "lineTax": 0,
      "lineTotal": 0,
      "description": "",
      "discountType": "fixed|percentage",
      "discountValue": 0
    }
  ]
}`,
          },
        ],
        temperature: 0,
        max_tokens: 6000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    const text = response.data?.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    console.error("[Groq] Parsing failed:", errMsg);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI Parser
// ─────────────────────────────────────────────────────────────────────────────
async function parseWithGemini(rawText) {
  console.log("[Gemini] Starting AI parsing...");

  const prompt = `Extract invoice data, return ONLY JSON.
Rules:
- date=YYYY-MM-DD; dueDate same format
- PRODUCT: has HSN (4-8 digits), qty>0, has unit (Piece/Kg/Box/etc)
-SERVICE: has SAC (6 digits starting 99), quantity>=0 or "-", unitType="Hours, Days, Months, Visits,Fixed cost, kilometers"
- gstPercentage = CGST% + SGST% combined (example: 9+9=18, not just 9)
- lineTax = sum all tax amounts on line
- Invoice has 2 discount columns: "Discount %" and "Discount Rs." (Amt)
- If Discount % is a round/clean number (5, 10, 12.5, 15, 20, 25): discountType="percentage", discountValue=that %
- Otherwise: discountType="fixed", discountValue=Discount Rs. amount
- Extract "Advance Received" or "Prepaid" or "Advance" amount from invoice (advanceReceived)
- Extract invoice-level discount (look for "Extra Discount", "Additional Discount", "Bulk Discount")
  - If shown as "10%": set extraDiscountType="percentage", extraDiscount=10
  - If shown as "₹500": set extraDiscountType="fixed", extraDiscount=500
  - DO NOT include item-level discounts here - only invoice summary discounts
- Empty/missing = null or 0, NEVER invent values
- ONLY valid JSON, NO markdown/backticks

Invoice:
${rawText}

Return JSON only:
{
  "companyName": null, "partyName": null, "gstin": null, "partyGstin": null,
  "invoiceNumber": null, "date": null, "dueDate": null, "address": null,
  "city": null, "state": null, "pincode": null, "contactNumber": null,
  "subtotal": 0, "taxAmount": 0, "totalAmount": 0, "paymentMethod": null,
  "notes": null, "advanceReceived": 0, "extraDiscountType": "fixed", "extraDiscount": 0,
  "items": [{"itemType":"product","product":"","hsn":"","sac":"","quantity":0,"unitType":"Piece","pricePerUnit":0,"amount":0,"gstPercentage":0,"lineTax":0,"lineTotal":0,"description":"","discountType":"fixed","discountValue":0}]
}`;

  try {
    const result = await getGeminiModel().generateContent(prompt);
    const text = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);
    console.log(`[Gemini] Success! Items found: ${parsed.items?.length || 0}`);
    return parsed;
  } catch (err) {
    console.error("[Gemini] Parsing failed:", err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract text from IMAGE using Google Cloud Vision (for scanned docs)
// ─────────────────────────────────────────────────────────────────────────────
async function extractTextFromImage(imageBuffer) {
  const [result] = await client.documentTextDetection({
    image: { content: imageBuffer },
  });
  if (result.fullTextAnnotation?.text) return result.fullTextAnnotation.text;
  if (result.textAnnotations?.length > 0)
    return result.textAnnotations[0].description || "";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract text from SCANNED PDF using Google Cloud Vision
// Converts each PDF page to image and runs Vision OCR
// Use this when pdfjs/pdf-parse returns < 50 chars (scanned PDF)
// ─────────────────────────────────────────────────────────────────────────────
async function extractTextFromScannedPDF(pdfBuffer) {
  try {
    console.log("[Vision OCR] Converting scanned PDF pages to images...");

    // Use pdf2pic or canvas-based rendering to convert PDF pages to images
    // Requires: npm install pdf2pic (uses GraphicsMagick/ImageMagick)
    const { fromBuffer } = require("pdf2pic");

    const converter = fromBuffer(pdfBuffer, {
      density: 200, // DPI — higher = better OCR, slower
      format: "png",
      width: 2000,
      height: 2800,
    });

    // Convert first 5 pages max
    const { getDocument, GlobalWorkerOptions } =
      await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath =
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const fileUrl = workerPath.startsWith("/")
      ? `file://${workerPath}`
      : `file:///${workerPath.replace(/\\/g, "/")}`;
    GlobalWorkerOptions.workerSrc = fileUrl;

    const uint8Array = new Uint8Array(pdfBuffer);
    const pdfDoc = await getDocument({ data: uint8Array }).promise;
    const totalPages = Math.min(pdfDoc.numPages, 5);

    let fullText = "";

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        console.log(`[Vision OCR] Processing page ${pageNum}/${totalPages}...`);
        const pageImage = await converter(pageNum, { responseType: "buffer" });
        const imageBuffer = pageImage.buffer;

        if (imageBuffer) {
          const pageText = await extractTextFromImage(imageBuffer);
          if (pageText) {
            fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
          }
        }
      } catch (pageErr) {
        console.warn(`[Vision OCR] Page ${pageNum} failed:`, pageErr.message);
      }
    }

    if (fullText.trim()) {
      console.log(
        `[Vision OCR] ✅ Extracted ${fullText.length} chars from scanned PDF`,
      );
      return fullText.trim();
    }

    return "";
  } catch (err) {
    console.warn("[Vision OCR] Scanned PDF extraction failed:", err.message);
    console.warn(
      "[Vision OCR] Tip: Install pdf2pic — npm install pdf2pic (needs ImageMagick)",
    );
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract text from PDF using pdfjs-dist (preserves table structure)
// FIX 1: standardFontDataUrl added — prevents garbled text
// FIX 2: transform[5] used instead of item.y (correct pdfjs API)
// ─────────────────────────────────────────────────────────────────────────────
async function extractTextFromPDFWithPdfJs(pdfBuffer) {
  try {
    console.log("[pdfjs] Extracting PDF text...");

    const { getDocument, GlobalWorkerOptions } =
      await import("pdfjs-dist/legacy/build/pdf.mjs");

    const workerPath =
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const fileUrl = workerPath.startsWith("/")
      ? `file://${workerPath}`
      : `file:///${workerPath.replace(/\\/g, "/")}`;

    GlobalWorkerOptions.workerSrc = fileUrl;

    // ✅ FIX 1: Provide standardFontDataUrl to prevent font warnings + garbled text
    const standardFontDataUrl = path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "standard_fonts",
      path.sep, // trailing slash required by pdfjs
    );

    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = getDocument({
      data: uint8Array,
      // Convert to file:// URL on Windows, direct path on Unix
      standardFontDataUrl: standardFontDataUrl.startsWith("/")
        ? `file://${standardFontDataUrl}`
        : `file:///${standardFontDataUrl.replace(/\\/g, "/")}`,
    });

    const pdf = await loadingTask.promise;
    let fullText = "";

    console.log(`[pdfjs] PDF loaded, processing ${pdf.numPages} pages...`);

    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const items = textContent.items;

        // ✅ FIX 2: Use transform[5] for Y coordinate (correct pdfjs API — item.y doesn't exist)
        // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
        // translateX = transform[4] = X position
        // translateY = transform[5] = Y position
        const itemsByLine = [];
        let currentLine = [];
        let currentY = null;

        // pdfjs Y is bottom-up, so sort descending to get top-to-bottom reading order
        const sortedItems = [...items]
          .filter((item) => item.str && item.str.trim())
          .sort((a, b) => {
            const yDiff = b.transform[5] - a.transform[5]; // descending Y (top first)
            if (Math.abs(yDiff) > 2) return yDiff;
            return a.transform[4] - b.transform[4]; // ascending X (left first)
          });

        for (const item of sortedItems) {
          const itemY = item.transform[5]; // ✅ correct Y coordinate
          if (currentY !== null && Math.abs(itemY - currentY) > 2) {
            if (currentLine.length > 0) {
              itemsByLine.push(currentLine);
              currentLine = [];
            }
          }
          currentY = itemY;
          currentLine.push(item);
        }

        if (currentLine.length > 0) {
          itemsByLine.push(currentLine);
        }

        for (const line of itemsByLine) {
          // Already sorted by X in the sort above, but ensure within each line
          line.sort((a, b) => a.transform[4] - b.transform[4]);
          const lineStr = line.map((item) => item.str).join(" ");
          fullText += lineStr + "\n";
        }
      } catch (pageErr) {
        console.warn(
          `[pdfjs] Error extracting page ${pageNum}:`,
          pageErr.message,
        );
      }
    }

    if (fullText.trim()) {
      console.log(
        `[pdfjs] ✅ Extracted ${fullText.length} characters from PDF`,
      );
      return fullText.trim();
    }

    console.log("[pdfjs] No text found in PDF (possibly scanned)");
    return "";
  } catch (err) {
    console.warn("[pdfjs] Extraction failed:", err.message);
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy export name kept for backward compatibility with fileProcessor.js
// Points to the correctly named pdfjs extractor
// ─────────────────────────────────────────────────────────────────────────────
const extractTextFromPDFWithVision = extractTextFromPDFWithPdfJs;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const cleanLine = (s) =>
  String(s || "")
    .replace(/\uFFFD/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

const toNumber = (val) => {
  if (val == null) return 0;
  const s = String(val)
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function parseIndianDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const numM = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (numM) {
    let yr = parseInt(numM[3], 10);
    if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    const d = new Date(yr, parseInt(numM[2], 10) - 1, parseInt(numM[1], 10));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2.toISOString();
}

function normalisePaymentMethod(raw) {
  const r = String(raw || "").toLowerCase();
  if (/cash/.test(r)) return "Cash";
  if (/upi|gpay|phonepe|paytm|bhim/.test(r)) return "UPI";
  if (/neft|rtgs|imps|bank|transfer|net.?banking|online/.test(r))
    return "Bank Transfer";
  if (/cheque|check/.test(r)) return "Cheque";
  if (/credit/.test(r)) return "Credit";
  return "Others";
}

function extractUnitFromText(line) {
  const m = String(line).match(
    /\b(Pcs?|Nos?|Kg|Kgs|Ltr|Litre|Litres|Units?|Box(?:es)?|Mtr|Meter|Set|Pack|Dozen)\b/i,
  );
  if (!m) return "Piece";
  const u = m[1].toLowerCase();
  const map = {
    kg: "Kg",
    kgs: "Kg",
    ltr: "Litre",
    litre: "Litre",
    litres: "Litre",
    pcs: "Piece",
    pc: "Piece",
    nos: "Piece",
    box: "Box",
    boxes: "Box",
    mtr: "Meter",
    meter: "Meter",
    dozen: "Dozen",
    pack: "Pack",
    set: "Set",
    unit: "Piece",
    units: "Piece",
  };
  return map[u] || "Piece";
}

function parseGstTaxLine(s) {
  if (!s) return null;
  const c = s.trim();
  const spaced = c.match(/^(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/);
  if (spaced) return [spaced[1], spaced[2]];
  const glued = c.match(/^(\d{1,3})((?:\d{1,3},)?\d{1,3},\d{3}(?:\.\d+)?)$/);
  if (glued) return [glued[1], glued[2]];
  return null;
}

function preProcessRawText(rawText) {
  let t = String(rawText || "");
  t = t.replace(/Sr\.\s*\n\s*No\./gi, "Sr. No.");
  t = t.replace(/\b(Invoice\s*(?:No\.?|Date))\s*:/gi, "$1: ");
  t = t.replace(/(Due)\s*\n\s*(Date)/gi, "$1 $2");
  t = t.replace(/\b(Name|Address|Phone|Due Date)\s*:/gim, (m, k) => k + ": ");
  t = t.replace(/\b(\d{8})(\d+)\s+([A-Za-z]{2,10})\b/g, "$1 $2 $3");
  t = t.replace(/HSN\/SAC\s*Qty/gi, "HSN/SAC Qty");
  t = t.replace(/\(Rs\.\)\s*Total/gi, "(Rs.) Total");
  return t;
}

function normalizeItemLine(line) {
  let t = String(line || "");
  t = t.replace(/\b(\d{6,8})(\d{1,3})\s+([A-Za-z]{2,10})\b/g, "$1 $2 $3");
  t = t.replace(/(\d)([A-Za-z])/g, "$1 $2");
  t = t.replace(/([A-Za-z])(\d)/g, "$1 $2");
  t = t.replace(/([A-Za-z])-(\d)/g, "$1 - $2");
  t = t.replace(
    /\b(Pcs?|Nos?|Kg|Kgs|Box(?:es)?|Units?|Ltr|Set|Pack|Meter|Mtr)\s*([\d,]+)/gi,
    "$1 $2",
  );
  t = t.replace(/(\d,\d{3})(\d)/g, "$1 $2");
  t = t.replace(/[ \t]+/g, " ").trim();
  return t;
}

function repairBrokenRows(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let cur = lines[i];
    const next = lines[i + 1];
    if (
      next &&
      /[A-Za-z]/.test(cur) &&
      !/\d/.test(cur) &&
      /^[\s\d,₹$\.\-]+$/.test(next)
    ) {
      cur = cur + " " + next;
      i++;
    }
    result.push(cur);
  }
  return result;
}

function heuristicExtractItems(lines) {
  const items = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^(Sr\.?|No\.?|Name|HSN|SAC|Qty|Rate|Amount|Total|TOTAL|Description|Particulars|Tax|GST)/i.test(
        line,
      )
    )
      continue;
    if (/total\s*in\s*words|amount\s*in\s*words|remarks/i.test(line)) continue;

    const priceMatch = line.match(/(.+?)\s+([\d,]+(?:\.\d+)?)$/);
    if (!priceMatch) continue;

    const productStr = priceMatch[1].trim();
    const amt = toNumber(priceMatch[2]);
    if (amt < 10) continue;
    if (!/[A-Za-z]{2,}/.test(productStr)) continue;
    if (/^(TOTAL|CGST|SGST|IGST|TAX|DISCOUNT|ROUND|OFF)\b/i.test(productStr))
      continue;

    const key = `${productStr}|${amt}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const qtyMatch = productStr.match(
      /(\d+(?:\.\d+)?)\s+(Boxes?|Kg|Kgs|Ltr|Litre|Pcs?|Nos?|Dozen|Box|Meter|Mtr|Unit|Set|Pack)/i,
    );
    const qtyRaw = qtyMatch ? qtyMatch[1] : null;
    const unitStr = qtyMatch ? qtyMatch[2] : "";

    const item = buildItem(
      productStr,
      "",
      qtyRaw,
      unitStr,
      0,
      amt,
      0,
      0,
      amt,
      productStr,
    );
    items.push(item);
  }
  return items;
}

function sliceMainItemsRegion(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const combined = lines[i] + " " + (lines[i + 1] || "");
    if (
      /(Sr\.?\s*No\.?|Name\s*of\s*Product|Name\s*of\s*Service|Description|Particulars)/i.test(
        combined,
      )
    ) {
      start = i;
      break;
    }
  }
  if (start === -1) return lines;

  let end = lines.length;
  const tiw = lines.findIndex(
    (l, i) => i > start && /TOTAL\s*IN\s*WORDS/i.test(l),
  );
  if (tiw !== -1) end = Math.min(end, tiw);
  const hsnRow = lines.findIndex(
    (l, i) => i > start + 3 && /^HSN\s*[\/\\]\s*SAC/i.test(l),
  );
  if (hsnRow !== -1) end = Math.min(end, hsnRow);
  return lines.slice(start, end);
}

function buildItem(
  product,
  hsn,
  qtyRaw,
  unitRaw,
  rate,
  taxable,
  gstPct,
  tax,
  total,
  lineForUnit,
) {
  const unitType = unitRaw
    ? extractUnitFromText(unitRaw)
    : extractUnitFromText(lineForUnit || "");
  const isService = !qtyRaw;
  const gst = parseFloat(gstPct) || 0;
  const qtyNum = qtyRaw ? parseFloat(qtyRaw) : 1;
  const computedTax = tax > 0 ? tax : +((taxable * gst) / 100).toFixed(2);
  const computedTotal = total > 0 ? total : +(taxable + computedTax).toFixed(2);
  const cleanProduct = String(product)
    .replace(/[\.\-\s]+$/, "")
    .trim();

  // ✅ Separate HSN for products and SAC for services
  const hsnCode = isService ? "" : String(hsn || "").trim();
  const sacCode = isService ? String(hsn || "").trim() : "";

  return {
    itemType: isService ? "service" : "product",
    product: cleanProduct,
    hsn: hsnCode,
    sac: sacCode,
    quantity: qtyNum,
    unitType: isService ? "Service" : unitType || "Piece",
    otherUnit: "",
    pricePerUnit:
      rate || (qtyNum > 0 ? +(taxable / qtyNum).toFixed(2) : taxable),
    amount: +taxable.toFixed(2),
    gstPercentage: +gst.toFixed(2),
    lineTax: +computedTax.toFixed(2),
    lineTotal: +computedTotal.toFixed(2),
    description: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS A: Full single-line rows
// ─────────────────────────────────────────────────────────────────────────────
function extractItemsFromFullRowLines(lines) {
  const items = [];

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (!/\d/.test(line)) continue;
    if (
      /^(total|subtotal|grand|tax|gst|cgst|sgst|igst|amount|sub\s*total|net|discount|remarks|words)/i.test(
        line,
      )
    )
      continue;
    if (
      /^(Sr\.?\s*No\.?|Name|HSN|SAC|Qty|Rate|Taxable|IGST|CGST|SGST|Amount|Total|Description)\b/i.test(
        line,
      )
    )
      continue;
    if (/^Total\b/i.test(line)) continue;

    // A2: CGST+SGST format
    const mA2 = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-\.]{1,50}?)\s+(\d{6,8})?\s*-?\s*(?:(\d+(?:\.\d+)?)\s+([A-Za-z]{2,10})\s+)?([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mA2) {
      const productRaw = mA2[2].replace(/[\.\-\s]+$/, "").trim();
      const taxable = toNumber(mA2[7]);
      const cgstPct = parseFloat(mA2[8]) || 0;
      const cgstAmt = toNumber(mA2[9]);
      const sgstPct = parseFloat(mA2[10]) || 0;
      const sgstAmt = toNumber(mA2[11]);
      const total = toNumber(mA2[12]);
      const item = buildItem(
        productRaw,
        mA2[3],
        mA2[4],
        mA2[5],
        toNumber(mA2[6]),
        taxable,
        cgstPct + sgstPct,
        cgstAmt + sgstAmt,
        total,
        line,
      );
      items.push(item);
      continue;
    }

    // Service with CGST+SGST
    const mServiceA2 = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-\.]{1,50}?)\s+(\d{6,8})?\s*-\s*([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mServiceA2) {
      const productRaw = mServiceA2[2].replace(/[\.\-\s]+$/, "").trim();
      const taxable = toNumber(mServiceA2[5]);
      const cgstPct = parseFloat(mServiceA2[6]) || 0;
      const cgstAmt = toNumber(mServiceA2[7]);
      const sgstPct = parseFloat(mServiceA2[8]) || 0;
      const sgstAmt = toNumber(mServiceA2[9]);
      const total = toNumber(mServiceA2[10]);
      const item = buildItem(
        productRaw,
        mServiceA2[3],
        null,
        "",
        toNumber(mServiceA2[4]),
        taxable,
        cgstPct + sgstPct,
        cgstAmt + sgstAmt,
        total,
        line,
      );
      items.push(item);
      continue;
    }

    // A1: IGST format
    const mA1 = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-\.]{1,50}?)\s+(\d{6,8})?\s*-?\s*(?:(\d+(?:\.\d+)?)\s+([A-Za-z]{2,10})\s+)?([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mA1) {
      const productRaw = mA1[2].replace(/[\.\-\s]+$/, "").trim();
      const taxable = toNumber(mA1[7]);
      const gst = parseFloat(mA1[8]) || 18;
      const tax = toNumber(mA1[9]);
      const total = toNumber(mA1[10]);
      const item = buildItem(
        productRaw,
        mA1[3],
        mA1[4],
        mA1[5],
        toNumber(mA1[6]),
        taxable,
        gst,
        tax,
        total,
        line,
      );
      items.push(item);
      continue;
    }

    // A3: No GST
    const mA3 = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-\.]{1,50}?)\s+(\d{6,8})?\s*-?\s*(?:(\d+(?:\.\d+)?)\s+([A-Za-z]{2,10})\s+)?([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mA3) {
      const productRaw = mA3[2].replace(/[\.\-\s]+$/, "").trim();
      const rate = toNumber(mA3[6]);
      const taxable = toNumber(mA3[7]);
      const total = toNumber(mA3[8]);
      const item = buildItem(
        productRaw,
        mA3[3],
        mA3[4],
        mA3[5],
        rate,
        taxable,
        0,
        0,
        total,
        line,
      );
      items.push(item);
      continue;
    }

    // Simple: idx name qty unit total
    const mSimple = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-]{1,40}?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mSimple) {
      const productRaw = mSimple[2].replace(/[\.\-\s]+$/, "").trim();
      const item = buildItem(
        productRaw,
        "",
        mSimple[3],
        mSimple[4],
        0,
        toNumber(mSimple[5]),
        0,
        0,
        toNumber(mSimple[5]),
        line,
      );
      items.push(item);
      continue;
    }

    // Service Simple
    const mServiceSimple = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z\s\-\.]{1,50}?)\s+(\d{6,8})?\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (mServiceSimple) {
      const productRaw = mServiceSimple[2].replace(/[\.\-\s]+$/, "").trim();
      const item = buildItem(
        productRaw,
        mServiceSimple[3] || "",
        null,
        "",
        0,
        toNumber(mServiceSimple[4]),
        0,
        0,
        toNumber(mServiceSimple[4]),
        line,
      );
      items.push(item);
      continue;
    }
  }

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS B: THREE-LINE BLOCKS (IGST multi-line format)
// ─────────────────────────────────────────────────────────────────────────────
function extractItemsFromThreeLineBlocks(lines) {
  const items = [];
  for (let i = 0; i < lines.length - 2; i++) {
    const l1 = cleanLine(lines[i]);
    const l2 = cleanLine(lines[i + 1]);
    const l3 = cleanLine(lines[i + 2]);
    if (!l1 || !l2 || !l3) continue;
    if (
      /^(Sr\.?\s*No\.?|Name|HSN|SAC|Qty|Rate|Taxable|IGST|CGST|SGST|Amount|Total|Description)\b/i.test(
        l1,
      )
    )
      continue;
    if (/^Total\b/i.test(l1)) continue;

    const gstTax = parseGstTaxLine(l2);
    if (!gstTax) continue;
    if (!/^[\d,]+(?:\.\d+)?$/.test(l3)) continue;

    const m1 = l1.match(
      /^(\d{1,3})\s+(.+?)[.\s]*(\d{6,8})?\s*-?\s*(?:(\d+(?:\.\d+)?)\s+([A-Za-z]{2,10})\s+)?([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i,
    );
    if (!m1) continue;

    const productRaw = m1[2].replace(/[\.\-\s]+$/, "").trim();
    if (!productRaw || productRaw.length < 2) continue;

    const taxable = toNumber(m1[7]);
    const gst = parseFloat(gstTax[0]) || 18;
    const tax = toNumber(gstTax[1]) || +((taxable * gst) / 100).toFixed(2);
    const total = toNumber(l3) || +(taxable + tax).toFixed(2);

    const item = buildItem(
      productRaw,
      m1[3],
      m1[4],
      m1[5],
      toNumber(m1[6]),
      taxable,
      gst,
      tax,
      total,
      l1,
    );
    items.push(item);
    i += 2;
  }
  return items;
}

function mergeItemsBest(a, b) {
  const score = (arr) =>
    (arr || []).reduce(
      (s, it) => s + (it?.product ? 2 : 0) + (it?.lineTotal > 0 ? 1 : 0),
      0,
    );
  if ((b?.length || 0) > (a?.length || 0)) return b;
  if ((b?.length || 0) === (a?.length || 0) && score(b) > score(a)) return b;
  return a || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main extraction — Gemini FIRST → Groq → Regex
// ─────────────────────────────────────────────────────────────────────────────
async function extractStructuredData(rawText) {
  // STEP 1: Gemini (most accurate)
  if (process.env.GEMINI_API_KEY) {
    console.log(
      "[extractStructuredData] Attempting Gemini AI parsing first...",
    );
    try {
      const geminiResult = await parseWithGemini(rawText);
      if (geminiResult && geminiResult.items && geminiResult.items.length > 0) {
        console.log(`[extractStructuredData] FINAL (Gemini):`, {
          parsedBy: "gemini",
        });
        return {
          ...geminiResult,
          date: geminiResult.date || null,
          dueDate: geminiResult.dueDate || null,
          parsedBy: "gemini",
        };
      }
    } catch (err) {
      if (err.message.includes("429") || err.message.includes("quota")) {
        console.log(
          "[extractStructuredData] Gemini rate limit hit, trying Groq...",
        );
      } else {
        console.error("[extractStructuredData] Gemini failed:", err.message);
      }
    }
  } else {
    console.log(
      "[extractStructuredData] No Gemini API key, skipping to Groq...",
    );
  }

  // STEP 2: Groq fallback
  if (process.env.GROQ_API_KEY) {
    console.log("[extractStructuredData] Attempting Groq AI parsing...");
    try {
      const groqResult = await parseWithGroq(rawText);
      if (groqResult && groqResult.items && groqResult.items.length > 0) {
        console.log(`[extractStructuredData] FINAL (Groq):`, {
          parsedBy: "groq",
        });
        return { ...groqResult, parsedBy: "groq" };
      }
      console.log(
        "[extractStructuredData] Groq returned no items, falling back to regex...",
      );
    } catch (err) {
      console.error("[extractStructuredData] Groq failed:", err.message);
    }
  } else {
    console.log(
      "[extractStructuredData] No Groq API key, skipping to regex...",
    );
  }

  // STEP 3: Regex fallback
  const preProcessed = preProcessRawText(rawText);
  const linesRaw = preProcessed.split("\n").map(cleanLine).filter(Boolean);
  const fullText = linesRaw.join("\n");

  const data = {
    companyName: null,
    partyName: null,
    gstin: null,
    partyGstin: null,
    address: null,
    city: null,
    state: null,
    pincode: null,
    contactNumber: null,
    invoiceNumber: null,
    date: null,
    dueDate: null,
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    paymentMethod: null,
    advanceReceived: 0,
    extraDiscountType: "fixed",
    extraDiscount: 0,
    items: [],
    parsedBy: "regex",
  };

  // Company name
  for (let i = 0; i < Math.min(10, linesRaw.length); i++) {
    const l = linesRaw[i];
    if (
      /^(Plot|House|Flat|Shop|Door|No\.|Phone|GSTIN|TAX|ORIGINAL|INVOICE|GST|Sumit|123,)/i.test(
        l,
      )
    )
      continue;
    if (l.length < 3) continue;
    if (/[A-Za-z]{3,}/.test(l) && !l.includes(":")) {
      data.companyName = l.replace(/\.+$/, "").trim();
      break;
    }
  }

  // GSTIN
  for (const line of linesRaw) {
    const m = line.match(/GSTIN\s*[:\-]?\s*([0-9][0-9A-Z]{14})/i);
    if (m?.[1] && m[1] !== "-" && /\d/.test(m[1])) {
      if (!data.gstin) data.gstin = m[1].toUpperCase();
      else if (!data.partyGstin) data.partyGstin = m[1].toUpperCase();
    }
  }

  // Invoice number
  for (const line of linesRaw) {
    const m = line.match(
      /Invoice\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,29})/i,
    );
    if (m?.[1]) {
      data.invoiceNumber = m[1].trim().replace(/[.,:;\s]+$/, "");
      break;
    }
  }

  // Dates
  for (const line of linesRaw) {
    if (!data.date) {
      const m = line.match(/^(?:Invoice\s*)?Date\s*[:\-]?\s*(.+)$/i);
      if (m?.[1]) {
        const d = parseIndianDate(m[1].trim());
        if (d) data.date = d;
      }
    }
    if (!data.dueDate) {
      const m = line.match(/^Due\s*(?:Date|On)\s*[:\-]?\s*(.+)$/i);
      if (m?.[1]) {
        const d = parseIndianDate(m[1].trim());
        if (d) data.dueDate = d;
      }
    }
  }

  // Party name
  const billedToIdx = linesRaw.findIndex((l) =>
    /Details of Buyer|Billed\s*to|Bill\s*to|Buyer/i.test(l),
  );
  if (billedToIdx !== -1) {
    for (
      let i = billedToIdx + 1;
      i < Math.min(billedToIdx + 10, linesRaw.length);
      i++
    ) {
      const m = linesRaw[i].match(/^Name\s*[:\-]\s*(.{2,80})/i);
      if (m?.[1]) {
        data.partyName = m[1].trim();
        break;
      }
    }
  }

  // Address
  const addrIdx = linesRaw.findIndex((l) => /^Address\s*[:\-]/i.test(l));
  if (addrIdx !== -1) {
    let addr = (
      linesRaw[addrIdx].match(/^Address\s*[:\-]\s*(.+)$/i)?.[1] || ""
    ).trim();
    const nextLine = linesRaw[addrIdx + 1] || "";
    if (nextLine && !/^(Phone|GSTIN|PAN|Country|State|Place)/i.test(nextLine)) {
      addr += /^\d{5,6}$/.test(nextLine)
        ? ", " + nextLine
        : nextLine.length < 60
          ? ", " + nextLine
          : "";
    }
    data.address = addr || null;
    if (addr) {
      const parts = addr
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      data.city = parts[1] || parts[0] || null;
      const sm = addr.match(
        /\b(Maharashtra|Gujarat|Rajasthan|Karnataka|Tamil\s*Nadu|Uttar\s*Pradesh|Delhi|Haryana|Punjab|Telangana|Andhra\s*Pradesh|West\s*Bengal|Madhya\s*Pradesh|Bihar|Odisha|Kerala|Assam|Jharkhand|Himachal\s*Pradesh|Uttarakhand|Chhattisgarh|Goa)\b/i,
      );
      if (sm) data.state = sm[1];
    }
  }

  // Pincode
  const pm = (data.address || fullText).match(/\b([1-9]\d{5})\b/);
  if (pm?.[1]) data.pincode = pm[1];

  // Contact
  const buyerPhoneIdx =
    billedToIdx !== -1
      ? linesRaw.findIndex(
          (l, i) => i > billedToIdx && /^Phone\s*[:\-]\s*/i.test(l),
        )
      : -1;
  const phoneLineIdx =
    buyerPhoneIdx !== -1
      ? buyerPhoneIdx
      : linesRaw.findIndex((l) => /^Phone\s*(?:No\.?)?\s*[:\-]/i.test(l));
  if (phoneLineIdx !== -1) {
    const m = linesRaw[phoneLineIdx].match(/[:\-]\s*([+\d\s\-]{8,20})/);
    if (m?.[1]) data.contactNumber = m[1].replace(/[^\d+]/g, "");
  }

  // Totals
  for (const line of linesRaw) {
    if (!data.subtotal) {
      const m = line.match(
        /(?:Taxable\s*(?:Value|Amount)|Sub\s*Total|Net\s*Amount)\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
      );
      if (m?.[1]) data.subtotal = toNumber(m[1]);
    }
    if (!data.taxAmount) {
      const m = line.match(
        /(?:Total\s*(?:Tax|GST|IGST|CGST|SGST)|Tax\s*Amount)\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
      );
      if (m?.[1]) data.taxAmount = toNumber(m[1]);
    }
    if (!data.totalAmount) {
      const m = line.match(
        /(?:Total\s*Amount|Grand\s*Total|Invoice\s*Total|Amount\s*(?:After\s*Tax|Payable))\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
      );
      if (m?.[1]) data.totalAmount = toNumber(m[1]);
    }
  }

  if (!data.totalAmount) {
    for (const line of linesRaw) {
      const mCGST = line.match(
        /^Total\s+\d+\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/i,
      );
      if (mCGST) {
        if (!data.subtotal) data.subtotal = toNumber(mCGST[1]);
        if (!data.taxAmount)
          data.taxAmount = toNumber(mCGST[2]) + toNumber(mCGST[3]);
        data.totalAmount = toNumber(mCGST[4]);
        break;
      }
      const mIGST = line.match(
        /^Total\s+\d+\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/i,
      );
      if (mIGST) {
        if (!data.subtotal) data.subtotal = toNumber(mIGST[1]);
        if (!data.taxAmount) data.taxAmount = toNumber(mIGST[2]);
        data.totalAmount = toNumber(mIGST[3]);
        break;
      }
      const mNoGST = line.match(/^Total\s+\d+\s+([\d,]+)\s+([\d,]+)\s*$/i);
      if (mNoGST) {
        if (!data.subtotal) data.subtotal = toNumber(mNoGST[1]);
        data.totalAmount = toNumber(mNoGST[2]);
        break;
      }
    }
  }

  // Payment method
  for (const line of linesRaw) {
    const m = line.match(
      /(?:Payment\s*(?:Mode|Method|Terms?)|Mode\s*of\s*Payment)\s*[:\-]?\s*([A-Za-z ]{3,25})/i,
    );
    if (m?.[1]) {
      data.paymentMethod = normalisePaymentMethod(m[1].trim());
      break;
    }
  }
  if (!data.paymentMethod) {
    for (const line of linesRaw) {
      const m = line.match(
        /\b(Cash|UPI|GPay|PhonePe|Paytm|NEFT|RTGS|IMPS|Cheque|Check|Bank\s*Transfer|Net\s*Banking|Credit\s*Card|Debit\s*Card|Online)\b/i,
      );
      if (m?.[1]) {
        data.paymentMethod = normalisePaymentMethod(m[1]);
        break;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Extract Advance Received
  // ─────────────────────────────────────────────────────────────────────────────
  for (const line of linesRaw) {
    const m = line.match(
      /(?:Advance\s*(?:Received|Paid)|Prepaid|Pre\s*Paid|Already\s*Paid)\s*(?:Rs\.?|₹)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i,
    );
    if (m?.[1]) {
      data.advanceReceived = toNumber(m[1]);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Extract Extra Discount (invoice-level, NOT item-level)
  // ─────────────────────────────────────────────────────────────────────────────
  for (const line of linesRaw) {
    // Look for patterns like "Extra Discount: 10%" or "Extra Discount: ₹500"
    const mPercent = line.match(
      /(?:Extra\s*Discount|Additional\s*Discount|Bulk\s*Discount|Overall\s*Discount|Discount\s*\(Invoice\s*Level\))\s*(?:Rs\.?|₹)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*%/i,
    );
    if (mPercent?.[1]) {
      data.extraDiscountType = "percentage";
      data.extraDiscount = parseFloat(mPercent[1].replace(/,/g, "")) || 0;
      break;
    }

    const mFixed = line.match(
      /(?:Extra\s*Discount|Additional\s*Discount|Bulk\s*Discount|Overall\s*Discount|Discount\s*\(Invoice\s*Level\))\s*(?:Rs\.?|₹)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*(?:Rs\.?|₹|$)/i,
    );
    if (mFixed?.[1]) {
      data.extraDiscountType = "fixed";
      data.extraDiscount = toNumber(mFixed[1]);
      break;
    }
  }

  // Items
  const mainRegionRaw = sliceMainItemsRegion(linesRaw);
  const repaired = repairBrokenRows(mainRegionRaw);
  const mainNorm = repaired
    .map(normalizeItemLine)
    .map(cleanLine)
    .filter(Boolean);

  const itemsA = extractItemsFromFullRowLines(mainNorm);
  const itemsB = extractItemsFromThreeLineBlocks(mainNorm);
  let combined = mergeItemsBest(itemsA, itemsB);

  if ((combined || []).length === 0) {
    combined = heuristicExtractItems(mainNorm);
  }

  data.items = combined || [];

  if (data.items.length > 0) {
    if (!data.subtotal)
      data.subtotal = +data.items
        .reduce((s, it) => s + (it.amount || 0), 0)
        .toFixed(2);
    if (!data.taxAmount)
      data.taxAmount = +data.items
        .reduce((s, it) => s + (it.lineTax || 0), 0)
        .toFixed(2);
    if (!data.totalAmount)
      data.totalAmount = +(data.subtotal + data.taxAmount).toFixed(2);
  }

  const formatDateForAPI = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  data.date = formatDateForAPI(data.date);
  data.dueDate = formatDateForAPI(data.dueDate);
  return data;
}

module.exports = {
  extractTextFromImage,
  extractTextFromPDFWithVision, // backward compat alias → pdfjs extractor
  extractTextFromPDFWithPdfJs, // explicit name
  extractTextFromScannedPDF, // new: real Vision OCR for scanned PDFs
  extractStructuredData,
};
