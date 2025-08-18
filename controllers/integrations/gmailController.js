const EmailIntegration = require("../../models/EmailIntegration");

// GET /api/integrations/gmail/status
exports.getStatus = async (req, res) => {
  try {
    const clientId = req.user.id; // your token uses { id, role, slug }
    let doc = await EmailIntegration.findOne({ client: clientId });
    if (!doc) {
      // create a blank record so UI always has a doc
      doc = await EmailIntegration.create({ client: clientId });
    }
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
 * GET /api/integrations/gmail/connect?redirect=<url>&mockEmail=<optional>
 *
 * DEV-FRIENDLY MOCK:
 * - If GOOGLE_CLIENT_ID is missing, we "mock connect" and mark as connected,
 *   using ?mockEmail=... (or a default).
 * - Later you can replace this with real Google OAuth and update tokens.
 */
exports.connectStart = async (req, res) => {
  try {
    const clientId = req.user.id;
    const { redirect = "/", mockEmail } = req.query;

    // If no OAuth env is configured, simulate success for dev
    if (!process.env.GOOGLE_CLIENT_ID || process.env.MOCK_GMAIL === "1") {
      const email = mockEmail || "connected@example.com";
      await EmailIntegration.findOneAndUpdate(
        { client: clientId },
        { $set: { connected: true, email } },
        { upsert: true }
      );
      return res.redirect(redirect);
    }

    // TODO: Real OAuth: build Google auth URL and res.redirect(authUrl)
    return res.status(501).json({
      message:
        "OAuth not implemented. Set MOCK_GMAIL=1 or implement Google OAuth here.",
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
