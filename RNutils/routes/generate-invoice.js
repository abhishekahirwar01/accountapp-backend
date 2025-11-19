const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

// Import only the templates that exist in transaction form
const { generateTemplate1 } = require('../templates/pdf-template1');
const {  generatePdfForTemplate2} = require('../templates/pdf-template2');
const { generateTemplate3 } = require('../templates/pdf-template3');
const { generateTemplate4 } = require('../templates/pdf-template4');
const { generateTemplate5 } = require('../templates/pdf-template5');
const { generateTemplate6 } = require('../templates/pdf-template6');
const { generateTemplate7 } = require('../templates/pdf-template7');
const { generateTemplate8 } = require('../templates/pdf-template8');
const { generateTemplate11 } = require('../templates/pdf-template11');
const { generateTemplate12 } = require('../templates/pdf-template12');
const { generateTemplate16 } = require('../templates/pdf-template16');
const { generateTemplate17 } = require('../templates/pdf-template17');
const { generateTemplate18 } = require('../templates/pdf-template18');
const { generateTemplate19 } = require('../templates/pdf-template19');
const { generateTemplateA5 } = require('../templates/pdf-templateA5');
const { generateTemplateA5_2 } = require('../templates/pdf-templateA5_2');
const { generateTemplateA5_3 } = require('../templates/pdf-templateA5_3');
const { generateTemplateA5_4 } = require('../templates/pdf-templateA5_4');
const { generateTemplateT3 } = require('../templates/pdf-template-t3');

// Sirf ek route - POST /api/generate-invoice
router.post('/generate-invoice', async (req, res) => {
  try {
    const { 
      template, 
      transaction, 
      company, 
      party, 
      shippingAddress, 
      bank,
      serviceNameById 
    } = req.body;

    console.log('📄 PDF Generation Request for template:', template);

    // Basic validation
    if (!template || !transaction) {
      return res.status(400).json({ 
        error: 'Template and transaction data required' 
      });
    }

    // PDF document create karo
    const pdfDoc = new PDFDocument({ 
      margin: 25,
      size: template.includes('A5') ? 'A5' : 'A4'
    });
    
    // PDF data collect karo
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    
    const pdfPromise = new Promise((resolve, reject) => {
      pdfDoc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
      pdfDoc.on('error', reject);
    });

    // Route to appropriate template with CORRECT parameters
    switch (template) {
      case 'template1':
        generateTemplate1(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'template2':
        generatePdfForTemplate2(pdfDoc, transaction, company, party, serviceNameById, shippingAddress);
        break;
      case 'template3':
        generateTemplate3(pdfDoc, transaction, company, party, serviceNameById);
        break;
      case 'template4':
        generateTemplate4(pdfDoc, transaction, company, party, serviceNameById);
        break;
      case 'template5':
        generateTemplate5(pdfDoc, transaction, company, party, serviceNameById);
        break;
      case 'template6':
        generateTemplate6(pdfDoc, transaction, company, party, serviceNameById);
        break;
      case 'template7':
        generateTemplate7(pdfDoc, transaction, company, party, serviceNameById);
        break;
      case 'template8':
        generateTemplate8(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'template11':
        generateTemplate11(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, undefined, bank);
        break;
      case 'template12':
        generateTemplate12(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'template16':
        generateTemplate16(pdfDoc, transaction, company, party, serviceNameById, shippingAddress);
        break;
      case 'template17':
        generateTemplate17(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'template18':
        generateTemplate18(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'template19':
        generateTemplate19(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
        break;
      case 'templateA5':
        generateTemplateA5(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank, null);
        break;
      case 'templateA5_2':
        generateTemplateA5_2(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank, null);
        break;
      case 'templateA5_3':
        generateTemplateA5_3(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank, null);
        break;
      case 'templateA5_4':
        generateTemplateA5_4(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank, null);
        break;
      case 'template-t3':
        generateTemplateT3(pdfDoc, transaction, company, party, shippingAddress, bank);
        break;
      default:
        // Default to template1
        generateTemplate1(pdfDoc, transaction, company, party, serviceNameById, shippingAddress, bank);
    }

    pdfDoc.end();

    // PDF buffer wait karo
    const pdfBuffer = await pdfPromise;

    // Response bhejo
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 
      `attachment; filename="invoice-${transaction.invoiceNumber || transaction._id || 'invoice'}.pdf"`
    );
    
    console.log('✅ PDF generated successfully');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message
    });
  }
});

module.exports = router;