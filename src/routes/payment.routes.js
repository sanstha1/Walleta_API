const express = require('express');
const router  = express.Router();
const payment = require('../controllers/payment.controller.js');
const { protect } = require('../middleware/auth.middleware.js');

// router.post('/activate-trial',       protect, payment.activateTrial);
// Temporarily add this ABOVE the activate-trial route:
router.post('/activate-trial', (req, res, next) => {
  console.log('🔍 Headers:', req.headers.authorization?.substring(0, 30));
  next();
}, protect, payment.activateTrial);
router.post('/initiate',             protect, payment.initiate);
router.post('/verify-and-activate',  protect, payment.verifyAndActivate);
router.get('/plan',                  protect, payment.getPlan);

module.exports = router;