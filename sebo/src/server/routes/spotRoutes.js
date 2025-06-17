const express = require('express');
const router = express.Router();
const { getLastSpotArb } = require('../controllers/spotSocketController');
const {handleSpotAnalysisRequest, handleSpotExchangePrice}= require('../controllers/spotController');
const { addExchangesSymbols } = require('../controllers/dbCotroller');

// ...otras rutas...

/**
 * @swagger
 * /api/spot/arb:
 *   get:
 *     summary: Obtiene el top 20 de oportunidades spot con precios actualizados y diferencia porcentual.
 *     tags:
 *       - Spot
 *     responses:
 *       200:
 *         description: Lista de oportunidades de arbitraje spot.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   symbol:
 *                     type: string
 *                     example: ETH3L/USDT
 *                   exchanges:
 *                     type: array
 *                     items:
 *                       type: string
 *                   prices:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         exchange:
 *                           type: string
 *                         price:
 *                           type: number
 *                   percent:
 *                     type: string
 *                     example: "200.00"
 */
router.get('/arb', getLastSpotArb);
// Rutas de Spot (movidas a routes/spotRoutes.js)


router.get('/exchange-symbols', addExchangesSymbols);
/**
 * @swagger
 * /api/spot/spotanalyzer:
 *   post:
 *     summary: Inicia el análisis de spot y actualiza el archivo de monedas.
 *     tags: [Spot]
 *     responses:
 *       '200':
 *         description: Análisis de spot completado y archivo de monedas actualizado.
 *       '500':
 *         description: Error durante el análisis de spot.
 */
router.get('/analysis', handleSpotAnalysisRequest);

router.get('/exchange-price', handleSpotExchangePrice);


module.exports = router;