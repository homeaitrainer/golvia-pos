const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { exportAllToCsv } = require('../services/exportService');

function exportRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/all', (req, res) => {
    res.json(exportAllToCsv(db));
  });

  return router;
}

module.exports = { exportRouter };
