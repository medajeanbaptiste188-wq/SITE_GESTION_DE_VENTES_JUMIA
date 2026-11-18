const express = require('express');
const { listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion } = require('../controllers/promotionController');

const router = express.Router();
router.get('/', listPromotions);
router.post('/', createPromotion);
router.get('/:id', getPromotion);
router.put('/:id', updatePromotion);
router.delete('/:id', deletePromotion);

module.exports = router;
