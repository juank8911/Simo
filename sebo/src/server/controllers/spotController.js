// d:\ProyectosTrade\simo\sebo\src\server\controllers\spotController.js
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');


// Define data directory and file paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE_PATH = path.join(DATA_DIR, 'exchanges_config.json');
const SPOT_COINS_FILE_PATH = path.join(DATA_DIR, 'spot_usdt_coins.json');

// Helper to read exchange config
const readExchangeConfig = async () => {
    try {
        await fs.access(CONFIG_FILE_PATH);
        const data = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Exchange config file not found at ${CONFIG_FILE_PATH}.`);
            return [];
        }
        console.error('Error reading or parsing exchange config file:', error);
        return [];
    }
};

// Helper to read spot_usdt_coins.json
const readSpotCoinsFileHelper = async () => {
    try {
        await fs.access(SPOT_COINS_FILE_PATH);
        const data = await fs.readFile(SPOT_COINS_FILE_PATH, 'utf-8');
        // Mostrar en consola los 5 primeros datos de "data" juntos
        try {
            const parsedData = JSON.parse(data);
            const values = Object.values(parsedData);
            console.log("Primeros 5 datos:", values.slice(0, 5));
        } catch (e) {
            console.warn("No se pudo parsear o mostrar los primeros 5 datos:", e.message);
        }
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Spot coins file not found at ${SPOT_COINS_FILE_PATH}.`);
            return null; // Indicate file not found or empty
        }
        console.error('Error reading or parsing spot coins file:', error);
        throw error; // Rethrow other errors
    }
};

// Helper to write spot coins data
const writeSpotCoinsFile = async (data) => {
    try {
        await fs.writeFile(SPOT_COINS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Spot coins data successfully written to ${SPOT_COINS_FILE_PATH}`);
    } catch (error) {
        console.error(`Error writing spot coins data to ${SPOT_COINS_FILE_PATH}:`, error);
    }
};

const handleSpotAnalysisRequest = async (req, res) => {
    console.log('[SPOT_ANALYSIS_START] Iniciando análisis de mercados spot...');
    try {
        console.log('[SPOT_ANALYSIS] Leyendo configuración de exchanges...');
        const configuredExchanges = await readExchangeConfig();
        console.log(`[SPOT_ANALYSIS] Configuración de exchanges leída. Total: ${configuredExchanges.length}`);
        const activeCcxtExchanges = configuredExchanges.filter(ex => ex.conexion = true &&
            ex.isActive && ex.connectionType === 'ccxt' && ccxt.exchanges.includes(ex.id)
        );

        if (activeCcxtExchanges.length === 0) {
            console.log("No se encontraron exchanges CCXT activos para analizar.");
            return res.status(200).json({ message: "No hay exchanges CCXT activos para analizar." });
        }
        console.log(`[SPOT_ANALYSIS] Exchanges CCXT activos para analizar: ${activeCcxtExchanges.length}`);

        // --- FASE 1: RECOLECCIÓN DE MONEDAS Y PRECIOS ---
        console.log(`[FASE_1_START] Agregando monedas y precios iniciales de ${activeCcxtExchanges.length} exchanges...`);
        const initialCoinMap = {};
        // const exchangeInstances = {}; // No es estrictamente necesario cachear instancias si solo se usan en Fase 1 para fetchTicker

        for (const exchangeConfig of activeCcxtExchanges) {
            const exchangeId = exchangeConfig.id;
            console.log(`[FASE_1_EXCHANGE_LOOP_START] Procesando exchange: ${exchangeId}`);
            try {
                console.log(`[FASE_1_EXCHANGE:${exchangeId}] Creando instancia de CCXT...`);
                const exchange = new ccxtexchangeId; // No es necesario pasar config si no se usan claves API aquí
                // exchangeInstances[exchangeId] = exchange; // Cachear si se reutiliza la instancia más tarde
                console.log(`[FASE_1_EXCHANGE:${exchangeId}] Cargando mercados...`);
                await exchange.loadMarkets();
                console.log(`[FASE_1_EXCHANGE:${exchangeId}] Mercados cargados. Iterando símbolos...`);

                for (const symbol in exchange.markets) {
                    const market = exchange.markets[symbol];
                    // Asegurarse de que solo se procesen mercados 'spot'
                    if (market.type === 'spot' && market.active && market.quote === 'USDT') {
                        if (!initialCoinMap[symbol]) {
                            initialCoinMap[symbol] = {
                                symbol: market.symbol,
                                name: market.base,
                                exchanges: {} // Cambiado a un objeto para almacenar exchangeId: precio
                            };
                            // console.log(`[FASE_1_EXCHANGE:${exchangeId}_SYMBOL:${symbol}] Nuevo símbolo agregado a initialCoinMap.`);
                        }
                        // Obtener el precio actual para este símbolo en este exchange
                        let currentPrice = null;
                        try {
                            // console.log(`[FASE_1_EXCHANGE:${exchangeId}_SYMBOL:${symbol}] Obteniendo ticker...`);
                            const ticker = await exchange.fetchTicker(symbol);
                            // Usar 'ask' (precio de venta) como referencia. Puedes cambiar a 'last', 'bid', etc.
                            currentPrice = ticker && (ticker.ask || ticker.last || ticker.bid);
                            if (typeof currentPrice !== 'number' || isNaN(currentPrice)) {
                                // console.log(`[FASE_1_EXCHANGE:${exchangeId}_SYMBOL:${symbol}] Precio no válido o NaN, estableciendo a null. Ticker:`, ticker);
                                currentPrice = null; // Asegurar que sea null si el precio no es válido
                            }
                        } catch (priceError) {
                            console.warn(`⚠️ No se pudo obtener precio de ${symbol} en ${exchangeId} durante Fase 1: ${priceError.message}`);
                            // currentPrice permanece null
                        }
                        initialCoinMap[symbol].exchanges[exchangeId] = currentPrice;
                        // console.log(`[FASE_1_EXCHANGE:${exchangeId}_SYMBOL:${symbol}] Precio almacenado: ${currentPrice}`);
                    }
                }
                console.log(`✔ Monedas y precios iniciales de ${exchangeId} agregados.`);
            } catch (e) {
                console.error(`❌ Error recolectando de ${exchangeId}: ${e.message}. Continuando...`);
            }
            console.log(`[FASE_1_EXCHANGE_LOOP_END] Exchange ${exchangeId} procesado.`);
        }
        console.log(`[FASE_1_END] Fase 1 completada. Monedas únicas encontradas: ${Object.keys(initialCoinMap).length}`);

        // --- FASE 2: FILTRADO POR REGLAS DE NEGOCIO ---
        console.log('[FASE_2_START] Aplicando filtros de arbitraje...');
        const filteredCoinMap = {};

        for (const symbol in initialCoinMap) {
            // console.log(`[FASE_2_SYMBOL_LOOP_START] Filtrando símbolo: ${symbol}`);
            const coinData = initialCoinMap[symbol];
            const numExchanges = Object.keys(coinData.exchanges).length; // Ajustado para un objeto
            // console.log(`[FASE_2_SYMBOL:${symbol}] Número de exchanges con este símbolo: ${numExchanges}`);

            // Regla 1: Descartar si solo está en 1 exchange
            if (numExchanges <= 1) {
                // console.log(`[FASE_2_SYMBOL:${symbol}] DESCARTADO (Regla 1: <= 1 exchange).`);
                continue;
            }

            // Regla 3: Verificar precios si está en 2 o más exchanges
            if (numExchanges >= 2) {
                // Los precios ya fueron recolectados en la Fase 1 y están en coinData.exchanges
                // console.log(`[FASE_2_SYMBOL:${symbol}] (Regla 3: >= 2 exchanges) Procesando precios...`);
                const pricedExchanges = Object.entries(coinData.exchanges)
                    .filter(([, price]) => price !== null && typeof price === 'number' && !isNaN(price)) // Filtrar precios no válidos o nulos
                    .map(([exchangeId, price]) => ({ price, exchangeId }));
                // console.log(`[FASE_2_SYMBOL:${symbol}] Número de exchanges con precios válidos: ${pricedExchanges.length}`);

                if (pricedExchanges.length < 2) {
                    // console.log(`[FASE_2_SYMBOL:${symbol}] DESCARTADO (Regla 2: < 2 precios válidos).`);
                    continue; // No hay suficientes precios para comparar
                }
                // console.log(`[FASE_2_SYMBOL:${symbol}] Encontrando min/max precios...`);

                let minPriceData = pricedExchanges[0];
                let maxPriceData = pricedExchanges[0];
                // console.log(`[FASE_2_SYMBOL:${symbol}] Inicial - cantidad de exchanges con precio: ${pricedExchanges.length}`);
                // console.log(`[FASE_2_SYMBOL:${symbol}] Inicial - precio min: ${minPriceData.price} en ${minPriceData.exchangeId}`);
                // console.log(`[FASE_2_SYMBOL:${symbol}] Inicial - precio max: ${maxPriceData.price} en ${maxPriceData.exchangeId}`);

                for (let i = 1; i < pricedExchanges.length; i++) {
                    if (pricedExchanges[i].price < minPriceData.price) {
                        minPriceData = pricedExchanges[i];
                        // console.log(`[FASE_2_SYMBOL:${symbol}] Nuevo min: ${minPriceData.price} en ${minPriceData.exchangeId}`);
                    }
                    if (pricedExchanges[i].price > maxPriceData.price) {
                        maxPriceData = pricedExchanges[i];
                        // console.log(`[FASE_2_SYMBOL:${symbol}] Nuevo max: ${maxPriceData.price} en ${maxPriceData.exchangeId}`);
                    }
                }
                
                const minPrice = minPriceData.price;
                const maxPrice = maxPriceData.price;
                const exchangeMin = minPriceData.exchangeId;
                const exchangeMax = maxPriceData.exchangeId;
                // console.log(`[FASE_2_SYMBOL:${symbol}] Final - precio min: ${minPrice} en ${exchangeMin}`);
                // console.log(`[FASE_2_SYMBOL:${symbol}] Final - precio max: ${maxPrice} en ${exchangeMax}`);

                let numerator = maxPrice - minPrice;
                let difference;
                let diferPercentageStr;
                // console.log(`[FASE_2_SYMBOL:${symbol}] Numerador (maxPrice - minPrice): ${numerator}`);

                if (minPrice === 0 && maxPrice === 0) {
                    // console.log(`[FASE_2_SYMBOL:${symbol}] Cálculo de diferencia: minPrice y maxPrice son 0.`);
                    difference = 0;
                } else if (minPrice === 0 && maxPrice > 0) {
                    // console.log(`[FASE_2_SYMBOL:${symbol}] Cálculo de diferencia: minPrice es 0 y maxPrice > 0. Saltando.`);
                    // En tu código original, esta condición hacía 'continue'.
                    // Si quieres que se procese como Infinity, cambia la línea de abajo.
                    // difference = Infinity; 
                    continue; // Manteniendo el comportamiento original de saltar
                } else if (maxPrice > 0 && minPrice > 0) { // Ambos precios son positivos
                    // console.log(`[FASE_2_SYMBOL:${symbol}] Cálculo de diferencia con fórmula original: (max-min) / ((max+min)/2).`);
                    const denominatorProduct = maxPrice + minPrice;
                    const denominatorFormulaPart = denominatorProduct / 2;
                    if (denominatorFormulaPart === 0) { // Salvaguarda adicional
                        console.warn(`[FASE_2_SYMBOL:${symbol}] Denominador cero inesperado con minPrice ${minPrice}, maxPrice ${maxPrice}`);
                        if (numerator === 0) difference = 0;
                        else difference = Infinity;
                        // console.log(`[FASE_2_SYMBOL:${symbol}] DESCARTADO (Denominador cero inesperado).`);
                        continue;
                    } else {
                        difference = numerator / denominatorFormulaPart;
                    }
                } else {
                    console.warn(`[FASE_2_SYMBOL:${symbol}] Saltando debido a precios inusuales para cálculo de diferencia: min ${minPrice}, max ${maxPrice}`);
                    // console.log(`[FASE_2_SYMBOL:${symbol}] DESCARTADO (precios inusuales para cálculo de diferencia).`);
                    continue;
                }
                // console.log(`[FASE_2_SYMBOL:${symbol}] Diferencia calculada (decimal): ${difference}`);

                if (difference === Infinity) diferPercentageStr = "Infinity%";
                else if (isNaN(difference)) diferPercentageStr = "NaN%";
                else diferPercentageStr = (difference * 100).toFixed(2) + '%';

                if (difference >= 0.006) { // 0.6%
                    console.log(`[FASE_2_SYMBOL:${symbol}] ✔ CONSERVADA (Dif: ${diferPercentageStr} >= 0.6%)`);
                    // Crear una copia de coinData para no modificar initialCoinMap directamente si no es necesario
                    const finalCoinData = { ...coinData };
                    finalCoinData.valores = {
                        exValMin: exchangeMin,
                        exValMax: exchangeMax,
                        valMin: minPrice,
                        valMax: maxPrice,
                        difer: diferPercentageStr
                    };
                    // El campo 'exchanges' ya contiene los precios de la Fase 1
                    // Si quieres que el 'exchanges' final solo tenga los IDs, necesitarías hacer:
                    // finalCoinData.exchanges = Object.keys(coinData.exchanges);
                    // Pero si quieres mantener los precios, ya está como { exchangeId: precio }
                    filteredCoinMap[symbol] = finalCoinData;
                } else {
                    // console.log(`[FASE_2_SYMBOL:${symbol}] DESCARTADA (Dif: ${diferPercentageStr} < 0.6%)`);
                }
            }
            // console.log(`[FASE_2_SYMBOL_LOOP_END] Símbolo ${symbol} filtrado.`);
        }
        console.log(`[FASE_2_END] Fase 2 completada. Monedas después del filtro: ${Object.keys(filteredCoinMap).length}`);

        // --- FASE 3: ESCRITURA DEL ARCHIVO FINAL ---
        console.log('[FASE_3_START] Escribiendo archivo final...');
        await writeSpotCoinsFile(filteredCoinMap);
        console.log('[FASE_3_END] Archivo final escrito.');

        const responsePayload = {
            message: "Análisis de spot y filtrado completado.",
            exchangesProcessed: activeCcxtExchanges.length,
            initialCoinsFound: Object.keys(initialCoinMap).length,
            finalCoinsKept: Object.keys(filteredCoinMap).length
        };
        console.log('[SPOT_ANALYSIS_SUCCESS] Enviando respuesta JSON:', responsePayload);
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error("[SPOT_ANALYSIS_CRITICAL_ERROR] Error crítico durante el análisis de spot:", error);
        res.status(500).json({ message: "Error crítico durante el análisis de spot.", error: error.message });
    }
};



// Helper function to parse 'difer' string to a number for sorting
const parseDiferToNumber = (diferStr) => {
    if (typeof diferStr !== 'string') {
        return Number.NEGATIVE_INFINITY; // Treat malformed/missing 'difer' as lowest priority
    }
    if (diferStr.toUpperCase() === "INFINITY%") {
        return Number.POSITIVE_INFINITY;
    }
    if (diferStr.toUpperCase() === "NAN%") {
        return Number.NEGATIVE_INFINITY; // Treat NaN as lowest priority
    }
    const value = parseFloat(diferStr.replace('%', ''));
    return isNaN(value) ? Number.NEGATIVE_INFINITY : value;
};

const getTopSpotOpportunities = async (req, res) => {
    try {
        const spotCoinsData = await readSpotCoinsFileHelper();

        // If file not found, is empty, or contains no data (e.g. {}), return an empty array.
        if (!spotCoinsData || Object.keys(spotCoinsData).length === 0) {
            return res.status(200).json([]);
        }

        const allOpportunities = Object.values(spotCoinsData);

        const sortedOpportunities = allOpportunities
            .map(op => ({
                ...op,
                // Ensure 'valores' and 'difer' exist before parsing, assign a numeric value for sorting
                parsedDifer: (op.valores && typeof op.valores.difer === 'string')
                    ? parseDiferToNumber(op.valores.difer)
                    : Number.NEGATIVE_INFINITY
            }))
            .sort((a, b) => b.parsedDifer - a.parsedDifer); // Sort descending: highest 'parsedDifer' first

        // Take the top 20 opportunities and remove the temporary 'parsedDifer' field
        const top20Opportunities = sortedOpportunities.slice(0, 20).map(op => {
            const { parsedDifer, ...opportunityData } = op;
            return opportunityData;
        });

        res.status(200).json(top20Opportunities);

    } catch (error) {
        console.error("Error in getTopSpotOpportunities:", error);
        res.status(500).json({
            message: "Failed to retrieve top spot opportunities due to a server error.",
            error: error.message // Provide error message for easier debugging
        });
    }
};

module.exports = {
    handleSpotAnalysisRequest,
    getTopSpotOpportunities,
    readSpotCoinsFileHelper, // <-- asegúrate de exportarla aquí
};