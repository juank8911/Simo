const ccxt = require("ccxt");
const { readSpotCoinsFileHelper } = require("./spotController");
let ioInstance = null; // Para guardar la instancia de socket.io

let lastSpotArbData = []; // Guarda el último top 20 emitido
// Define the target namespace based on the Python client's URL path
// WEBSOCKET_URL from Python config: "ws://localhost:3001/api/spot/arb"
// The path component /api/spot/arb is treated as a Socket.IO namespace.
const SPOT_ARB_DATA_NAMESPACE = 
  process.env.SPOT_ARB_DATA_NAMESPACE || "/api/spot/arb";

// Función para obtener y emitir los datos cada 5 segundos
async function emitSpotPricesLoop(io) {
  ioInstance = io; // Store the main io instance if needed by other parts

  // Get a handle to the specific namespace
  const targetNamespace = io.of(SPOT_ARB_DATA_NAMESPACE);
  console.log(
    `SpotSocketController: Emitting 'spot-arb' data to namespace: ${SPOT_ARB_DATA_NAMESPACE}`
  );

  while (true) {
    try {
      const spotCoinsData = await readSpotCoinsFileHelper();
      if (!spotCoinsData) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const top20 = Object.values(spotCoinsData)
        .sort((a, b) => {
          const getNum = (v) =>
            parseFloat((v?.valores?.difer || "0").replace("%", ""));
          return getNum(b) - getNum(a);
        })
        .slice(0, 20);

      let result = [];
      for (const coin of top20) {
        const { symbol, exchanges, name } = coin; // Asegúrate de obtener 'name'
        const prices = [];
        for (const exId of exchanges) {
          try {
            const ex = new ccxt[exId]();
            await ex.loadMarkets();
            const ticker = await ex.fetchTicker(symbol);
            prices.push({ exchange: exId, price: ticker.last }); // Usar 'last' en lugar de 'ask' para consistencia
          } catch (e) {
            prices.push({ exchange: exId, price: null });
          }
        }
        // Filtra precios válidos y ordena
        const validPrices = prices.filter(
          (p) => typeof p.price === "number" && !isNaN(p.price)
        );
        validPrices.sort((a, b) => a.price - b.price);

        if (validPrices.length >= 2) {
          const min = validPrices[0];
          const max = validPrices[validPrices.length - 1];
          const percent = ((max.price - min.price) / min.price) * 100;
          // Imprime en consola
          console.log(
            `Moneda: ${symbol} | Min: ${min.exchange} ${min.price} | Max: ${max.exchange} ${max.price} | Diferencia: ${percent.toFixed(2)}%`
          );
          // Emite por socket en el formato esperado por la app Python
          const data = {
            symbol: symbol,
            name: name, // Incluir el nombre de la moneda
            exchanges: validPrices.map((v) => v.exchange),
            valores: {
              exValMin: min.exchange,
              exValMax: max.exchange,
              valMin: min.price,
              valMax: max.price,
              difer: percent.toFixed(2) + "%",
            },
          };
          targetNamespace.emit("spot-arb", data); // Emit to the specific namespace
          result.push(data);
        }
      }
      lastSpotArbData = result; // Guarda el último resultado
    } catch (err) {
      console.error(
        `Error in spotSocketController loop (namespace: ${SPOT_ARB_DATA_NAMESPACE}):`,
        err
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Endpoint para obtener el último top 20
const getLastSpotArb = (req, res) => {
  res.status(200).json(lastSpotArbData);
};

module.exports = { emitSpotPricesLoop, getLastSpotArb };


