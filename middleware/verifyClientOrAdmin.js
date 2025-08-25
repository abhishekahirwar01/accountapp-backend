const jwt = require("jsonwebtoken");

// const verifyClientOrAdmin = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];

//   if (!token) return res.status(401).json({ message: "No token provided" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     if (decoded.role !== "client" && decoded.role !== "master" && decoded.role !== "user" && decoded.role !== "manager" && decoded.role !== "admin") {
//       return res.status(403).json({ message: "Access denied" });
//     }

//     req.user = decoded;
//     next();
//   } catch (err) {
//     return res.status(400).json({ message: "Invalid token" });
//   }
// };


const verifyClientOrAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // allow these roles (adjust as you like)
    const role = (decoded.role || "").toLowerCase();
    const allowed = ["master", "client", "admin", "manager", "user"];
    if (!allowed.includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // keep existing
    req.user = decoded;

    // 🔑 normalize IDs for everyone
    const userId =
      decoded.id || decoded._id || decoded.sub; // who is acting
    const clientId =
      decoded.clientId || decoded.createdByClient || userId; // tenant id (for master/client it's themselves; for users it should be createdByClient)

    req.auth = { userId, clientId, role };
    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid token" });
  }
};

module.exports = verifyClientOrAdmin;
