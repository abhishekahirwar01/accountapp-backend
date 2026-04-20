// controllers/integrations/gmailController.js
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const EmailIntegration = require("../../models/EmailIntegration");
const Company = require("../../models/Company");
const User = require("../../models/User");
const MailComposer = require("nodemailer/lib/mail-composer");

// helper: build OAuth client
function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

exports.getStatus = async (req, res) => {
  try {
    // Determine the client ID the same way as in sendInvoicePDF
    let clientId = null;
    
    if (req.user) {
      const user = await User.findById(req.user.id).select("createdByClient role").lean();
      
      if (user?.role === 'client') {
        clientId = req.user.id;
      } else if (user?.createdByClient) {
        clientId = user.createdByClient;
      }
    }
    
    if (!clientId && req.user?.createdByClient) {
      clientId = req.user.createdByClient;
    }
    
    if (!clientId) {
      clientId = req.user?.id;
    }

    if (!clientId) {
      return res.status(400).json({ 
        connected: false, 
        message: "Unable to determine client ID" 
      });
    }

    let doc = await EmailIntegration.findOne({ client: clientId }).lean();

    if (!doc) {
      const created = await EmailIntegration.create({ client: clientId });
      doc = created.toObject();
    }

    // Proactive health check
    if (doc.connected && doc.refreshToken) {
      const oauth2 = buildOAuthClient();
      oauth2.setCredentials({ refresh_token: doc.refreshToken });
      try {
        const tokenResp = await oauth2.getAccessToken();
        if (!tokenResp || !tokenResp.token) {
          throw new Error("invalid_grant");
        }
      } catch (err) {
        const reason = /invalid_grant|expired|revoked/i.test(err?.message || "")
          ? "token_expired"
          : "unknown";

        await EmailIntegration.updateOne(
          { client: clientId },
          { $set: { connected: false, reason, lastFailureAt: new Date() } },
        );

        doc.connected = false;
        doc.reason = reason;
        doc.lastFailureAt = new Date();
      }
    }

    return res.json({
      connected: !!doc.connected,
      email: doc.email || null,
      termsAcceptedAt: doc.termsAcceptedAt || null,
      reason: doc.reason || null,
      lastFailureAt: doc.lastFailureAt || null,
    });
  } catch (e) {
    console.error("Get status error:", e);
    res.status(500).json({ message: e.message });
  }
};

// POST /api/integrations/gmail/accept-terms
exports.acceptTerms = async (req, res) => {
  try {
    const clientId = req.user.createdByClient || req.user.id;
    await EmailIntegration.findOneAndUpdate(
      { client: clientId },
      { $set: { termsAcceptedAt: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.connectStart = async (req, res) => {
  try {
    const clientId = req.user.createdByClient || req.user.id;
    const { redirect = "/" } = req.query;

    // In dev you can still support mock via env
    if (!process.env.GOOGLE_CLIENT_ID || process.env.MOCK_GMAIL === "1") {
      await EmailIntegration.findOneAndUpdate(
        { client: clientId },
        { $set: { connected: true, email: "connected@example.com" } },
        { upsert: true },
      );
      return res.redirect(redirect);
    }

    const oauth2 = buildOAuthClient();

    // encode state to recover client + post-connect redirect
    const state = jwt.sign({ clientId, redirect }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    const scopes = [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
    ];

    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline", // get refresh_token
      include_granted_scopes: true,
      prompt: "consent select_account", // force chooser + ensure refresh_token on re-consent
      scope: scopes,
      state, // pass through to callback
    });

    return res.redirect(authUrl);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * GET /api/integrations/gmail/callback
 * Handles Google's redirect; exchanges code for tokens; stores email + tokens.
 */
exports.connectCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code/state");

    // restore state
    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.status(400).send("Invalid state");
    }
    const { clientId, redirect = "/" } = decoded;

    const oauth2 = buildOAuthClient();
    const { tokens } = await oauth2.getToken(code); // {access_token, refresh_token, scope, expiry_date, id_token, token_type}
    oauth2.setCredentials(tokens);

    // Extract email from ID token (we requested 'openid email')
    let email = null;
    if (tokens.id_token) {
      const ticket = await oauth2.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload?.email || null;
    }

    if (!email) {
      // Fallback: use Gmail profile (needs gmail.send; we already have it)
      const gmail = google.gmail({ version: "v1", auth: oauth2 });
      const me = await gmail.users.getProfile({ userId: "me" });
      email = me.data.emailAddress || null;
    }

    if (!email)
      return res.status(400).send("Could not determine Gmail address");

    // We want to persist only refreshToken + email
    const existing = await EmailIntegration.findOne({
      client: clientId,
    }).lean();

    const update = {
      provider: "gmail",
      connected: true,
      email,
    };

    // Only set refreshToken if Google sent a new one **OR** we don't have one yet
    if (tokens.refresh_token) {
      update.refreshToken = tokens.refresh_token;
    } else if (!existing?.refreshToken) {
      // Sometimes Google doesn't send refresh_token on re-consent.
      // If we don't already have one, ask user to fully re-connect:
      // (tell them to remove app access in Google Account -> Security -> Third-party access)
      return res
        .status(400)
        .send(
          "No refresh token received. Please remove app access from your Google Account and reconnect.",
        );
    }

    // Persist
    await EmailIntegration.findOneAndUpdate(
      { client: clientId },
      {
        $set: {
          provider: "gmail",
          connected: true,
          email,
          refreshToken: tokens.refresh_token || existing?.refreshToken || null,
          // clear diagnostics
          reason: null,
          lastFailureAt: null,
        },
      },
      { upsert: true },
    );

    // Back to app
    const url = new URL(redirect, "http://dummy");
    const search = url.search ? url.search + "&" : "?";
    return res.redirect(
      redirect + search + "gmail=connected&email=" + encodeURIComponent(email),
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth callback error: " + e.message);
  }
};

/**
 * Utility: send email via the client's Gmail using refresh_token.
 * Use this from your Sales/Purchase flows.
 */
/**
 * Utility: send email via the client's Gmail using refresh_token only.
 */
async function assertSenderHasGmail(clientId) {
  const integ = await EmailIntegration.findOne({
    client: clientId,
    provider: "gmail",
    connected: true,
  })
    .select("+refreshToken email")
    .lean();

  if (!integ || !integ.refreshToken || !integ.email) {
    const err = new Error(
      "Gmail is not connected for the company sender. Please connect Gmail in settings.",
    );
    err.statusCode = 400;
    throw err;
  }
  return { senderEmail: integ.email, refreshToken: integ.refreshToken };
}

async function sendWithClientGmail({
  clientId,
  refreshToken,
  senderEmail,
  fromName,
  to,
  cc,        // Add cc as a parameter
  bcc,       // Add bcc as a parameter
  subject,
  html,
  attachments = [],
}) {
  // Input validation
  if (!to || !subject || !html) {
    throw new Error("Missing required email fields: to, subject, or html");
  }

  let rt = refreshToken;
  let email = senderEmail;

  // Fetch from DB if not provided
  if (!rt || !email) {
    const integ = await EmailIntegration.findOne({
      client: clientId,
      provider: "gmail",
      connected: true,
    })
      .select("+refreshToken email")
      .lean();

    if (!integ) {
      throw new Error("No Gmail integration found for this client");
    }
    
    if (!integ.refreshToken) {
      throw new Error("Gmail refresh token missing. Please reconnect.");
    }
    
    if (!integ.email) {
      throw new Error("Gmail email address missing. Please reconnect.");
    }
    
    rt = rt || integ.refreshToken;
    email = email || integ.email;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  
  oauth2.setCredentials({ refresh_token: rt });

  // Verify token is valid before sending
  try {
    await oauth2.getAccessToken();
  } catch (err) {
    await EmailIntegration.updateOne(
      { client: clientId },
      {
        $set: {
          connected: false,
          reason: "token_expired",
          lastFailureAt: new Date(),
        },
      }
    );
    throw new Error("Gmail token expired. Please reconnect.");
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const fromHeader = fromName ? `${fromName} <${email}>` : email;

  // Create mail options - removed req.body references
  const mailOptions = {
    from: fromHeader,
    to: to,
    subject: subject,
    html: html,
    attachments: attachments,
    headers: {
      'X-Mailer': 'YourApp/1.0',
    },
  };

  // Only add cc and bcc if they are provided
  if (cc) mailOptions.cc = cc;
  if (bcc) mailOptions.bcc = bcc;

  const mail = new MailComposer(mailOptions).compile();

  const raw = (await mail.build())
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const response = await gmail.users.messages.send({ 
      userId: "me", 
      requestBody: { raw } 
    });
    
    return response.data;
  } catch (err) {
    console.error("Gmail send error:", err);
    
    const isAuthErr =
      err?.code === 401 ||
      err?.response?.status === 401 ||
      /invalid_grant|unauthorized|not authorized|permission|expired|revoked/i.test(
        err?.message || err?.response?.data?.error || ""
      );
    
    if (isAuthErr) {
      await EmailIntegration.updateOne(
        { client: clientId },
        {
          $set: {
            connected: false,
            refreshToken: null,
            reason: "revoked",
            lastFailureAt: new Date(),
          },
        }
      );
      throw new Error("Gmail access was revoked/expired. Please reconnect Gmail.");
    }
    
    throw new Error(`Failed to send email: ${err.message}`);
  }
}

// POST /api/integrations/gmail/send-invoice

// controllers/integrations/gmailController.js (fixed version)

exports.sendInvoicePDF = async (req, res) => {
  try {
    const {
      to,
      subject,
      message,
      html,
      fileName,
      pdfBase64,
      companyId,
    } = req.body || {};

    // Validate required fields
    if (!to || !pdfBase64) {
      return res.status(400).json({ 
        message: "Missing required fields: 'to' and 'pdfBase64' are required." 
      });
    }

    if (!to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ 
        message: "Invalid email format for 'to' field." 
      });
    }

    // Determine the client ID for sending email
    let senderClientId = null;
    let companyDoc = null;

    // STRATEGY 1: If companyId is provided, get the client from company
    if (companyId) {
      companyDoc = await Company.findById(companyId)
        .select("businessName owner client") // Also check for direct client field
        .lean();
      
      if (!companyDoc) {
        return res.status(404).json({ message: "Company not found." });
      }
      
      // Try to get client ID from various possible fields
      senderClientId = companyDoc.client || companyDoc.owner;
      
      if (senderClientId) {
        console.log(`Found sender client ID from company: ${senderClientId}`);
      }
    }

    // STRATEGY 2: If no client ID yet, try from the authenticated user
    if (!senderClientId && req.user) {
      const actor = await User.findById(req.user.id)
        .select("createdByClient role")
        .lean();
      
      if (actor) {
        // If user is a client directly, use their ID
        if (actor.role === 'client') {
          senderClientId = req.user.id;
          console.log(`Using direct client ID from user: ${senderClientId}`);
        }
        // If user has createdByClient (user belongs to a client)
        else if (actor.createdByClient) {
          senderClientId = actor.createdByClient;
          console.log(`Using createdByClient from user: ${senderClientId}`);
        }
      }
    }

    // STRATEGY 3: Last resort - check if req.user.id itself is a client ID
    if (!senderClientId && req.user?.id) {
      const possibleClient = await User.findById(req.user.id)
        .select("role")
        .lean();
      
      if (possibleClient?.role === 'client') {
        senderClientId = req.user.id;
        console.log(`Using user ID as client ID (fallback): ${senderClientId}`);
      }
    }

    // If still no client ID, try to find any client with Gmail connected
    if (!senderClientId) {
      // Try to find the first client with Gmail integration
      const anyIntegration = await EmailIntegration.findOne({ 
        provider: "gmail", 
        connected: true 
      }).select("client").lean();
      
      if (anyIntegration) {
        senderClientId = anyIntegration.client;
        console.log(`Using first available Gmail client: ${senderClientId}`);
      }
    }

    if (!senderClientId) {
      return res.status(400).json({
        message: "No email sender configured. Please ensure the company has an owner/client linked or your account has Gmail connected.",
        debug: {
          hasCompanyId: !!companyId,
          hasUser: !!req.user,
          userId: req.user?.id,
        }
      });
    }

    // Now verify Gmail connection for the found client ID
    const integ = await EmailIntegration.findOne({
      client: senderClientId,
      provider: "gmail",
      connected: true,
    })
    .select("+refreshToken email")
    .lean();

    if (!integ) {
      return res.status(400).json({
        message: `Gmail is not connected for client ${senderClientId}. Please connect Gmail in settings first.`,
        needsReconnect: true,
        debug: { senderClientId }
      });
    }

    if (!integ.refreshToken) {
      return res.status(400).json({
        message: "Gmail refresh token missing. Please reconnect Gmail.",
        needsReconnect: true,
      });
    }

    if (!integ.email) {
      return res.status(400).json({
        message: "Gmail email address missing. Please reconnect Gmail.",
        needsReconnect: true,
      });
    }

    // Validate token is still valid
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    
    oauth2.setCredentials({ refresh_token: integ.refreshToken });
    
    try {
      await oauth2.getAccessToken();
      console.log(`Token validated successfully for ${integ.email}`);
    } catch (tokenErr) {
      console.error("Token validation error:", tokenErr.message);
      
      await EmailIntegration.updateOne(
        { client: senderClientId },
        { 
          $set: { 
            connected: false, 
            reason: "token_expired",
            lastFailureAt: new Date() 
          }
        }
      );
      
      return res.status(400).json({
        message: "Gmail connection has expired. Please reconnect Gmail.",
        needsReconnect: true,
      });
    }

    // Prepare email content
    const htmlBody = html && html.trim() 
      ? html 
      : `<div style="font-family: system-ui, -apple-system, sans-serif;">
          <p>${(message || "").replace(/\n/g, '<br>')}</p>
         </div>`;

    const emailSubject = subject || "Invoice";
    const filename = fileName || `invoice_${Date.now()}.pdf`;
    const fromName = companyDoc?.businessName || "Business";

    console.log(`Sending invoice email from ${integ.email} to ${to}`);

    // Send the email
    await sendWithClientGmail({
      clientId: senderClientId,
      refreshToken: integ.refreshToken,
      senderEmail: integ.email,
      fromName: fromName,
      to: to,
      subject: emailSubject,
      html: htmlBody,
      attachments: [
        {
          filename: filename,
          content: Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ],
    });

    console.log(`Invoice email sent successfully to ${to} from ${integ.email}`);

    return res.json({ 
      ok: true, 
      sentFrom: integ.email,
      to: to,
      subject: emailSubject,
      clientId: senderClientId,
    });
    
  } catch (e) {
    console.error("Send invoice error:", e);
    
    // Handle specific error types
    if (e.message?.includes("revoked") || e.message?.includes("expired")) {
      return res.status(400).json({
        message: "Gmail access was revoked. Please reconnect Gmail.",
        needsReconnect: true,
      });
    }
    
    if (e.message?.includes("Invalid grant")) {
      return res.status(400).json({
        message: "Gmail authentication expired. Please reconnect Gmail.",
        needsReconnect: true,
      });
    }
    
    return res.status(500).json({ 
      message: e.message || "Failed to send invoice email." 
    });
  }
};

// Example endpoint: POST /api/integrations/gmail/send-test { to }
exports.sendTest = async (req, res) => {
  try {
    const clientId = req.user.createdByClient || req.user.id;
    const { to } = req.body;
    await sendWithClientGmail({
      clientId,
      fromName: "Your Company",
      to,
      subject: "Test email from your connected Gmail",
      html: "<p>Success! Your integration works.</p>",
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /api/integrations/gmail/disconnect
exports.disconnect = async (req, res) => {
  try {
    const clientId = req.user.createdByClient || req.user.id;
    const integ = await EmailIntegration.findOne({ client: clientId });
    if (!integ) return res.json({ ok: true });

    // Optional: revoke on Google side (if you want)
    // await fetch('https://oauth2.googleapis.com/revoke?token=' + integ.refreshToken, { method: 'POST', headers: {'Content-type': 'application/x-www-form-urlencoded'} });

    await EmailIntegration.updateOne(
      { client: clientId },
      { $set: { connected: false, refreshToken: null } },
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Export for reuse in your invoice flows
exports._internal = { sendWithClientGmail };
