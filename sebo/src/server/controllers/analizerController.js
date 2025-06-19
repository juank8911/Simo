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
    analyzeSymbols
};
