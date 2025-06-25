const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Obtener configuración
router.get('/', (req, res) => {
    configController.getConfig(req, res);
});

// Actualizar configuración
router.put('/', (req, res) => {
    configController.updateConfig(req, res);
});

module.exports = router;