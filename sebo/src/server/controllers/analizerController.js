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
        const symbols = await Symbol.find({});
        let insertedCount = 0;

        for (const symbol of symbols) {
            const exchangeSymbols = await ExchangeSymbol.find({ symbolId: symbol._id });
            console.log(`Processing symbol: ${symbol.name}, ExchangeSymbols count: ${exchangeSymbols.length}`);
            if (exchangeSymbols.length > 1) {
                let minSell = 1000000;
                let maxBuy = -100000000;
                let minSellExSyId = null;
                let maxBuyExSyId = null;

                for (const exSy of exchangeSymbols) {

                    if (exSy.Val_sell < minSell && exSy.Val_sell > 0) {
                        console.log(`MAXl: ${ exSy.Val_sell}------${ minSell}`);
                        minSell = exSy.Val_sell;
                        console.log(`MAXl: ${ exSy.Val_sell}------${ minSell}`);

                        minSellExSyId = exSy.exchangeId;
                    }
                    if (exSy.Val_buy > maxBuy && exSy.Val_buy > 0) {
                        maxBuy = exSy.Val_buy;
                        maxBuyExSyId = exSy.exchangeId
                    }
                }
                var promedio = await ((maxBuy - minSell) / minSell) * 100;
                if (isNaN(promedio) || promedio === Infinity) {
                    promedio = 0; // Si el promedio es NaN, lo establecemos a 0
                }
                console.log(`Symbol: ${symbol.name}, Min Sell: ${minSell}, Max Buy: ${maxBuy}, Promedio: ${promedio}`);
                const analysis = new Analysis({
                    id_exsyMin: minSellExSyId,
                    id_exsyMax: maxBuyExSyId,
                    Val_buy: maxBuy,
                    Val_sell: minSell,
                    promedio: promedio,
                    symbolId: symbol._id
                });

                await analysis.save();
                insertedCount++;
            }
        }
        console.log(`Total analysis documents inserted: ${insertedCount}`);
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
    analyzeSymbols
};
