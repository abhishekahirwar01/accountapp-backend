// routes/testRoutes.js
const router = require('express').Router();

router.get('/test', (req, res) => {
  res.json({ working: true, from: "route file" });
});

module.exports = router;