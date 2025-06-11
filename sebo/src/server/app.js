const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path'); // Added for path.join
const { PORT } = require('./utils/config'); // Assuming PORT is defined in utils/config
const { getExchangesStatus, getConfiguredExchanges, getExchangeStatusById, updateExchangeActiveStatus } = require('./controllers/exchangeController');
const { handleSpotAnalysisRequest } = require('./controllers/spotController'); // Import new controller

dotenv.config();

const app = express();

// Middleware
app.use(cors()); // Habilita CORS para permitir peticiones desde el frontend
app.use(express.json()); // Permite a Express parsear JSON

// Servir archivos estáticos del frontend
app.use(express.static('src/public'));

// Endpoint para obtener el estado de los exchanges (predefined list from old config - might be deprecated or adapted)
app.get('/api/exchanges-status', getExchangesStatus);

// Endpoint to get all configured and ccxt exchanges
app.get('/api/configured-exchanges', getConfiguredExchanges);

// Endpoint to update an exchange's active status
app.post('/api/update-exchange-active-status', updateExchangeActiveStatus);

// New Endpoint for Spot Analyzer
app.post('/api/spot/spotanalyzer', handleSpotAnalysisRequest);

// New endpoint to get status for a specific exchange by ID
app.get('/api/exchange-status/:exchangeId', getExchangeStatusById);

// Ruta raíz para servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
    console.log('Accede al frontend en http://localhost:3000');
});
