// d:\ProyectosTrade\simo\sebo\src\server\controllers\spotController.js
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');
const { Analysis, Symbol, ExchangeSymbol, Exchange } = require('../data/dataBase/connectio'); // Added model imports

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
    console.log('Iniciando análisis de mercados spot...');
    try {
        const configuredExchanges = await readExchangeConfig();
        const activeCcxtExchanges = configuredExchanges.filter(ex =>
            ex.isActive && ex.connectionType === 'ccxt' && ccxt.exchanges.includes(ex.id)
        );

        if (activeCcxtExchanges.length === 0) {
            console.log("No se encontraron exchanges CCXT activos para analizar.");
            return res.status(200).json({ message: "No hay exchanges CCXT activos para analizar." });
        }

        // --- FASE 1: RECOLECCIÓN DE MONEDAS ---
        console.log(`Fase 1: Agregando monedas de ${activeCcxtExchanges.length} exchanges...`);
        const initialCoinMap = {};
        const exchangeInstances = {}; // Cache instances for price fetching

        for (const exchangeConfig of activeCcxtExchanges) {
            const exchangeId = exchangeConfig.id;
            try {
                const exchange = new ccxt[exchangeId]();
                exchangeInstances[exchangeId] = exchange; // Cache instance
                await exchange.loadMarkets();

                for (const symbol in exchange.markets) {
                    const market = exchange.markets[symbol];
                    if (market.spot && market.active && market.quote === 'USDT') {
                        if (!initialCoinMap[symbol]) {
                            
                            initialCoinMap[symbol] = { symbol: market.symbol, name: market.base, exchanges: [] };
                        }
                        if (!initialCoinMap[symbol].exchanges.includes(exchangeId)) {
                            initialCoinMap[symbol].exchanges.push(exchangeId);
                        }
                    }
                }
                console.log(`✔ Monedas de ${exchangeId} ageregadas.`);
            } catch (e) {
                console.error(`❌ Error recolectando de ${exchangeId}: ${e.message}. Continuando...`);
            }
        }
        console.log(`Fase 1 completada. Monedas únicas encontradas: ${Object.keys(initialCoinMap).length}`);

        // --- FASE 2: FILTRADO POR REGLAS DE NEGOCIO ---
        console.log('Fase 2: Aplicando filtros de arbitraje...');
        const filteredCoinMap = {};

        for (const symbol in initialCoinMap) {
            const coinData = initialCoinMap[symbol];
            const numExchanges = coinData.exchanges.length;

            // Regla 1: Descartar si solo está en 1 exchange
            if (numExchanges <= 1) {
                continue;
            }


            // Regla 3: Verificar precios si está en 2-4 exchanges
            if (numExchanges >= 2) {
                const pricePromises = coinData.exchanges.map(exId =>
                    exchangeInstances[exId].fetchTicker(symbol)
                        .then(ticker => ({ ticker, exchangeId: exId })) // Incluir exchangeId
                        .catch(e => {
                            console.warn(`⚠️ No se pudo obtener precio de ${symbol} en ${exId}: ${e.message}`);
                            return null;
                        })
                );

                const results = await Promise.allSettled(pricePromises);
                const pricedExchanges = results
                    .filter(r => r.status === 'fulfilled' && r.value && r.value.ticker && r.value.ticker.ask)
                    .map(r => ({ price: r.value.ticker.ask, exchangeId: r.value.exchangeId }));

                if (pricedExchanges.length < 2) {
                    continue; // No hay suficientes precios para comparar
                }

                let minPriceData = pricedExchanges[0];
                let maxPriceData = pricedExchanges[0]
                    console.log("cantidad de exchanges: ", pricedExchanges.length)
                    console.log("precio min: ", minPriceData.price);
                    console.log("precio max: ", maxPriceData.price);
                for (let i = 1; i < pricedExchanges.length; i++) {
                    if (pricedExchanges[i].price < minPriceData.price) {
                        minPriceData = pricedExchanges[i];
                        console.log("nuevo min: ", minPriceData.price);
                    }
                    if (pricedExchanges[i].price > maxPriceData.price) {
                        maxPriceData = pricedExchanges[i];
                        console.log("nuevo max: ", maxPriceData.price);
                    }
                }
                // los campos se deben estar en 0 para hacer operaciones 
                const minPrice = minPriceData.price; 
                const maxPrice = maxPriceData.price;
                const exchangeMin = minPriceData.exchangeId;
                const exchangeMax = maxPriceData.exchangeId;
                console.log("precio min: ", minPrice);
                console.log("precio max: ", maxPrice);
                console.log("exchange min: ", exchangeMin);
                console.log("exchange max: ", exchangeMax);

                // Fórmula proporcionada: (valor1 - valor2) / ((valor1 * valor2) / 2)
                let numerator = maxPrice - minPrice;
                let difference;
                let diferPercentageStr;

                if (minPrice === 0 && maxPrice === 0) {
                    difference = 0;
                } else if (minPrice === 0 && maxPrice > 0) { // Denominador (maxPrice * minPrice / 2) sería 0
                    continue
                } else if (maxPrice > 0 && minPrice > 0) { // Ambos precios son positivos
                    const denominatorProduct = maxPrice + minPrice;
                    const denominatorFormulaPart = denominatorProduct / 2;
                    if (denominatorFormulaPart === 0) { // Salvaguarda adicional
                        console.warn(`Denominador cero inesperado para ${symbol} con minPrice ${minPrice}, maxPrice ${maxPrice}`);
                        if (numerator === 0) difference = 0;
                        else difference = Infinity; // O considerar saltar con 'continue'
                        console.warn(`Saltando ${symbol} debido a precios = 0: min ${minPrice}, max ${maxPrice}`);
                        continue
                    } else {
                        difference = numerator / denominatorFormulaPart;
                    }
                } else {
                    console.warn(`Saltando ${symbol} debido a precios inusuales para cálculo de diferencia: min ${minPrice}, max ${maxPrice}`);
                    continue;
                }

                if (difference === Infinity) diferPercentageStr = "Infinity%";
                else if (isNaN(difference)) diferPercentageStr = "NaN%";
                else diferPercentageStr = (difference * 100).toFixed(2) + '%';

                if (difference >= 0.006) {
                    console.log(`✔ CONSERVADA: ${symbol} (Dif: ${diferPercentageStr})`);
                    coinData.valores = {
                        exValMin: exchangeMin,
                        exValMax: exchangeMax,
                        valMin: minPrice,
                        valMax: maxPrice,
                        difer: diferPercentageStr
                    };
                    filteredCoinMap[symbol] = coinData;
                } else {
                    // console.log(`DESCARTADA: ${symbol} (Dif: ${diferPercentageStr})`);
                }
            }
        }
        console.log(`Fase 2 completada. Monedas después del filtro: ${Object.keys(filteredCoinMap).length}`);

        // --- FASE 3: ESCRITURA DEL ARCHIVO FINAL ---
        await writeSpotCoinsFile(filteredCoinMap);

        res.status(200).json({
            message: "Análisis de spot y filtrado completado.",
            exchangesProcessed: activeCcxtExchanges.length,
            initialCoinsFound: Object.keys(initialCoinMap).length,
            finalCoinsKept: Object.keys(filteredCoinMap).length
        });

    } catch (error) {
        console.error("Error crítico durante el análisis de spot:", error);
        res.status(500).json({ message: "Error crítico durante el análisis de spot.", error: error.message });
    }
};


const getTopOpportunitiesFromDB = async (limit = 20) => {
  try {
    const opportunities = await Analysis.find({})
      .sort({ promedio: -1 }) // Sort by 'promedio' descending
      .limit(limit)
      .populate({
        path: 'symbolId',
        select: 'id_sy name' // Select specific fields from Symbol
      })
      .populate({
        path: 'id_exsyMin',
        select: 'Val_sell exchangeId', // Val_sell here is the minimum selling price for the opportunity
        populate: {
          path: 'exchangeId',
          select: 'id_ex name' // Select specific fields from Exchange
        }
      })
      .populate({
        path: 'id_exsyMax',
        select: 'Val_buy exchangeId', // Val_buy here is the maximum buying price for the opportunity
        populate: {
          path: 'exchangeId',
          select: 'id_ex name' // Select specific fields from Exchange
        }
      })
      .exec();

    if (!opportunities) {
      return [];
    }

    // Transform the data into the desired output structure
    const formattedOpportunities = opportunities.map(op => {
      if (!op.symbolId || !op.id_exsyMin || !op.id_exsyMax || !op.id_exsyMin.exchangeId || !op.id_exsyMax.exchangeId) {
        // console.warn(`Skipping opportunity due to missing populated data: ${op._id}`);
        return null; // Skip if essential populated data is missing
      }

      return {
        symbol: op.symbolId.id_sy,
        name: op.symbolId.name,
        // The 'exchanges' array in the old format listed all exchanges where the coin was found.
        // The Analysis model focuses on the two specific exchanges involved in the arbitrage.
        // For now, let's list the two involved in the found opportunity.
        exchanges: [op.id_exsyMin.exchangeId.id_ex, op.id_exsyMax.exchangeId.id_ex].sort(),
        valores: {
          exValMin: op.id_exsyMin.exchangeId.id_ex,
          exValMax: op.id_exsyMax.exchangeId.id_ex,
          valMin: op.Val_sell, // This is the minSell from analysis (buy price for arbitrageur)
          valMax: op.Val_buy,   // This is the maxBuy from analysis (sell price for arbitrageur)
          difer: op.promedio != null ? op.promedio.toFixed(2) + '%' : "N/A"
        }
      };
    }).filter(op => op !== null); // Filter out any nulls from skipped opportunities

    return formattedOpportunities;

  } catch (error) {
    console.error("Error fetching top opportunities from DB:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
};

const getTopSpotOpportunities = async (req, res) => {
  try {
    // Call the new function to get data from the database
    const topOpportunities = await getTopOpportunitiesFromDB(); // Default limit is 20

    if (!topOpportunities || topOpportunities.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(topOpportunities);

  } catch (error) {
    // Log the error on the server
    console.error("Error in getTopSpotOpportunities (DB):", error);
    // Send a generic error message to the client
    res.status(500).json({
      message: "Failed to retrieve top spot opportunities from the database.",
      // Optionally, include error.message if it's safe to expose, or a generic error code
      // error: error.message
    });
  }
};

const handleSpotExchangePrice = async (req, res) => {
    console.log('Iniciando análisis de mercados spot...');
    try {
        const configuredExchanges = await readExchangeConfig();
        const activeCcxtExchanges = configuredExchanges.filter(ex =>
            ex.isActive && ex.connectionType === 'ccxt' && ccxt.exchanges.includes(ex.id)
        );

        if (activeCcxtExchanges.length === 0) {
            console.log("No se encontraron exchanges CCXT activos para analizar.");
            return res.status(200).json({ message: "No hay exchanges CCXT activos para analizar." });
        }

        // --- FASE 1: RECOLECCIÓN DE MONEDAS ---
        console.log(`Fase 1: Agregando monedas de ${activeCcxtExchanges.length} exchanges...`);
        const initialCoinMap = {};
        const exchangeInstances = {}; // Cache instances for price fetching

        for (const exchangeConfig of activeCcxtExchanges) {
            const exchangeId = exchangeConfig.id;
            try {
                const exchange = new ccxt[exchangeId]();
                exchangeInstances[exchangeId] = exchange; // Cache instance
                await exchange.loadMarkets();

                for (const symbol in exchange.markets) {
                    const market = exchange.markets[symbol];
                    if (market.spot && market.active && market.quote === 'USDT') {
                        if (!initialCoinMap[symbol]) {
                            initialCoinMap[symbol] = { symbol: market.symbol, name: market.base, exchanges: [] };
                        }
                        if (!initialCoinMap[symbol].exchanges.includes(exchangeId)) {
                            initialCoinMap[symbol].exchanges.push(exchangeId);
                        }
                    }
                }
                console.log(`✔ Monedas de ${exchangeId} ageregadas.`);
            } catch (e) {
                console.error(`❌ Error recolectando de ${exchangeId}: ${e.message}. Continuando...`);
            }
        }
        console.log(`Fase 1 completada. Monedas únicas encontradas: ${Object.keys(initialCoinMap).length}`);

        // --- FASE 2: OBTENER PRECIOS DE COMPRA Y VENTA ---
        // Para cada símbolo, obtener los precios de compra y venta de cada exchange
        const resultCoinMap = {};

        for (const symbol in initialCoinMap) {
            const coinData = initialCoinMap[symbol];
            const exchangesObj = {};

            // Para cada exchange, obtener el ticker y guardar buy/sell
            for (const exId of coinData.exchanges) {
                try {
                    const ticker = await exchangeInstances[exId].fetchTicker(symbol);
                    exchangesObj[exId] = {
                        buy: ticker.bid ?? null,
                        sell: ticker.ask ?? null
                    };
                } catch (e) {
                    exchangesObj[exId] = {
                        buy: null,
                        sell: null
                    };
                    console.warn(`⚠️ No se pudo obtener ticker de ${symbol} en ${exId}: ${e.message}`);
                }
            }

            // Estructura final para el símbolo
            resultCoinMap[symbol] = {
                symbol: coinData.symbol,
                name: coinData.name,
                exchanges: exchangesObj
                // No agregamos "valores" aquí, solo la estructura principal y los precios
            };
        }

        // --- FASE 3: ESCRITURA DEL ARCHIVO FINAL ---
        await writeSpotCoinsFile(resultCoinMap);

        res.status(200).json({
            message: "Precios de compra y venta por exchange agregados correctamente.",
            totalSymbols: Object.keys(resultCoinMap).length
        });

    } catch (error) {
        console.error("Error crítico durante el análisis de spot:", error);
        res.status(500).json({ message: "Error crítico durante el análisis de spot.", error: error.message });
    }
};

module.exports = {
    handleSpotAnalysisRequest,
    getTopSpotOpportunities,
    readSpotCoinsFileHelper,
    handleSpotExchangePrice, // <-- asegúrate de exportarla aquí
    getTopOpportunitiesFromDB, // Added new function
};