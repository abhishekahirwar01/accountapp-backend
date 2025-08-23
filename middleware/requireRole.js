// middleware/requireRole.js
const jwt = require("jsonwebtoken");

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    try {
      const auth = req.headers.authorization || "";
      const [scheme, token] = auth.split(" ");
      if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ message: "Authorization token missing or malformed" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      }

      req.user = decoded;
      next();
    } catch (err) {
      const code =
        err.name === "TokenExpiredError" ? 401 :
        err.name === "JsonWebTokenError" ? 401 : 500;
      return res.status(code).json({ message: err.message || "Unauthorized" });
    }
  };
}

module.exports = requireRole;
