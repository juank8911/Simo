/**
 * crea el crud para el modelo de analisis.model.js
 */





/**
 *  llama el metodo de symbolCotroller para obteer los todos los ids de los simbolos
 *  obten todos los datos de exchngeymbol para los simbolos uo por uno
 *  obten el valor mas bajo de db_sell y el valor mas alto de db_buy entre todos los exchanges de ese simbolo,
 * saca el porcentaje de diferencia entre esos dos valores, agrega los resultados a la tabla analysis: 
 * id_exsyMin: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeSymbol' },
     id_exsyMax: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeSymbol' },
     Val_buy: { type: Number, default: 0 },
     Val_sell: { type: Number, default: 0 },
     promedio: { type: Number, default: 0 },
     symbolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Symbol', required: true },
     timestamp: { type: Date, default: Date.now }
 *  retorna la cantidad de documentos insertados
 */
const Analysis = require('../data/dataBase/modelosBD/analysis.model')
const ExchangeSymbol = require('../data/dataBase/modelosBD/exchangeSymbol.model');
const Symbol = require('../data/dataBase/modelosBD/symbol.model');
const ccxt = require('ccxt'); // Added ccxt import

/**
 * crea el crud para el modelo de analisis.model.js
 */
const createAnalysis = async (req, res) => {
    try {
        const analysis = new Analysis(req.body);
        await analysis.save();
        res.status(201).json(analysis);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllAnalysis = async (req, res) => {
    try {
        const analysis = await Analysis.find().populate('id_exsyMin').populate('id_exsyMax').populate('symbolId');
        res.status(200).json(analysis);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAnalysisById = async (req, res) => {
    try {
        const analysis = await Analysis.findById(req.params.id).populate('id_exsyMin').populate('id_exsyMax').populate('symbolId');
        if (!analysis) {
            return res.status(404).json({ message: 'Analysis not found' });
        }
        res.status(200).json(analysis);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAnalysis = async (req, res) => {
    try {
        const analysis = await Analysis.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!analysis) {
            return res.status(404).json({ message: 'Analysis not found' });
        }
        res.status(200).json(analysis);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteAnalysis = async (req, res) => {
    try {
        const analysis = await Analysis.findByIdAndDelete(req.params.id);
        if (!analysis) {
            return res.status(404).json({ message: 'Analysis not found' });
        }
        res.status(200).json({ message: 'Analysis deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

 const analyzeSymbols = async (req, res) => {
    try {
        const symbols = await Symbol.find({}, '_id');
        let insertedCount = 0;

        for (const symbol of symbols) {
            const exchangeSymbols = await ExchangeSymbol.find({ symbolId: symbol._id });

            if (exchangeSymbols.length > 0) {
                let minSell = Infinity;
                let maxBuy = -Infinity;
                let minSellExSyId = null;
                let maxBuyExSyId = null;

                for (const exSy of exchangeSymbols) {
                    // Ensure Val_sell and Val_buy are not null or undefined if that's possible
                    if (exSy.Val_sell != null && exSy.Val_sell < minSell) {
                        minSell = exSy.Val_sell;
                        minSellExSyId = exSy._id;
                    }
                    if (exSy.Val_buy != null && exSy.Val_buy > maxBuy) {
                        maxBuy = exSy.Val_buy;
                        maxBuyExSyId = exSy._id;
                    }
                }

                // Handle cases where minSell is 0 or Infinity to avoid NaN or Infinity in promedio
                let promedio;
                if (minSell === 0 || minSell === Infinity || maxBuy === -Infinity || minSellExSyId === null || maxBuyExSyId === null) {
                    promedio = 0; // Or some other appropriate default or error indicator
                } else {
                    promedio = ((maxBuy - minSell) / minSell) * 100;
                }

                // --- Fee fetching logic START ---
                let takerFeeExMin = 0;
                let makerFeeExMin = 0;
                let takerFeeExMax = 0;
                let makerFeeExMax = 0;
                let withdrawalFeeAssetFromExMin = 0;
                let withdrawalNetworkAssetFromExMin = '';
                let exSymMinDoc, exSymMaxDoc; // Declare here to use in catch block if needed

                try {
                    if (minSellExSyId && maxBuyExSyId) { // Only proceed if we have valid ExSy IDs
                        exSymMinDoc = await ExchangeSymbol.findById(minSellExSyId)
                            .populate({ path: 'exchangeId', select: 'id_ex' })
                            .populate({ path: 'symbolId', select: 'id_sy name' });
                        exSymMaxDoc = await ExchangeSymbol.findById(maxBuyExSyId)
                            .populate({ path: 'exchangeId', select: 'id_ex' });

                        if (exSymMinDoc && exSymMinDoc.exchangeId && exSymMinDoc.symbolId && exSymMaxDoc && exSymMaxDoc.exchangeId) {
                            const symbolStr = exSymMinDoc.symbolId.id_sy;
                            const baseCurrency = exSymMinDoc.symbolId.name;

                            // --- Fees for exMin ---
                            const exchangeMinId = exSymMinDoc.exchangeId.id_ex;
                            const ccxtExMin = new ccxt[exchangeMinId]();
                            await ccxtExMin.loadMarkets();

                            if (ccxtExMin.has['fetchTradingFees']) {
                                const tradingFeesMin = await ccxtExMin.fetchTradingFees();
                                if (tradingFeesMin[symbolStr]) {
                                    takerFeeExMin = tradingFeesMin[symbolStr].taker;
                                    makerFeeExMin = tradingFeesMin[symbolStr].maker;
                                }
                            } else if (ccxtExMin.markets && ccxtExMin.markets[symbolStr]) {
                                takerFeeExMin = ccxtExMin.markets[symbolStr].taker;
                                makerFeeExMin = ccxtExMin.markets[symbolStr].maker;
                            }

                            if (ccxtExMin.has['fetchCurrencies']) {
                                const currenciesMin = await ccxtExMin.fetchCurrencies();
                                if (currenciesMin[baseCurrency] && currenciesMin[baseCurrency].networks) {
                                    let bestNetworkFee = Infinity;
                                    let bestNetworkName = '';
                                    for (const netId in currenciesMin[baseCurrency].networks) {
                                        const network = currenciesMin[baseCurrency].networks[netId];
                                        if (network.active !== false && network.withdraw !== false && network.fee != null && network.fee < bestNetworkFee) {
                                            bestNetworkFee = network.fee;
                                            bestNetworkName = netId.toUpperCase();
                                        }
                                    }
                                    if (bestNetworkFee !== Infinity) {
                                        withdrawalFeeAssetFromExMin = bestNetworkFee;
                                        withdrawalNetworkAssetFromExMin = bestNetworkName;
                                    }
                                } else if (currenciesMin[baseCurrency] && currenciesMin[baseCurrency].fee) {
                                    withdrawalFeeAssetFromExMin = currenciesMin[baseCurrency].fee;
                                }
                            }

                            // --- Fees for exMax ---
                            const exchangeMaxId = exSymMaxDoc.exchangeId.id_ex;
                            const ccxtExMax = new ccxt[exchangeMaxId]();
                            await ccxtExMax.loadMarkets();

                            if (ccxtExMax.has['fetchTradingFees']) {
                                const tradingFeesMax = await ccxtExMax.fetchTradingFees();
                                if (tradingFeesMax[symbolStr]) {
                                    takerFeeExMax = tradingFeesMax[symbolStr].taker;
                                    makerFeeExMax = tradingFeesMax[symbolStr].maker;
                                }
                            } else if (ccxtExMax.markets && ccxtExMax.markets[symbolStr]) {
                                takerFeeExMax = ccxtExMax.markets[symbolStr].taker;
                                makerFeeExMax = ccxtExMax.markets[symbolStr].maker;
                            }
                        }
                    }
                } catch (feeError) {
                    const currentSymbolStr = exSymMinDoc && exSymMinDoc.symbolId ? exSymMinDoc.symbolId.id_sy : (symbol ? symbol._id : 'N/A');
                    console.error(`Error fetching fees for symbol ${currentSymbolStr}: ${feeError.message}`);
                    // Fees will remain 0 or default if an error occurs
                }
                // --- Fee fetching logic END ---

                const analysisData = {
                    id_exsyMin: minSellExSyId,
                    id_exsyMax: maxBuyExSyId,
                    Val_buy: maxBuy,
                    Val_sell: minSell,
                    promedio: promedio,
                    symbolId: symbol._id,
                    taker_fee_exMin: takerFeeExMin,
                    maker_fee_exMin: makerFeeExMin,
                    taker_fee_exMax: takerFeeExMax,
                    maker_fee_exMax: makerFeeExMax,
                    withdrawal_fee_asset_from_exMin: withdrawalFeeAssetFromExMin,
                    withdrawal_network_asset_from_exMin: withdrawalNetworkAssetFromExMin,
                    timestamp: new Date()
                };
                const analysis = new Analysis(analysisData);
                await analysis.save();
                insertedCount++;
            }
        }
        console.log(`Inserted ${insertedCount} analysis documents.`);
         // Return a success message with the count of inserted documentsS
        res.status(200).json({ message: `${insertedCount} analysis documents inserted.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createAnalysis,
    getAllAnalysis,
    getAnalysisById,
    updateAnalysis,
    deleteAnalysis,
    analyzeSymbols,
    getFormattedTopAnalysis // Nueva función
};

// Nueva función
const getFormattedTopAnalysis = async (limit = 20) => {
  try {
    const topAnalysisDocs = await Analysis.find({})
      .sort({ promedio: -1 })
      .limit(limit)
      .populate({
        path: 'symbolId', // Popula el symbolId desde Analysis
        select: 'id_sy name'
      })
      .populate({
        path: 'id_exsyMin', // Popula el ExchangeSymbol referenciado en id_exsyMin
        select: 'exchangeId Val_sell', // Solo necesitamos exchangeId de aquí (Val_sell ya está en Analysis)
        populate: {
          path: 'exchangeId', // Popula el Exchange referenciado en ExchangeSymbol.exchangeId
          select: 'id_ex name' // Tomamos el id_ex (CCXT ID) y el nombre del exchange
        }
      })
      .populate({
        path: 'id_exsyMax', // Popula el ExchangeSymbol referenciado en id_exsyMax
        select: 'exchangeId Val_buy', // Solo necesitamos exchangeId de aquí (Val_buy ya está en Analysis)
        populate: {
          path: 'exchangeId', // Popula el Exchange referenciado en ExchangeSymbol.exchangeId
          select: 'id_ex name'
        }
      })
      .exec();

    if (!topAnalysisDocs || topAnalysisDocs.length === 0) {
      return [];
    }

    const formattedResults = topAnalysisDocs.map(doc => {
      // Validar que las populaciones existan para evitar errores
      if (!doc.symbolId || !doc.id_exsyMin || !doc.id_exsyMin.exchangeId || !doc.id_exsyMax || !doc.id_exsyMax.exchangeId) {
        console.warn(`Skipping analysis doc ${doc._id} due to missing populated fields.`);
        return null;
      }

      return {
        analysis_id: doc._id, // Útil para debugging o referencias futuras
        symbol: doc.symbolId.id_sy,
        symbol_name: doc.symbolId.name,

        exchange_min_id: doc.id_exsyMin.exchangeId.id_ex,
        exchange_min_name: doc.id_exsyMin.exchangeId.name, // Nombre legible del exchange

        exchange_max_id: doc.id_exsyMax.exchangeId.id_ex,
        exchange_max_name: doc.id_exsyMax.exchangeId.name, // Nombre legible del exchange

        price_at_exMin_to_buy_asset: doc.Val_sell, // Precio de compra en exMin (venta más baja)
        price_at_exMax_to_sell_asset: doc.Val_buy, // Precio de venta en exMax (compra más alta)

        percentage_difference: doc.promedio != null ? doc.promedio.toFixed(2) + '%' : "N/A",

        fees_exMin: {
          taker_fee: doc.taker_fee_exMin,
          maker_fee: doc.maker_fee_exMin,
          withdrawal_fee_asset: doc.withdrawal_fee_asset_from_exMin,
          withdrawal_network: doc.withdrawal_network_asset_from_exMin
        },
        fees_exMax: {
          taker_fee: doc.taker_fee_exMax,
          maker_fee: doc.maker_fee_exMax
          // No hay withdrawal fee desde exMax en este modelo de datos de Analysis
        },
        timestamp: doc.timestamp // Timestamp del análisis
      };
    }).filter(item => item !== null); // Remover los nulos si alguna populación falló

    return formattedResults;

  } catch (error) {
    console.error("Error fetching formatted top analysis:", error);
    throw error; // Re-lanzar para que el llamador lo maneje
  }
};
