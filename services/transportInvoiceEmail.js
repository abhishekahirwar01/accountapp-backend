// services/transportInvoiceEmail.js
const nodemailer = require('nodemailer');
const { _internal } = require("../controllers/integrations/gmailController");
const EmailIntegration = require("../models/EmailIntegration");

// Fix the path - check where your template file actually is
// Try different possible paths:
let generatePdfForTripTransportationInvoiceTemplate;
try {
  // Try the correct path based on your project structure
  generatePdfForTripTransportationInvoiceTemplate = require("../lib/trip-transportation-invoice-template").generatePdfForTripTransportationInvoiceTemplate;
} catch (e1) {
  try {
    // Alternative path
    generatePdfForTripTransportationInvoiceTemplate = require("../../lib/trip-transportation-invoice-template").generatePdfForTripTransportationInvoiceTemplate;
  } catch (e2) {
    try {
      // Another alternative
      generatePdfForTripTransportationInvoiceTemplate = require("./lib/trip-transportation-invoice-template").generatePdfForTripTransportationInvoiceTemplate;
    } catch (e3) {
      console.error("Could not find trip-transportation-invoice-template module");
      // Create a placeholder function that returns null
      generatePdfForTripTransportationInvoiceTemplate = async () => {
        console.error("PDF generation not available - template not found");
        return null;
      };
    }
  }
}

// Create system transporter
function createSystemTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

// Format currency in Indian Rupees
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

// Format date
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// Generate PDF for attachment
async function generateInvoicePDF(invoice, company, consignor, consignee, bankDetails) {
  try {
    if (!generatePdfForTripTransportationInvoiceTemplate) {
      console.error("PDF generation function not available");
      return null;
    }

    // Prepare the trip data for PDF generation
    const tripData = {
      ...invoice.tripDetails,
      _id: invoice.tripId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      advanceReceived: invoice.advanceReceived,
      extraDiscount: invoice.extraDiscount,
      extraDiscountType: invoice.extraDiscountType,
      paymentMethod: invoice.paymentMethod,
      notes: invoice.notes,
      consignorDetails: invoice.consignorDetails,
      consigneeDetails: invoice.consigneeDetails,
      totalAmount: invoice.invoiceTotalAmount,
      subtotal: invoice.invoiceSubtotal,
      gst: invoice.invoiceGstAmount,
      gstPercentage: invoice.invoiceGstPercentage,
      loadingCharges: invoice.invoiceLoadingCharges,
      unloadingCharges: invoice.invoiceUnloadingCharges,
      otherCharges: invoice.invoiceOtherCharges,
    };

    const brandColor = company?.brandColor || "#1565C0";

    const blob = await generatePdfForTripTransportationInvoiceTemplate(
      tripData,
      company,
      consignor,
      consignee,
      bankDetails,
      undefined,
      null,
      brandColor
    );

    // Convert blob to buffer
    const buffer = Buffer.from(await blob.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error("Error generating PDF:", error);
    return null;
  }
}

// Generate transport invoice email HTML with actual data
function renderTransportInvoiceHtml({ 
  invoice, 
  customerName, 
  company, 
  tripDetails, 
  customMessage 
}) {
  const totalAmount = formatCurrency(invoice.invoiceTotalAmount || 0);
  const advanceReceived = formatCurrency(invoice.advanceReceived || 0);
  const discount = formatCurrency(invoice.extraDiscount || 0);
  const subtotal = formatCurrency(invoice.invoiceSubtotal || 0);
  const gstAmount = formatCurrency(invoice.invoiceGstAmount || 0);
  const gstPercentage = invoice.invoiceGstPercentage || 0;
  
  const issuedOn = formatDate(invoice.invoiceDate);
  const dueOn = formatDate(invoice.dueDate);
  
  // Calculate days overdue
  let daysOverdue = 0;
  if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
    const diffTime = Math.abs(new Date() - new Date(invoice.dueDate));
    daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transport Invoice ${invoice.invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 700px;
      margin: 20px auto;
      padding: 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, ${company?.brandColor || '#4F46E5'} 0%, ${company?.brandColor ? '#4F46E5' : '#7C3AED'} 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .message-box {
      background: #fefce8;
      padding: 15px;
      border-left: 4px solid #eab308;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info-section {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info-section h3 {
      margin: 0 0 15px 0;
      color: ${company?.brandColor || '#4F46E5'};
      font-size: 18px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .info-table td:first-child {
      font-weight: 600;
      color: #475569;
      width: 35%;
    }
    .info-table td:last-child {
      color: #1e293b;
    }
    .amount {
      font-size: 20px;
      font-weight: bold;
      color: ${company?.brandColor || '#4F46E5'};
    }
    .overdue-badge {
      background: #dc2626;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      display: inline-block;
    }
    .footer {
      background: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
    }
    .attachment-note {
      background: #e0f2fe;
      padding: 10px;
      border-radius: 6px;
      text-align: center;
      margin-top: 20px;
      font-size: 13px;
    }
    hr {
      margin: 20px 0;
      border: none;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>TRANSPORT INVOICE</h1>
        <p>${invoice.invoiceNumber}</p>
      </div>
      
      <div class="content">
        <div class="greeting">
          <strong>Dear ${customerName},</strong>
        </div>
        
        ${customMessage ? `
        <div class="message-box">
          ${customMessage.replace(/\n/g, '<br/>')}
        </div>
        ` : `
        <p>Please find attached the PDF invoice for your transport service.</p>
        `}
        
        <!-- Invoice Summary Section -->
        <div class="info-section">
          <h3>📄 Invoice Summary</h3>
          <table class="info-table">
            <tr><td>Invoice Number:</td><td><strong>${invoice.invoiceNumber}</strong></td></tr>
            <tr><td>Invoice Date:</td><td>${issuedOn}</td></tr>
            <tr><td>Due Date:</td><td>${dueOn} ${daysOverdue > 0 ? `<span class="overdue-badge">Overdue by ${daysOverdue} days</span>` : ''}</td></tr>
            <tr><td>Total Amount:</td><td><span class="amount">${totalAmount}</span></td></tr>
            ${advanceReceived !== '₹0.00' ? `<tr><td>Advance Received:</td><td style="color: #16a34a;">${advanceReceived}</td></tr>` : ''}
            ${discount !== '₹0.00' ? `<tr><td>Discount ${invoice.extraDiscountType === 'percentage' ? `(${invoice.extraDiscount}%)` : ''}:</td><td style="color: #16a34a;">${discount}</td></tr>` : ''}
          </table>
        </div>
        
        <!-- Trip Details Section -->
        <div class="info-section">
          <h3>🚚 Trip Details</h3>
          <table class="info-table">
            <tr><td style="width: 35%; color: #475569; font-weight: 600;">Trip ID / Sheet No:</td><td><strong>${tripDetails?.tripId || tripDetails?.tripSheetNo || invoice.tripDetails?.tripId || 'N/A'}</strong></td></tr>
            <tr><td style="color: #475569; font-weight: 600;">Route:</td><td>${tripDetails?.from || invoice.tripDetails?.from || 'N/A'} → ${tripDetails?.to || invoice.tripDetails?.to || 'N/A'}</td></tr>
            ${tripDetails?.cargoType || invoice.tripDetails?.cargoType ? `<tr><td style="color: #475569; font-weight: 600;">Cargo Type:</td><td>${tripDetails?.cargoType || invoice.tripDetails?.cargoType}</td></tr>` : ''}
            ${tripDetails?.cargoWeight || invoice.tripDetails?.cargoWeight ? `<tr><td style="color: #475569; font-weight: 600;">Cargo Weight:</td><td>${tripDetails?.cargoWeight || invoice.tripDetails?.cargoWeight} ${tripDetails?.cargoWeightUnit || invoice.tripDetails?.cargoWeightUnit || 'kg'}</td></tr>` : ''}
            ${tripDetails?.lrNo || invoice.tripDetails?.lrNo ? `<tr><td style="color: #475569; font-weight: 600;">LR No:</td><td>${tripDetails?.lrNo || invoice.tripDetails?.lrNo}</td></tr>` : ''}
            ${tripDetails?.ewayBillNo || invoice.tripDetails?.ewayBillNo ? `<tr><td style="color: #475569; font-weight: 600;">E-way Bill No:</td><td>${tripDetails?.ewayBillNo || invoice.tripDetails?.ewayBillNo}</td></tr>` : ''}
            ${tripDetails?.vehicleNumber || invoice.vehicleDetails?.vehicleNumber ? `<tr><td style="color: #475569; font-weight: 600;">Vehicle Number:</td><td>${tripDetails?.vehicleNumber || invoice.vehicleDetails?.vehicleNumber}</td></tr>` : ''}
          </table>
        </div>
        
        <!-- Financial Breakdown -->
        <div class="info-section">
          <h3>💰 Financial Breakdown</h3>
          <table class="info-table">
            <tr><td style="color: #475569; font-weight: 600;">Subtotal:</td><td>${formatCurrency(invoice.invoiceSubtotal || 0)}</td></tr>
            ${invoice.invoiceLoadingCharges ? `<tr><td style="color: #475569; font-weight: 600;">Loading Charges:</td><td>${formatCurrency(invoice.invoiceLoadingCharges)}</td></tr>` : ''}
            ${invoice.invoiceUnloadingCharges ? `<tr><td style="color: #475569; font-weight: 600;">Unloading Charges:</td><td>${formatCurrency(invoice.invoiceUnloadingCharges)}</td></tr>` : ''}
            ${invoice.invoiceOtherCharges ? `<tr><td style="color: #475569; font-weight: 600;">Other Charges:</td><td>${formatCurrency(invoice.invoiceOtherCharges)}</td></tr>` : ''}
            ${gstPercentage > 0 ? `<tr><td style="color: #475569; font-weight: 600;">GST (${gstPercentage}%):</td><td>${gstAmount}</td></tr>` : ''}
            <tr style="border-top: 2px solid #e2e8f0;">
              <td style="font-weight: bold; padding-top: 12px;">Grand Total:</td>
              <td style="font-weight: bold; padding-top: 12px; font-size: 18px; color: ${company?.brandColor || '#4F46E5'};">${totalAmount}</td>
            </tr>
          </table>
        </div>
        
        <div class="attachment-note">
          📎 <strong>PDF Attached:</strong> The complete invoice PDF is attached to this email for your records.
        </div>
        
        <hr/>
        
        <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
        
        <p>
          Best regards,<br/>
          <strong>${company?.businessName || 'Transport Company'}</strong><br/>
          ${company?.emailId || ''}<br/>
          ${company?.mobileNumber || ''}
        </p>
      </div>
      
      <div class="footer">
        <p>Thank you for your business!</p>
        <p>This is an automatically generated email. Please do not reply directly.</p>
        <p>&copy; ${new Date().getFullYear()} ${company?.businessName || 'Transport Company'}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send transport invoice email with PDF attachment and fallback to system email
 */
async function sendTransportInvoiceEmail({
  clientId,
  invoice,
  customerName,
  company,
  consignor,
  consignee,
  bankDetails,
  tripDetails,
  to: toOverride,
  subject: subjectOverride,
  customMessage,
}) {
  try {
    // Determine recipient
    const recipientEmail = toOverride || invoice.consigneeDetails?.email || invoice.consignorDetails?.email;
    if (!recipientEmail) {
      throw new Error("No email address found for recipient");
    }

    const companyName = company?.businessName || "Transport Company";
    const subject = subjectOverride || `Transport Invoice ${invoice.invoiceNumber} from ${companyName}`;
    
    // Generate PDF attachment
    console.log("📄 Generating PDF attachment...");
    const pdfBuffer = await generateInvoicePDF(invoice, company, consignor, consignee, bankDetails);
    
    if (!pdfBuffer) {
      console.warn("⚠️ PDF generation failed, sending email without attachment");
    }
    
    // Generate HTML content with actual data
    const html = renderTransportInvoiceHtml({
      invoice,
      customerName,
      company,
      tripDetails,
      customMessage,
    });

    console.log(`📧 Sending transport invoice email to: ${recipientEmail}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📎 PDF Attachment: ${pdfBuffer ? 'Yes' : 'No'}`);

    // Prepare attachments array
    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    // Try 1: Client Gmail
    try {
      console.log('🔧 Attempting client Gmail...');
      
      const integration = await EmailIntegration.findOne({ 
        client: clientId, 
        connected: true 
      }).lean();
      
      if (integration?.refreshToken) {
        await _internal.sendWithClientGmail({
          clientId: clientId,
          fromName: companyName,
          to: recipientEmail,
          subject: subject,
          html: html,
          attachments: attachments,
        });
        console.log('✅ Email sent via Client Gmail with PDF attachment');
        
        return {
          success: true,
          method: 'gmail',
          recipientEmail: recipientEmail,
          sentAt: new Date(),
          hasAttachment: !!pdfBuffer,
        };
      } else {
        console.log('⚠️ No client Gmail connected, falling back to system email');
        throw new Error('No client Gmail connected');
      }
      
    } catch (gmailError) {
      console.error('❌ Client Gmail failed:', gmailError.message);
      
      // Try 2: System Email (Fallback)
      console.log('🔧 Falling back to system email...');
      
      const transporter = createSystemTransporter();
      
      const mailOptions = {
        from: `"${companyName}" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: subject,
        html: html,
        attachments: attachments,
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent via System Email with PDF attachment');
      
      return {
        success: true,
        method: 'system',
        messageId: result.messageId,
        recipientEmail: recipientEmail,
        sentAt: new Date(),
        hasAttachment: !!pdfBuffer,
      };
    }
    
  } catch (error) {
    console.error('❌ Error sending transport invoice email:', error);
    throw new Error('Failed to send transport invoice email: ' + error.message);
  }
}

module.exports = { sendTransportInvoiceEmail };