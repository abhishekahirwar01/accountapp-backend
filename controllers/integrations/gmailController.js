// controllers/integrations/gmailController.js
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const EmailIntegration = require("../../models/EmailIntegration");
const MailComposer = require("nodemailer/lib/mail-composer");

// helper: build OAuth client
function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /api/integrations/gmail/status
exports.getStatus = async (req, res) => {
  try {
    const clientId = req.user.id;
    let doc = await EmailIntegration.findOne({ client: clientId });
    if (!doc) doc = await EmailIntegration.create({ client: clientId });
    res.json({
      connected: !!doc.connected,
      email: doc.email || null,
      termsAcceptedAt: doc.termsAcceptedAt || null,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// POST /api/integrations/gmail/accept-terms
exports.acceptTerms = async (req, res) => {
  try {
    const clientId = req.user.id;
    await EmailIntegration.findOneAndUpdate(
      { client: clientId },
      { $set: { termsAcceptedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * GET /api/integrations/gmail/connect?redirect=<url>
 * Kicks off OAuth by redirecting to Google's consent + account chooser.
 * Authentication: token allowed in query (?token=) since it opens in a new tab.
 */
exports.connectStart = async (req, res) => {
  try {
    const clientId = req.user.id;
    const { redirect = "/" } = req.query;

    // In dev you can still support mock via env
    if (!process.env.GOOGLE_CLIENT_ID || process.env.MOCK_GMAIL === "1") {
      await EmailIntegration.findOneAndUpdate(
        { client: clientId },
        { $set: { connected: true, email: "connected@example.com" } },
        { upsert: true }
      );
      return res.redirect(redirect);
    }

    const oauth2 = buildOAuthClient();

    // encode state to recover client + post-connect redirect
    const state = jwt.sign(
      { clientId, redirect },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const scopes = [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
    ];

    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",                 // get refresh_token
      include_granted_scopes: true,
      prompt: "consent select_account",       // force chooser + ensure refresh_token on re-consent
      scope: scopes,
      state,                                  // pass through to callback
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

    if (!email) return res.status(400).send("Could not determine Gmail address");

    // Persist
    await EmailIntegration.findOneAndUpdate(
      { client: clientId },
      {
        $set: {
          provider: "gmail",
          connected: true,
          email,
          accessToken: tokens.access_token || null,
          refreshToken: tokens.refresh_token || null, // may be null on reconsent; prompt=consent usually ensures it
          tokenType: tokens.token_type || null,
          scope: tokens.scope || null,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      },
      { upsert: true }
    );

    // Back to app
    const url = new URL(redirect, "http://dummy");
    const search = url.search ? url.search + "&" : "?";
    return res.redirect(redirect + search + "gmail=connected&email=" + encodeURIComponent(email));
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth callback error: " + e.message);
  }
};

/**
 * Utility: send email via the client's Gmail using refresh_token.
 * Use this from your Sales/Purchase flows.
 */
async function sendWithClientGmail({ clientId, fromName, to, subject, html, attachments = [] }) {
  const integ = await EmailIntegration.findOne({ client: clientId, connected: true });
  if (!integ || !integ.refreshToken) {
    throw new Error("Client has not connected Gmail or refresh token missing");
  }

  const oauth2 = buildOAuthClient();
  oauth2.setCredentials({
    refresh_token: integ.refreshToken,
    access_token: integ.accessToken || undefined,
    expiry_date: integ.expiryDate ? integ.expiryDate.getTime() : undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // build MIME using nodemailer MailComposer
  const mail = new MailComposer({
    from: fromName ? `${fromName} <${integ.email}>` : integ.email,
    to,
    subject,
    html,
    attachments, // [{ filename, content (Buffer|String|Stream), contentType }]
  }).compile();

  const raw = (await mail.build())
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

// Example endpoint: POST /api/integrations/gmail/send-test { to }
exports.sendTest = async (req, res) => {
  try {
    const clientId = req.user.id;
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
    const clientId = req.user.id;
    const integ = await EmailIntegration.findOne({ client: clientId });
    if (!integ) return res.json({ ok: true });

    // Optional: revoke on Google side (if you want)
    // await fetch('https://oauth2.googleapis.com/revoke?token=' + integ.refreshToken, { method: 'POST', headers: {'Content-type': 'application/x-www-form-urlencoded'} });

    await EmailIntegration.updateOne(
      { client: clientId },
      { $set: { connected: false, accessToken: null, refreshToken: null, scope: null, tokenType: null, expiryDate: null } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Export for reuse in your invoice flows
exports._internal = { sendWithClientGmail };
