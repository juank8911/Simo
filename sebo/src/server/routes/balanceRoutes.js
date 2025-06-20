const express = require('express');
const router = express.Router();
const balanceController = require('../controllers/balanceController');

// Rutas para Balance
router.post('/', balanceController.createBalance); // POST /api/balances
router.get('/', balanceController.getAllBalances);   // GET /api/balances

// Rutas específicas por id_exchange (más prácticas)
router.get('/exchange/:exchangeId', balanceController.getBalanceByExchange); // GET /api/balances/exchange/binance
router.put('/exchange/:exchangeId', balanceController.updateBalanceByExchange);   // PUT /api/balances/exchange/binance (Upsert)

// Rutas por _id de MongoDB (opcional, si se necesita gestión directa por _id)
router.put('/:balanceId', balanceController.updateBalanceById);     // PUT /api/balances/mongo_object_id
router.delete('/:balanceId', balanceController.deleteBalanceById); // DELETE /api/balances/mongo_object_id

module.exports = router;
