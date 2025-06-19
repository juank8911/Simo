const express = require('express');
const router = express.Router();
// Adjust the path to where exchangeController is actually located
// Assuming it's in ../controllers/exchangeController.js
const exchangeController = require('../controllers/exchangeController');

// Existing routes for exchange status etc. might also be defined here or in app.js directly.
// For this task, we are adding a new route.
// If other exchange-related routes from app.js (like /api/exchanges-status)
// should be managed here, they would need to be moved.

// New route for withdrawal fees
// GET /api/exchanges/:exchangeId/withdrawal-fees/:currencyCode
router.get('/:exchangeId/withdrawal-fees/:currencyCode', exchangeController.getWithdrawalFees);

// Example: If you were to move other routes from app.js here:
// router.get('/status', exchangeController.getExchangesStatus);
// router.get('/configured', exchangeController.getConfiguredExchanges);
// router.get('/:exchangeId/status', exchangeController.getExchangeStatusById); // Note: path might conflict if not careful
// router.post('/update-active-status', exchangeController.updateExchangeActiveStatus);


module.exports = router;
