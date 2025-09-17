// controllers/whatsappController.js
const axios = require('axios');

const accessToken = process.env.WHATSAPP_ACCESS_TOKEN; // Replace with your actual access token
const phoneNumberId = "821011864424701"; // Replace with your WhatsApp Business phone number ID

// Send WhatsApp message
const sendMessage = async (req, res) => {
  const { phoneNumber, templateName, languageCode } = req.body;

  try {
    // Make the POST request to the WhatsApp Business API
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber, // Recipient's phone number in international format
        type: "template",
        template: {
          name: templateName, // The name of your template (e.g., "hello_world")
          language: {
            code: languageCode || "en_US", // Language code for the message (default to "en_US")
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`, // Add the Authorization header with the access token
        },
      }
    );

    // If the message is sent successfully
    res.status(200).send({ message: "Message sent successfully!", data: response.data });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).send({
      message: "Failed to send message",
      error: error.response ? error.response.data : error.message,
    });
  }
};

module.exports = { sendMessage };
