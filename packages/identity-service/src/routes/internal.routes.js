const express = require('express');
const { internalAuth } = require('@froncort/shared');
const connectionService = require('../services/connection.service');

const router = express.Router();

router.get('/connections/status', internalAuth, async (req, res, next) => {
  try {
    const { orgA, orgB } = req.query;
    if (!orgA || !orgB) {
      return res.status(400).json({
        error: { message: 'orgA and orgB query params are required', code: 'VALIDATION_ERROR' },
      });
    }
    const result = await connectionService.checkStatusBetween(String(orgA), String(orgB));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
