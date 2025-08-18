const express = require("express");
const jwt = require("jsonwebtoken");
const { getStatus, acceptTerms, connectStart } = require("../controllers/integrations/gmailController");
const verifyClientOrAdmin = require("../middleware/verifyClientOrAdmin");
const router = express.Router();

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required", solution: "Include valid JWT token in Authorization header" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// allow token in query ONLY for this GET
function requireAuthAllowQuery(req, res, next) {
  let token = null;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token && req.query && req.query.token) token = req.query.token;  // 👈 allow query

  if (!token) return res.status(401).json({ error: "Authentication required", solution: "Include token via ?token= or Authorization header" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// …
router.get("/gmail/status", requireAuth, getStatus);
router.post("/gmail/accept-terms", requireAuth, acceptTerms);
router.get("/gmail/connect", requireAuthAllowQuery, connectStart);  // 👈 use the relaxed auth



module.exports = router;