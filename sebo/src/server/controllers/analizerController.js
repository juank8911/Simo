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
const {deleteExchangeSymbolsMen1} = require('./spotController'); // Importing spotController to use its methods
const ccxt = require('ccxt'); // Added ccxt import
const Balance = require('../data/dataBase/modelosBD/balance.model');
const balanceController = require('./balanceController');

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



const getTop20porPorcetaje = async (req, res) => {
    try {
        // Obtiene el último balance registrado
        const lastBalance = await balanceController.getLastBalance();

        // Obtiene los 20 primeros documentos completos de analysis ordenados por promedio (mayor a menor)
        const topAnalysis = await Analysis.find({})
            .sort({ promedio: -1 })
            .limit(20)
            .populate({
                path: 'id_exsyMin',
                populate: {
                    path: 'exchangeId',
                    select: 'id_ex name'
                }
            })
            .populate({
                path: 'id_exsyMax',
                populate: {
                    path: 'exchangeId',
                    select: 'id_ex name'
                }
            })
            .populate({
                path: 'symbolId',
                select: 'id_sy name'
            });

        // Formatea la respuesta para incluir los datos relevantes
        const formatted = topAnalysis.map(doc => ({
            analysis_id: doc._id,
            symbol_id: doc.symbolId ? doc.symbolId.id_sy : null,
            symbol_name: doc.symbolId ? doc.symbolId.name : null,
            exchange_min: doc.id_exsyMin && doc.id_exsyMin.exchangeId ? {
                id: doc.id_exsyMin.exchangeId.id_ex,
                name: doc.id_exsyMin.exchangeId.name,
                ...doc.id_exsyMin._doc // incluye otros campos de id_exsyMin si los necesitas
            } : null,
            exchange_max: doc.id_exsyMax && doc.id_exsyMax.exchangeId ? {
                id: doc.id_exsyMax.exchangeId.id_ex,
                name: doc.id_exsyMax.exchangeId.name,
                ...doc.id_exsyMax._doc // incluye otros campos de id_exsyMax si los necesitas
            } : null,
            promedio: doc.promedio,
            timestamp: doc.timestamp
        }));

        // Devuelve el lastBalance y los análisis juntos
        return {
            lastBalance: lastBalance || {},
            analysis: formatted
        };
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

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


const pruebaDistinct = async (req, res) => {
    try {
        // Obtiene todos los idSymbol únicos de exchangeSymbols (sin repeticiones)
        const symbolIds = await ExchangeSymbol.distinct('symbolId');
        //busca todos los simbolos que no etan e symbolIds
        const symbols = await Symbol.find({ _id: { $nin: symbolIds }});
        res.status(200).json({ symbolIdsLength: symbolIds.length, symbols: symbols.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

 const analyzeSymbols = async (req, res) => {
    try {
        // const symbols = await Symbol.find({});
        await deleteExchangeSymbolsMen1();
        console.log('borrados');
        // Obtiene un arreglo de symbolId únicos desde ExchangeSymbol (sin repeticiones)
        const symbolIds = await ExchangeSymbol.distinct('symbolId');
        const symbls = await Symbol.find({ _id: { $in: symbolIds } }, { _id: 1 });
        let insertedCount = 0;
        let aymbl =0;
        let exf = 0;
        for (const symbol of symbls) {
            // console.log(symbol)
            console.log(symbls.length +'/'+ aymbl);
            aymbl++;
            // console.log(`Processing symbol: ${)
            const exchangeSymbols = await ExchangeSymbol.find({ symbolId: symbol });
            // console.log(`Processing symbol: ${symbol.name}, ExchangeSymbols count: ${exchangeSymbols.length}`);

            if (exchangeSymbols.length > 1) {
                let minSell = Infinity; // Initialize minSell to Infinity
                let maxBuy = -Infinity; // Initialize maxBuy to -Infinity
                let minSellExSyId = null;
                let maxBuyExSyId = null;
                    exf = 0;
                for (const exSy of exchangeSymbols) {
                    console.log(exchangeSymbols.length +'/'+ exf);
                    exf++;
                    if (exSy.Val_sell != null && exSy.Val_sell < minSell && exSy.Val_sell > 0) {
                        minSell = exSy.Val_sell;
                        minSellExSyId = exSy._id;
                    }
                    if (exSy.Val_buy != null && exSy.Val_buy > maxBuy && exSy.Val_buy > 0) {
                        maxBuy = exSy.Val_buy;
                        maxBuyExSyId = exSy._id;
                    }
                }

                let promedio;
                if (minSell === Infinity || maxBuy === -Infinity || minSellExSyId === null || maxBuyExSyId === null || minSell === 0) {
                    promedio = 0;
                } else {
                    promedio = ((maxBuy - minSell) / minSell) * 100;
                }

                let takerFeeExMin = 0;
                let makerFeeExMin = 0;
                let takerFeeExMax = 0;
                let makerFeeExMax = 0;
                let exSymMinDoc, exSymMaxDoc;

                try {
                    if (minSellExSyId && maxBuyExSyId) {
                        exSymMinDoc = await ExchangeSymbol.findById(minSellExSyId)
                            .populate({ path: 'exchangeId', select: 'id_ex' })
                            .populate({ path: 'symbolId', select: 'id_sy name' });
                        exSymMaxDoc = await ExchangeSymbol.findById(maxBuyExSyId)
                            .populate({ path: 'exchangeId', select: 'id_ex' })


                        if (exSymMinDoc && exSymMinDoc.exchangeId && exSymMinDoc.symbolId && exSymMaxDoc && exSymMaxDoc.exchangeId) {
                            const symbolStr = exSymMinDoc.symbolId.id_sy;
                            const baseCurrency = exSymMinDoc.symbolId.name;

                            const exchangeMinId = exSymMinDoc.exchangeId.id_ex;
                            const ccxtExMin = new ccxt[exchangeMinId]();
                            await ccxtExMin.loadMarkets();

                            // if (ccxtExMin.markets[symbolStr]) {
                                // console.log(symbolStr)
                                // const tradingFeesMin = await ccxtExMin.fetchTradingFees();
                                if (ccxtExMin.markets[symbolStr]) {
                                    takerFeeExMin = await ccxtExMin.markets[symbolStr]['taker'];
                                    makerFeeExMin = await ccxtExMin.markets[symbolStr]['maker'];
                                    // percentage = await  ccxtExMin.markets[symbolStr]['percentage'];
                                    // console.log(takerFeeExMin, makerFeeExMin, percentage)
                                }
                            // }
                            // const baseCurrencyCode = symbolStr.split('/')[0];
                            // console.log(`Moneda base: ${baseCurrencyCode}`);
                            // if (ccxtExMin.currencies[baseCurrencyCode]) {
                                // console.log(`Información de la moneda '${baseCurrencyCode}' encontrada.`);
                                // const currencyInfo = await ccxtExMin.currencies[baseCurrencyCode];

                            const exchangeMaxId = await exSymMaxDoc.exchangeId.id_ex;
                            const ccxtExMax = await new ccxt[exchangeMaxId]();
                            await ccxtExMax.loadMarkets();
                            if (ccxtExMax.markets && ccxtExMax.markets[symbolStr]) {
                                takerFeeExMax = await ccxtExMax.markets[symbolStr]['taker'];
                                makerFeeExMax = await ccxtExMin.markets[symbolStr]['maker'];
                                // percentage = await ccxtExMin.markets[symbolStr]['percentage'];

                            }
                        // }
                        }
                }
                } catch (feeError) {
                    const currentSymbolStr = exSymMinDoc && exSymMinDoc.symbolId ? exSymMinDoc.symbolId.id_sy : (symbol ? symbol.id_sy : 'N/A');
                    console.error(`Error fetching fees for symbol ${currentSymbolStr} (ID: ${symbol._id}): ${feeError.message}`);
                    takerFeeExMin = takerFeeExMin || 0;
                    makerFeeExMin = makerFeeExMin || 0;
                    takerFeeExMax = takerFeeExMax || 0;
                    makerFeeExMax = makerFeeExMax || 0;
                }

                if (minSellExSyId && maxBuyExSyId) {
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
                        timestamp: new Date()
                    };
                    const analysis = new Analysis(analysisData);
                    await analysis.save();
                    // console.log(`add ${insertedCount}`)
                    insertedCount++;
                } else {
                     console.warn(`Skipping analysis for symbol ${symbol.name} (ID: ${symbol._id}) due to missing minSellExSyId or maxBuyExSyId.`);
                }
            }
        }
        console.log(`Total analysis documents inserted: ${insertedCount}`);
        res.status(200).json({ message: `${insertedCount} analysis documents inserted.` });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const feesExchange = async (symbolStr, exchangeId) => {
    try {
        const exchange = await Exchange.findById(exchangeId);
        if (!exchange) {
            throw new Error(`Exchange not found: ${exchangeId}`);
        }

        const symbol = await Symbol.findOne({ id_sy: symbolStr });
        if (!symbol) {
            throw new Error(`Symbol not found: ${symbolStr}`);
        }

        // Obtiene las tarifas del exchange para el símbolo
        const fees = await Fee.findOne({ exchangeId: exchangeId, symbolId: symbol._id });
        return fees || { taker: 0, maker: 0 };
    } catch (error) {
        console.error(`Error fetching fees for ${symbolStr} on ${exchangeId}:`, error);
        throw error;
    }
};


/** retorna la mejor red con los fees mas bajos de un arreglo de redes */
const networkSelect = async (Analysis) => {
    try {
        let bestNetwork = null;
        let minFee = Infinity;

        // Recorre todas las keys del objeto networks
        for (const netKey in networks) {
            const net = await networks[netKey];
            // Solo considera networks activos y con withdraw habilitado
            console.log(`Evaluating network: ${netKey}, active: ${net.active}, withdraw: ${net.withdraw}, fee: ${net.fee}`);
            if (net.active !== false && net.withdraw !== false ) {
                if (net.fee < minFee) {
                    minFee = await net.fee;
                    bestNetwork = await net.id;
                }
            }
        }

        if (bestNetwork) {
            // Si se usa como función utilitaria, retorna el mejor network
            return  {fee: minFee, bestNetwork: bestNetwork};
        } else {
            // Si no hay ninguno válido, retorna null o lanza error
            return null;
        }
    } catch (error) {
        console.error("Error selecting best network:", error);
        if (res) {
            return res.status(500).json({ message: error.message });
        }
        throw error;
    }
};


const getFormattedTopAnalysis = async (limit = 20) => {
  try {
    const topAnalysisDocs = await Analysis.find({})
      .sort({ promedio: -1 })
      .limit(limit)
      .populate({
        path: 'symbolId',
        select: 'id_sy name'
      })
      .populate({
        path: 'id_exsyMin',
        select: 'exchangeId Val_sell',
        populate: {
          path: 'exchangeId',
          select: 'id_ex name'
        }
      })
      .populate({
        path: 'id_exsyMax',
        select: 'exchangeId Val_buy',
        populate: {
          path: 'exchangeId',
          select: 'id_ex name'
        }
      })
      .exec();
    if (!topAnalysisDocs || topAnalysisDocs.length === 0) {
      return [];
    }

    const formattedResults = topAnalysisDocs.map(doc => {
      if (!doc.symbolId || !doc.id_exsyMin || !doc.id_exsyMin.exchangeId || !doc.id_exsyMax || !doc.id_exsyMax.exchangeId) {
        console.log(JSON.stringify(doc));
        console.warn(`Skipping analysis doc ${doc._id} due to missing populated fields.`);
        return null;
      }

      return {

        analysis_id: doc._id,
        symbol: doc.symbolId.id_sy,
        symbol_name: doc.symbolId.name,
        exchange_min_id: doc.id_exsyMin.exchangeId.id_ex,
        exchange_min_name: doc.id_exsyMin.exchangeId.name,
        exchange_max_id: doc.id_exsyMax.exchangeId.id_ex,
        exchange_max_name: doc.id_exsyMax.exchangeId.name,
        price_at_exMin_to_buy_asset: doc.Val_sell,
        price_at_exMax_to_sell_asset: doc.Val_buy,
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
        },
        timestamp: doc.timestamp
      }
      ;
    }).filter(item => item !== null);

    return formattedResults;

  } catch (error) {
    console.error("Error fetching formatted top analysis:", error);
    throw error;
  }
};

module.exports = {
    createAnalysis,
    getAllAnalysis,
    getAnalysisById,
    updateAnalysis,
    deleteAnalysis,
    analyzeSymbols,
    getFormattedTopAnalysis,
    pruebaDistinct,
    getTop20porPorcetaje
};
