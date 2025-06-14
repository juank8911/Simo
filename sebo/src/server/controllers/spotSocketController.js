const ccxt = require('ccxt');
const { readSpotCoinsFileHelper } = require('./spotController');
let ioInstance = null; // Para guardar la instancia de socket.io

let lastSpotArbData = []; // Guarda el último top 20 emitido

// Función para obtener y emitir los datos cada 5 segundos
async function emitSpotPricesLoop(io) {
    ioInstance = io;
    while (true) {
        try {
            const spotCoinsData = await readSpotCoinsFileHelper();
            if (!spotCoinsData) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            const top20 = Object.values(spotCoinsData)
                .sort((a, b) => {
                    const getNum = v => parseFloat((v?.valores?.difer || '0').replace('%', ''));
                    return getNum(b) - getNum(a);
                })
                .slice(0, 20);

            let result = [];
            for (const coin of top20) {
                const { symbol, exchanges } = coin;
                const prices = [];
                for (const exId of exchanges) {
                    try {
                        const ex = new ccxt[exId]();
                        await ex.loadMarkets();
                        const ticker = await ex.fetchTicker(symbol);
                        prices.push({ exchange: exId, price: ticker.ask });
                    } catch (e) {
                        prices.push({ exchange: exId, price: null });
                    }
                }
                // Filtra precios válidos y ordena
                const validPrices = prices.filter(p => typeof p.price === 'number' && !isNaN(p.price));
                validPrices.sort((a, b) => a.price - b.price);

                if (validPrices.length >= 2) {
                    const min = validPrices[0];
                    const max = validPrices[validPrices.length - 1];
                    const percent = ((max.price - min.price) / min.price) * 100;
                    // Imprime en consola
                    console.log(`Moneda: ${symbol} | Min: ${min.exchange} ${min.price} | Max: ${max.exchange} ${max.price} | Diferencia: ${percent.toFixed(2)}%`);
                    // Emite por socket
                    const data = {
                        symbol,
                        exchanges: validPrices.map(v => v.exchange),
                        prices: validPrices.map(v => ({ exchange: v.exchange, price: v.price })),
                        percent: percent.toFixed(2)
                    };
                    io.emit('spot-arb', data);
                    result.push(data);
                }
            }
            lastSpotArbData = result; // Guarda el último resultado
        } catch (err) {
            console.error('Error en spotSocketController:', err);
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

// Endpoint para obtener el último top 20
const getLastSpotArb = (req, res) => {
    res.status(200).json(lastSpotArbData);
};

module.exports = { emitSpotPricesLoop, getLastSpotArb };