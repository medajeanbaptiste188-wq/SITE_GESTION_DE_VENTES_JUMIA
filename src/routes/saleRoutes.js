const express = require('express');
const { listSales, listPendingSales, listPeriodsWithSales, createSale, deliverSale, updateSale, deleteSale } = require('../controllers/saleController');

const router = express.Router();
router.get('/', listSales);
router.get('/en-attente', listPendingSales);
router.get('/periodes', listPeriodsWithSales);
router.post('/', createSale);
router.post('/:id/livrer', deliverSale);
router.put('/:id', updateSale);
router.delete('/:id', deleteSale);

module.exports = router;
