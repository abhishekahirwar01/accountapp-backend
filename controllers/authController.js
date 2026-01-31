const Client = require("../models/Client");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const AccountValidity = require("../models/AccountValidity");
const nodemailer = require("nodemailer");

// OTP policy
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN ?? 5);
const OTP_RESEND_SECONDS = Number(process.env.OTP_RESEND_SECONDS ?? 45);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

// 6-digit numeric OTP generator
function generateOtp(digits = 6) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(Math.floor(Math.random() * (max - min)) + min);
}

const DEV_HARDCODE_OTP = process.env.DEV_HARDCODE_OTP === "true";

// Helper for Nodemailer (Enhanced for Production Troubleshooting)
const createTransporter = () => {
  console.log("[SMTP-DEBUG] Attempting to create transporter with user:", process.env.EMAIL_USER);
  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465, // Use 465 for SSL or 587 for STARTTLS
    secure: true, 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // Normal password used here as requested
    },
    // TLS settings to bypass some common cloud provider blocks
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2"
    }
  });
};

// POST /api/auth/verify-otp
exports.verifyOtp = async (req, res) => {
  try {
    const { identifier, otp, type } = req.body;
    console.log(`[verifyOtp] received identifier=${identifier} type=${type}`);

    if (!identifier || !otp) return res.status(400).json({ message: "Missing identifier or otp" });
    const normalized = String(identifier).trim();

    // 1. Try Client
    if (!type || type === "client") {
      const client = await Client.findOne({ $or: [{ clientUsername: normalized }, { email: normalized }] });
      if (client) {
        const validity = await AccountValidity.findOne({ client: client._id });
        if (!validity || validity.status === "disabled" || new Date() >= new Date(validity.expiresAt)) {
          return res.status(403).json({ message: "Account expired or disabled" });
        }
        if (!client.otpHash || client.otpExpiresAt < Date.now()) return res.status(400).json({ message: "OTP expired" });

        const ok = await bcrypt.compare(String(otp), client.otpHash);
        if (!ok) {
          client.otpAttempts = (client.otpAttempts || 0) + 1;
          await client.save();
          return res.status(401).json({ message: "Invalid OTP" });
        }

        client.otpHash = null; client.otpAttempts = 0; await client.save();
        const token = jwt.sign({ id: client._id, role: "client", slug: client.slug }, process.env.JWT_SECRET, { expiresIn: "1d" });
        return res.json({ message: "Login successful", token, user: client, accountType: "client" });
      }
    }

    // 2. Try User
    const user = await User.findOne({ $or: [{ userId: normalized }, { email: normalized }, { contactNumber: normalized }] }).populate("role");
    if (user) {
      if (!user.otpHash || user.otpExpiresAt < Date.now()) return res.status(400).json({ message: "OTP expired" });
      const ok = await bcrypt.compare(String(otp), user.otpHash);
      if (!ok) {
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        await user.save();
        return res.status(401).json({ message: "Invalid OTP" });
      }

      user.otpHash = null; user.otpAttempts = 0; await user.save();
      const perms = Array.from(new Set([...(user.role?.permissions || []), ...(user.permissions || [])]));
      const token = jwt.sign({ id: user._id, role: user.role?.name || "user", perms }, process.env.JWT_SECRET, { expiresIn: "8h" });
      return res.json({ message: "Login successful", token, user, accountType: "user" });
    }

    return res.status(404).json({ message: "Account not found" });
  } catch (err) {
    console.error("verifyOtp error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/auth/request-user-otp
exports.requestUserOtp = async (req, res) => {
  try {
    const { identifier } = req.body;
    console.log(`[requestUserOtp] Start for: ${identifier}`);
    
    if (!identifier) return res.status(400).json({ message: "Missing identifier" });
    const normalized = String(identifier).trim().toLowerCase();

    // Find Account
    const client = await Client.findOne({ $or: [{ clientUsername: normalized }, { email: normalized }] });
    const user = !client ? await User.findOne({ $or: [{ email: normalized }, { userId: normalized }, { contactNumber: normalized }] }) : null;
    
    const target = client || user;
    if (!target) {
      console.log(`[requestUserOtp] Account NOT FOUND in DB for: ${normalized}`);
      return res.status(404).json({ message: "Account not found" });
    }

    // Check Throttling
    if (target.otpLastSentAt && Date.now() - target.otpLastSentAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      return res.status(429).json({ message: "Please wait before resending" });
    }

    const otp = generateOtp();
    
    // DEV MODE Check
    if (DEV_HARDCODE_OTP) {
        console.log(`[DEBUG-DEV] Bypassing SMTP. OTP for ${normalized}: ${otp}`);
        target.otpHash = await bcrypt.hash(otp, 10);
        target.otpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
        target.otpLastSentAt = new Date();
        await target.save();
        return res.json({ message: "OTP sent (Dev Mode)", otp, dev: true });
    }

    // SMTP Logic
    const transporter = createTransporter();
    console.log(`[SMTP-DEBUG] Attempting to send email to: ${target.email}`);

    try {
      const info = await transporter.sendMail({
        from: `"Vinimay Support" <${process.env.EMAIL_USER}>`,
        to: target.email,
        subject: "Your Vinimay Login OTP",
        html: `<p>Your OTP for login is <b>${otp}</b>. It expires in ${OTP_TTL_MIN} minutes.</p>`,
      });

      console.log(`[SMTP-SUCCESS] Message sent: ${info.messageId}`);

      // Save to DB only if mail succeeds
      target.otpHash = await bcrypt.hash(otp, 10);
      target.otpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
      target.otpLastSentAt = new Date();
      await target.save();

      return res.json({ message: "OTP sent successfully", email: target.email });

    } catch (mailError) {
      // YEH LOG SABSE IMPORTANT HAI PRODUCTION KE LIYE
      console.error("❌ [SMTP-FATAL-ERROR] Failed to send email:");
      console.error("Error Code:", mailError.code);
      console.error("Error Message:", mailError.message);
      if (mailError.response) console.error("SMTP Response:", mailError.response);

      return res.status(500).json({ 
        message: "Email sending failed. Internal SMTP Error.", 
        details: mailError.message 
      });
    }

  } catch (err) {
    console.error("requestUserOtp System Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
