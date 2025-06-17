const ccxt = require('ccxt');
const { EXCHANGES } = require('../utils/config');
const fs = require('fs').promises;
const path = require('path');

// Define data directory and config file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE_PATH = path.join(DATA_DIR, 'exchanges_config.json');


// Función para inicializar un exchange con ccxt
const initializeExchange = (exchangeId) => {
    try {
        // Asegúrate de que el ID del exchange es válido para ccxt
        if (!ccxt.exchanges.includes(exchangeId)) {
            console.warn(`[${exchangeId}] no es un ID de exchange válido para ccxt.`);
            return null;
        }

        // Crear una instancia del exchange. Puedes añadir claves API aquí si las tienes.
        // Por ejemplo:
        // const api_key = process.env[\`\${exchangeId.toUpperCase()}_API_KEY\`];
        // const secret = process.env[\`\${exchangeId.toUpperCase()}_SECRET\`];
        //
        // const exchangeConfig = {
        //     'apiKey': api_key,
        //     'secret': secret,
        //     'timeout': 10000, // Tiempo de espera para la respuesta
        //     'enableRateLimit': true, // Habilitar la gestión de límites de tasa
        // };
        //
        // return new ccxt[exchangeId](exchangeConfig);

        // Para este ejemplo, solo inicializamos sin credenciales para probar conectividad pública
        return new ccxt[exchangeId]({
            'timeout': 10000,
            'enableRateLimit': true,
        });

    } catch (error) {
        console.error(`Error inicializando exchange ${exchangeId}: ${error.message}`);
        return null;
    }
};

// Helper to ensure data directory exists
const ensureDataDirExists = async () => {
    try {
        await fs.access(DATA_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') { // If directory does not exist
            try {
                await fs.mkdir(DATA_DIR, { recursive: true });
                console.log(`Data directory created: ${DATA_DIR}`);
            } catch (mkdirError) {
                console.error(`Error creating data directory ${DATA_DIR}:`, mkdirError);
                throw mkdirError; // Rethrow to prevent further operations if dir creation fails
            }
        } else {
            console.error(`Error accessing data directory ${DATA_DIR}:`, error);
            throw error; // Rethrow other access errors
        }
    }
};

// Helper functions for config file
const readExchangeConfig = async () => {
    await ensureDataDirExists(); // Ensure directory exists before trying to read
    try {
        // Check if the file itself exists
        await fs.access(CONFIG_FILE_PATH);
        const data = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { // If config file does not exist
            console.warn(`Exchange config file not found at ${CONFIG_FILE_PATH}. A new one will be created on first update.`);
            return []; // Return empty array, it will be created on first write
        }
        // For other errors (e.g., parsing error, permissions), log and return empty
        console.error('Error reading or parsing exchange config file:', error);
        return []; // Return empty array to prevent application crash on malformed JSON
    }
};

const writeExchangeConfig = async (config) => {
    await ensureDataDirExists(); // Ensure directory exists before trying to write
    try {
        await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error writing exchange config file:', error);
    }
};

// Helper function to get status and price for a single exchange
const getSingleExchangeStatusAndPrice = async (exchangeId, exchangeNameProvided) => { //NOSONAR
    const result = {
        id: exchangeId,
        name: exchangeNameProvided || (exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1)), // Use provided name or derive from ID
        connected: false,
        error: null
    };

    const exchange = initializeExchange(exchangeId);

    if (!exchange) {
        result.error = `Failed to initialize ccxt for ${result.name}. Check if ID is correct or if ccxt supports it.`;
        return result;
    }

    try {
        // Intentar cargar los mercados para verificar conectividad básica
        await exchange.loadMarkets();
        result.connected = true;

    } catch (e) {
        result.connected = false;
        result.error = e.message;
        // console.error(`Error fetching data for ${result.name}: ${e.message}`);
    }
    return result;
};

// Función para obtener el estado y el precio de un exchange (used by getExchangesStatus)
const getExchangeStatusAndPrice = async (exchangeId, exchangeName) => {
    // This function now can use the common helper
    return getSingleExchangeStatusAndPrice(exchangeId, exchangeName);
};

// Endpoint para obtener el estado de todos los exchanges
const getExchangesStatus = async (req, res) => {
    const statusPromises = EXCHANGES.map(ex => getSingleExchangeStatusAndPrice(ex.id, ex.name));
    const allExchangesStatus = await Promise.allSettled(statusPromises); //NOSONAR

    const formattedResults = allExchangesStatus.map(promiseResult => {
        if (promiseResult.status === 'fulfilled') {
            return promiseResult.value;
        } else {
            // Esto debería ser manejado por el catch dentro de getExchangeStatusAndPrice,
            // pero es un fallback en caso de error Promise.allSettled
            return {
                id: 'unknown',
                name: 'Unknown Exchange',
                connected: false,
                error: promiseResult.reason ? promiseResult.reason.message : 'Unknown error'
            };
        }
    });

    res.json(formattedResults);
};

// (Original getAvailableExchanges is replaced by getConfiguredExchanges)
// const getAvailableExchanges = (req, res) => { ... };

// New function to get configured and all ccxt exchanges
const getConfiguredExchanges = async (req, res) => {
    try {
        const ccxtExchangeIds = ccxt.exchanges;
        let configuredExchanges = await readExchangeConfig();
        const configuredMap = new Map(configuredExchanges.map(ex => [ex.id, ex]));

        const finalExchangeList = [];

        // Add configured exchanges first, marking if ccxt supports them
        configuredExchanges.forEach(confEx => {
            finalExchangeList.push({
                ...confEx,
                ccxtSupported: ccxtExchangeIds.includes(confEx.id)
            });
        });

        // Add any ccxt exchanges not already in the configured list
        ccxtExchangeIds.forEach(id => {
            if (!configuredMap.has(id)) {
                finalExchangeList.push({
                    id: id,
                    name: id.charAt(0).toUpperCase() + id.slice(1),
                    isActive: false, // Default to not active if new
                    ccxtSupported: true
                });
            }
        });
        
        // Optional: Sort by name
        finalExchangeList.sort((a, b) => a.name.localeCompare(b.name));

        res.json(finalExchangeList);
    } catch (error) {
        console.error('Error fetching configured exchanges:', error);
        res.status(500).json({ error: 'Failed to retrieve list of exchanges.' });
    }
};






// Endpoint to get status for a single exchange by ID
const getExchangeStatusById = async (req, res) => {
    const { exchangeId } = req.params;
    if (!exchangeId) {
        return res.status(400).json({ error: 'Exchange ID is required.' });
    }

    try {
        const config = await readExchangeConfig();
        const exchangeConfig = config.find(ex => ex.id === exchangeId);
        const exchangeName = exchangeConfig ? exchangeConfig.name : (exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1));

        // If the exchange is not CCXT-based or not supported, don't try to connect.
        // This prevents crashes for manual or unsupported exchanges.
        if (!exchangeConfig || exchangeConfig.connectionType !== 'ccxt') {
            updateExchangeConexionStatus(exchangeId, false); // Update connection status
            console.warn(`Exchange '${exchangeName}' is not configured for CCXT connection.`);
            return res.json({
                id: exchangeId,
                name: exchangeName,
                connected: false,
                error: `Exchange '${exchangeName}' is not configured for CCXT connection.`
            });
        }

        const status = await getSingleExchangeStatusAndPrice(exchangeId, exchangeName);
        updateExchangeConexionStatus(exchangeId, true); // Update connection status
        // If the exchange is not connected, we can still return the status with an error message
        res.json(status);
    } catch (error) {
        console.error(`Error in getExchangeStatusById for ${exchangeId}:`, error);
        res.status(500).json({
            id: exchangeId,
            name: exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1),
            connected: false,
            error: 'An unexpected server error occurred while fetching status.'
        });
    }
};


// Endpoint to update the active status of an exchange
const updateExchangeActiveStatus = async (req, res) => {
    const { exchangeId, isActive, exchangeName } = req.body;

    if (typeof exchangeId === 'undefined' || typeof isActive === 'undefined') {
        return res.status(400).json({ error: 'exchangeId and isActive are required.' });
    }

    try {
        let config = await readExchangeConfig();
        const index = config.findIndex(ex => ex.id === exchangeId);

        if (index > -1) {
            config[index].isActive = isActive;
        } else {
            // Add new exchange to config if it wasn't there
            config.push({ id: exchangeId, name: exchangeName || (exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1)), isActive: isActive });
        }

        await writeExchangeConfig(config);
        res.json({ success: true, message: `Exchange ${exchangeId} active status updated.` });
    } catch (error) {
        console.error('Error updating exchange active status:', error);
        res.status(500).json({ error: 'Failed to update exchange active status.' });
    }
};

// Nueva función para actualizar el campo "conexion"
const updateExchangeConexionStatus = async (exchangeId, status) => {
    let config = await readExchangeConfig();
    let updated = false;
    config = config.map(ex => {
        if (ex.id === exchangeId) {
            updated = true;
            return { ...ex, conexion: status };
        }
        return ex;
    });
    if (updated) {
        await writeExchangeConfig(config);
    }
};

module.exports = {
    getExchangesStatus,
    // getAvailableExchanges, // Replaced
    getConfiguredExchanges,
    getExchangeStatusById,
    updateExchangeActiveStatus,
};
