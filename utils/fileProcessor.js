// utils/fileProcessor.js
const XLSX = require("xlsx");
const pdfParse = require("pdf-parse");

/**
 * Extract PDF text using pdfjs-dist (preserves table structure)
 * Uses coordinated text extraction with correct transform[5] Y coordinates
 * and standardFontDataUrl to prevent font warnings
 */
async function extractTextFromPDFWithPdfJs(fileBuffer) {
  const {
    extractTextFromPDFWithPdfJs: pdfjsExtractor,
  } = require("../services/googleVisionService");
  return await pdfjsExtractor(fileBuffer);
}

/**
 * Extract PDF text using pdf-parse (fast, for text-based PDFs)
 */
async function extractTextFromPDFTextLayer(fileBuffer) {
  const data = await pdfParse(fileBuffer);
  return (data.text || "").trim();
}

/**
 * Extract text from scanned PDF using Google Cloud Vision OCR
 * Converts PDF pages to images and runs Vision API on each
 * Requires: npm install pdf2pic (needs ImageMagick on the system)
 */
async function extractTextFromScannedPDF(fileBuffer) {
  const {
    extractTextFromScannedPDF: visionOCR,
  } = require("../services/googleVisionService");
  return await visionOCR(fileBuffer);
}

/**
 * Process PDF file with three-tier fallback:
 *
 * STEP 1: pdfjs-dist — best table structure preservation (digital PDFs)
 * STEP 2: pdf-parse  — fast fallback for simple text-based PDFs
 * STEP 3: Google Cloud Vision OCR — for scanned/image PDFs (no text layer)
 */
async function processPDF(fileBuffer) {
  let text = "";

  // ── STEP 1: pdfjs-dist (best table structure) ────────────────────────────
  console.log("[processPDF] Step 1️⃣: Attempting pdfjs-dist extraction...");
  try {
    text = await extractTextFromPDFWithPdfJs(fileBuffer);
    if (text && text.length > 100) {
      console.log(
        `[processPDF] ✅ pdfjs SUCCESS: ${text.length} characters extracted`,
      );
      console.log(`[processPDF] 🔵 DATA SOURCE: PDFJS-DIST`);
      return text;
    }
    console.log(
      `[processPDF] pdfjs returned ${text.length} chars — trying pdf-parse...`,
    );
  } catch (err) {
    console.error("[processPDF] pdfjs failed:", err.message);
  }

  // ── STEP 2: pdf-parse fallback ───────────────────────────────────────────
  console.log("[processPDF] Step 2️⃣: Attempting pdf-parse extraction...");
  try {
    text = await extractTextFromPDFTextLayer(fileBuffer);
    if (text && text.length > 100) {
      console.log(
        `[processPDF] ✅ pdf-parse SUCCESS: ${text.length} characters extracted`,
      );
      console.log(`[processPDF] 🟢 DATA SOURCE: PDF-PARSE`);
      return text;
    }
    console.log(
      `[processPDF] pdf-parse returned ${text.length} chars — likely scanned PDF`,
    );
  } catch (err) {
    console.error("[processPDF] pdf-parse failed:", err.message);
  }

  // ── STEP 3: Google Cloud Vision OCR (scanned PDFs) ───────────────────────
  // Only reached when both text-layer methods return < 100 chars
  // This is the real Vision API call — converts pages to images then OCRs
  console.log(
    "[processPDF] Step 3️⃣: PDF appears scanned — attempting Vision OCR...",
  );
  try {
    text = await extractTextFromScannedPDF(fileBuffer);
    if (text && text.length > 50) {
      console.log(
        `[processPDF] ✅ Vision OCR SUCCESS: ${text.length} characters extracted`,
      );
      console.log(
        `[processPDF] 🟡 DATA SOURCE: GOOGLE VISION OCR (SCANNED PDF)`,
      );
      return text;
    }
  } catch (err) {
    console.error("[processPDF] Vision OCR failed:", err.message);
  }

  // All methods failed
  throw new Error(
    "Could not extract text from PDF. " +
      "Tried: pdfjs-dist, pdf-parse, Google Vision OCR. " +
      "Please ensure the file is a valid PDF. " +
      "For scanned PDFs, install ImageMagick and run: npm install pdf2pic",
  );
}

/**
 * Process image file (JPG, PNG, WebP) using Google Vision OCR.
 */
async function processImage(fileBuffer) {
  const { extractTextFromImage } = require("../services/googleVisionService");
  const text = await extractTextFromImage(fileBuffer);
  if (!text || text.trim().length < 10) {
    throw new Error("No meaningful text found in image.");
  }
  return text;
}

/**
 * Process Excel / CSV file using xlsx library.
 */
function processExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  let extractedText = "";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    jsonData.forEach((row) => {
      if (Array.isArray(row)) {
        const rowText = row
          .map((cell) =>
            cell !== null && cell !== undefined ? String(cell).trim() : "",
          )
          .filter(Boolean)
          .join("\t");
        if (rowText) extractedText += rowText + "\n";
      }
    });
  });

  if (!extractedText.trim()) {
    throw new Error("Excel file appears to be empty.");
  }

  return extractedText;
}

module.exports = { processPDF, processImage, processExcel };
