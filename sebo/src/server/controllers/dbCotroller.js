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
    const existingExchangeObjectIdsInSymbols = await ExchangeSymbol.distinct('exchangeId');

    // Luego, buscamos Exchanges que cumplan las condiciones y cuyo _id NO esté en la lista obtenida
    const activeExchanges = await Exchange.find({
      isActive: true,
      connectionType: 'ccxt',
      _id: { $nin: existingExchangeObjectIdsInSymbols } // $nin significa "not in"
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
        }

        const markets = ccxtExchange.markets;
        if (!markets || Object.keys(markets).length === 0) {
          console.warn(`No markets found for exchange ${exchangeId}. Skipping...`);
          continue; // Skip to the next exchange
        }
        // 3. y 4. Procesar cada símbolo del exchange
        console.log(`Processing exchange: ${exchangeId} with ${Object.keys(markets).length} markets`);
        for (const symbol in markets) {
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
                addedCount++;
              } else {
                // If exists, optionally update values and timestamp
                let ticker = null;
                try {
                  ticker = await ccxtExchange.fetchTicker(market.symbol);
                } catch (tickerError) {
                  console.warn(`Could not fetch ticker for ${market.symbol} on ${exchangeId} for update: ${tickerError.message}`);
                }

                if (ticker) {
                  exchangeSymbolDoc.Val_buy = ticker.bid;
                  exchangeSymbolDoc.Val_sell = ticker.ask;
                  exchangeSymbolDoc.timestamp = new Date();
                  await exchangeSymbolDoc.save();
                }
              }
            } catch (symbolProcessingError) {
              symbolErrors.push({
                exchangeId: exchangeId,
                symbol: market.symbol,
                error: symbolProcessingError.message,
              });
              console.error(`Error processing symbol ${market.symbol} on ${exchangeId}:`, symbolProcessingError);
            }
          }
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
 * crea el metodo para obtener todos exchangeSymbol de un simbolo en especifico de la base de datos
 * y devolverlos en un formato que pueda ser utilizado  por la api
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
  getAllExchangeSymbols
};
