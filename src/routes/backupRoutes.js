const express = require('express');
const { createBackup, restoreBackup } = require('../controllers/backupController');

const router = express.Router();
router.get('/', createBackup);
router.post('/restore', restoreBackup);

module.exports = router;
