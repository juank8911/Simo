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
        console.log(`Fase 1: Recolectando monedas de ${activeCcxtExchanges.length} exchanges...`);
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
                console.log(`✔ Monedas de ${exchangeId} recolectadas.`);
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

            // Regla 2: Conservar si está en 5 o más exchanges
            if (numExchanges >= 5) {
                filteredCoinMap[symbol] = coinData;
                continue;
            }

            // Regla 3: Verificar precios si está en 2-4 exchanges
            if (numExchanges >= 2 && numExchanges <= 4) {
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
                let maxPriceData = pricedExchanges[0];

                for (let i = 1; i < pricedExchanges.length; i++) {
                    if (pricedExchanges[i].price < minPriceData.price) {
                        minPriceData = pricedExchanges[i];
                    }
                    if (pricedExchanges[i].price > maxPriceData.price) {
                        maxPriceData = pricedExchanges[i];
                    }
                }

                const minPrice = minPriceData.price;
                const maxPrice = maxPriceData.price;
                const exchangeMin = minPriceData.exchangeId;
                const exchangeMax = maxPriceData.exchangeId;

                // Fórmula proporcionada: (valor1 - valor2) / ((valor1 * valor2) / 2)
                let numerator = maxPrice - minPrice;
                let difference;
                let diferPercentageStr;

                if (minPrice === 0 && maxPrice === 0) {
                    difference = 0;
                } else if (minPrice === 0 && maxPrice > 0) { // Denominador (maxPrice * minPrice / 2) sería 0
                    difference = Infinity;
                } else if (maxPrice > 0 && minPrice > 0) { // Ambos precios son positivos
                    const denominatorProduct = maxPrice * minPrice;
                    const denominatorFormulaPart = denominatorProduct / 2;
                    if (denominatorFormulaPart === 0) { // Salvaguarda adicional
                        console.warn(`Denominador cero inesperado para ${symbol} con minPrice ${minPrice}, maxPrice ${maxPrice}`);
                        if (numerator === 0) difference = 0;
                        else difference = Infinity; // O considerar saltar con 'continue'
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

module.exports = {
    handleSpotAnalysisRequest,
};