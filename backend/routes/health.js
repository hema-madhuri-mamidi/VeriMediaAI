const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'VeriMedia AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    gemini: !!process.env.GEMINI_API_KEY ? 'configured' : 'not configured (set GEMINI_API_KEY)',
  });
});

module.exports = router;
