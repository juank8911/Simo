// const ccxt = require("ccxt"); // No longer needed here
// const { readSpotCoinsFileHelper } = require("./spotController"); // No longer needed here
// const { getTopOpportunitiesFromDB } = require('./spotController'); // Removed
const { getFormattedTopAnalysis } = require('./analizerController'); // Added
let ioInstance = null; // Para guardar la instancia de socket.io

let lastSpotArbData = []; // Stays as an array, will store data from DB
// Define the target namespace based on the Python client's URL path
// WEBSOCKET_URL from Python config: "ws://localhost:3001/api/spot/arb"
// The path component /api/spot/arb is treated as a Socket.IO namespace.
const SPOT_ARB_DATA_NAMESPACE = 
  process.env.SPOT_ARB_DATA_NAMESPACE || "http.//localhost:3001/api/spot/arb";

// Función para obtener y emitir los datos cada 5 segundos
async function emitSpotPricesLoop(io) {
  ioInstance = io; // Store the main io instance if needed by other parts

  // Get a handle to the specific namespace
  const targetNamespace = io.of(SPOT_ARB_DATA_NAMESPACE);
  console.log(
    `SpotSocketController: Emitting 'spot-arb' data to namespace: ${SPOT_ARB_DATA_NAMESPACE} (from DB via AnalizerController)`
  );

  while (true) {
    try {
      // Call the new function from analizerController.js
      const detailedOpportunities = await getFormattedTopAnalysis();

      if (detailedOpportunities && detailedOpportunities.length > 0) {
        lastSpotArbData = detailedOpportunities; // Update lastSpotArbData with the formatted data

        // Emit each opportunity individually
        // 'opportunity' now has the detailed JSON structure with fees
        for (const opportunity of detailedOpportunities) {
          targetNamespace.emit("spot-arb", opportunity);
        }
        // console.log(`Emitted ${detailedOpportunities.length} detailed opportunities to ${SPOT_ARB_DATA_NAMESPACE}`);
      } else {
        // console.log('No detailed opportunities found in DB to emit.');
        lastSpotArbData = []; // Clear if no data found
      }

    } catch (err) {
      console.error(
        `Error in spotSocketController loop (sourcing from analizerController for namespace: ${SPOT_ARB_DATA_NAMESPACE}):`,
        err
      );
      lastSpotArbData = []; // Clear on error
    }
    await new Promise((r) => setTimeout(r, 5000)); // Interval remains 5 seconds
  }
}

// Endpoint para obtener el último top 20
const getLastSpotArb = (req, res) => {
  res.status(200).json(lastSpotArbData);
};

module.exports = { emitSpotPricesLoop, getLastSpotArb };


