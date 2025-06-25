/**
 * crea una funcion para agregar los exchage desde el json de exchages_cofig.json
 * reorno la cantidad de exchanges agregados
 * cuanto fallaron al agregarse
 * y listo de id de los que fallaron
 */
const Exchange = require('../data/dataBase/modelosBD/exchange.model');
const mongoose = require('mongoose');
const exchangesConfig = require('../data/exchanges_config.json');
const ExchangeSymbol = require('../data/dataBase/modelosBD/exchangeSymbol.model');
const Symbol = require('../data/dataBase/modelosBD/symbol.model');
const ccxt = require('ccxt');

const addExchanges = async (req, res) => {
  let addedCount = 0;
  let failedCount = 0;
  const failedIds = [];

  for (const exchangeConfig of exchangesConfig) {
    try {
      // Mapear los campos del config al esquema del modelo
      const exchangeData = {
        id_ex: exchangeConfig.id, // Asignar exchangeConfig.id a id_ex
        name: exchangeConfig.name,
        isActive: exchangeConfig.isActive,
        isCoreExchange: exchangeConfig.isCoreExchange, // Asegúrate que este campo exista o tenga un default
        connectionType: exchangeConfig.connectionType, // Asegúrate que este campo exista o tenga un default
        conexion: exchangeConfig.conexion // Asegúrate que este campo exista o tenga un default
      };
      const newExchange = new Exchange(exchangeData);
      await newExchange.save();
      addedCount++;
    } catch (error) {
      failedCount++;
      failedIds.push(exchangeConfig.id);
      console.error(`Error adding exchange ${exchangeConfig.id}:`, error);
    }
  }
  res.status(200).json({
    message: `Added ${addedCount} exchanges, failed to add ${failedCount}.`,
    failedIds: failedIds
  });
};

/**
 * crea el metodo para agregar los symbolos desde spot_usdt.coins.json pero toma solo el symbol q es el id y name 
 */

const spotCoinsData = require('../data/spot_usdt_coins.json');

const addSymbols = async (req, res) => {
  let addedCount = 0;
  let failedCount = 0;
  const failedSymbols = [];

  // spotCoinsData is an object where keys are symbols (like "BTC/USDT")
  // and values are objects containing symbol details.
  // We iterate over the values to get the symbol objects.
  const symbolsToAdd = Object.values(spotCoinsData);

  for (const symbolData of symbolsToAdd) {
    try {
      // Mapear los campos del spotCoinsData al esquema del modelo Symbol
      const symbolToAdd = {
        id_sy: symbolData.symbol, // Usar el campo 'symbol' como id_sy
        name: symbolData.name,   // Usar el campo 'name'
      };
      const newSymbol = new Symbol(symbolToAdd);
      await newSymbol.save();
      addedCount++;
    } catch (error) {
      failedCount++;
      failedSymbols.push(symbolData.symbol);
      console.error(`Error adding symbol ${symbolData.symbol}:`, error);
    }
  }
  res.status(200).json({
    message: `Added ${addedCount} symbols, failed to add ${failedCount}.`,
    failedSymbols: failedSymbols
  });
};


/**
 * const addExchangesSymbols
 * cre el metodo para obtener lo symbolos por exchage desde ccxt el proceso es el siguiente:
 * 1. obtener los exchanges activos isactive = treu de la base de datos el id de cada exchage
 * 2. obtener los symbolos de cada exchange activo desde ccxt si no  puede obteer los datos guardar el error 
 * en un array y continuar con el siguiete exchange devolver el array de errores al final del proceso con los datos
 * 3. por cada symbolo de cada exchange activo, verificar si ya existe en symbolos de la base de datos
 * 4. si no existe, agregarlo a la base de datos en symbol y en exchangesymbols agregar el exchange y el symbolo a la tabla de exchangesymbols con el valor de compra y venta de el array obtenido de ccxt de cada simbolo
 * !!IMPORATE!!  si el symbolo ya existe en symbolos de la base de datos, verificar si ya existe en exchangesymbols, si ya existe el symbolo = symbolId y el exchange = exchangeId  exchangesymbols, si ya existe cotinuar con el siguiete de lo controrario agregargrlo
 * !!importante!! en exchagesybols pueden repetirse los id de lo simbolos o los de los exhanges pero nunca pueden reprtirse el mismo sybolo y exchnge jutos 
 * * @param {Object} req - Request object 
 * * @param {Object} res - Response object
 * res.status(200).json({
 *   message: `Added ${addedCount} exchange symbols, failed to add ${failedCount} exchanges., errors de conexion: ${failedIds, error arroajoda po ccxt}`,
 * captura los errores y devuelve un mensaje de error
 *  */


const addExchangesSymbolsForSimbols = async (req, res) => {
const usedSymbols = await ExchangeSymbol.distinct('symbolId');
const usedSymbolObjectIds = await usedSymbols.map(symbol => symbol._id);

// obteer de symbolos los simbolos diferentes a usedSymbolObjectIds
const symbols = await Symbol.find({ _id: { $nin: usedSymbolObjectIds } });
//toma todos los exchanges que tengan el isActive = true  
const activeExchanges = await Exchange.find({ isActive: true });

let addedCount = 0;
let failedCount = 0;
const errors = [];
console.log(`Found ${symbols.length} symbols to process.`);
for (const symbol of symbols) {
  const exchangeSymbolsToInsert = [];
  console.log(`Processing symbol: ${symbol.id_sy}`);
  for (const exchange of activeExchanges) {
    // console.log(`Processing exchange: ${exchange.id_ex} for symbol: ${symbol.id_sy}`);
    try {
      const exchangeId = exchange.id_ex;
      const ccxtExchange = new ccxt[exchangeId]({
        'timeout': 10000,
        'enableRateLimit': true,
      });
      await ccxtExchange.loadMarkets();

      // Busca el símbolo en los mercados del exchange
      const market = ccxtExchange.markets[symbol.id_sy];
      if (!market || !market.spot || !market.active || market.quote !== 'USDT') {
        continue;
      }

      // // Verifica si ya existe la combinación en ExchangeSymbol
      // const exists = await ExchangeSymbol.findOne({
      //   symbolId: symbol._id,
      //   exchangeId: exchange._id,
      // });
      // if (exists) continue;

      let ticker = null;
      try {
        // console.log(`Fetching ticker for ${symbol.id_sy} on ${exchangeId}`);
        // Solo intenta obtener el ticker si el símbolo existe en el exchange
        if (ccxtExchange.markets[symbol.id_sy]) {
          ticker = await ccxtExchange.fetchTicker(symbol.id_sy);
        } else {
          // Si el símbolo no existe en el exchange, no crea el documento y continúa con el siguiente exchange
          continue;
        }
      } catch (tickerError) {
        // Si falla, deja los valores en 0
        console.warn(`Could not fetch ticker for ${symbol.id_sy} on ${exchangeId}: ${tickerError.message}`);
        continue; // Continúa con el siguiente exchange
      }

      exchangeSymbolsToInsert.push({
        symbolId: symbol._id,
        exchangeId: exchange._id,
        Val_buy: ticker ? ticker.bid : 0,
        Val_sell: ticker ? ticker.ask : 0,
        timestamp: new Date(),
      });
      addedCount++;
      console.log(`Added ExchangeSymbol for ${exchangeSymbolsToInsert.length}`);
    } catch (err) {
      failedCount++;
      errors.push({
        symbol: symbol.id_sy,
        exchange: exchange.id_ex,
        error: err.message,
      });
      continue;
    }
  }
  if (exchangeSymbolsToInsert.length > 1) {
    try {
      console.log(`Inserting ${exchangeSymbolsToInsert.length} ExchangeSymbol entries for symbol ${symbol.id_sy}`);
      await ExchangeSymbol.insertMany(exchangeSymbolsToInsert);
    } catch (bulkError) {
      cosole.error(`Error inserting ExchangeSymbol entries for symbol ${symbol.id_sy}:`, bulkError);
      errors.push({
        symbol: symbol.id_sy,
        error: bulkError.message,
      });
    }
  }
}
console.log(`Finished processing symbols. Added ${addedCount} ExchangeSymbol entries, failed ${failedCount}.`);
res.status(200).json({
  message: `Processed symbols. Added ${addedCount} ExchangeSymbol entries, failed ${failedCount}.`,
  errors,
});
}



const addExchangesSymbols = async (req, res) => {
  let addedCount = 0;
  let failedExchangeCount = 0;
  const failedExchangeIds = [];
  const symbolErrors = []; // To store errors during symbol/exchangeSymbol processing

  try {
    /** 1. Obtener los exchanges activos de la base de datos y que el id del exchage no este en exhangeSymbol si ya estan en la 
      significa que ya se analizo y no se necesita volver a analizarlo.
      Aquí "id del exchange" se refiere al _id del documento Exchange,
      ya que ExchangeSymbol.exchangeId referencia a Exchange._id.
    */
    // Primero, obtenemos todos los _id de Exchange que ya están en ExchangeSymbol
    const usedExchangeId  = await ExchangeSymbol.distinct('exchangeId');
    const  existingExchangeObjectIdsExchange = await usedExchangeId.map(es => es.exchangeId);

    // Obtener todos los exchanges cuyo _id NO esté en existingExchangeObjectIdsExchange
    const activeExchanges = await Exchange.find({
      _id: { $nin: existingExchangeObjectIdsExchange }
    });

    if (activeExchanges.length === 0) {
      return res.status(200).json({
        message: "No active CCXT exchanges found in the database.",
        addedCount: 0,
        failedExchangeCount: 0,
        failedExchangeIds: [],
        symbolErrors: []
      });
    }
    console.log(`Found ${activeExchanges.length} active CCXT exchanges.`);
    for (const exchange of activeExchanges) {
      const exchangeId = exchange.id_ex;
      console.log(`Processing exchange: ${exchangeId}`);
      try {
        // 2. Obtener los símbolos de cada exchange activo desde ccxt
        const ccxtExchange = new ccxt[exchangeId]({
          'timeout': 10000,
          'enableRateLimit': true,
        });
        await ccxtExchange.loadMarkets();
        

        // Obtener todos los tickers para el exchange de una vez para eficiencia
        let allTickers = {};
        try {
          allTickers = await ccxtExchange.fetchTickers();
        } catch (fetchTickersError) {
          console.error(`Error fetching all tickers for exchange ${exchangeId}: ${fetchTickersError.message}. Proceeding without live prices for this exchange.`);
          // Si fetchTickers falla, allTickers permanecerá vacío, y los symbols no tendrán precios actuales.
          continue; // Skip to the next exchange
        }
        /**cra un cosole log para ver el contenido de ccxtExchange.markets mustra 2 elemetos y mostrr el coetido de y has una pausa de 5 segundos
         * 
         */        
    
      
        // Pause for 5 seconds

        var markets =  ccxtExchange.markets;
        markets = await Object.fromEntries(
          Object.entries(markets).filter(
            ([_, market]) => market.spot === true && market.active === true && market.quote === 'USDT'
         )
        );
        console.log(`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ${Object.values(markets).slice(0, 2)}`);
        if (!markets || Object.keys(markets).length === 0) {
          console.warn(`No markets found for exchange ${exchangeId}. Skipping...`);
          continue; // Skip to the next exchange
        }
        // 3. y 4. Procesar cada símbolo del exchange
        console.log(`Processing exchange: ${exchangeId} with ${Object.keys(markets).length} markets`);
        simbolos = 0;
        for (const symbol in markets) {
          console.log(`${simbolos} / ${Object.keys(markets).length}`);
          const market = markets[symbol];
          // Only process spot markets with USDT quote
          if (market.spot && market.active && market.quote === 'USDT') {
            try {
              // Find or create the Symbol in the database
              let symbolDoc = await Symbol.findOne({ id_sy: market.symbol });
              // console.log(`Processing symbol: ${market} on exchange: ${exchangeId}`);
              if (!symbolDoc) {
                symbolDoc = new Symbol({
                  id_sy: market.symbol,
                  name: market.base,
                });
                await symbolDoc.save();
                // console.log(`${market.symbol} - ok s`);
              }

              // Check if the ExchangeSymbol combination already exists
              let exchangeSymbolDoc = await ExchangeSymbol.findOne({
                symbolId: symbolDoc._id,
                exchangeId: exchange._id, // Usar el ObjectId del documento Exchange
              });

              if (!exchangeSymbolDoc) {
                // Fetch ticker to get buy/sell values (ask/bid)
                let ticker = null;
                try {
                  ticker = await ccxtExchange.fetchTicker(market.symbol);
                } catch (tickerError) {
                  console.warn(`Could not fetch ticker for ${market.symbol} on ${exchangeId}: ${tickerError.message}`);
                  // Continue without ticker data, Val_buy and Val_sell will be default 0
                  continue
                }
                // console.log(`Adding new ExchangeSymbol for ${ticker.bid} on ${exchangeId}`);
                exchangeSymbolDoc = new ExchangeSymbol({
                  symbolId: symbolDoc._id,
                  exchangeId: exchange._id, // Usar el ObjectId del documento Exchange
                  Val_buy: ticker ? ticker.bid : 0, // Use bid for buy value
                  Val_sell: ticker ? ticker.ask : 0, // Use ask for sell value
                  timestamp: new Date(),
                });
                await exchangeSymbolDoc.save();
                // console.log(`${ticker.bid} - ok es`);
                addedCount++;
                
              } 
            } catch (symbolProcessingError) {
              symbolErrors.push({
                exchangeId: exchangeId,
                symbol: market.symbol,
                error: symbolProcessingError.message,
              });
              console.error(`Error processing symbol ${market.symbol} on ${exchangeId}:`, symbolProcessingError);
              continue; // Continue to the next symbol if there's an error
            }
          }
          simbolos++;
        }
      } catch (exchangeError) {
        failedExchangeCount++;
        failedExchangeIds.push(exchangeId);
        console.error(`Error connecting to or fetching markets for exchange ${exchangeId}: ${exchangeError.message}`);
        symbolErrors.push({
          exchangeId: exchangeId,
          error: `Failed to connect or fetch markets: ${exchangeError.message}`,
        });
      }
    }
    console.log(`Finished processing exchanges. Added/Updated ${addedCount} ExchangeSymbol entries.`);
    res.status(200).json({
      message: `Processed active CCXT exchanges. Added/Updated ${addedCount} ExchangeSymbol entries.`,
      failedExchangeCount: failedExchangeCount,
      failedExchangeIds: failedExchangeIds,
      symbolErrors: symbolErrors,
    });

  } catch (error) {
    console.error("Critical error in addExchangesSymbols:", error);
    res.status(500).json({
      message: "An error occurred while processing exchanges and symbols.",
      error: error.message,
      failedExchangeCount: failedExchangeCount,
      failedExchangeIds: failedExchangeIds,
      symbolErrors: symbolErrors,
    });
  }
};

/**
 * metodo para eliminar los exchangeSymbol que cumplan las siguientes condiciones
 * delete document  from  exchanSymbol where symbolid = symbol,_id count(exchangeId) < 2clos exchangeSymbol que no tengan de 2 exchanges en adelante
 * recorrer la coleccion de symbols y buscar y eliminar de la coleccion de exchangeSymbol los que cumplan las condiciones
 *
 */const deleteLowCountExchangeSymbols = async (req, res) => {
  let deletedCount = 0;
  const symbolsProcessed = [];
  const errors = [];

  try {
    // 1. Obtener todos los símbolos
    const symbols = await Symbol.find({}, '_id id_sy');

    console.log(`Found ${symbols.length} symbols to check.`);

    for (const symbol of symbols) {
      symbolsProcessed.push(symbol.id_sy);
      try {
        // 2. Contar cuántos ExchangeSymbols existen para este símbolo
        const count = await ExchangeSymbol.countDocuments({ symbolId: symbol._id });

        // 3. Si el count es menor que 2, eliminar todos los ExchangeSymbols para este símbolo
        if (count < 2) {
          const deleteResult = await ExchangeSymbol.deleteMany({ symbolId: symbol._id });
          deletedCount += deleteResult.deletedCount;
          console.log(`Deleted ${deleteResult.deletedCount} ExchangeSymbol entries for symbol ${symbol.id_sy} (count: ${count}).`);
        } else {
          // console.log(`Symbol ${symbol.id_sy} has ${count} ExchangeSymbol entries. Keeping.`);
        }
      } catch (symbolError) {
        errors.push({
          symbolId: symbol._id,
          symbol: symbol.id_sy,
          error: symbolError.message,
        });
        console.error(`Error processing symbol ${symbol.id_sy} for deletion check:`, symbolError);
      }
    }
    /**celimina el simbolo  */
    console.log(`Finished deleting low count ExchangeSymbols. Total deleted: ${deletedCount}`);

    res.status(200).json({
      message: `Checked ${symbols.length} symbols. Deleted ${deletedCount} ExchangeSymbol entries where count was less than 2.`,
      symbolsProcessed: symbolsProcessed,
      errors: errors,
    });

  } catch (error) {
    console.error("Critical error in deleteLowCountExchangeSymbols:", error);
    res.status(500).json({
      message: "An error occurred while deleting low count exchange symbols.",
      error: error.message,
      symbolsProcessed: symbolsProcessed,
      errors: errors,
    });  }
};

/**
 * crea el metodo para obtener todos los exchangeSymbol de un symbolo
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.params.symbolId - The ID of the symbol to fetch exchange symbols for.
 * res.status(200).json(exchangeSymbols);
 * res.status(500).json({ message: "Error fetching exchange symbols", error: error.message });
 */






const getAllExchangeSymbols = async (req, res) => {
  try {
    const { symbolId } = req.params;
    const exchangeSymbols = await ExchangeSymbol.find({ symbolId });
    res.status(200).json(exchangeSymbols);
  } catch (error) {
    console.error("Error fetching exchange symbols:", error);
    res.status(500).json({ message: "Error fetching exchange symbols", error: error.message });
  }
};

module.exports = {
  addExchanges,
  addSymbols,
  addExchangesSymbols,
  addExchangesSymbolsForSimbols,
  getAllExchangeSymbols
};
