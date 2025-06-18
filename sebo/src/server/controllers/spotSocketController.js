// const ccxt = require("ccxt"); // No longer needed here
// const { readSpotCoinsFileHelper } = require("./spotController"); // No longer needed here
const { getTopOpportunitiesFromDB } = require('./spotController'); // Added
let ioInstance = null; // Para guardar la instancia de socket.io

let lastSpotArbData = []; // Stays as an array, will store data from DB
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
  ioInstance = io;
 
  console.log(
    `SpotSocketController: Emitting 'spot-arb' data to namespace: ${SPOT_ARB_DATA_NAMESPACE} from DB`
  );

  while (true) {
    try {
      const topOpportunitiesFromDB = await getTopOpportunitiesFromDB(); // Fetches top 20 by default

      if (topOpportunitiesFromDB && topOpportunitiesFromDB.length > 0) {
        lastSpotArbData = topOpportunitiesFromDB; // Update lastSpotArbData with the full list

        // Emit each opportunity individually
        // The 'opportunity' object from getTopOpportunitiesFromDB is already in the desired format.
        for (const opportunity of topOpportunitiesFromDB) {
          targetNamespace.emit("spot-arb", opportunity);
        }
        // console.log(`Emitted ${topOpportunitiesFromDB.length} opportunities to ${SPOT_ARB_DATA_NAMESPACE}`);
      } else {
        // console.log('No opportunities found in DB to emit.');
        lastSpotArbData = []; // Clear if nothing found
      }

    } catch (err) {
      console.error(
        `Error in spotSocketController loop (DB source for namespace: ${SPOT_ARB_DATA_NAMESPACE}):`,
        err
      );
      lastSpotArbData = []; // Clear on error to avoid serving stale data
    }
    await new Promise((r) => setTimeout(r, 5000)); // Interval remains 5 seconds
  }
}

// Endpoint para obtener el último top 20
const getLastSpotArb = (req, res) => {
  res.status(200).json(lastSpotArbData);
};

module.exports = { emitSpotPricesLoop, getLastSpotArb };


