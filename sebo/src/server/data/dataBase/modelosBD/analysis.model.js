const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  id_exsyMin: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeSymbol' },
  id_exsyMax: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeSymbol' },
  Val_buy: { type: Number, default: 0 },
  Val_sell: { type: Number, default: 0 },
  promedio: { type: Number, default: 0 },
  symbolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Symbol', required: true },
  timestamp: { type: Date, default: Date.now }
});

const Analysis = mongoose.model('Analysis', analysisSchema);

module.exports = Analysis;