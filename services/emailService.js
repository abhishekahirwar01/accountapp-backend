// services/emailService.js
const nodemailer = require('nodemailer');
const { _internal } = require("../controllers/integrations/gmailController");
const Client = require("../models/Client");

// Create a system-level transporter for reports
function createSystemTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Your system email
      pass: process.env.EMAIL_PASSWORD // Your system email password
    }
  });
}

async function sendReportEmail(to, subject, htmlContent) {
  try {
    // Try using system email first (fallback method)
    const transporter = createSystemTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Report email sent to ${to}: ${result.messageId}`);
    return result;
    
  } catch (error) {
    console.error('System email sending failed:', error);
    
    // Fallback: Try to find a client with Gmail connected
    try {
      // Find any client that has Gmail connected
      const clientWithGmail = await Client.findOne({
        'emailIntegrations.connected': true
      });
      
      if (clientWithGmail) {
        const result = await _internal.sendWithClientGmail({
          clientId: clientWithGmail._id,
          fromName: 'Sales Report System',
          to,
          subject,
          html: htmlContent
        });
        console.log(`Report email sent via client Gmail to ${to}: ${result.messageId}`);
        return result;
      }
      
      throw new Error('No clients have Gmail connected');
      
    } catch (fallbackError) {
      console.error('All email methods failed:', fallbackError);
      throw new Error('Email sending failed: ' + fallbackError.message);
    }
  }
}

module.exports = {
  createSystemTransporter,
  sendReportEmail
};