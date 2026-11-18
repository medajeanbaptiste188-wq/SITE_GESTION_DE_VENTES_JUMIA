const express = require('express');
const { health } = require('../controllers/healthController');
const { login, signup } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { loginRateLimit } = require('../middlewares/loginRateLimitMiddleware');
const productRoutes = require('./productRoutes');
const promotionRoutes = require('./promotionRoutes');
const saleRoutes = require('./saleRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const adminRoutes = require('./adminRoutes');
const backupRoutes = require('./backupRoutes');

const router = express.Router();

router.get('/health', health);
router.post('/auth/login', loginRateLimit, login);
router.post('/auth/inscription', loginRateLimit, signup);

// Toutes les futures routes API sont protégées, sauf health et login ci-dessus.
router.use(requireAuth);
router.use('/produits', productRoutes);
router.use('/promotions', promotionRoutes);
router.use('/ventes', saleRoutes);
router.use('/admin', adminRoutes);
router.use('/sauvegarde', backupRoutes);
router.use('/', dashboardRoutes);

module.exports = router;
