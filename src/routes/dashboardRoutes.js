const express = require('express');
const { dashboard, exportCsv } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/dashboard', dashboard);
router.get('/export', exportCsv);

module.exports = router;
