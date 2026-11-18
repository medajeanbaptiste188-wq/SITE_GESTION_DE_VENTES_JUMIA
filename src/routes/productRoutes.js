const express = require('express');
const { listProducts, getProduct, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const { productImageUpload } = require('../middlewares/productImageUpload');

const router = express.Router();

router.get('/', listProducts);
router.post('/', productImageUpload, createProduct);
router.get('/:id', getProduct);
router.put('/:id', productImageUpload, updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
